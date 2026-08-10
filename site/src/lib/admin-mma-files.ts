import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
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
  localizations: { cs: { title: string; dek: string; bodyMDX: string }; en?: { title: string; dek: string; bodyMDX: string } };
  organization: "ufc" | "oktagon" | null;
  placements: string[];
  weekStart: string;
  sources: Array<{ kind: "internal"; ref: string } | { kind: "external"; url: string; retrievedAt: string }>;
  fighterRefs: string[];
  eventRef: string | null;
  modelVersion: string | null;
  packageHash: string;
  contentHash: string;
  hero: AdminMmaHero | null;
  ratings: RatingRecord[];
}

export interface AdminMmaPredictionSource {
  id: string;
  name: string;
  state: "wired" | "proposed" | "disabled" | "blocked";
  lastStatus: string | null;
  lastRetrievedAt: string | null;
  freshnessHours: number | null;
  quota: string;
}

export interface AdminMmaPredictionHealth {
  sources: AdminMmaPredictionSource[];
  organizations: Record<"ufc" | "oktagon", {
    events: number;
    bouts: number;
    announced: number;
    confirmed: number;
    completed: number;
  }>;
  corroboration: { noSource: number; oneProvider: number; multipleProviders: number };
  lastSnapshotAt: string | null;
  lastSnapshotAgeHours: number | null;
}

export interface AdminMmaBannerSize { width: number; height: number }
export interface AdminMmaBannerSlot {
  id: string;
  desktop: AdminMmaBannerSize;
  variants: AdminMmaBannerSize[];
  mobile: AdminMmaBannerSize | null;
  pages: string[];
  enabled: boolean;
  image: ({ src: string } & AdminMmaBannerSize) | null;
  alt: string;
  href: string | null;
  stagedChanged: boolean;
}

export interface AdminMmaBanners {
  status: "staged" | "delivered" | "missing";
  preparedAt: string | null;
  receiptRef: string | null;
  slots: AdminMmaBannerSlot[];
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
  predictions: AdminMmaPredictionHealth;
  banners: AdminMmaBanners;
  socialPacks: AdminMmaSocialPack[];
  calendar: AdminEditorialDay[];
  unreadable: string[];
}

const record = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, maximum = 1_000): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value.trim() : null;
const textArray = (value: unknown, maximum = 80): string[] | null => Array.isArray(value) && value.length <= maximum && value.every((entry) => text(entry, 400)) ? value as string[] : null;
const hash12 = (raw: string): string => `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`;

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const shiftedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function civilFromDays(days: number): { year: number; month: number; day: number } {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365);
  let year = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

