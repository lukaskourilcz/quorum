import type { Channel } from "./channel-registry.js";
import {
  BUFFER_API_VERSION,
  BUFFER_VERIFY_READS,
  BUFFER_VERIFY_WAITS_MS,
  createBufferPost,
  probeBufferLinkedInChannel,
  providerText,
  readBufferPost,
  type FetchLike
} from "./buffer-api.js";
import { LINKEDIN_TEXT_LIMIT, linkedinCaptionCarriesLink, linkedinTrackedLink } from "./linkedin-text.js";
import type { VerifiedSocialAsset } from "./media/assets.js";
import { ProviderRejectedError, SocialPublishHoldError, type PublishAdapter } from "./publish.js";
import type { ResolvedPublisherTarget } from "./publisher-targets.js";
import { assertQueueItemPublishable, type RuntimeQueueItem } from "./queue.js";

/**
 * The LinkedIn transport: a `PublishAdapter` over Buffer's free plan (quorum#571).
 *
 * Buffer carries an item the queue, the owner and every gate have already settled. It never
 * chooses copy, window, profile or experiment: the post goes out with `shareNow` inside the item's
 * own window, never `addToQueue` (Buffer would pick the time slot) and never `customScheduled`
 * (the queue owns the window). It sends LinkedIn and nothing else; Instagram and Threads stay on
 * the Direct Meta core. Nothing here stores a request or response body.
 */

export type BufferLinkedInFormat = "single-image" | "multi-image";

/**
 * How a carousel goes to LinkedIn until the owner's live test says otherwise.
 *
 * LinkedIn's organic carousel is a document or a multi-image post. Buffer documents `assets` as an
 * ordered list, but whether it hands LinkedIn several images from the API is what the live test in
 * docs/SOCIAL-PROVIDERS.md establishes. Until that result is recorded, slide one goes as a single
 * image with the caption and the tracked devShark link. The live test's result is the one reason
 * to change this line.
 */
export const BUFFER_LINKEDIN_FORMAT: BufferLinkedInFormat = "single-image";

const LINKEDIN_MAX_IMAGES = 20;

