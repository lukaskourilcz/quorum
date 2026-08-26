import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import Parser from "rss-parser";
import { safeFetch } from "../security/url.js";
import { configRoot } from "../paths.js";
import type { StreamItem, StreamName, StreamSyncReceipt } from "../contracts/boardless-stream.js";
import { mergeStream, normalizeItem, type RawStreamInput } from "./normalize.js";
import { loadStreamRegistry, sourcesFor, type StreamRegistry, type StreamSourceEntry } from "./registry.js";

/**
 * Zero model calls live anywhere in this file, which is why stream syncing sits
 * outside the model share of the operating cap entirely. The only network calls
 * are feed reads through `safeFetch`, which enforces the host allowlist, the
 * public-address check and the byte and redirect caps.
 */
// Measured against the real registry: a full-text Substack archive decompresses
// past 2 MB, which silently cost two sources on the first live run.
const MAX_FEED_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 15_000;

// The same parser the source adapters use. rss-parser handles RSS 2.0 and Atom
// in one pass, which the registry mixes, and it is already a dependency.
const parser = new Parser({
  timeout: FETCH_TIMEOUT_MS,
  customFields: { item: [["itunes:duration", "itunesDuration"]] },
});

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
}

function allowedHosts(): string[] {
  const raw = readFileSync(path.join(configRoot, "network-allowlist.json"), "utf8");
  return (JSON.parse(raw) as { runtimeHosts: string[] }).runtimeHosts;
}

/** Duration as seconds, from either `1:02:03` or a plain second count. */
export function parseDuration(value: unknown): number | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  if (/^\d+$/u.test(raw)) return Number(raw);
  const parts = raw.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** RSS 2.0 and Atom in one pass: the registry mixes both. */
export async function parseFeed(xml: string): Promise<RawStreamInput[]> {
  const feed = await parser.parseString(xml);
  return (feed.items ?? []).map((entry) => {
    const item = entry as unknown as Record<string, unknown>;
    return {
      title: text(item.title),
      url: text(item.link),
      author: text(item.creator) ?? text(item.author),
      summary: text(item.contentSnippet) ?? text(item.content) ?? text(item.summary),
      publishedAt: text(item.isoDate) ?? text(item.pubDate),
      durationSec: parseDuration(item.itunesDuration),
    };
  });
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
  now: string;
}

async function readFeed(entry: StreamSourceEntry, allowHosts: readonly string[], deps: FetchDeps): Promise<string> {
  const response = await safeFetch(entry.feed!, {
    allowHosts,
    maxBytes: MAX_FEED_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.resolveImpl ? { resolveImpl: deps.resolveImpl } : {}),
  });
  return new TextDecoder().decode(response.body);
}

export interface SyncInput {
  stream: StreamName;
  current: readonly StreamItem[];
  registry?: StreamRegistry;
  windowDays?: number;
  perSourcePerDay?: number;
  deps: FetchDeps;
}

export interface SyncOutput {
  items: StreamItem[];
  receipt: StreamSyncReceipt;
}

/**
 * One sync pass.
 *
 * A source that fails yields zero items and one receipt note. It never throws,
 * because a feed being down for a day must not be able to fail a cycle that
 * also delivers an edition.
 */
export async function syncStream(input: SyncInput): Promise<SyncOutput> {
  const registry = input.registry ?? loadStreamRegistry();
  const allowHosts = allowedHosts();
  const entries = sourcesFor(registry, input.stream);
  const sourceErrors: Array<{ source: string; reason: string }> = [];
  const fetched: StreamItem[] = [];

  for (const entry of entries) {
    try {
      const xml = await readFeed(entry, allowHosts, input.deps);
      for (const raw of await parseFeed(xml)) {
        const item = normalizeItem(raw, entry, input.stream);
        if (item) fetched.push(item);
      }
    } catch (error) {
      sourceErrors.push({
        source: entry.id,
        reason: error instanceof Error ? error.message.slice(0, 200) : "unknown error",
      });
    }
  }

  const merged = mergeStream(input.current, fetched, {
    anchor: input.deps.now,
    windowDays: input.windowDays ?? 60,
    perSourcePerDay: input.perSourcePerDay ?? 4,
  });

  return {
    items: merged.items,
    receipt: {
      schemaVersion: "stream-sync/1",
      stream: input.stream,
      date: input.deps.now,
      before: input.current.length,
      after: merged.items.length,
      added: merged.added,
      pruned: merged.pruned,
      sourceErrors,
    },
  };
}

/**
 * Podcast Index auth. Used only for shows with no workable RSS or YouTube
 * surface, so the common path needs no key at all and the absence of one
 * degrades a few shows rather than the stream.
 */
export function podcastIndexHeaders(key: string, secret: string, unixSeconds: number): Record<string, string> {
  return {
    "X-Auth-Key": key,
    "X-Auth-Date": String(unixSeconds),
    Authorization: createHmac("sha1", "").update(`${key}${secret}${unixSeconds}`).digest("hex"),
    "User-Agent": "BoardlessAI/streams",
  };
}
