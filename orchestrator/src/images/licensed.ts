import sharp from "sharp";
import { ArticleImageSchema, type ArticleImage } from "../contracts/autonomy.js";
import { safeFetch } from "../security/url.js";
import { validateLicensedImageCandidate } from "./article-image.js";
import { readPixabayCache, writePixabayCache } from "./pixabay-cache.js";
import { stateRoot } from "../paths.js";

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
  /**
   * The Wikidata item whose P18 named this file — set only by `fighterIdentityPhoto`.
   *
   * It marks a picture that is linked to the subject as an entity rather than matched against
   * their name, and two rules read it: `heroReady` stops filtering on orientation, and
   * `heroCropAnchor` cuts the 16:9 hero from the top of the frame rather than from wherever
   * sharp finds the most detail. Both are explained where they are enforced.
   */
  identityOf?: string;
  /**
   * Marks a photograph that illustrates the sport and depicts nobody the article is about.
   *
   * Set only by `illustrativeSportPhoto`. Everything downstream that could turn a picture into a
   * claim about a person reads it: `produceMmaFilesArticle` refuses the writer's alt text for such
   * a candidate, because the writer knows the article's subject and an alt it writes about a stock
   * cage photograph is one sentence away from naming them in it.
   */
  illustrative?: true;
  /**
   * Czech alt text the file's own metadata yields, which outranks anything the writer produces.
   *
   * Only a candidate that carries a description of itself can set this. The writer is shown
   * captions and no pixels, so an alt it writes is a guess about a picture it has not seen.
   */
  altCs?: string;
}

/**
 * How certain we are that an article's hero shows what the article is about. Three rungs.
 *
 * A fighter article does not need a photograph of that fighter every time; it needs never to
 * present a photograph as being them when it is not. The rungs are ordered by certainty and the
 * hero is the highest one that can be fetched:
 *
 * 1. `entity-linked` — the file the subject's own Wikidata item names through P18. An item is the
 *    person rather than a string about them, so this is certain. `fighterIdentityPhoto` builds it.
 *    Measured on 4 August 2026: 39 of the 92 fighter cards reach this rung.
 * 2. `illustrative` — a curated, licensed photograph of the sport: a cage, a hall, a crowd. It is
 *    honest precisely because it claims nothing, and the whole of that guarantee lives in its alt
 *    text, which describes the photograph and never the article's subject. `illustrativeSportPhoto`
 *    builds it. This rung is why the other 53 cards no longer fall straight to a drawn plate.
 * 3. `generated` — the FRAME plate from `deterministicArticleImage`, drawn when even a stock
 *    photograph cannot be fetched. It contains no photograph and says so.
 *
 * The rung a candidate sits on is a property of how it was found, not of how it looks, which is
 * why it is read off the fields that record the finding rather than guessed from the picture.
 */
export const PHOTO_CERTAINTY_LADDER = ["entity-linked", "illustrative", "generated"] as const;

export type PhotoCertainty = (typeof PHOTO_CERTAINTY_LADDER)[number];

/** Which rung a candidate sits on; `generated` when there is no candidate at all. */
export function photoCertaintyOf(
  candidate: Pick<LicensedPhotoCandidate, "identityOf" | "illustrative"> | null | undefined
): PhotoCertainty {
  if (candidate?.identityOf) return "entity-linked";
  if (candidate?.illustrative) return "illustrative";
  return "generated";
}

export interface LicensedImageSearchResult {
  candidates: LicensedPhotoCandidate[];
  skippedProviders: Array<{ provider: "pexels" | "pixabay"; reason: "missing-key" }>;
}

type JsonFetcher = (url: string, options: { headers?: Record<string, string> }) => Promise<unknown>;

const API_HOSTS = ["api.openverse.org", "commons.wikimedia.org", "api.pexels.com", "pixabay.com"];

/**
 * How many results each provider is asked for, per phrase.
 *
 * Modest on purpose. Three phrases across four providers is twelve requests, and the shortlist
 * stops at twelve candidates however many come back — so a larger page buys nothing but a bigger
 * share of a free tier's rate limit. Wikimedia in particular tightened anonymous limits in 2026.
 */
const PER_PROVIDER_PAGE = 8;
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

