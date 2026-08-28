import { z } from "zod";
import type { Channel } from "./channel-registry.js";
import type { PublishAdapter } from "./publish.js";
import type { ResolvedPublisherTarget } from "./publisher-targets.js";
import { assertQueueItemPublishable, type RuntimeQueueItem } from "./queue.js";

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

function accountCredentials(environment: NodeJS.ProcessEnv, target: ResolvedPublisherTarget | undefined, channel: Channel): { accessToken: string; userId: string } {
  if (!target || target.connection.platform !== channel.id) {
    throw new Error("A validated profile/connection binding is required");
  }
  if (target.providerId !== "direct-meta") {
    throw new Error("The official Meta adapter accepts only its exact provider binding");
  }
  const requiredScopes = channel.id === "threads"
    ? ["threads_basic", "threads_content_publish"] as const
    : ["instagram_basic", "instagram_content_publish"] as const;
  if (requiredScopes.some((scope) => !target.connection.approvedScopes.includes(scope))) {
    throw new Error("The validated connection is missing an official publish scope");
  }
  return {
    accessToken: requiredEnvironment(environment, target.credentialRef),
    userId: requiredEnvironment(environment, target.nativeAccountIdRef)
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
      item: RuntimeQueueItem,
      idempotencyKey: string,
      target?: ResolvedPublisherTarget
    ): Promise<{ remoteId: string }> {
      assertQueueItemPublishable(item);
      const content = item.content!;
      if (!target) throw new Error("A validated profile/connection binding is required");
      const version = apiVersion(environment, target);
      const credentials = accountCredentials(environment, target, channel);
      const accessToken = credentials.accessToken;
      const existing = publishedByKey.get(idempotencyKey);
      if (existing) return { remoteId: existing };

      if (channel.connector === "meta_threads" && channel.id === "threads") {
        if (content.assetPaths.length > 0) {
          throw new Error("The verified Threads transport currently accepts text-only items");
        }
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
        if (content.assetPaths.length < 1 || content.assetPaths.some((asset) => !/\.(?:jpe?g|png|webp)$/iu.test(asset))) {
          throw new Error("The verified Instagram transport requires one to ten image assets");
        }
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
    async verify(channel: Channel, _item: RuntimeQueueItem, remoteId: string, target?: ResolvedPublisherTarget): Promise<{ remoteId: string; remoteUrl: string }> {
      if (!target) throw new Error("A validated profile/connection binding is required");
      const version = apiVersion(environment, target);
      const credentials = accountCredentials(environment, target, channel);
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
    },
    async findByIdempotencyKey(_channel: Channel, idempotencyKey: string): Promise<{ remoteId: string } | null> {
      const remoteId = publishedByKey.get(idempotencyKey);
      return remoteId ? { remoteId } : null;
    }
  };
}
