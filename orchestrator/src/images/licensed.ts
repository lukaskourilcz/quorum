import sharp from "sharp";
import { ArticleImageSchema, type ArticleImage } from "../contracts/autonomy.js";
import { safeFetch } from "../security/url.js";
import { validateLicensedImageCandidate } from "./article-image.js";

export type LicensedImageProvider = "openverse" | "wikimedia" | "pexels" | "pixabay";

export interface LicensedPhotoCandidate {
  id: string;
  provider: LicensedImageProvider;
  title: string;
  thumbnailUrl: string;
  downloadUrl: string;
  width: number;
  height: number;
  license: "CC0" | "CC BY" | "CC BY-SA" | "Pexels License" | "Pixabay Content License";
  author: string;
  sourceUrl: string;
  attributionHtml: string;
}

export interface LicensedImageSearchResult {
  candidates: LicensedPhotoCandidate[];
  skippedProviders: Array<{ provider: "pexels" | "pixabay"; reason: "missing-key" }>;
}

type JsonFetcher = (url: string, options: { headers?: Record<string, string> }) => Promise<unknown>;

const API_HOSTS = ["api.openverse.org", "commons.wikimedia.org", "api.pexels.com", "pixabay.com"];
// Openverse aggregates, so its images live on the original provider's CDN. Only hosts named
// here are downloadable; a candidate served from anywhere else is dropped by candidateHosted.
const DOWNLOAD_HOSTS = [
  "upload.wikimedia.org",
  "images.pexels.com",
  "cdn.pixabay.com",
  "pixabay.com",
  "live.staticflickr.com",
  "farm1.staticflickr.com",
  "farm2.staticflickr.com",
  "farm3.staticflickr.com",
  "farm4.staticflickr.com",
  "farm5.staticflickr.com",
  "farm6.staticflickr.com",
  "farm8.staticflickr.com",
  "farm9.staticflickr.com"
];

/** Whether a candidate's bytes sit on a host the downloader is allowed to reach. */
export function candidateHosted(candidate: { downloadUrl: string }): boolean {
  try {
    return DOWNLOAD_HOSTS.includes(new URL(candidate.downloadUrl).hostname);
  } catch {
    return false;
  }
}

async function defaultJsonFetcher(url: string, options: { headers?: Record<string, string> }): Promise<unknown> {
  const response = await safeFetch(url, {
    allowHosts: API_HOSTS,
    headers: options.headers,
    maxBytes: 1_000_000,
    timeoutMs: 8_000
  });
  return JSON.parse(new TextDecoder().decode(response.body)) as unknown;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function openverseLicense(value: unknown): LicensedPhotoCandidate["license"] | null {
  const normalized = text(value).toLowerCase().replaceAll("_", "-");
  if (normalized === "cc0" || normalized === "pdm") return "CC0";
  if (normalized === "by") return "CC BY";
  if (normalized === "by-sa") return "CC BY-SA";
  return null;
}

function wikimediaLicense(value: unknown): LicensedPhotoCandidate["license"] | null {
  const normalized = text(value).toLowerCase();
  if (normalized.includes("public domain") || normalized === "cc0") return "CC0";
  if (/cc\s*by-sa/u.test(normalized)) return "CC BY-SA";
  if (/cc\s*by/u.test(normalized)) return "CC BY";
  return null;
}

function safeCandidate(candidate: LicensedPhotoCandidate): LicensedPhotoCandidate | null {
  if (candidate.width < 640 || candidate.height < 360 || candidate.width <= candidate.height) return null;
  if (!candidate.thumbnailUrl.startsWith("https://") || !candidate.downloadUrl.startsWith("https://")) return null;
  const problems = validateLicensedImageCandidate({
    license: candidate.license,
    author: candidate.author,
    sourceUrl: candidate.sourceUrl,
    attributionHtml: candidate.attributionHtml
  });
  return problems.length === 0 ? candidate : null;
}

async function searchOpenverse(query: string, fetchJson: JsonFetcher): Promise<LicensedPhotoCandidate[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "6");
  url.searchParams.set("license", "cc0,by,by-sa,pdm");
  const payload = await fetchJson(url.toString(), {}) as { results?: unknown[] };
  return (payload.results ?? []).flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const license = openverseLicense(item.license);
    if (!license) return [];
    const sourceUrl = text(item.foreign_landing_url);
    const author = text(item.creator) || "Unknown creator";
    const candidate = safeCandidate({
      id: `openverse:${text(item.id)}`,
      provider: "openverse",
      title: text(item.title) || query,
      thumbnailUrl: text(item.thumbnail),
      downloadUrl: text(item.url),
      width: positiveNumber(item.width),
      height: positiveNumber(item.height),
      license,
      author,
      sourceUrl,
      // Openverse's terms require an app to indicate it was made using Openverse without
      // implying endorsement, and CC BY requires the licence to be named beside the author.
      attributionHtml: `${author} · ${license} · found via Openverse (not endorsed by Openverse)`
    });
    return candidate ? [candidate] : [];
  });
}