/**
 * Where the gate may fetch a thumbnail from. Separate from `DOWNLOAD_HOSTS`, and deliberately.
 *
 * A thumbnail is fetched to be looked at and thrown away; a download becomes the published hero.
 * The two lists mostly coincide, and the one host that differs is the reason they are two lists:
 * Openverse aggregates, so its full-size bytes live on the original provider's CDN — which is why
 * `DOWNLOAD_HOSTS` does not name Openverse at all — while its thumbnails are served by Openverse
 * itself. Adding `api.openverse.org` to the download allowlist to reach those thumbs would have
 * let a search response nominate a publishable host, which is the exact hole the fixed download
 * allowlist exists to close.
 *
 * Same review posture as the other list: a host is added here in a commit somebody reads, never
 * from an API response.
 */
export const THUMBNAIL_HOSTS = [...DOWNLOAD_HOSTS, "api.openverse.org"];

/** Whether the gate may fetch this candidate's thumbnail at all. */
export function thumbnailHosted(candidate: { thumbnailUrl: string }): boolean {
  try {
    return THUMBNAIL_HOSTS.includes(new URL(candidate.thumbnailUrl).hostname);
  } catch {
    return false;
  }
}

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

/**
 * A Commons `LicenseShortName` mapped onto a licence the site may publish under, or null.
 *
 * The non-commercial and no-derivatives clauses are matched before anything else, because they
 * are prefixes of the permissive names and this used to read them as such: "CC BY-NC 4.0" fell
 * through to the `cc by` branch and came back as plain "CC BY", and "CC BY-ND 2.0" with it. The
 * validator that exists to refuse those licences was then handed a laundered string and passed
 * it, so the only guard against publishing an NC file commercially could never fire. Its test
 * did not catch it either — it calls the validator with the literal "CC BY-NC" and never goes
 * through this mapping.
 */
export function wikimediaLicense(value: unknown): LicensedPhotoCandidate["license"] | null {
  const normalized = text(value).toLowerCase();
  if (/\bnc\b|noncommercial|non-commercial|\bnd\b|noderiv/u.test(normalized)) return null;
  if (normalized.includes("public domain") || normalized === "cc0") return "CC0";
  if (/cc\s*by-sa/u.test(normalized)) return "CC BY-SA";
  if (/cc\s*by/u.test(normalized)) return "CC BY";
  return null;
}

/**
 * Whether a candidate can become the hero at all: big enough, right shape, properly licensed.
 *
 * One definition, called by every producer of candidates. `fighterIdentityPhoto` needs it too —
 * it resolves a file the subject's item names, and 16 of the 55 the roster names are narrower
 * than 640px. Offering one of those anyway meant the writer was shown a photograph, chose it,
 * and `materializeLicensedPhoto` then threw; the article still got its FRAME cover, but by way
 * of a failure rather than a decision, and the log said an image search had succeeded.
 */
export function heroReady(candidate: LicensedPhotoCandidate): boolean {
  if (candidate.width < 640 || candidate.height < 360) return false;
  // Landscape-only is a search filter, not a quality rule. A stock archive answering a phrase
  // returns whatever it has, and a tall frame there is usually a crop of something incidental —
  // but a P18 file is a portrait of a named person, and only 12 of the 55 the roster names are
  // wider than they are tall. Rejecting the other 43 would have thrown away four fifths of the
  // only pictures that are provably of the right subject, so an identity-linked file is judged
  // on size and licence alone.
  if (!candidate.identityOf && candidate.width <= candidate.height) return false;
  if (!candidate.thumbnailUrl.startsWith("https://") || !candidate.downloadUrl.startsWith("https://")) return false;
  return validateLicensedImageCandidate({
    license: candidate.license,
    author: candidate.author,
    sourceUrl: candidate.sourceUrl,
    attributionHtml: candidate.attributionHtml
  }).length === 0;
}

function safeCandidate(candidate: LicensedPhotoCandidate): LicensedPhotoCandidate | null {
  return heroReady(candidate) ? candidate : null;
}

async function searchOpenverse(query: string, fetchJson: JsonFetcher): Promise<LicensedPhotoCandidate[]> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", String(PER_PROVIDER_PAGE));
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
    gsrlimit: String(PER_PROVIDER_PAGE),
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
  url.searchParams.set("per_page", String(PER_PROVIDER_PAGE));
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

