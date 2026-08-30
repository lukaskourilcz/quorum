import { createHash } from "node:crypto";
import type { ContestSource } from "../../contracts/contest-radar.js";

/**
 * How Contest Radar reaches a source, and every way it refuses to.
 *
 * One request per source per run unless the registry says otherwise, a hard byte ceiling, a
 * conditional request when the last run left a validator, and a timeout. Every one of those is a
 * refusal rather than a feature: a source that has not changed costs nothing, a source that starts
 * serving a 40 MB page is cut off, and a source that hangs cannot hold the run.
 *
 * Nothing here stores a page. The founding decision forbids a raw archive, so a body lives only
 * long enough for its adapter to read it, and what survives is a candidate, a hash and a receipt.
 *
 * The user agent identifies the crawler honestly. Imitating a browser is how a bot check gets
 * defeated, and defeating a bot check is the thing this venture does not do — `lablab.ai` and
 * `dorahacks.io` are rejected in the registry for exactly that reason rather than worked around.
 */

const USER_AGENT = "BoardlessAI-ContestRadar/1.0 (+https://boardlessai.com; owner-only research)";

/** Long enough for a slow page, short enough that one source cannot hold the run. */
const REQUEST_TIMEOUT_MS = 20_000;

export interface ContestFetchCacheEntry {
  /** `ETag` from the last successful response, when the source sent one. */
  etag: string | null;
  lastModified: string | null;
  /** Hash of the last body, so a source with no validator still detects "unchanged". */
  bodyHash: string | null;
  fetchedAt: string;
}

export type ContestFetchCache = Record<string, ContestFetchCacheEntry>;

export type ContestFetchOutcome =
  | { kind: "ok"; body: string; bodyHash: string; cache: ContestFetchCacheEntry; requestCount: number }
  | { kind: "unchanged"; cache: ContestFetchCacheEntry; requestCount: number }
  | { kind: "skipped"; reason: string; requestCount: 0 }
  | { kind: "failed"; reason: string; requestCount: number };

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A failure message a receipt can carry.
 *
 * Sanitised on purpose: no stack, no header, no body excerpt and no URL beyond the host. A receipt
 * is read by whoever is diagnosing a quiet day, and a page fragment in it is both a leak and a
 * distraction from the one fact that matters — which source stopped answering and how.
 */
function safeReason(error: unknown, host: string): string {
  const message = error instanceof Error ? error.message : "the request failed";
  return `${host}: ${message.replace(/\s+/gu, " ").slice(0, 160)}`;
}

export async function fetchContestSource(input: {
  source: ContestSource;
  cache: ContestFetchCache;
  now: Date;
  fetchImpl?: typeof fetch;
}): Promise<ContestFetchOutcome> {
  const { source } = input;

  // Every refusal the registry already recorded is honoured here rather than re-litigated. A
  // source that is rejected, held or disabled is not fetched, whatever a caller passes.
  if (source.verdict !== "enabled") {
    return { kind: "skipped", reason: `${source.id} is ${source.verdict}.`, requestCount: 0 };
  }
  if (source.discoveryOnly || source.maxRequestsPerRun === 0) {
    return { kind: "skipped", reason: `${source.id} makes no request of its own.`, requestCount: 0 };
  }
  if (source.authPosture === "owner-read-credential" && !process.env[source.credentialEnvName ?? ""]) {
    return { kind: "skipped", reason: `${source.id} waits for ${source.credentialEnvName}.`, requestCount: 0 };
  }

  const previous = input.cache[source.id];
  const headers: Record<string, string> = {
    "user-agent": USER_AGENT,
    accept: source.type === "json-api" ? "application/json" : "*/*"
  };
  // A conditional request is the cheapest possible run: the source answers 304 and sends nothing.
  if (previous?.etag) headers["if-none-match"] = previous.etag;
  if (previous?.lastModified) headers["if-modified-since"] = previous.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await (input.fetchImpl ?? fetch)(source.endpoint, {
      headers,
      redirect: "follow",
      signal: controller.signal
    });

    if (response.status === 304 && previous) {
      return { kind: "unchanged", cache: { ...previous, fetchedAt: input.now.toISOString() }, requestCount: 1 };
    }
    if (!response.ok) {
      return { kind: "failed", reason: `${source.host}: HTTP ${response.status}`, requestCount: 1 };
    }

    // The ceiling is checked against the declared length first and against the real bytes second,
    // because a source that lies about its length is exactly the one worth cutting off.
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > source.maxBodyBytes) {
      return { kind: "failed", reason: `${source.host}: declared ${declared} bytes over the ${source.maxBodyBytes} ceiling`, requestCount: 1 };
    }
    const body = await response.text();
    if (body.length > source.maxBodyBytes) {
      return { kind: "failed", reason: `${source.host}: ${body.length} bytes over the ${source.maxBodyBytes} ceiling`, requestCount: 1 };
    }

    const bodyHash = hash(body);
    // A source with no validator still gets "unchanged" from its own body hash, which is what
    // keeps a daily scan over a weekly-updating listing from re-parsing the same page all week.
    if (previous?.bodyHash === bodyHash) {
      return {
        kind: "unchanged",
        cache: { ...previous, fetchedAt: input.now.toISOString() },
        requestCount: 1
      };
    }
    return {
      kind: "ok",
      body,
      bodyHash,
      cache: {
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        bodyHash,
        fetchedAt: input.now.toISOString()
      },
      requestCount: 1
    };
  } catch (error) {
    return { kind: "failed", reason: safeReason(error, source.host), requestCount: 1 };
  } finally {
    clearTimeout(timer);
  }
}