function metadataValue(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return text((value as { value?: unknown }).value).replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim();
}

async function searchWikimedia(query: string, fetchJson: JsonFetcher): Promise<LicensedPhotoCandidate[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `file:${query}`,
    gsrnamespace: "6",
    gsrlimit: "6",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "640"
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const payload = await fetchJson(url.toString(), {}) as { query?: { pages?: Record<string, unknown> } };
  return Object.values(payload.query?.pages ?? {}).flatMap((raw) => {
    const page = raw as { pageid?: unknown; title?: unknown; imageinfo?: unknown[] };
    const info = (page.imageinfo?.[0] ?? {}) as Record<string, unknown>;
    const metadata = (info.extmetadata ?? {}) as Record<string, unknown>;
    const license = wikimediaLicense(metadataValue(metadata.LicenseShortName));
    if (!license || !["image/jpeg", "image/png", "image/webp"].includes(text(info.mime))) return [];
    const author = metadataValue(metadata.Artist) || metadataValue(metadata.Credit) || "Wikimedia Commons contributor";
    const pageId = positiveNumber(page.pageid);
    const candidate = safeCandidate({
      id: `wikimedia:${pageId}`,
      provider: "wikimedia",
      title: text(page.title).replace(/^File:/u, "") || query,
      thumbnailUrl: text(info.thumburl) || text(info.url),
      downloadUrl: text(info.url),
      width: positiveNumber(info.width),
      height: positiveNumber(info.height),
      license,
      author,
      sourceUrl: `https://commons.wikimedia.org/?curid=${pageId}`,
      attributionHtml: `${author} · ${license} · Wikimedia Commons`
    });
    return candidate ? [candidate] : [];
  });
}

async function searchPexels(query: string, key: string, fetchJson: JsonFetcher): Promise<LicensedPhotoCandidate[]> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("orientation", "landscape");
  url.searchParams.set("per_page", "5");
  const payload = await fetchJson(url.toString(), { headers: { Authorization: key } }) as { photos?: unknown[] };
  return (payload.photos ?? []).flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const src = (item.src ?? {}) as Record<string, unknown>;
    const author = text(item.photographer);
    const candidate = safeCandidate({
      id: `pexels:${positiveNumber(item.id)}`,
      provider: "pexels",
      title: text(item.alt) || query,
      thumbnailUrl: text(src.medium),
      downloadUrl: text(src.original) || text(src.large2x) || text(src.large),
      width: positiveNumber(item.width),
      height: positiveNumber(item.height),
      license: "Pexels License",
      author,
      sourceUrl: text(item.url),
      attributionHtml: `Photo by ${author} on Pexels`
    });
    return candidate ? [candidate] : [];
  });
}

async function searchPixabay(query: string, key: string, fetchJson: JsonFetcher): Promise<LicensedPhotoCandidate[]> {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", key);
  url.searchParams.set("q", query.slice(0, 100));
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "horizontal");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("min_width", "1600");
  url.searchParams.set("min_height", "900");
  url.searchParams.set("per_page", "5");
  const payload = await fetchJson(url.toString(), {}) as { hits?: unknown[] };
  return (payload.hits ?? []).flatMap((raw) => {
    const item = raw as Record<string, unknown>;
    const author = text(item.user);
    const candidate = safeCandidate({
      id: `pixabay:${positiveNumber(item.id)}`,
      provider: "pixabay",
      title: text(item.tags) || query,
      thumbnailUrl: text(item.previewURL),
      downloadUrl: text(item.largeImageURL) || text(item.webformatURL),
      width: positiveNumber(item.imageWidth) || positiveNumber(item.webformatWidth),
      height: positiveNumber(item.imageHeight) || positiveNumber(item.webformatHeight),
      license: "Pixabay Content License",
      author,
      sourceUrl: text(item.pageURL),
      attributionHtml: `Image by ${author} on Pixabay`
    });
    return candidate ? [candidate] : [];
  });
}

/**
 * Keep only photographs whose own metadata names the subject.
 *
 * A stock search for "ufc valentina-shevchenko" returned a US Air Force range photograph of
 * two people who are not her, and it shipped as the hero of her profile, credited to the
 * airman who took it. A generic query returns generic results, and an article about a named
 * person carrying a photograph of different named people is a misattribution, not a
 * decoration. So a candidate has to earn its place: every word of the subject's name must
 * appear in the candidate's own title, author or source URL. Nothing matching is the correct
 * answer often, and the deterministic FRAME hero covers it.
 */
export function candidatesNaming(
  candidates: readonly LicensedPhotoCandidate[],
  subject: string
): LicensedPhotoCandidate[] {
  const words = subject
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3);
  if (words.length === 0) return [];
  return candidates.filter((candidate) => {
    const haystack = `${candidate.title} ${candidate.author} ${candidate.sourceUrl}`
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ");
    return words.every((word) => haystack.includes(word));
  });
}