async function searchPixabay(
  query: string,
  key: string,
  fetchJson: JsonFetcher,
  cache: { root: string; now: Date } | null
): Promise<LicensedPhotoCandidate[]> {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", key);
  url.searchParams.set("q", query.slice(0, 100));
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "horizontal");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("min_width", "1600");
  url.searchParams.set("min_height", "900");
  url.searchParams.set("per_page", String(PER_PROVIDER_PAGE));
  // Pixabay's terms require a response to be cached for 24 hours instead of re-requested. The
  // cache is consulted before the network, never after, so a re-run inside a day makes no call.
  const cached = cache ? await readPixabayCache(cache.root, url.toString(), cache.now) : null;
  const payload = (cached ?? await (async () => {
    const fresh = await fetchJson(url.toString(), {});
    if (cache) await writePixabayCache(cache.root, url.toString(), fresh, cache.now);
    return fresh;
  })()) as { hits?: unknown[] };
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
 * Keep only photographs whose own metadata names the subject. For subjects that are not people.
 *
 * This was written for a person and could not do that job. A stock search for "ufc
 * valentina-shevchenko" returned a US Air Force range photograph of two people who are not her;
 * requiring every word of the name fixed that case and not the class, because a name is not an
 * identity. "Gustavo Lopez" is an OKTAGON bantamweight and an Argentinian subsecretario de
 * Presidencia, the politician's file passed this filter on 4 August 2026, and `captionResidual`
 * below then ranked it first — its caption is "678 - Gustavo Lopez", which is almost purely the
 * name. A person is now resolved through their Wikidata item instead; see `fighterIdentityPhoto`.
 *
 * What is left is the case this can answer. MMA Files assigns a fight-week preview an event ref
 * such as `ufc:event:ufc-330-makhachev-vs-machado-garry`, and an event is a name: it has no
 * entity photograph to be confused about, its own poster and arena shots are what carry that
 * name, and the worst outcome of a wrong match is the wrong arena rather than the wrong human
 * being. Nothing matching is still a frequent and correct answer, covered by the FRAME hero.
 *
 * Keeping people away from this is the caller's job and it is done by ref shape, not by what is
 * on disk: `selectArticleImage` reaches here only when every subject ref matches
 * `org:event:slug`. Anything else — a fighter, a killed slot's placeholder, a ref of no shape it
 * recognises — never arrives.
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
  return candidates
    .filter((candidate) => {
      const haystack = `${candidate.title} ${candidate.author} ${candidate.sourceUrl}`
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ");
      return words.every((word) => haystack.includes(word));
    })
    .map((candidate) => ({ candidate, aboutness: captionResidual(candidate.title, words) }))
    .sort((left, right) => left.aboutness - right.aboutness)
    .map((entry) => entry.candidate);
}

/**
 * How much of a caption is about someone or something other than the subject.
 *
 * Naming the subject is not the same as being a photograph of the subject. The hero that shipped
 * on Valentina Shevchenko's profile is genuinely her — and its Commons caption reads "Valentina
 * Shevchenko, UFC bantamweight fighter, and her coach, Pavel Fedotov, operate Engagement Skills
 * Trainer weapons during a visit to Joint Base Langley-Eustis." Her name is in it, so the filter
 * above passed it, and what ran above an article about her retirement trilogy was a firearms
 * range. The same search also returned a file captioned "Kyrgyzstani–Peruvian muay thai and MMA
 * fighter Valentina Shevchenko", which is the photograph anyone would have picked.
 *
 * The difference between those two is the words left over once the subject's name is removed:
 * four, against sixteen naming a second person, a weapon system and a military base. So the
 * shortest remainder wins. This ranks; it never rejects, because a long caption can still be the
 * only photograph there is.
 */
export function captionResidual(title: string, subjectWords: readonly string[]): number {
  const remaining = title
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !subjectWords.includes(word));
  return remaining.length;
}

/**
 * The shortlist a phrase — or two, or three — brings back from four archives.
 *
 * One query used to go to each provider and the first four survivors were the whole shortlist,
 * which meant a single provider that answered quickly filled it and the other three contributed
 * nothing. The desk now writes two or three phrases describing different aspects of the same
 * picture, and each is asked of every provider; the results are interleaved by round, so the
 * shortlist reads first-choice-from-each before it reads anybody's second.
 *
 * Deduplication is unchanged and still runs on both keys. A file republished under two source
 * URLs is one photograph, and so is the same event photographed five times under one caption:
 * offering it twelve times out of twelve wastes the whole shortlist and, more to the point,
 * wastes the gate's one call on twelve views of the same frame.
 */
