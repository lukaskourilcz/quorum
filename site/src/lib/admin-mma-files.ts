import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseRatingLedger, type RatingRecord } from "./rating-model";

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

type Locale = "en" | "cs";

/**
 * An article's hero, with the credit that has to travel with it.
 *
 * Half of this used to be guessed. The URL assumed every hero was a deterministic SVG plate, so
 * the day the desk started buying licensed photographs the preview asked for a hero.svg that was
 * never written and showed a broken image instead. The credit was not read at all, which is the
 * more serious half: a CC BY or CC BY-SA photograph shown without its attribution is a licence
 * breach, so an image whose credit cannot be read is not displayed here at all.
 */
export interface AdminMmaHero {
  url: string;
  /** Czech alt is required by the package contract; English is optional and falls back to it. */
  alt: Record<Locale, string>;
  /** The attribution line, flattened to text — never injected as markup. */
  credit: string;
  license: string;
  sourceUrl: string;
}

export interface AdminMmaArticle {
  id: string;
  slug: string;
  date: string;
  slot: "am" | "pm";
  format: string;
  status: "draft" | "blocked" | "published" | "killed";
  localizations: Record<Locale, { title: string; dek: string; bodyMDX: string }>;
  sources: Array<{ kind: "internal"; ref: string } | { kind: "external"; url: string; retrievedAt: string }>;
  fighterRefs: string[];
  eventRef: string | null;
  modelVersion: string | null;
  packageHash: string;
  contentHash: string;
  hero: AdminMmaHero | null;
  ratings: RatingRecord[];
}

export interface AdminMmaSocialVariant {
  id: "A" | "B";
  articleRef: string;
  captions: Record<Locale, { instagram: string; threads: string }>;
  designAxes: {
    templateFamily: string;
    colorScheme: string;
    headlineFraming: string;
    captionTone: string;
  };
  imageUrls: Record<Locale, string>;
  contentHash: string;
  ratings: RatingRecord[];
}

export interface AdminMmaSocialPack {
  articleRef: string;
  status: "draft" | "queued" | "archived";
  assignmentProtocolRef: string;
  variants: [AdminMmaSocialVariant, AdminMmaSocialVariant];
}

export interface AdminEditorialDay {
  date: string;
  slots: Array<{
    slot: "am" | "pm";
    format: string;
    rationale: string;
    status: "assigned" | "killed";
    killedReason: string | null;
    articleStatus: string | null;
  }>;
}

export interface AdminMmaFilesSnapshot {
  articles: AdminMmaArticle[];
  socialPacks: AdminMmaSocialPack[];
  calendar: AdminEditorialDay[];
  unreadable: string[];
}

