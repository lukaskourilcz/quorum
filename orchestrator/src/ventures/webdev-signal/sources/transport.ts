import { createHash } from "node:crypto";
import type { WebDevSource } from "../../../contracts/webdev-signal.js";
import { safeFetch } from "../../../security/url.js";
import type { WebDevSourceCacheEntry } from "./cache.js";

const USER_AGENT = "BoardlessAI-WebDevSignal/1.0 (+source-collection; no-cookie)";
const RETRYABLE_STATUSES = [429, 500, 502, 503, 504] as const;
const SOURCE_VERSION = "1.0.0";

interface TransportBase {
  sourceId: string;
  attempts: number;
  nextCache: WebDevSourceCacheEntry;
}

export type WebDevTransportResult =
  | (TransportBase & { kind: "fetched"; body: Uint8Array; contentType: string; finalUrl: string })
  | (TransportBase & { kind: "unchanged"; reason: "not-modified" | "content-hash" })
  | (TransportBase & { kind: "held" | "failed"; reason: string })
  | (TransportBase & { kind: "backoff"; reason: string; retryAfterAt: string });

export interface WebDevTransportInput {
  source: WebDevSource;
  now: string;
  cache?: WebDevSourceCacheEntry;
  mode: "live" | "dry" | "fixture";
  fixtureBody?: Uint8Array;
  fixtureContentType?: string;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
  delayImpl?: (milliseconds: number) => Promise<void>;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function blankCache(source: WebDevSource): WebDevSourceCacheEntry {
  return {
    sourceId: source.id,
    etag: null,
    lastModified: null,
    contentHash: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastNonEmptySuccessAt: null,
    retryAfterAt: null,
    parserVersion: source.parser.version,
    sourceVersion: SOURCE_VERSION,
    layoutFingerprint: null,
    consecutiveFailures: 0,
    heldReason: null
  };
}

function retryAfterAt(value: string | undefined, now: string): string {
  const nowMs = new Date(now).getTime();
  const seconds = Number(value);
  const parsedMs = Number.isFinite(seconds) && seconds >= 0
    ? nowMs + Math.min(seconds, 86_400) * 1_000
    : Date.parse(value ?? "");
  const safeMs = Number.isFinite(parsedMs) && parsedMs >= nowMs
    ? Math.min(parsedMs, nowMs + 86_400_000)
    : nowMs + 60_000;
  return new Date(safeMs).toISOString();
}

function fail(source: WebDevSource, cache: WebDevSourceCacheEntry, now: string, reason: string, attempts: number): WebDevTransportResult {
  const consecutiveFailures = cache.consecutiveFailures + 1;
  const held = consecutiveFailures >= source.healthPolicy.failureThreshold;
  const nextCache = {
    ...cache,
    lastAttemptAt: now,
    parserVersion: source.parser.version,
    sourceVersion: SOURCE_VERSION,
    consecutiveFailures,
    heldReason: held ? reason.slice(0, 240) : null
  };
  return { kind: held ? "held" : "failed", sourceId: source.id, attempts, reason: reason.slice(0, 240), nextCache };
}

function successCache(input: {
  source: WebDevSource;
  cache: WebDevSourceCacheEntry;
  now: string;
  hash: string;
  etag?: string;
  lastModified?: string;
  nonEmpty: boolean;
}): WebDevSourceCacheEntry {
  return {
    ...input.cache,
    etag: input.etag ?? input.cache.etag,
    lastModified: input.lastModified ?? input.cache.lastModified,
    contentHash: input.hash,
    lastAttemptAt: input.now,
    lastSuccessAt: input.now,
    lastNonEmptySuccessAt: input.nonEmpty ? input.now : input.cache.lastNonEmptySuccessAt,
    retryAfterAt: null,
    parserVersion: input.source.parser.version,
    sourceVersion: SOURCE_VERSION,
    consecutiveFailures: 0,
    heldReason: null
  };
}

export async function fetchWebDevSource(input: WebDevTransportInput): Promise<WebDevTransportResult> {
  const { source, now } = input;
  const cache = input.cache ?? blankCache(source);
  if (source.state !== "enabled" && source.state !== "optional") {
    return fail(source, cache, now, `source-${source.state}:${source.stateReason}`, 0);
  }
  if (input.mode === "dry") {
    return fail(source, cache, now, "dry-mode-no-network-or-cache-mutation", 0);
  }
  if (input.mode === "fixture") {
    if (!input.fixtureBody) return fail(source, cache, now, "fixture-body-missing", 0);
    const body = input.fixtureBody;
    const hash = sha256(body);
    const nextCache = successCache({ source, cache, now, hash, nonEmpty: body.byteLength > 0 });
    return { kind: "fetched", sourceId: source.id, attempts: 0, body, contentType: input.fixtureContentType ?? "application/json", finalUrl: source.endpoint, nextCache };
  }
  if (process.env.CI && !input.fetchImpl) {
    return fail(source, cache, now, "ci-live-network-disabled", 0);
  }
  if (cache.retryAfterAt && cache.retryAfterAt > now) {
    return { kind: "backoff", sourceId: source.id, attempts: 0, reason: "cached-retry-after", retryAfterAt: cache.retryAfterAt, nextCache: cache };
  }

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (cache.etag) headers["If-None-Match"] = cache.etag;
  if (cache.lastModified) headers["If-Modified-Since"] = cache.lastModified;
  const maximumAttempts = Math.min(2, source.limits.requestCapPerRun);

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const response = await safeFetch(source.endpoint, {
        allowHosts: [source.canonicalHost],
        headers,
        maxBytes: source.limits.bodyBytes,
        maxRedirects: source.limits.redirects,
        timeoutMs: source.limits.timeoutMs,
        acceptedStatuses: [304, ...RETRYABLE_STATUSES],
        responseHeaderNames: ["etag", "last-modified", "retry-after"],
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
      });
      if (response.status === 304) {
        if (!cache.contentHash) return fail(source, cache, now, "not-modified-without-cache", attempt);
        const nextCache = {
          ...cache,
          etag: response.headers.etag ?? cache.etag,
          lastModified: response.headers["last-modified"] ?? cache.lastModified,
          lastAttemptAt: now,
          lastSuccessAt: now,
          retryAfterAt: null,
          consecutiveFailures: 0,
          heldReason: null
        };
        return { kind: "unchanged", sourceId: source.id, attempts: attempt, reason: "not-modified", nextCache };
      }
      if (RETRYABLE_STATUSES.includes(response.status as (typeof RETRYABLE_STATUSES)[number])) {
        const retryAt = retryAfterAt(response.headers["retry-after"], now);
        const nextCache = { ...cache, lastAttemptAt: now, retryAfterAt: retryAt };
        if (attempt < maximumAttempts) {
          await (input.delayImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(Math.min(1_000, Math.max(0, Date.parse(retryAt) - Date.parse(now))));
          continue;
        }
        if (response.status === 429) {
          return { kind: "backoff", sourceId: source.id, attempts: attempt, reason: "http-429", retryAfterAt: retryAt, nextCache };
        }
        return fail(source, { ...cache, retryAfterAt: retryAt }, now, `http-${response.status}`, attempt);
      }
      const hash = sha256(response.body);
      const nextCache = successCache({
        source,
        cache,
        now,
        hash,
        etag: response.headers.etag,
        lastModified: response.headers["last-modified"],
        nonEmpty: response.body.byteLength > 0
      });
      if (cache.contentHash === hash) {
        return { kind: "unchanged", sourceId: source.id, attempts: attempt, reason: "content-hash", nextCache };
      }
      return { kind: "fetched", sourceId: source.id, attempts: attempt, body: response.body, contentType: response.contentType, finalUrl: response.url, nextCache };
    } catch (error) {
      if (attempt < maximumAttempts) {
        await (input.delayImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))))(250 * attempt);
        continue;
      }
      const reason = error instanceof Error ? error.message : "unknown-transport-error";
      return fail(source, cache, now, reason, attempt);
    }
  }
  return fail(source, cache, now, "transport-attempts-exhausted", maximumAttempts);
}
