/**
 * The one network door this package has.
 *
 * Every host is named by the caller from config, never taken from a response: fal answers with
 * an output URL and a stock search answers with photo URLs, and a hostile or broken answer could
 * otherwise point the downloader anywhere. HTTPS only, a timeout on every call and a byte ceiling
 * on every body, because a runner that hangs on one frame still bills its minutes.
 */
export class HttpFailure extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export interface FetchedBody {
  status: number;
  contentType: string;
  body: Uint8Array;
}

export type Fetcher = typeof fetch;

export interface BoundedFetchOptions extends Omit<RequestInit, "signal"> {
  allowHosts: readonly string[];
  maxBytes: number;
  timeoutMs: number;
  /** Return non-2xx responses instead of throwing; the ingest client reads 409 and 429 bodies. */
  acceptAnyStatus?: boolean;
  /** Tests point the ingest client at http://127.0.0.1; production never does. */
  allowInsecureLoopback?: boolean;
  fetcher?: Fetcher;
}

export function checkUrl(raw: string, allowHosts: readonly string[], allowInsecureLoopback = false): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpFailure("URL is invalid", 0);
  }
  const loopback = allowInsecureLoopback && url.protocol === "http:" && url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !loopback) throw new HttpFailure("only HTTPS is allowed", 0);
  if (url.username || url.password) throw new HttpFailure("credentials in URLs are refused", 0);
  if (!loopback && !allowHosts.includes(url.hostname)) {
    throw new HttpFailure(`host ${url.hostname} is not on the allowlist`, 0);
  }
  return url;
}

export async function boundedFetch(raw: string, options: BoundedFetchOptions): Promise<FetchedBody> {
  const { allowHosts, maxBytes, timeoutMs, acceptAnyStatus, allowInsecureLoopback, fetcher, ...init } = options;
  const url = checkUrl(raw, allowHosts, allowInsecureLoopback);
  const response = await (fetcher ?? fetch)(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs)
  });
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new HttpFailure(`response is larger than ${maxBytes} bytes`, response.status);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpFailure(`response is larger than ${maxBytes} bytes`, response.status);
      }
      chunks.push(value);
    }
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (!response.ok && !acceptAnyStatus) {
    const retryAfter = Number(response.headers.get("retry-after") ?? NaN);
    // The body of a provider error can echo the request; only the status leaves this function.
    throw new HttpFailure(`HTTP ${response.status}`, response.status, Number.isFinite(retryAfter) ? retryAfter : undefined);
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body
  };
}

export function parseJson(body: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new HttpFailure("response is not JSON", 0);
  }
}
