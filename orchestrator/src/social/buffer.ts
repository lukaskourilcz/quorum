import type { Channel } from "./channel-registry.js";
import {
  BUFFER_API_VERSION,
  BUFFER_VERIFY_READS,
  createBufferPost,
  probeBufferLinkedInChannel,
  providerText,
  readBufferPost,
  type FetchLike
} from "./buffer-api.js";
import { ProviderRejectedError, type PublishAdapter } from "./publish.js";
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

const LINKEDIN_TEXT_LIMIT = 3_000;
const LINKEDIN_MAX_IMAGES = 20;
const VERIFY_INTERVAL_MS = 5_000;

export interface BufferAdapterOptions {
  /** How a carousel goes to LinkedIn; the committed rule unless a test says otherwise. */
  linkedInFormat?: BufferLinkedInFormat;
  /**
   * Turns a queue asset path (`/social/...`) into the public HTTPS URL Buffer fetches, for a caller
   * that hands the adapter no verified frames. The default joins it to `PUBLIC_SITE_URL`, as the
   * Meta adapter does on this branch. Frames the runner has already proved (quorum#570) always win.
   */
  resolveAssetUrl?: (assetPath: string, environment: NodeJS.ProcessEnv) => string;
  sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * A frame the runner proved for this run: the exact URL that answered for the asset path. The shape
 * is the part of #570's `VerifiedSocialAsset` the adapter reads.
 */
export interface BufferVerifiedFrame {
  path: string;
  url: string;
}

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

/** Only the URL proved for this exact path; a frame without one stops the send before any request. */
function verifiedFrameUrl(frames: readonly BufferVerifiedFrame[], assetPath: string): string {
  const frame = frames.find((candidate) => candidate.path === assetPath);
  if (!frame) throw new ProviderRejectedError("invalid-input", "Every LinkedIn frame needs a URL verified before the send");
  return frame.url;
}

function defaultAssetUrl(assetPath: string, environment: NodeJS.ProcessEnv): string {
  const base = environment.PUBLIC_SITE_URL?.trim();
  if (!base?.startsWith("https://")) {
    throw new ProviderRejectedError("invalid-input", "PUBLIC_SITE_URL must use HTTPS for LinkedIn media");
  }
  return new URL(assetPath, base).toString();
}

/** The item's own destination with its own UTM fields, so attribution reads LinkedIn traffic. */
export function bufferTrackedLink(item: Pick<RuntimeQueueItem, "destination" | "utm">): string {
  const url = new URL(item.destination);
  url.searchParams.set("utm_source", item.utm.source);
  url.searchParams.set("utm_medium", item.utm.medium);
  url.searchParams.set("utm_campaign", item.utm.campaign);
  url.searchParams.set("utm_content", item.utm.content);
  return url.toString();
}

/**
 * The exact post Buffer receives, decided here and nowhere else.
 *
 * Multi-image, once confirmed, sends every slide with the approved caption. Otherwise the post is
 * slide one (or text alone) with the caption and the tracked devShark link, because a reader who
 * sees one slide needs the way to the rest. A composed text over LinkedIn's 3,000 characters is
 * refused before anything is sent; Buffer counts UTF-16 units, which is what `length` counts.
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
  const destination = new URL(item.destination);
  // A full link to the destination counts; a bare "devshark.app" in a signature does not, because
  // it carries no UTM fields and attribution would lose the post.
  const alreadyLinked = content.text.includes(`${destination.origin}${destination.pathname}`.replace(/\/$/u, ""));
  const text = multi || alreadyLinked ? content.text : `${content.text}\n\n${bufferTrackedLink(item)}`;
  if (text.length > LINKEDIN_TEXT_LIMIT) {
    throw new ProviderRejectedError("invalid-input", `The LinkedIn post would be ${text.length} characters and LinkedIn allows ${LINKEDIN_TEXT_LIMIT}`);
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
  const resolveAssetUrl = options.resolveAssetUrl ?? defaultAssetUrl;
  const sleep = options.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const publishedByKey = new Map<string, string>();
  return {
    async publish(channel, item, idempotencyKey, target, frames): Promise<{ remoteId: string }> {
      assertQueueItemPublishable(item);
      const { apiKey, channelId } = bufferCredentials(environment, target, channel);
      const existing = publishedByKey.get(idempotencyKey);
      if (existing) return { remoteId: existing };
      const plan = planBufferLinkedInPost(item, format, (asset) => frames ? verifiedFrameUrl(frames, asset) : resolveAssetUrl(asset, environment));
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
        if (read < BUFFER_VERIFY_READS) await sleep(VERIFY_INTERVAL_MS);
      }
      throw new Error(`Buffer has not sent the post yet (status ${status})`);
    },

    async findByIdempotencyKey(_channel, idempotencyKey): Promise<{ remoteId: string } | null> {
      const remoteId = publishedByKey.get(idempotencyKey);
      return remoteId ? { remoteId } : null;
    }
  };
}
