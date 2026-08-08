import { createHash } from "node:crypto";
import { atomicWriteJson, readJson } from "../state.js";

/**
 * Pixabay's terms require that an API response be cached for 24 hours rather than re-requested.
 *
 * So this is a contractual obligation before it is an optimisation, which is why it is a file on
 * disk and not a map in memory: three cycles run a day in separate processes, and an in-memory
 * cache would satisfy nothing. It also happens to be the cheapest way to keep a re-run of the
 * morning slot off a rate-limited free tier.
 *
 * Keyed by the request URL with the key stripped out. A key in a cache filename is a key on disk
 * in a place nobody is watching, and the query is what identifies the response anyway.
 */
const TTL_MS = 24 * 60 * 60 * 1_000;

export interface CachedProviderResponse {
  storedAt: string;
  payload: unknown;
}

/** The cache key: the request without its credential. */
export function pixabayCacheKey(url: string): string {
  let stripped = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("key");
    stripped = parsed.toString();
  } catch {
    // A malformed URL still gets a stable key; it will simply never match a real request.
  }
  return createHash("sha256").update(stripped).digest("hex").slice(0, 32);
}

function cachePath(key: string): string {
  return `cache/pixabay/${key}.json`;
}

/** The stored response, or null when there is none or it has aged out. */
export async function readPixabayCache(
  root: string,
  url: string,
  now: Date
): Promise<unknown | null> {
  const entry = await readJson<CachedProviderResponse | null>(root, cachePath(pixabayCacheKey(url)), null)
    .catch(() => null);
  if (!entry?.storedAt) return null;
  const age = now.getTime() - new Date(entry.storedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > TTL_MS) return null;
  return entry.payload;
}

export async function writePixabayCache(
  root: string,
  url: string,
  payload: unknown,
  now: Date
): Promise<void> {
  await atomicWriteJson(root, cachePath(pixabayCacheKey(url)), {
    storedAt: now.toISOString(),
    payload
  } satisfies CachedProviderResponse).catch(() => undefined);
}