export function weekStart(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) return date;
  const serial = daysFromCivil(Number(match[1]), Number(match[2]), Number(match[3]));
  const mondayIndex = ((serial + 3) % 7 + 7) % 7;
  const monday = civilFromDays(serial - mondayIndex);
  return `${String(monday.year).padStart(4, "0")}-${String(monday.month).padStart(2, "0")}-${String(monday.day).padStart(2, "0")}`;
}

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
async function hero(value: unknown, mediaBase: string, root: string): Promise<AdminMmaHero | null> {
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
  try {
    if (!(await stat(path.join(root, "state", mediaBase, `hero.${extension}`))).isFile()) return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return {
    url: mediaUrl(`${mediaBase}/hero.${extension}`),
    alt: { cs: altCs, en: altEn ?? altCs },
    credit,
    license: name,
    sourceUrl
  };
}

async function parseArticle(raw: string, ratingRecords: readonly RatingRecord[], root: string): Promise<AdminMmaArticle | null> {
  let input: Record<string, unknown> | null = null;
  try { input = record(JSON.parse(raw)); } catch { return null; }
  const slug = text(input?.slug, 160);
  const localizations = record(input?.localizations);
  const en = localization(localizations?.en);
  const cs = localization(localizations?.cs);
  const organization = input?.organization === "ufc" || input?.organization === "oktagon" ? input.organization : null;
  const format = text(input?.format, 80);
  const sources = Array.isArray(input?.sources) ? input.sources.map(source) : [];
  const fighterRefs = textArray(input?.fighterRefs);
  const publishAt = text(input?.publishAt, 80);
  const packageHashValue = text(input?.packageHash, 80);
  const status = input?.status === "draft" || input?.status === "blocked" || input?.status === "published" || input?.status === "killed" ? input.status : null;
  const slot = input?.slot === "am" || input?.slot === "pm" ? input.slot : null;
  if (input?.schemaVersion !== "article/1" || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !cs || !format || !sources.length || sources.some((item) => !item) || !fighterRefs || !publishAt || Number.isNaN(Date.parse(publishAt)) || !slot || !status || !packageHashValue || !/^[a-f0-9]{64}$/.test(packageHashValue) || packageHash(input) !== packageHashValue) return null;
  const date = publishAt.slice(0, 10);
  const id = `article:${date}:${slot}:${slug}`;
  const eventRef = text(input.eventRef, 160);
  const modelVersion = text(input.modelVersion, 100);
  const mediaBase = `ventures/mma-files/media/${date}-${slot}-${slug}`;
  return {
    id, slug, date, slot, format, status,
    localizations: { cs, ...(en ? { en } : {}) },
    organization,
    placements: ["Nejnovější", ...(organization ? [organization.toUpperCase()] : [])],
    weekStart: weekStart(date),
    sources: sources as AdminMmaArticle["sources"],
    fighterRefs,
    eventRef,
    modelVersion,
    packageHash: packageHashValue,
    contentHash: `sha256:${packageHashValue.slice(0, 12)}`,
    hero: await hero(input.image, mediaBase, root),
    ratings: history(ratingRecords, id)
  };
}

async function optionalJson(absolute: string): Promise<unknown> {
  try { return JSON.parse(await readFile(absolute, "utf8")) as unknown; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; return null; }
}

async function recursiveJsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
      ? recursiveJsonFiles(path.join(directory, entry.name))
      : Promise.resolve(entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])));
    return nested.flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function sourceProvider(reference: string): string {
  if (reference.startsWith("source:cito-ufc:")) return "provider:cito-ufc";
  if (reference.startsWith("source:wikipedia:")) return "provider:wikipedia";
  if (reference.startsWith("source:wikidata:")) return "provider:wikidata";
  if (reference.startsWith("source:the-odds-api:")) return "provider:the-odds-api";
  if (reference.startsWith("source:apify:")) return reference.split(":").slice(0, 3).join(":");
  try { return reference.startsWith("https://") ? `host:${new URL(reference).hostname.toLowerCase()}` : reference.split(":").slice(0, 2).join(":"); }
  catch { return reference; }
}

function quotaLabel(sourceId: string, access: unknown, quotas: { odds: unknown; cito: unknown; apify: unknown }): string {
  const odds = record(quotas.odds);
  if (sourceId === "the-odds-api") return typeof odds?.remainingCredits === "number" ? `${odds.remainingCredits}/500 credits remaining` : "No quota snapshot";
  const cito = record(quotas.cito);
  if (sourceId === "cito-ufc") return typeof cito?.monthlyCalls === "number" && typeof cito?.dailyCalls === "number"
    ? `${cito.monthlyCalls}/500 monthly · ${cito.dailyCalls}/200 daily`
    : "No quota snapshot";
  const apify = record(quotas.apify);
  if (access === "apify") return typeof apify?.estimatedUsedUsd === "number" && typeof apify?.shareCapUsd === "number"
    ? `$${apify.estimatedUsedUsd.toFixed(2)} / $${apify.shareCapUsd.toFixed(2)} MMA share`
    : "$0 until approvals; no quota snapshot";
  return "No metered quota";
}

