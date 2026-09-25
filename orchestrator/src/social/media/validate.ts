import sharp from "sharp";
import { parseSafeHttpsUrl, safeFetch } from "../../security/url.js";

export interface MediaValidation {
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export async function validateSocialImage(
  bytes: Buffer,
  maxBytes = 8_000_000
): Promise<MediaValidation> {
  if (bytes.byteLength > maxBytes) {
    throw new Error("Social image exceeds the byte cap");
  }
  const metadata = await sharp(bytes).metadata();
  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error("Unable to read social image metadata");
  }
  if (metadata.width < 320 || metadata.height < 320) {
    throw new Error("Social image is too small");
  }
  if (!["jpeg", "png", "webp"].includes(metadata.format)) {
    throw new Error(`Unsupported social image format: ${metadata.format}`);
  }
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    bytes: bytes.byteLength
  };
}

/** The content type a hosted frame must answer with, by extension. Instagram and Threads take nothing else. */
export function hostedImageType(assetPath: string): "image/png" | "image/jpeg" {
  return /\.png$/iu.test(assetPath) ? "image/png" : "image/jpeg";
}

export type HostedImageCheck =
  | { ok: true; contentType: "image/png" | "image/jpeg"; declaredBytes: number | null }
  | { ok: false; outcome: "host-not-allowlisted" | "unreachable" | "wrong-type"; detail: string };

/**
 * Ask the URL a platform will fetch whether it serves the frame, before anything is sent.
 *
 * A `HEAD` through `safeFetch`, so the host must be on the runtime allowlist, the address public,
 * the scheme HTTPS and the answer a 200 without a redirect. The content type must be the one the
 * file's extension promises: a PNG path that answers `text/plain` is a 404 page wearing a 200.
 * Every miss is returned, never thrown, because the caller holds the item rather than failing the
 * run, and never retried against another URL.
 */
export async function checkHostedSocialImage(url: string, options: {
  assetPath: string;
  allowHosts: readonly string[];
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}): Promise<HostedImageCheck> {
  const expected = hostedImageType(options.assetPath);
  let hostname: string;
  try {
    hostname = parseSafeHttpsUrl(url).hostname;
  } catch (error) {
    return { ok: false, outcome: "unreachable", detail: boundedDetail(error) };
  }
  if (!options.allowHosts.includes(hostname)) {
    return { ok: false, outcome: "host-not-allowlisted", detail: `${hostname} is not on the runtime allowlist` };
  }
  try {
    const response = await safeFetch(url, {
      allowHosts: options.allowHosts,
      method: "HEAD",
      headers: { Accept: `${expected}` },
      maxBytes: 8_000_000,
      maxRedirects: 0,
      timeoutMs: 10_000,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.resolveImpl ? { resolveImpl: options.resolveImpl } : {}),
      responseHeaderNames: ["content-length"]
    });
    if (response.status !== 200) {
      return { ok: false, outcome: "unreachable", detail: `answered HTTP ${response.status}, not 200` };
    }
    if (response.contentType !== expected) {
      return { ok: false, outcome: "wrong-type", detail: `answered ${response.contentType || "no content type"}, not ${expected}` };
    }
    const declared = Number(response.headers["content-length"] ?? Number.NaN);
    return { ok: true, contentType: expected, declaredBytes: Number.isFinite(declared) ? declared : null };
  } catch (error) {
    const detail = boundedDetail(error);
    return { ok: false, outcome: /Unexpected content type/u.test(detail) ? "wrong-type" : "unreachable", detail };
  }
}

function boundedDetail(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim().slice(0, 300) || "no detail";
}
