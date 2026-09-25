import { z } from "zod";
import type { PublishingQuota } from "../contracts/social-publish-hold.js";
import type { Channel } from "./channel-registry.js";
import type { VerifiedSocialAsset } from "./media/assets.js";
import {
  awaitContainer,
  getJson,
  INSTAGRAM_CONTAINER_WAIT,
  postForm,
  quotaHasRoom,
  readPublishingQuota,
  realSleep,
  THREADS_CONTAINER_WAIT,
  type FetchLike,
  type Sleep
} from "./meta-graph.js";
import { SocialPublishHoldError, type PublishAdapter } from "./publish.js";
import type { ResolvedPublisherTarget } from "./publisher-targets.js";
import { assertQueueItemPublishable, type RuntimeQueueItem } from "./queue.js";

const MetaLiveResponseSchema = z.object({
  id: z.string().min(1),
  permalink_url: z.url().optional(),
  permalink: z.url().optional()
}).superRefine((value, context) => {
  if (!value.permalink_url && !value.permalink) context.addIssue({ code: "custom", message: "Meta live response has no permalink" });
});

/** Threads' own limit: "Text posts are limited to 500 characters", with an emoji counted as its UTF-8 bytes. */
export const THREADS_TEXT_LIMIT = 500;

/**
 * The length Threads will measure. Anything that is not an emoji counts one per code point, which
 * never undercounts a combining sequence; an emoji counts its whole grapheme's UTF-8 bytes.
 */
export function threadsTextLength(text: string): number {
  let length = 0;
  for (const { segment } of new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)) {
    length += /\p{Extended_Pictographic}/u.test(segment) ? Buffer.byteLength(segment, "utf8") : [...segment].length;
  }
  return length;
}

/**
 * Which official Graph host and publish scopes a connection uses.
 *
 * Threads has one. Instagram has two login paths that must never be mixed: Facebook Login on
 * `graph.facebook.com` with `instagram_basic` and `instagram_content_publish` (DNESKAi's connection),
 * and Instagram Login on `graph.instagram.com` with the `instagram_business_*` scopes (devShark's,
 * which needs no Facebook Page).
 */
function metaSurface(channel: Channel, target: ResolvedPublisherTarget): { host: string; scopes: readonly string[] } {
  if (channel.id === "threads") return { host: "graph.threads.net", scopes: ["threads_basic", "threads_content_publish"] };
  switch (target.connection.connector.loginMode) {
    case "instagram-login":
      return { host: "graph.instagram.com", scopes: ["instagram_business_basic", "instagram_business_content_publish"] };
    case "instagram-facebook-login":
      return { host: "graph.facebook.com", scopes: ["instagram_basic", "instagram_content_publish"] };
    default:
      throw new Error("An Instagram connection needs Instagram Login or Facebook Login");
  }
}

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing credential or connector setting: ${name}`);
  }
  return value;
}

function apiVersion(environment: NodeJS.ProcessEnv, target: ResolvedPublisherTarget): string {
  const version = requiredEnvironment(environment, "META_GRAPH_API_VERSION");
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("META_GRAPH_API_VERSION must match vN.N");
  }
  if (version !== target.apiVersion) {
    throw new Error("META_GRAPH_API_VERSION does not match the validated connection binding");
  }
  return version;
}

interface MetaAccount {
  accessToken: string;
  /** `https://<host>/<version>/<user>/`, the base every account endpoint hangs off. */
  base: URL;
  /** `https://<host>/<version>/`, for reading a container or a post by its own id. */
  root: URL;
}

function metaAccount(environment: NodeJS.ProcessEnv, target: ResolvedPublisherTarget | undefined, channel: Channel): MetaAccount {
  if (!target || target.connection.platform !== channel.id) {
    throw new Error("A validated profile/connection binding is required");
  }
  if (target.providerId !== "direct-meta") {
    throw new Error("The official Meta adapter accepts only its exact provider binding");
  }
  const version = apiVersion(environment, target);
  const surface = metaSurface(channel, target);
  if (surface.scopes.some((scope) => !(target.connection.approvedScopes as readonly string[]).includes(scope))) {
    throw new Error("The validated connection is missing an official publish scope");
  }
  const accessToken = requiredEnvironment(environment, target.credentialRef);
  const userId = requiredEnvironment(environment, target.nativeAccountIdRef);
  const root = new URL(`https://${surface.host}/${version}/`);
  return { accessToken, root, base: new URL(`${encodeURIComponent(userId)}/`, root) };
}

