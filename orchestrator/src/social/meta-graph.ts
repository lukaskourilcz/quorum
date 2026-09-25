import { z } from "zod";
import type { PublishingQuota } from "../contracts/social-publish-hold.js";
import { ProviderRejectedError } from "./publish.js";

/**
 * The HTTP half of the Direct Meta adapter: one form POST, one JSON GET, the publishing-limit read
 * and the container status wait. Every call is to a URL `meta.ts` built on an official Graph host;
 * nothing here chooses a host, and nothing reads or writes state.
 */
export type FetchLike = typeof fetch;
export type Sleep = (milliseconds: number) => Promise<void>;

export const realSleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const MetaIdResponseSchema = z.object({ id: z.string().min(1) });

export async function postForm(fetchImpl: FetchLike, url: URL, values: Record<string, string>): Promise<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Meta connector returned HTTP ${response.status}`);
  const parsed = MetaIdResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Meta connector returned an invalid response");
  return parsed.data.id;
}

/** A read. The token rides in the query string, as Meta documents; callers redact errors. */
export async function getJson(fetchImpl: FetchLike, url: URL): Promise<unknown> {
  const response = await fetchImpl(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`answered HTTP ${response.status}`);
  return (await response.json()) as unknown;
}

/**
 * `threads_publishing_limit` and `content_publishing_limit` answer the same shape:
 * `{ data: [{ quota_usage, config: { quota_total, quota_duration } }] }`
 * (developers.facebook.com/docs/threads/troubleshooting,
 * developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit).
 */
const PublishingLimitSchema = z.object({
  data: z.array(z.object({
    quota_usage: z.number().int().nonnegative(),
    config: z.object({
      quota_total: z.number().int().positive(),
      quota_duration: z.number().int().positive()
    })
  })).min(1)
});

/** Read one account's publishing limit. Throws when it cannot be read; the caller holds on that. */
export async function readPublishingQuota(fetchImpl: FetchLike, url: URL): Promise<PublishingQuota> {
  const parsed = PublishingLimitSchema.safeParse(await getJson(fetchImpl, url));
  if (!parsed.success) throw new Error("the publishing limit answer has no quota_usage and config");
  const [entry] = parsed.data.data;
  return { usage: entry!.quota_usage, total: entry!.config.quota_total, durationSeconds: entry!.config.quota_duration };
}

/** True when one more post fits: Meta counts a carousel as one post on both platforms. */
export function quotaHasRoom(quota: PublishingQuota): boolean {
  return quota.usage + 1 <= quota.total;
}

const CONTAINER_STATES = ["EXPIRED", "ERROR", "FINISHED", "IN_PROGRESS", "PUBLISHED"] as const;

/**
 * How long to wait for a container before publishing it.
 *
 * Threads: Meta recommends waiting about 30 seconds before `threads_publish` so the upload is fully
 * processed, and `GET /{container}?fields=status,error_message` says whether it was
 * (developers.facebook.com/docs/threads/posts, /docs/threads/troubleshooting). Instagram: query
 * `status_code` once a minute for no more than five minutes
 * (developers.facebook.com/docs/instagram-platform/content-publishing).
 */
export interface ContainerWait {
  platform: "Threads" | "Instagram";
  field: "status" | "status_code";
  firstWaitMs: number;
  retryWaitMs: number;
  maxReads: number;
}

export const THREADS_CONTAINER_WAIT: ContainerWait = { platform: "Threads", field: "status", firstWaitMs: 30_000, retryWaitMs: 30_000, maxReads: 5 };
export const INSTAGRAM_CONTAINER_WAIT: ContainerWait = { platform: "Instagram", field: "status_code", firstWaitMs: 0, retryWaitMs: 60_000, maxReads: 6 };

const ContainerStatusSchema = z.looseObject({
  status: z.string().optional(),
  status_code: z.string().optional(),
  error_message: z.string().optional()
});

function bounded(text: string | undefined): string | null {
  const trimmed = text?.replace(/\s+/gu, " ").trim().slice(0, 120);
  return trimmed ? trimmed : null;
}

/**
 * Wait until a container is `FINISHED`, or throw.
 *
 * Every throw here happens before the publish request, so nothing reached a feed. `ERROR` and
 * `EXPIRED` are Meta's final answer that the container will never publish, so they throw
 * `ProviderRejectedError` and the item fails for owner review. An unreadable status, `PUBLISHED`
 * before the request, or a container still `IN_PROGRESS` after the last read is not a final answer:
 * the runner records it as ambiguous, and the error text says that nothing was published so
 * reconciliation is a check, not a hunt.
 */
export async function awaitContainer(fetchImpl: FetchLike, sleep: Sleep, statusUrl: URL, wait: ContainerWait): Promise<void> {
  if (wait.firstWaitMs > 0) await sleep(wait.firstWaitMs);
  for (let read = 1; read <= wait.maxReads; read += 1) {
    const parsed = ContainerStatusSchema.safeParse(await getJson(fetchImpl, statusUrl));
    const raw = parsed.success ? parsed.data[wait.field] : undefined;
    const state = (CONTAINER_STATES as readonly string[]).includes(raw ?? "") ? raw as (typeof CONTAINER_STATES)[number] : null;
    if (state === "FINISHED") return;
    if (state === null) throw new Error(`${wait.platform} container status is unreadable; nothing was published`);
    if (state === "PUBLISHED") throw new Error(`${wait.platform} container reports PUBLISHED before the publish request`);
    if (state === "ERROR" || state === "EXPIRED") {
      const reason = bounded(parsed.success ? (parsed.data.error_message ?? (wait.field === "status_code" ? parsed.data.status : undefined)) : undefined);
      throw new ProviderRejectedError("container-failed", `${wait.platform} container is ${state}${reason ? ` (${reason})` : ""} before publish; nothing was published`);
    }
    if (read < wait.maxReads) await sleep(wait.retryWaitMs);
  }
  throw new Error(`${wait.platform} container is still IN_PROGRESS after ${wait.maxReads} reads; nothing was published`);
}