export async function discoverLicensedPhotos(input: {
  query: string;
  pexelsKey?: string;
  pixabayKey?: string;
  fetchJson?: JsonFetcher;
  maximum?: number;
}): Promise<LicensedImageSearchResult> {
  const query = input.query.trim().replace(/\s+/gu, " ").slice(0, 100);
  if (!query) return { candidates: [], skippedProviders: [] };
  const fetchJson = input.fetchJson ?? defaultJsonFetcher;
  const skippedProviders: LicensedImageSearchResult["skippedProviders"] = [];
  if (!input.pexelsKey) skippedProviders.push({ provider: "pexels", reason: "missing-key" });
  if (!input.pixabayKey) skippedProviders.push({ provider: "pixabay", reason: "missing-key" });
  const jobs: Array<Promise<LicensedPhotoCandidate[]>> = [
    searchOpenverse(query, fetchJson).catch(() => []),
    searchWikimedia(query, fetchJson).catch(() => []),
    ...(input.pexelsKey ? [searchPexels(query, input.pexelsKey, fetchJson).catch(() => [])] : []),
    ...(input.pixabayKey ? [searchPixabay(query, input.pixabayKey, fetchJson).catch(() => [])] : [])
  ];
  const providerResults = await Promise.all(jobs);
  const maximum = input.maximum ?? 4;
  const candidates: LicensedPhotoCandidate[] = [];
  for (const list of providerResults) {
    for (const candidate of list) {
      if (!candidateHosted(candidate)) continue;
      if (candidates.some((item) => item.sourceUrl === candidate.sourceUrl)) continue;
      // The same event photographed five times is one picture as far as an editor is
      // concerned; offering it four times out of four wastes the whole shortlist.
      if (candidates.some((item) => item.title === candidate.title)) continue;
      candidates.push(candidate);
      if (candidates.length >= maximum) break;
    }
    if (candidates.length >= maximum) break;
  }
  return { candidates, skippedProviders };
}

async function webpVariant(bytes: Uint8Array, width: number, height: number, maximumBytes: number): Promise<Buffer> {
  for (const quality of [82, 74, 66, 58]) {
    const output = await sharp(bytes, { failOn: "warning" })
      .rotate()
      .resize(width, height, { fit: "cover", position: "attention" })
      .webp({ quality, effort: 5 })
      .toBuffer();
    if (output.byteLength <= maximumBytes) return output;
  }
  throw new Error(`Licensed image cannot fit the ${maximumBytes}-byte asset cap`);
}

export async function materializeLicensedPhoto(input: {
  candidate: LicensedPhotoCandidate;
  venture: "caught-up" | "mma-files";
  slug: string;
  altEn?: string;
  altCs: string;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
}): Promise<ArticleImage> {
  const candidate = safeCandidate(input.candidate);
  if (!candidate) throw new Error("Licensed image candidate failed validation");
  const fetchBytes = input.fetchBytes ?? (async (url: string) => {
    // The allowlist is fixed. It used to add whatever host the search response named, which
    // is the one thing an allowlist exists to prevent: a hostile or compromised API answer
    // could point the downloader anywhere it liked. A candidate hosted somewhere we do not
    // recognise is dropped instead, which costs a picture and keeps the guarantee.
    const response = await safeFetch(url, {
      allowHosts: DOWNLOAD_HOSTS,
      maxBytes: 12_000_000,
      timeoutMs: 12_000
    });
    if (!response.contentType.startsWith("image/")) throw new Error("Licensed asset is not an image");
    return response.body;
  });
  const source = await fetchBytes(candidate.downloadUrl);
  const metadata = await sharp(source, { failOn: "warning" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 640 || metadata.height < 360) {
    throw new Error("Licensed asset dimensions are too small");
  }
  const [hero, thumb] = await Promise.all([
    webpVariant(source, 1_600, 900, 800_000),
    webpVariant(source, 640, 360, 300_000)
  ]);
  const safeSlug = input.slug.toLowerCase().replace(/[^a-z0-9-]+/gu, "-").replace(/^-|-$/gu, "");
  const directory = input.venture === "caught-up" ? "editions" : "articles";
  return ArticleImageSchema.parse({
    hero_path: `public/images/${directory}/${safeSlug}/hero.webp`,
    thumb_path: `public/images/${directory}/${safeSlug}/thumb.webp`,
    width: 1_600,
    height: 900,
    ...(input.altEn ? { alt_en: input.altEn } : {}),
    alt_cs: input.altCs,
    license: {
      name: candidate.license,
      author: candidate.author,
      source_url: candidate.sourceUrl,
      attribution_html: candidate.attributionHtml
    },
    origin: "photo",
    hero_bytes_base64: hero.toString("base64"),
    thumb_bytes_base64: thumb.toString("base64")
  });
}
