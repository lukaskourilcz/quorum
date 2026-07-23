import { z } from "zod";
import type { Channel } from "./channel-registry.js";
import type { PublishAdapter } from "./publish.js";
import { assertQueueItemPublishable, type QueueItem } from "./queue.js";

const MetaIdResponseSchema = z.object({
  id: z.string().min(1)
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
  return {
    async publish(
      channel: Channel,
      item: QueueItem,
      _idempotencyKey: string
    ): Promise<{ remoteId: string }> {
      assertQueueItemPublishable(item);
      const content = item.content!;
      const version = apiVersion(environment);
      const accessToken = requiredEnvironment(environment, channel.credentialRef);

      if (channel.connector === "meta_threads" && channel.id === "threads") {
        const userId = requiredEnvironment(environment, "META_THREADS_USER_ID");
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
        return { remoteId };
      }

      if (channel.connector === "meta_instagram" && channel.id === "instagram") {
        const userId = requiredEnvironment(
          environment,
          "META_INSTAGRAM_IG_USER_ID"
        );
        const base = new URL(
          `https://graph.facebook.com/${version}/${encodeURIComponent(userId)}/`
        );
        const publicSiteUrl = requiredEnvironment(environment, "PUBLIC_SITE_URL");
        if (!publicSiteUrl.startsWith("https://")) {
          throw new Error("PUBLIC_SITE_URL must use HTTPS for Instagram media");
        }
        const imageUrl = new URL(content.assetPaths[0]!, publicSiteUrl).toString();
        const creationId = await postForm(fetchImpl, new URL("media", base), {
          image_url: imageUrl,
          caption: content.text,
          access_token: accessToken
        });
        const remoteId = await postForm(
          fetchImpl,
          new URL("media_publish", base),
          {
            creation_id: creationId,
            access_token: accessToken
          }
        );
        return { remoteId };
      }

      throw new Error(`Unsupported guarded connector: ${channel.connector}`);
    }
  };
}