function withToken(url: URL, accessToken: string, query: Record<string, string> = {}): URL {
  const next = new URL(url);
  for (const [key, value] of Object.entries(query)) next.searchParams.set(key, value);
  next.searchParams.set("access_token", accessToken);
  return next;
}

/**
 * The frames Meta is told to fetch, in the item's order, each with the one URL `verifySocialAssets`
 * proved in this run and the alt text of that frame.
 *
 * The adapter used to build `PUBLIC_SITE_URL` plus the path itself, which pointed Meta at a site
 * nobody had deployed; now a frame without a proof stops the send before any request. A lone frame
 * falls back to the item's alt text, which then describes exactly that frame.
 */
function provedFrames(item: RuntimeQueueItem, assets: readonly VerifiedSocialAsset[] | undefined): Array<{ url: string; altText: string | null }> {
  const content = item.content;
  return content.assetPaths.map((assetPath) => {
    const verified = assets?.find((candidate) => candidate.path === assetPath);
    if (!verified) throw new Error("Every Instagram or Threads frame needs a URL verified before the send");
    return { url: verified.url, altText: verified.altText ?? (content.assetPaths.length === 1 ? content.altText : null) };
  });
}

function withAlt(values: Record<string, string>, altText: string | null): Record<string, string> {
  return altText ? { ...values, alt_text: altText.slice(0, 1_000) } : values;
}

/**
 * Hold, before any write, when the account's publishing limit has no room for one more post or
 * cannot be read. Both platforms count a carousel as one post.
 */