const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 1_000): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value.trim() : null;
const textArray = (value: unknown, maximum = 80): string[] | null => Array.isArray(value) && value.length <= maximum && value.every((entry) => text(entry, 400)) ? value as string[] : null;
const hash12 = (raw: string): string => `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}

function packageHash(value: Record<string, unknown>): string {
  const { packageHash: ignored, ...content } = value;
  void ignored;
  return createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
}

async function files(directory: string): Promise<string[]> {
  try { return (await readdir(directory)).filter((filename) => filename.endsWith(".json")).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

async function ratings(root: string): Promise<{ records: RatingRecord[]; malformed: boolean }> {
  try {
    const parsed = parseRatingLedger(await readFile(path.join(root, "state", "ratings", "mma-files", "ledger.jsonl"), "utf8"));
    return parsed ? { records: parsed, malformed: false } : { records: [], malformed: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [], malformed: false };
    throw error;
  }
}

function history(records: readonly RatingRecord[], id: string): RatingRecord[] {
  return records.filter((rating) => rating.objectRef.id === id).sort((left, right) => right.ratedAt.localeCompare(left.ratedAt));
}

function localization(value: unknown): AdminMmaArticle["localizations"][Locale] | null {
  const item = record(value);
  const title = text(item?.title, 160);
  const dek = text(item?.dek, 320);
  const bodyMDX = text(item?.bodyMDX, 40_000);
  return title && dek && bodyMDX ? { title, dek, bodyMDX } : null;
}

function source(value: unknown): AdminMmaArticle["sources"][number] | null {
  const item = record(value);
  if (item?.kind === "internal") {
    const ref = text(item.ref, 240);
    return ref ? { kind: "internal", ref } : null;
  }
  if (item?.kind === "external") {
    const url = text(item.url, 500);
    const retrievedAt = text(item.retrievedAt, 80);
    return url?.startsWith("https://") && retrievedAt && !Number.isNaN(Date.parse(retrievedAt)) ? { kind: "external", url, retrievedAt } : null;
  }
  return null;
}

function mediaUrl(relative: string): string {
  return `/admin/api/mma-files/media?path=${encodeURIComponent(relative)}`;
}

/**
 * Read the hero the package actually stored, or nothing.
 *
 * The extension comes from `hero_path` because that is what storeArticleMedia wrote the file
 * under — photographs are WebP, deterministic plates are SVG, and hardcoding either one turns
 * the other half of the archive into a 404. Attribution is required rather than optional: an
 * unattributed CC BY photograph on screen is the licence problem, so an unreadable credit
 * removes the picture instead of the credit.
 */
function hero(value: unknown, mediaBase: string): AdminMmaHero | null {
  const image = record(value);
  const license = record(image?.license);
  const heroPath = text(image?.hero_path, 300);
  const altCs = text(image?.alt_cs, 300);
  const altEn = text(image?.alt_en, 300);
  const name = text(license?.name, 80);
  const sourceUrl = text(license?.source_url, 500);
  const attribution = text(license?.attribution_html, 2_000);
  // Flattened the same way orchestrator/src/delivery/verifier.ts flattens it before looking for
  // the credit on the published page, so admin shows the string the verifier will hunt for.
  const credit = attribution?.replaceAll(/<[^>]+>/gu, " ").replaceAll(/\s+/gu, " ").trim();
  const extension = heroPath ? /\.(webp|png|svg)$/u.exec(heroPath)?.[1] : undefined;
  if (!extension || !altCs || !name || !credit || !sourceUrl?.startsWith("https://")) return null;
  return {
    url: mediaUrl(`${mediaBase}/hero.${extension}`),
    alt: { cs: altCs, en: altEn ?? altCs },
    credit,
    license: name,
    sourceUrl
  };
}

function parseArticle(raw: string, ratingRecords: readonly RatingRecord[]): AdminMmaArticle | null {
  let input: Record<string, unknown> | null = null;
  try { input = record(JSON.parse(raw)); } catch { return null; }
  const slug = text(input?.slug, 160);
  const localizations = record(input?.localizations);
  const en = localization(localizations?.en);
  const cs = localization(localizations?.cs);
  const format = text(input?.format, 80);
  const sources = Array.isArray(input?.sources) ? input.sources.map(source) : [];
  const fighterRefs = textArray(input?.fighterRefs);
  const publishAt = text(input?.publishAt, 80);
  const packageHashValue = text(input?.packageHash, 80);
  const status = input?.status === "draft" || input?.status === "blocked" || input?.status === "published" || input?.status === "killed" ? input.status : null;
  const slot = input?.slot === "am" || input?.slot === "pm" ? input.slot : null;
  if (input?.schemaVersion !== "article/1" || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !en || !cs || !format || !sources.length || sources.some((item) => !item) || !fighterRefs || !publishAt || Number.isNaN(Date.parse(publishAt)) || !slot || !status || !packageHashValue || !/^[a-f0-9]{64}$/.test(packageHashValue) || packageHash(input) !== packageHashValue) return null;
  const date = publishAt.slice(0, 10);
  const id = `article:${date}:${slot}:${slug}`;
  const eventRef = text(input.eventRef, 160);
  const modelVersion = text(input.modelVersion, 100);
  const mediaBase = `ventures/mma-files/media/${date}-${slot}-${slug}`;
  return {
    id, slug, date, slot, format, status,
    localizations: { en, cs },
    sources: sources as AdminMmaArticle["sources"],
    fighterRefs,
    eventRef,
    modelVersion,
    packageHash: packageHashValue,
    contentHash: `sha256:${packageHashValue.slice(0, 12)}`,
    hero: hero(input.image, mediaBase),
    ratings: history(ratingRecords, id)
  };
}

function variant(value: unknown, articleRef: string, ratingRecords: readonly RatingRecord[]): AdminMmaSocialVariant | null {
  const item = record(value);
  const id = item?.id === "A" || item?.id === "B" ? item.id : null;
  const captions = record(item?.captions);
  const enCaptions = record(captions?.en);
  const csCaptions = record(captions?.cs);
  const enInstagram = text(enCaptions?.instagram, 2_200);
  const enThreads = text(enCaptions?.threads, 500);
  const csInstagram = text(csCaptions?.instagram, 2_200);
  const csThreads = text(csCaptions?.threads, 500);
  const axes = record(item?.designAxes);
  const templateFamily = text(axes?.templateFamily, 80);
  const colorScheme = text(axes?.colorScheme, 80);
  const headlineFraming = text(axes?.headlineFraming, 120);
  const captionTone = text(axes?.captionTone, 120);
  const refParts = /^article:(\d{4}-\d{2}-\d{2}):(am|pm):([a-z0-9-]+)$/u.exec(articleRef);
  if (!id || !enInstagram || !enThreads || !csInstagram || !csThreads || !templateFamily || !colorScheme || !headlineFraming || !captionTone || !refParts) return null;
  const objectId = `${articleRef}:${id}`;
  const base = `ventures/mma-files/media/${refParts[1]}-${refParts[2]}-${refParts[3]}`;
  return {
    id,
    articleRef,
    captions: { en: { instagram: enInstagram, threads: enThreads }, cs: { instagram: csInstagram, threads: csThreads } },
    designAxes: { templateFamily, colorScheme, headlineFraming, captionTone },
    imageUrls: { en: mediaUrl(`${base}/social-${id}-en.svg`), cs: mediaUrl(`${base}/social-${id}-cs.svg`) },
    contentHash: hash12(JSON.stringify(item)),
    ratings: history(ratingRecords, objectId)
  };
}

function parseSocialPack(raw: string, ratingRecords: readonly RatingRecord[]): AdminMmaSocialPack | null {
  let input: Record<string, unknown> | null = null;
  try { input = record(JSON.parse(raw)); } catch { return null; }
  const articleRef = text(input?.articleRef, 240);
  const assignmentProtocolRef = text(input?.assignmentProtocolRef, 240);
  const status = input?.status === "draft" || input?.status === "queued" || input?.status === "archived" ? input.status : null;
  if (input?.schemaVersion !== "social-variant/1" || !articleRef || !assignmentProtocolRef || !status || !Array.isArray(input.variants) || input.variants.length !== 2) return null;
  const variants = input.variants.map((entry) => variant(entry, articleRef, ratingRecords));
  return variants[0]?.id === "A" && variants[1]?.id === "B" ? { articleRef, assignmentProtocolRef, status, variants: variants as [AdminMmaSocialVariant, AdminMmaSocialVariant] } : null;
}

function parseEditorialDay(raw: string, articles: readonly AdminMmaArticle[]): AdminEditorialDay | null {
  let input: Record<string, unknown> | null = null;
  try { input = record(JSON.parse(raw)); } catch { return null; }
  const date = text(input?.date, 10);
  if (input?.schemaVersion !== "editorial-slate/1" || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(input.slots) || input.slots.length !== 2) return null;
  const slots = input.slots.map((value) => {
    const item = record(value);
    const slot = item?.slot === "am" || item?.slot === "pm" ? item.slot : null;
    const format = text(item?.format, 80);
    const rationale = text(item?.rationale, 240);
    const status = item?.status === "assigned" || item?.status === "killed" ? item.status : null;
    const killedReason = text(item?.killedReason, 240);
    if (!slot || !format || !rationale || !status || (status === "killed" && !killedReason)) return null;
    return { slot, format, rationale, status, killedReason, articleStatus: articles.find((article) => article.date === date && article.slot === slot)?.status ?? null };
  });
  return slots.every(Boolean) ? { date, slots: slots as AdminEditorialDay["slots"] } : null;
}

export async function readAdminMmaFiles(root = repositoryRoot): Promise<AdminMmaFilesSnapshot> {
  const ratingState = await ratings(root);
  const articleRoot = path.join(root, "state", "ventures", "mma-files", "articles");
  const articles: AdminMmaArticle[] = [];
  const unreadable: string[] = ratingState.malformed ? ["ratings/mma-files/ledger.jsonl"] : [];
  for (const filename of await files(articleRoot)) {
    const parsed = parseArticle(await readFile(path.join(articleRoot, filename), "utf8"), ratingState.records);
    if (parsed) articles.push(parsed); else unreadable.push(`articles/${filename}`);
  }
  const socialPacks: AdminMmaSocialPack[] = [];
  const packRoot = path.join(root, "state", "ventures", "mma-files", "social", "packs");
  for (const filename of await files(packRoot)) {
    const parsed = parseSocialPack(await readFile(path.join(packRoot, filename), "utf8"), ratingState.records);
    if (parsed) socialPacks.push(parsed); else unreadable.push(`social/packs/${filename}`);
  }
  const calendar: AdminEditorialDay[] = [];
  const slateRoot = path.join(root, "state", "ventures", "mma-files", "slates");
  for (const filename of await files(slateRoot)) {
    const parsed = parseEditorialDay(await readFile(path.join(slateRoot, filename), "utf8"), articles);
    if (parsed) calendar.push(parsed); else unreadable.push(`slates/${filename}`);
  }
  return {
    articles: articles.sort((left, right) => right.date.localeCompare(left.date) || left.slot.localeCompare(right.slot)),
    socialPacks: socialPacks.sort((left, right) => right.articleRef.localeCompare(left.articleRef)),
    calendar: calendar.sort((left, right) => right.date.localeCompare(left.date)),
    unreadable
  };
}