export async function discoverLicensedPhotos(input: {
  /** One phrase, for the callers that still have exactly one. */
  query?: string;
  /** The desk's phrases. Each is asked of every provider. */
  queries?: readonly string[];
  pexelsKey?: string;
  pixabayKey?: string;
  fetchJson?: JsonFetcher;
  maximum?: number;
  /** Where the Pixabay response cache lives, and the clock it ages against. */
  cacheRoot?: string;
  now?: Date;
}): Promise<LicensedImageSearchResult> {
  const queries = [...(input.queries ?? []), ...(input.query ? [input.query] : [])]
    .map((phrase) => phrase.trim().replace(/\s+/gu, " ").slice(0, 100))
    .filter(Boolean)
    // Three is the ceiling the desk is asked for, and the ceiling here too: a fourth phrase adds
    // four more requests to a free tier for candidates the shortlist has no room for.
    .slice(0, 3);
  const unique = [...new Set(queries)];
  if (unique.length === 0) return { candidates: [], skippedProviders: [] };
  const fetchJson = input.fetchJson ?? defaultJsonFetcher;
  const cache = { root: input.cacheRoot ?? stateRoot, now: input.now ?? new Date() };
  const skippedProviders: LicensedImageSearchResult["skippedProviders"] = [];
  if (!input.pexelsKey) skippedProviders.push({ provider: "pexels", reason: "missing-key" });
  if (!input.pixabayKey) skippedProviders.push({ provider: "pixabay", reason: "missing-key" });

  const jobs: Array<Promise<LicensedPhotoCandidate[]>> = [];
  for (const query of unique) {
    jobs.push(searchOpenverse(query, fetchJson).catch(() => []));
    jobs.push(searchWikimedia(query, fetchJson).catch(() => []));
    if (input.pexelsKey) jobs.push(searchPexels(query, input.pexelsKey, fetchJson).catch(() => []));
    if (input.pixabayKey) jobs.push(searchPixabay(query, input.pixabayKey, fetchJson, cache).catch(() => []));
  }
  const lists = await Promise.all(jobs);

  const maximum = input.maximum ?? 12;
  const candidates: LicensedPhotoCandidate[] = [];
  const depth = Math.max(0, ...lists.map((list) => list.length));
  for (let round = 0; round < depth && candidates.length < maximum; round += 1) {
    for (const list of lists) {
      const candidate = list[round];
      if (!candidate) continue;
      if (!candidateHosted(candidate)) continue;
      if (candidates.some((item) => item.sourceUrl === candidate.sourceUrl)) continue;
      if (candidates.some((item) => item.title === candidate.title)) continue;
      candidates.push(candidate);
      if (candidates.length >= maximum) break;
    }
  }
  return { candidates, skippedProviders };
}

/**
 * Where the 16:9 hero is cut out of a taller frame.
 *
 * `attention` asks sharp for the busiest region, which is right for a stock photograph of a
 * place or an object. It is wrong for a portrait, and provably so: run against Commons file
 * "Charles Oliveira do Bronxs.jpg", a 3024x4032 portrait, attention returned a band containing
 * a championship belt and a torso and no face at all. Under an alt saying the picture is of
 * Charles Oliveira, that is the same lie by a different route.
 *
 * `top` takes the band from the top edge. A person photographed in portrait has their head near
 * the top, so this keeps the face; checked by eye against the crops of Oliveira, Belal Muhammad,
 * Conor McGregor, Ilia Topuria, Amanda Ribas, Rose Namajunas, Brandon Moreno, Leon Edwards and
 * Sean O'Malley, every one of which held the face after the switch.
 */
export type CropAnchor = "attention" | "top";

/**
 * Which anchor a candidate gets. Exported because it is the whole of the decision.
 *
 * The pixel difference cannot be shown in a test: sharp's attention strategy scores luminance
 * frequency, saturation and skin tones, and on any synthetic frame those are flat enough that it
 * returns the same band as `top`. It separates on real photographs, which is where it was
 * checked — see the note above `CropAnchor`.
 */
export function heroCropAnchor(candidate: Pick<LicensedPhotoCandidate, "identityOf">): CropAnchor {
  return candidate.identityOf ? "top" : "attention";
}

async function webpVariant(
  bytes: Uint8Array,
  width: number,
  height: number,
  maximumBytes: number,
  anchor: CropAnchor
): Promise<Buffer> {
  for (const quality of [82, 74, 66, 58]) {
    const output = await sharp(bytes, { failOn: "warning" })
      .rotate()
      .resize(width, height, { fit: "cover", position: anchor })
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
  const anchor = heroCropAnchor(candidate);
  const [hero, thumb] = await Promise.all([
    webpVariant(source, 1_600, 900, 800_000, anchor),
    webpVariant(source, 640, 360, 300_000, anchor)
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