async function readPredictionHealth(root: string, now: Date): Promise<AdminMmaPredictionHealth> {
  const registry = record(await optionalJson(path.join(root, "config", "mma-sources.json")));
  const sourceEntries = Array.isArray(registry?.sources) ? registry.sources : [];
  const snapshotFiles = await recursiveJsonFiles(path.join(root, "state", "ventures", "fightaiq", "source-snapshots"));
  const snapshots: Array<Record<string, unknown>> = [];
  for (const file of snapshotFiles) {
    if (path.basename(file) === "quota.json") continue;
    const parsed = record(await optionalJson(file));
    if (parsed?.schemaVersion === "fightaiq-source-snapshot/1") snapshots.push(parsed);
  }
  snapshots.sort((left, right) => String(right.retrievedAt ?? "").localeCompare(String(left.retrievedAt ?? "")));
  const latest = snapshots[0] ?? null;
  const latestAt = text(latest?.retrievedAt, 80);
  const latestResults = new Map<string, { status: string; at: string }>();
  for (const snapshot of snapshots) {
    const retrievedAt = text(snapshot.retrievedAt, 80);
    if (!retrievedAt || !Array.isArray(snapshot.sources)) continue;
    for (const rawSource of snapshot.sources) {
      const source = record(rawSource);
      const id = text(source?.sourceId, 100);
      const status = text(source?.status, 80);
      if (id && status && !latestResults.has(id)) latestResults.set(id, { status, at: retrievedAt });
    }
  }
  const quotas = {
    odds: await optionalJson(path.join(root, "state", "ventures", "fightaiq", "source-snapshots", "quota.json")),
    cito: await optionalJson(path.join(root, "state", "mma", "source-quota", "cito.json")),
    apify: await optionalJson(path.join(root, "state", "mma", "source-quota", "apify.json"))
  };
  const sources = sourceEntries.flatMap((value): AdminMmaPredictionSource[] => {
    const source = record(value);
    const id = text(source?.id, 100);
    const name = text(source?.name, 160);
    const state = source?.state === "wired" || source?.state === "proposed" || source?.state === "disabled" || source?.state === "blocked" ? source.state : null;
    if (!id || !name || !state) return [];
    const last = latestResults.get(id);
    const freshnessHours = last ? Math.max(0, (now.getTime() - Date.parse(last.at)) / 3_600_000) : null;
    return [{ id, name, state, lastStatus: last?.status ?? null, lastRetrievedAt: last?.at ?? null, freshnessHours, quota: quotaLabel(id, source?.access, quotas) }];
  });

  const organizations: AdminMmaPredictionHealth["organizations"] = {
    ufc: { events: 0, bouts: 0, announced: 0, confirmed: 0, completed: 0 },
    oktagon: { events: 0, bouts: 0, announced: 0, confirmed: 0, completed: 0 }
  };
  for (const file of await recursiveJsonFiles(path.join(root, "state", "mma", "events"))) {
    const event = record(await optionalJson(file));
    if (event?.org === "ufc" || event?.org === "oktagon") organizations[event.org].events += 1;
  }
  const corroboration = { noSource: 0, oneProvider: 0, multipleProviders: 0 };
  for (const file of await recursiveJsonFiles(path.join(root, "state", "mma", "bouts"))) {
    const bout = record(await optionalJson(file));
    if (bout?.org !== "ufc" && bout?.org !== "oktagon") continue;
    const counts = organizations[bout.org];
    counts.bouts += 1;
    if (bout.status === "announced") counts.announced += 1;
    if (bout.status === "confirmed" || bout.status === "weigh-in") counts.confirmed += 1;
    if (bout.status === "completed") counts.completed += 1;
    const refs = Array.isArray(bout.sourceRefs) ? bout.sourceRefs.filter((value): value is string => typeof value === "string") : [];
    const providers = new Set(refs.map(sourceProvider)).size;
    if (providers === 0) corroboration.noSource += 1;
    else if (providers === 1) corroboration.oneProvider += 1;
    else corroboration.multipleProviders += 1;
  }
  return {
    sources,
    organizations,
    corroboration,
    lastSnapshotAt: latestAt,
    lastSnapshotAgeHours: latestAt ? Math.max(0, (now.getTime() - Date.parse(latestAt)) / 3_600_000) : null
  };
}