async function assertPublishingRoom(fetchImpl: FetchLike, url: URL): Promise<void> {
  let quota: PublishingQuota;
  try {
    quota = await readPublishingQuota(fetchImpl, url);
  } catch (error) {
    throw new SocialPublishHoldError("publishing-quota-unreadable", `The publishing limit could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!quotaHasRoom(quota)) {
    throw new SocialPublishHoldError("publishing-quota-exhausted", `${quota.usage} of ${quota.total} posts are used in the last ${quota.durationSeconds} seconds`, quota);
  }
}

export interface MetaPublishAdapterOptions {
  /** How the adapter waits for a container; a test passes a recorder instead of real time. */
  sleep?: Sleep;
}

export function createMetaPublishAdapter(
  environment: NodeJS.ProcessEnv,
  fetchImpl: FetchLike = fetch,
  options: MetaPublishAdapterOptions = {}
): PublishAdapter {
  const sleep = options.sleep ?? realSleep;
  const publishedByKey = new Map<string, string>();

  /** Create the item's container: text alone, one image, or a carousel of 2 to 10 frames. */
  async function threadsContainer(account: MetaAccount, item: RuntimeQueueItem, frames: Array<{ url: string; altText: string | null }>): Promise<string> {
    const token = { access_token: account.accessToken };
    const endpoint = new URL("threads", account.base);
    const text = item.content.text;
    if (frames.length === 0) return postForm(fetchImpl, endpoint, { media_type: "TEXT", text, ...token });
    if (frames.length === 1) {
      return postForm(fetchImpl, endpoint, withAlt({ media_type: "IMAGE", image_url: frames[0]!.url, text, ...token }, frames[0]!.altText));
    }
    const children: string[] = [];
    for (const frame of frames) {
      children.push(await postForm(fetchImpl, endpoint, withAlt({ media_type: "IMAGE", image_url: frame.url, is_carousel_item: "true", ...token }, frame.altText)));
    }
    return postForm(fetchImpl, endpoint, { media_type: "CAROUSEL", children: children.join(","), text, ...token });
  }

  /** The caption goes on the single image or the carousel container only; carousel children take none. */
  async function instagramContainer(account: MetaAccount, item: RuntimeQueueItem, frames: Array<{ url: string; altText: string | null }>): Promise<string> {
    const token = { access_token: account.accessToken };
    const endpoint = new URL("media", account.base);
    const caption = item.content.text;
    if (frames.length === 1) {
      return postForm(fetchImpl, endpoint, withAlt({ image_url: frames[0]!.url, caption, ...token }, frames[0]!.altText));
    }
    const children: string[] = [];
    for (const frame of frames) {
      children.push(await postForm(fetchImpl, endpoint, withAlt({ image_url: frame.url, is_carousel_item: "true", ...token }, frame.altText)));
    }
    return postForm(fetchImpl, endpoint, { media_type: "CAROUSEL", children: children.join(","), caption, ...token });
  }

  return {
    async publish(
      channel: Channel,
      item: RuntimeQueueItem,
      idempotencyKey: string,
      target?: ResolvedPublisherTarget,
      assets?: readonly VerifiedSocialAsset[]
    ): Promise<{ remoteId: string }> {
      assertQueueItemPublishable(item);
      const content = item.content;
      if (!target) throw new Error("A validated profile/connection binding is required");
      const account = metaAccount(environment, target, channel);
      const existing = publishedByKey.get(idempotencyKey);
      if (existing) return { remoteId: existing };

      if (channel.connector === "meta_threads" && channel.id === "threads") {
        const length = threadsTextLength(content.text);
        if (length > THREADS_TEXT_LIMIT) {
          throw new SocialPublishHoldError("platform-text-limit", `Threads counts this text as ${length} characters; it takes ${THREADS_TEXT_LIMIT}`);
        }
        const frames = provedFrames(item, assets);
        await assertPublishingRoom(fetchImpl, withToken(new URL("threads_publishing_limit", account.base), account.accessToken, { fields: "quota_usage,config" }));
        const creationId = await threadsContainer(account, item, frames);
        // A text container needs no processing; an image or carousel is fetched by Meta and must
        // finish before it can be published.
        if (frames.length > 0) {
          await awaitContainer(fetchImpl, sleep, withToken(new URL(encodeURIComponent(creationId), account.root), account.accessToken, { fields: "status,error_message" }), THREADS_CONTAINER_WAIT);
        }
        const remoteId = await postForm(fetchImpl, new URL("threads_publish", account.base), { creation_id: creationId, access_token: account.accessToken });
        publishedByKey.set(idempotencyKey, remoteId);
        return { remoteId };
      }

      if (channel.connector === "meta_instagram" && channel.id === "instagram") {
        if (content.assetPaths.length < 1 || content.assetPaths.length > 10 || content.assetPaths.some((asset) => !/\.jpe?g$/iu.test(asset))) {
          throw new Error("The verified Instagram transport requires one to ten JPEG images");
        }
        const frames = provedFrames(item, assets);
        await assertPublishingRoom(fetchImpl, withToken(new URL("content_publishing_limit", account.base), account.accessToken, { fields: "quota_usage,config" }));
        const creationId = await instagramContainer(account, item, frames);
        await awaitContainer(fetchImpl, sleep, withToken(new URL(encodeURIComponent(creationId), account.root), account.accessToken, { fields: "status_code,status" }), INSTAGRAM_CONTAINER_WAIT);
        const remoteId = await postForm(fetchImpl, new URL("media_publish", account.base), { creation_id: creationId, access_token: account.accessToken });
        publishedByKey.set(idempotencyKey, remoteId);
        return { remoteId };
      }

      throw new Error(`Unsupported guarded connector: ${channel.connector}`);
    },
    async verify(channel: Channel, _item: RuntimeQueueItem, remoteId: string, target?: ResolvedPublisherTarget): Promise<{ remoteId: string; remoteUrl: string }> {
      if (!target) throw new Error("A validated profile/connection binding is required");
      const account = metaAccount(environment, target, channel);
      // Both an IG Media and a Threads Media name their public URL `permalink`.
      const url = withToken(new URL(encodeURIComponent(remoteId), account.root), account.accessToken, { fields: "id,permalink" });
      let answer: unknown;
      try {
        answer = await getJson(fetchImpl, url);
      } catch (error) {
        throw new Error(`Meta post verifier ${error instanceof Error ? error.message : String(error)}`);
      }
      const parsed = MetaLiveResponseSchema.safeParse(answer);
      if (!parsed.success || parsed.data.id !== remoteId) throw new Error("Meta post verifier returned an invalid post");
      return { remoteId, remoteUrl: parsed.data.permalink_url ?? parsed.data.permalink! };
    },
    async findByIdempotencyKey(_channel: Channel, idempotencyKey: string): Promise<{ remoteId: string } | null> {
      const remoteId = publishedByKey.get(idempotencyKey);
      return remoteId ? { remoteId } : null;
    }
  };
}
