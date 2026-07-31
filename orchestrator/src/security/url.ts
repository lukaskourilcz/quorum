import dns from "node:dns/promises";
import net from "node:net";

const ALLOWED_CONTENT_TYPES = [
  "application/atom+xml",
  "application/feed+json",
  "application/json",
  "application/rss+xml",
  "application/xml",
  "text/html",
  "text/plain",
  "text/xml"
];

export class UnsafeUrlError extends Error {}

function isPrivateIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a = -1, b = -1] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") ||
    normalized.startsWith("::ffff:192.168.")
  );
}

export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return !isPrivateIpv4(address);
  }
  if (family === 6) {
    return !isPrivateIpv6(address);
  }
  return false;
}

export function parseSafeHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("URL is invalid");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError("Only HTTPS URLs are allowed");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Credentials in URLs are forbidden");
  }
  if (
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    url.hostname === "metadata.google.internal"
  ) {
    throw new UnsafeUrlError("Local and metadata hosts are forbidden");
  }
  if (net.isIP(url.hostname) && !isPublicAddress(url.hostname)) {
    throw new UnsafeUrlError("Private address is forbidden");
  }
  return url;
}

export async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  if (net.isIP(hostname)) {
    return [hostname];
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true });
  const addresses = records.map((record) => record.address);
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address))) {
    throw new UnsafeUrlError("Host resolves to a private or missing address");
  }
  return addresses;
}

export interface SafeFetchOptions {
  allowHosts: readonly string[];
  method?: "GET" | "POST";
  headers?: Readonly<Record<string, string>>;
  body?: string;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}

export async function safeFetch(
  raw: string,
  options: SafeFetchOptions
): Promise<{ url: string; contentType: string; body: Uint8Array }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const resolveImpl = options.resolveImpl ?? resolvePublicAddresses;
  const maxRedirects = options.maxRedirects ?? 3;
  const maxBytes = options.maxBytes ?? 1_000_000;
  let url = parseSafeHttpsUrl(raw);
  const method = options.method ?? "GET";

  if (method === "GET" && options.body !== undefined) {
    throw new UnsafeUrlError("GET requests cannot include a body");
  }
  for (const name of Object.keys(options.headers ?? {})) {
    if (["cookie", "host", "proxy-authorization", "forwarded"].includes(name.toLowerCase())) {
      throw new UnsafeUrlError(`Forbidden request header: ${name}`);
    }
  }

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!options.allowHosts.includes(url.hostname)) {
      throw new UnsafeUrlError(`Host is not allowlisted: ${url.hostname}`);
    }
    const addresses = await resolveImpl(url.hostname);
    if (addresses.some((address) => !isPublicAddress(address))) {
      throw new UnsafeUrlError("DNS resolution includes a private address");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8_000);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          Accept:
            "application/json, application/atom+xml, application/rss+xml, application/xml, text/plain;q=0.9, text/html;q=0.7",
          ...options.headers
        },
        method,
        body: options.body,
        redirect: "manual",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 300 && response.status < 400) {
      if (method !== "GET") {
        throw new UnsafeUrlError("Redirects are forbidden for non-GET requests");
      }
      const location = response.headers.get("location");
      if (!location || redirect === maxRedirects) {
        throw new UnsafeUrlError("Unsafe or excessive redirect");
      }
      url = parseSafeHttpsUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) {
      throw new UnsafeUrlError(`Source returned HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new UnsafeUrlError(`Unexpected content type: ${contentType}`);
    }
    const declaredLength = Number(response.headers.get("content-length") ?? 0);
    if (declaredLength > maxBytes) {
      throw new UnsafeUrlError("Declared response is too large");
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new UnsafeUrlError("Decompressed response is too large");
    }
    return { url: url.toString(), contentType, body: buffer };
  }
  throw new UnsafeUrlError("Redirect limit exceeded");
}