async function readBanners(root: string): Promise<AdminMmaBanners> {
  const specification = record(await optionalJson(path.join(root, "config", "mma-ad-slots.json")));
  const definitions = Array.isArray(specification?.slots) ? specification.slots : [];
  const contract = record(await optionalJson(path.join(root, "state", "ventures", "mma-files", "banners", "contract.json")));
  const staged = record(await optionalJson(path.join(root, "state", "ventures", "mma-files", "banners", "payload", "data", "boardless", "ads.json")));
  const delivered = record(await optionalJson(path.join(root, "state", "ventures", "mma-files", "banners", "delivered.json")));
  const stagedSlots = record(staged?.slots) ?? {};
  const deliveredSlots = record(delivered?.slots) ?? {};
  const slots = definitions.flatMap((value): AdminMmaBannerSlot[] => {
    const definition = record(value);
    const desktop = record(definition?.desktop);
    const mobile = record(definition?.mobile);
    const id = text(definition?.id, 100);
    if (!id || typeof desktop?.width !== "number" || typeof desktop.height !== "number") return [];
    const current = record(stagedSlots[id]);
    const image = record(current?.image);
    const variants = Array.isArray(desktop.variants) ? desktop.variants.flatMap((entry): AdminMmaBannerSize[] => {
      const size = record(entry);
      return typeof size?.width === "number" && typeof size.height === "number" ? [{ width: size.width, height: size.height }] : [];
    }) : [];
    const slotValue = {
      enabled: current?.enabled === true,
      image: typeof image?.src === "string" && typeof image.width === "number" && typeof image.height === "number" ? { src: image.src, width: image.width, height: image.height } : null,
      alt: typeof current?.alt === "string" ? current.alt : "",
      href: typeof current?.href === "string" ? current.href : null
    };
    return [{
      id,
      desktop: { width: desktop.width, height: desktop.height },
      variants,
      mobile: typeof mobile?.width === "number" && typeof mobile.height === "number" ? { width: mobile.width, height: mobile.height } : null,
      pages: Array.isArray(definition?.pages) ? definition.pages.filter((entry): entry is string => typeof entry === "string") : [],
      ...slotValue,
      stagedChanged: JSON.stringify(canonical(slotValue)) !== JSON.stringify(canonical(deliveredSlots[id] ?? null))
    }];
  });
  return {
    status: contract?.status === "staged" || contract?.status === "delivered" ? contract.status : "missing",
    preparedAt: text(contract?.preparedAt, 80),
    receiptRef: text(contract?.receiptRef, 300),
    slots
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

export async function readAdminMmaFiles(root = repositoryRoot, now = new Date()): Promise<AdminMmaFilesSnapshot> {
  const [ratingState, predictions, banners] = await Promise.all([
    ratings(root),
    readPredictionHealth(root, now),
    readBanners(root)
  ]);
  const articleRoot = path.join(root, "state", "ventures", "mma-files", "articles");
  const articles: AdminMmaArticle[] = [];
  const unreadable: string[] = ratingState.malformed ? ["ratings/mma-files/ledger.jsonl"] : [];
  for (const filename of await files(articleRoot)) {
    const parsed = await parseArticle(await readFile(path.join(articleRoot, filename), "utf8"), ratingState.records, root);
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
    predictions,
    banners,
    socialPacks: socialPacks.sort((left, right) => right.articleRef.localeCompare(left.articleRef)),
    calendar: calendar.sort((left, right) => right.date.localeCompare(left.date)),
    unreadable
  };
}
