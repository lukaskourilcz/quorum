import { z } from "zod";
import type { Channel } from "./channel-registry.js";
import type { PublishAdapter } from "./publish.js";
import { assertQueueItemPublishable, type QueueItem } from "./queue.js";

const MetaIdResponseSchema = z.object({
  id: z.string().min(1)
});

const MetaLiveResponseSchema = z.object({
  id: z.string().min(1),
  permalink_url: z.url().optional(),
  permalink: z.url().optional()
}).superRefine((value, context) => {
  if (!value.permalink_url && !value.permalink) context.addIssue({ code: "custom", message: "Meta live response has no permalink" });
});

type FetchLike = typeof fetch;

function requiredEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Missing credential or connector setting: ${name}`);
  }
  return value;
}

function apiVersion(environment: NodeJS.ProcessEnv): string {
  const version = requiredEnvironment(environment, "META_GRAPH_API_VERSION");
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("META_GRAPH_API_VERSION must match vN.N");
  }
  return version;
}

/**
 * The credential prefix each publishing venture's tokens live under.
 *
 * A venture absent from this map has no social account, and that is a fact about the company
 * rather than a gap to fill in: marketingShark drafts carousels for a human to review and owns no
 * channel, no token and no publishing path. Absence throws by name below rather than resolving to
 * `undefined_THREADS_ACCESS_TOKEN` and failing as a confusing missing-environment error.
 */
const VENTURE_PREFIX: Partial<Record<QueueItem["venture"], string>> = {
  "caught-up": "CAUGHT_UP",
  "mma-files": "MMA_FILES",
  "titty-tuesdays": "TITTY_TUESDAYS"
};

function accountCredentials(environment: NodeJS.ProcessEnv, item: QueueItem, channel: Channel): { accessToken: string; userId: string } {
  const prefix = VENTURE_PREFIX[item.venture];
  if (!prefix) {
    throw new Error(`${item.venture} has no social credentials and cannot publish`);
  }
  const channelPrefix = channel.id === "threads" ? "THREADS" : "INSTAGRAM";
  return {
    accessToken: requiredEnvironment(environment, `${prefix}_${channelPrefix}_ACCESS_TOKEN`),
    userId: requiredEnvironment(environment, `${prefix}_${channelPrefix}_USER_ID`)
  };
}

async function postForm(
  fetchImpl: FetchLike,
  url: URL,
  values: Record<string, string>
): Promise<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`Meta connector returned HTTP ${response.status}`);
  }
  const parsed = MetaIdResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("Meta connector returned an invalid response");
  }
  return parsed.data.id;
}

export function createMetaPublishAdapter(
  environment: NodeJS.ProcessEnv,
  fetchImpl: FetchLike = fetch
): PublishAdapter {
  const publishedByKey = new Map<string, string>();
  return {
    async publish(
      channel: Channel,
      item: QueueItem,
      idempotencyKey: string
    ): Promise<{ remoteId: string }> {
      assertQueueItemPublishable(item);
      const content = item.content!;
      const version = apiVersion(environment);
      const credentials = accountCredentials(environment, item, channel);
      const accessToken = credentials.accessToken;
      const existing = publishedByKey.get(idempotencyKey);
      if (existing) return { remoteId: existing };

      if (channel.connector === "meta_threads" && channel.id === "threads") {
        const userId = credentials.userId;
        const base = new URL(
          `https://graph.threads.net/${version}/${encodeURIComponent(userId)}/`
        );
        const creationId = await postForm(
          fetchImpl,
          new URL("threads", base),
          {
            media_type: "TEXT",
            text: content.text,
            access_token: accessToken
          }
        );
        const remoteId = await postForm(
          fetchImpl,
          new URL("threads_publish", base),
          {
            creation_id: creationId,
            access_token: accessToken
          }
        );
        publishedByKey.set(idempotencyKey, remoteId);
        return { remoteId };
      }

      if (channel.connector === "meta_instagram" && channel.id === "instagram") {
        const userId = credentials.userId;
        const base = new URL(
          `https://graph.facebook.com/${version}/${encodeURIComponent(userId)}/`
        );
        const publicSiteUrl = requiredEnvironment(environment, "PUBLIC_SITE_URL");
        if (!publicSiteUrl.startsWith("https://")) {
          throw new Error("PUBLIC_SITE_URL must use HTTPS for Instagram media");
        }
        const imageUrls = content.assetPaths.map((asset) => new URL(asset, publicSiteUrl).toString());
        const creationId = imageUrls.length === 1
          ? await postForm(fetchImpl, new URL("media", base), {
              image_url: imageUrls[0]!,
              caption: content.text,
              access_token: accessToken
            })
          : await (async () => {
              const children: string[] = [];
              for (const imageUrl of imageUrls) {
                children.push(await postForm(fetchImpl, new URL("media", base), {
                  image_url: imageUrl,
                  is_carousel_item: "true",
                  access_token: accessToken
                }));
              }
              return postForm(fetchImpl, new URL("media", base), {
                media_type: "CAROUSEL",
                children: children.join(","),
                caption: content.text,
                access_token: accessToken
              });
            })();
        const remoteId = await postForm(
          fetchImpl,
          new URL("media_publish", base),
          {
            creation_id: creationId,
            access_token: accessToken
          }
        );
        publishedByKey.set(idempotencyKey, remoteId);
        return { remoteId };
      }

      throw new Error(`Unsupported guarded connector: ${channel.connector}`);
    },
    async verify(channel: Channel, item: QueueItem, remoteId: string): Promise<{ remoteId: string; remoteUrl: string }> {
      const version = apiVersion(environment);
      const credentials = accountCredentials(environment, item, channel);
      const host = channel.id === "threads" ? "graph.threads.net" : "graph.facebook.com";
      const fields = channel.id === "threads" ? "id,permalink" : "id,permalink_url";
      const url = new URL(`https://${host}/${version}/${encodeURIComponent(remoteId)}`);
      url.searchParams.set("fields", fields);
      url.searchParams.set("access_token", credentials.accessToken);
      const response = await fetchImpl(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Meta post verifier returned HTTP ${response.status}`);
      const parsed = MetaLiveResponseSchema.safeParse(await response.json());
      if (!parsed.success || parsed.data.id !== remoteId) throw new Error("Meta post verifier returned an invalid post");
      return { remoteId, remoteUrl: parsed.data.permalink_url ?? parsed.data.permalink! };
    }
  };
}