export interface BufferAdapterOptions {
  /** How a carousel goes to LinkedIn; the committed rule unless a test says otherwise. */
  linkedInFormat?: BufferLinkedInFormat;
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * A frame the runner proved for this run (quorum#570): the exact URL that answered for the asset
 * path. It is the part of `VerifiedSocialAsset` the adapter reads.
 */
export type BufferVerifiedFrame = Pick<VerifiedSocialAsset, "path" | "url">;

/** The Buffer adapter also takes the frames the runner proved for the item it is sending. */
export interface BufferPublishAdapter extends PublishAdapter {
  publish(
    channel: Channel,
    item: RuntimeQueueItem,
    idempotencyKey: string,
    target?: ResolvedPublisherTarget,
    frames?: readonly BufferVerifiedFrame[]
  ): Promise<{ remoteId: string }>;
}

export interface BufferPostPlan {
  text: string;
  imageUrls: string[];
  format: "text" | "single-image" | "multi-image";
  altText: string | null;
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new ProviderRejectedError("unauthorized", `Missing credential or connector setting: ${name}`);
  return value;
}

/** Every refusal here happens before a request exists, so each one is certain to have sent nothing. */
function bufferCredentials(
  environment: NodeJS.ProcessEnv,
  target: ResolvedPublisherTarget | undefined,
  channel: Channel
): { apiKey: string; channelId: string } {
  if (!target || target.connection.platform !== channel.id) {
    throw new ProviderRejectedError("invalid-input", "A validated profile/connection binding is required");
  }
  if (target.providerId !== "buffer" || channel.id !== "linkedin" || channel.connector !== "buffer_linkedin") {
    throw new ProviderRejectedError("invalid-input", "The Buffer adapter sends only LinkedIn items on its exact provider binding");
  }
  if (target.apiVersion !== BUFFER_API_VERSION) {
    throw new ProviderRejectedError("invalid-input", "The Buffer API version does not match the validated connection binding");
  }
  if (!target.connection.approvedScopes.includes("provider-managed")) {
    throw new ProviderRejectedError("unauthorized", "The validated connection does not record Buffer's managed LinkedIn grant");
  }
  return {
    apiKey: requiredEnvironment(environment, target.credentialRef),
    channelId: requiredEnvironment(environment, target.nativeAccountIdRef)
  };
}

/**
 * Only the URL the runner proved for this exact path. There is no fallback: a frame without a proof,
 * or a caller that hands no frames at all, stops the send before any request. Text alone needs none.
 */
function verifiedFrameUrl(frames: readonly BufferVerifiedFrame[] | undefined, assetPath: string): string {
  const frame = frames?.find((candidate) => candidate.path === assetPath);
  if (!frame) throw new ProviderRejectedError("invalid-input", "Every LinkedIn frame needs a URL verified before the send");
  return frame.url;
}

/** The item's own destination with its own UTM fields, so attribution reads LinkedIn traffic. */
export const bufferTrackedLink = linkedinTrackedLink;

/**
 * The exact post Buffer receives, decided here and nowhere else.
 *
 * Multi-image, once confirmed, sends every slide with the approved caption. Otherwise the post is
 * slide one (or text alone) with the caption and the tracked devShark link, because a reader who
 * sees one slide needs the way to the rest. A composed text over LinkedIn's 3,000 characters is held
 * before anything is sent (`platform-text-limit`): it pauses nothing, and an edit that supersedes the
 * item can fix it. Buffer counts UTF-16 units, which is what `length` counts.
 */
export function planBufferLinkedInPost(
  item: RuntimeQueueItem,
  format: BufferLinkedInFormat,
  assetUrl: (assetPath: string) => string
): BufferPostPlan {
  const content = item.content;
  if (content.assetPaths.some((asset) => !/\.(?:jpe?g|png)$/iu.test(asset))) {
    throw new ProviderRejectedError("invalid-input", "The LinkedIn transport accepts JPEG or PNG images only");
  }
  const multi = format === "multi-image" && content.assetPaths.length > 1;
  const assets = multi ? content.assetPaths.slice(0, LINKEDIN_MAX_IMAGES) : content.assetPaths.slice(0, 1);
  const text = multi || linkedinCaptionCarriesLink(content.text, item.destination) ? content.text : `${content.text}\n\n${linkedinTrackedLink(item)}`;
  if (text.length > LINKEDIN_TEXT_LIMIT) {
    throw new SocialPublishHoldError("platform-text-limit", `The LinkedIn post would be ${text.length} characters with its tracked link and LinkedIn allows ${LINKEDIN_TEXT_LIMIT}; nothing was sent`);
  }
  if (assets.length > 0 && !content.altText) {
    throw new ProviderRejectedError("invalid-input", "LinkedIn media requires alt text");
  }
  const imageUrls = assets.map((asset) => {
    const url = assetUrl(asset);
    if (!url.startsWith("https://")) throw new ProviderRejectedError("invalid-input", "LinkedIn media must be served over HTTPS");
    return url;
  });
  return {
    text,
    imageUrls,
    format: imageUrls.length === 0 ? "text" : multi ? "multi-image" : "single-image",
    altText: content.altText
  };
}

function linkedInPermalink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(?:^|\.)linkedin\.com$/u.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function createBufferPublishAdapter(
  environment: NodeJS.ProcessEnv,
  fetchImpl: FetchLike = fetch,
  options: BufferAdapterOptions = {}
): BufferPublishAdapter {
  const format = options.linkedInFormat ?? BUFFER_LINKEDIN_FORMAT;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const publishedByKey = new Map<string, string>();
  return {
    async publish(channel, item, idempotencyKey, target, frames): Promise<{ remoteId: string }> {
      assertQueueItemPublishable(item);
      const { apiKey, channelId } = bufferCredentials(environment, target, channel);
      const existing = publishedByKey.get(idempotencyKey);
      if (existing) return { remoteId: existing };
      const plan = planBufferLinkedInPost(item, format, (asset) => verifiedFrameUrl(frames, asset));
      const probe = await probeBufferLinkedInChannel({ apiKey, channelId, fetchImpl });
      if (probe.state !== "healthy") {
        throw new ProviderRejectedError(probe.state === "rate-limited" ? "rate-limited" : "channel-unavailable", `${probe.reason}; nothing was created`);
      }
      const { postId } = await createBufferPost({ fetchImpl, apiKey, channelId, text: plan.text, imageUrls: plan.imageUrls, altText: plan.altText });
      publishedByKey.set(idempotencyKey, postId);
      return { remoteId: postId };
    },

    async verify(channel, _item, remoteId, target): Promise<{ remoteId: string; remoteUrl: string }> {
      const { apiKey, channelId } = bufferCredentials(environment, target, channel);
      let status = "unknown";
      for (let read = 1; read <= BUFFER_VERIFY_READS; read += 1) {
        const post = await readBufferPost({ fetchImpl, apiKey, postId: remoteId });
        if (post.id !== remoteId || post.channelId !== channelId || post.channelService !== "linkedin") {
          throw new Error("Buffer post read-back does not match the created LinkedIn post");
        }
        status = post.status;
        if (post.status === "sent") {
          const permalink = linkedInPermalink(post.externalLink);
          if (!permalink) throw new Error("Buffer reports the post sent without a LinkedIn link");
          return { remoteId, remoteUrl: permalink };
        }
        if (post.status === "error") throw new Error(`Buffer reports the LinkedIn send failed: ${providerText(post.error?.message)}`);
        if (post.status === "draft" || post.status === "needs_approval") {
          throw new Error(`Buffer holds the post as ${post.status}, so it was not sent`);
        }
        if (read < BUFFER_VERIFY_READS) await sleep(BUFFER_VERIFY_WAITS_MS[read - 1]!);
      }
      throw new Error(`Buffer has not sent the post yet (status ${status})`);
    },

    async findByIdempotencyKey(_channel, idempotencyKey): Promise<{ remoteId: string } | null> {
      const remoteId = publishedByKey.get(idempotencyKey);
      return remoteId ? { remoteId } : null;
    }
  };
}
