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

/**
 * What each platform's publishing API accepts for one image, from Meta's own references (read
 * 2026-09-25): Instagram takes JPEG only, 8 MB, width 320 to 1,440, aspect 4:5 to 1.91:1, sRGB
 * (developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media);
 * Threads takes JPEG or PNG, 8 MB, width 320 to 1,440, aspect up to 10:1, and converts other colour
 * spaces itself (developers.facebook.com/docs/threads/posts). 8 MB is read as 8,000,000 bytes, the
 * stricter reading, and the width floor is enforced although both platforms would upscale: a frame
 * narrower than 320 pixels is not one this company rendered.
 */
export const PLATFORM_IMAGE_RULES = {
  instagram: { formats: ["jpeg"], maxBytes: 8_000_000, minWidth: 320, maxWidth: 1_440, minAspect: 4 / 5, maxAspect: 1.91, srgbOnly: true },
  threads: { formats: ["jpeg", "png"], maxBytes: 8_000_000, minWidth: 320, maxWidth: 1_440, minAspect: 1 / 10, maxAspect: 10, srgbOnly: false }
} as const satisfies Record<string, {
  formats: readonly ("jpeg" | "png")[];
  maxBytes: number;
  minWidth: number;
  maxWidth: number;
  minAspect: number;
  maxAspect: number;
  srgbOnly: boolean;
}>;
export type ImagePlatform = keyof typeof PLATFORM_IMAGE_RULES;

export function isImagePlatform(channel: string): channel is ImagePlatform {
  return Object.hasOwn(PLATFORM_IMAGE_RULES, channel);
}

/** A path's extension alone already rules a frame out: Instagram refuses a PNG before it is fetched. */
export function platformAcceptsExtension(channel: ImagePlatform, assetPath: string): boolean {
  const format = /\.png$/iu.test(assetPath) ? "png" : /\.jpe?g$/iu.test(assetPath) ? "jpeg" : null;
  return format !== null && (PLATFORM_IMAGE_RULES[channel].formats as readonly string[]).includes(format);
}

export type PlatformImageCheck = { ok: true } | { ok: false; detail: string };

/**
 * Check a frame's actual bytes against what its platform accepts, before the platform is asked to
 * fetch it. A refusal here would otherwise surface as a container `ERROR` after the item had been
 * handed over, which the publisher has to treat as an ambiguous delivery.
 */
export async function checkPlatformImage(bytes: Uint8Array, channel: ImagePlatform): Promise<PlatformImageCheck> {
  const rules = PLATFORM_IMAGE_RULES[channel];
  const name = channel === "instagram" ? "Instagram" : "Threads";
  if (bytes.byteLength > rules.maxBytes) return { ok: false, detail: `${bytes.byteLength} bytes is over ${name}'s ${rules.maxBytes}` };
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes).metadata();
  } catch {
    return { ok: false, detail: "the bytes do not decode as an image" };
  }
  const { width, height, format, space } = metadata;
  if (!width || !height || !format) return { ok: false, detail: "the image has no readable size or format" };
  if (!(rules.formats as readonly string[]).includes(format)) return { ok: false, detail: `${name} does not accept ${format}; it takes ${rules.formats.join(" or ")}` };
  if (width < rules.minWidth || width > rules.maxWidth) return { ok: false, detail: `width ${width} is outside ${name}'s ${rules.minWidth} to ${rules.maxWidth}` };
  const aspect = width / height;
  if (aspect < rules.minAspect - 1e-9 || aspect > rules.maxAspect + 1e-9) {
    return { ok: false, detail: `aspect ${width}:${height} is outside what ${name} accepts` };
  }
  if (rules.srgbOnly && space !== "srgb") return { ok: false, detail: `colour space ${space ?? "unknown"} is not the sRGB ${name} requires` };
  return { ok: true };
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
