import { createHash } from "node:crypto";
import type { StreamItem, StreamName } from "../contracts/boardless-stream.js";
import { StreamItemSchema } from "../contracts/boardless-stream.js";
import type { StreamSourceEntry } from "./registry.js";

/**
 * The canonical form of a URL, which is what the id is taken from.
 *
 * Tracking parameters are the reason this exists: the same post arriving with
 * and without `?utm_source=` must be one item, not two, or every sync would
 * re-add yesterday's links.
 */
export function canonicalUrl(raw: string): string {
  const url = new URL(raw);
  url.hash = "";
  // Deliberately not normalising the scheme. Forcing https: here would promote
  // an http link into a valid-looking one instead of letting the caller refuse
  // it, which is the opposite of what the https check is for.
  url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|ref_|source$|si$|fbclid$|gclid$)/u.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

export function streamItemId(url: string): string {
  return createHash("sha1").update(canonicalUrl(url)).digest("hex");
}

/** YYYY-MM-DD in UTC from an RSS date, or null when it is unusable. */
export function publishedDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export interface RawStreamInput {
  title?: string;
  url?: string;
  author?: string;
  summary?: string;
  publishedAt?: string;
  durationSec?: number;
}

function clamp(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.replace(/\s+/gu, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/**
 * One feed entry to one stream item, or null when it cannot be rendered.
 *
 * Returning null rather than throwing is the whole posture of this path: a
 * malformed entry costs one item, a failed source costs a section, and neither
 * may cost the run.
 */
export function normalizeItem(
  raw: RawStreamInput,
  entry: StreamSourceEntry,
  stream: StreamName,
): StreamItem | null {
  if (!raw.url || !raw.title) return null;
  let url: string;
  try {
    url = canonicalUrl(raw.url);
  } catch {
    return null;
  }
  if (!url.startsWith("https://")) return null;
  const published = publishedDate(raw.publishedAt);
  if (!published) return null;

  const candidate = {
    id: streamItemId(url),
    title: clamp(raw.title, 300),
    url,
    source: { kind: entry.kind, name: entry.name, ...(entry.feed ? { feed: entry.feed } : {}) },
    published,
    ...(clamp(raw.author, 120) ? { author: clamp(raw.author, 120) } : {}),
    ...(clamp(raw.summary, 280) ? { summary: clamp(raw.summary, 280) } : {}),
    ...(stream === "podcasts"
      ? {
          show: entry.name,
          ...(raw.durationSec && raw.durationSec > 0 ? { durationSec: Math.round(raw.durationSec) } : {}),
          ...(entry.links && Object.keys(entry.links).length > 0 ? { links: entry.links } : {}),
        }
      : {}),
  };

  const parsed = StreamItemSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export interface MergeResult {
  items: StreamItem[];
  added: string[];
  pruned: string[];
}

/**
 * Merge a fetch into the current file.
 *
 * Existing items win on conflict: a title the magazine already published should
 * not silently change because a feed re-worded it. Anything older than the
 * window is pruned, and each source is capped per day so one busy blog cannot
 * take the whole page.
 */
export function mergeStream(
  current: readonly StreamItem[],
  fetched: readonly StreamItem[],
  options: { anchor: string; windowDays: number; perSourcePerDay: number },
): MergeResult {
  const floor = new Date(Date.UTC(
    Number(options.anchor.slice(0, 4)),
    Number(options.anchor.slice(5, 7)) - 1,
    Number(options.anchor.slice(8, 10)),
  ) - (options.windowDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const byId = new Map<string, StreamItem>();
  for (const item of current) byId.set(item.id, item);

  const added: string[] = [];
  const perSourceDay = new Map<string, number>();
  for (const item of current) {
    const key = `${item.source.name}|${item.published}`;
    perSourceDay.set(key, (perSourceDay.get(key) ?? 0) + 1);
  }

  for (const item of fetched) {
    if (byId.has(item.id)) continue;
    if (item.published < floor) continue;
    const key = `${item.source.name}|${item.published}`;
    const used = perSourceDay.get(key) ?? 0;
    if (used >= options.perSourcePerDay) continue;
    perSourceDay.set(key, used + 1);
    byId.set(item.id, item);
    added.push(item.id);
  }

  const pruned: string[] = [];
  for (const [id, item] of byId) {
    if (item.published < floor) {
      pruned.push(id);
      byId.delete(id);
    }
  }

  const items = [...byId.values()].sort(
    (a, b) => b.published.localeCompare(a.published) || a.title.localeCompare(b.title),
  );
  return { items, added, pruned };
}
