import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseTehdejsiFeatureRecommendation,
  type TehdejsiFeaturePayload,
  type TehdejsiFeatureRecommendation,
  type TehdejsiFeatureStatus
} from "./tehdejsi-feature-model";
import { parseRatingRecord, type RatingRecord } from "./rating-model";

export type AdminTehdejsiState = "missing" | "unreadable" | "present";

export interface AdminTehdejsiFact {
  id: string;
  kind: "everyday" | "culture" | "city" | "price" | "media" | "event";
  country: "cz" | "ua";
  place: string | null;
  yearFrom: number;
  yearTo: number;
  sensitivityTier: 0 | 1 | 2;
  text: string;
  sources: Array<{ title: string; url: string | null; note: string | null }>;
  verified: string | null;
}

export interface AdminTehdejsiFacts {
  copiedFrom: string;
  copiedAt: string;
  contentHash: string;
  facts: AdminTehdejsiFact[];
}

export interface AdminTehdejsiShortlistEntry {
  rank: number;
  factId: string;
  score: number;
  factors: {
    askability: number;
    anniversary: number;
    sourceConfidence: number;
    countryBalance: number;
    tierCost: number;
  };
  veto: "tier-2-review-required" | "recently-used" | null;
}

export interface AdminTehdejsiShortlist {
  date: string;
  factsHash: string;
  entries: AdminTehdejsiShortlistEntry[];
}

export interface AdminTehdejsiCycle {
  startedOn: string;
  phase: "planning" | "production";
  dayStatuses: Record<"planning" | "production", "pending" | "active" | "completed">;
  chosenFactIds: string[];
  stretch: { count: number; reason: "budget-pressure" | "review-required" | "no-candidate"; nextAttemptOn: string } | null;
  updatedAt: string;
}

export interface AdminTehdejsiResearch {
  topicKey: string;
  cycleId: string;
  provider: string;
  model: string;
  completedAt: string;
  tokensIn: number;
  tokensOut: number;
  searches: number;
  costUsd: number;
  usedBy: string[];
}

export interface AdminTehdejsiFeature {
  id: string;
  date: string;
  cycleId: string;
  status: TehdejsiFeatureStatus;
  factIds: string[];
  dossierCount: number;
  sensitivityTier: 0 | 1 | 2;
  tierRaisedBy: string[];
  terminologyCheckedAt: string;
  payload: TehdejsiFeaturePayload;
  media: Array<{
    slideOrdinal: number;
    source: string;
    sourceUrl: string | null;
    licence: "cc-by" | "cc-by-sa" | "public-domain" | "own-render";
    attribution: string;
  }>;
  humanReviewRequired: boolean;
  humanReviewedAt: string | null;
  designLab: { ready: boolean; readyAt: string | null };
  owner: { postedUrls: Record<"cs" | "ua", string | null>; rejectionReason: string | null };
  generatedAt: string;
  updatedAt: string;
  contentHash: string;
  ratings: RatingRecord[];
}

type StoreName = "facts" | "shortlists" | "cycle" | "ledger" | "features" | "ratings";

export interface AdminTehdejsiSnapshot {
  stores: Record<StoreName, AdminTehdejsiState>;
  unreadable: Record<StoreName | "total", number>;
  facts: AdminTehdejsiFacts | null;
  shortlist: AdminTehdejsiShortlist | null;
  cycle: AdminTehdejsiCycle | null;
  research: AdminTehdejsiResearch[];
  researchEfficiency: number | null;
  features: AdminTehdejsiFeature[];
}

type ReadResult<T> = { state: AdminTehdejsiState; items: T[]; unreadable: number };
type ObjectValue = Record<string, unknown>;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;
const STATE_PATH = /^state\/[a-zA-Z0-9._/-]+$/u;

function object(value: unknown): ObjectValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as ObjectValue
    : null;
}

function exact(value: ObjectValue, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max;
}

function finite(value: unknown, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function https(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as ObjectValue)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function parseFact(value: unknown): AdminTehdejsiFact | null {
  const fact = object(value);
  if (!fact || !exact(fact, [
    "id", "kind", "country", "place", "yearFrom", "yearTo", "sensitivityTier", "shareSafe",
    "text", "sources", "verified"
  ])) return null;
  if (typeof fact.id !== "string" || fact.id.length > 80 || !SLUG.test(fact.id)) return null;
  if (!(["everyday", "culture", "city", "price", "media", "event"] as unknown[]).includes(fact.kind)) return null;
  if (fact.country !== "cz" && fact.country !== "ua") return null;
  if (fact.place !== null && !text(fact.place, 120)) return null;
  if (!integer(fact.yearFrom, 1900, 2030) || !integer(fact.yearTo, 1900, 2030) || fact.yearTo < fact.yearFrom) return null;
  if (![0, 1, 2].includes(Number(fact.sensitivityTier)) || fact.shareSafe !== true || !text(fact.text, 600) || fact.text.trim().length < 20) return null;
  if (!Array.isArray(fact.sources) || fact.sources.length < 1 || fact.sources.length > 6) return null;
  const sources: AdminTehdejsiFact["sources"] = [];
  for (const raw of fact.sources) {
    const source = object(raw);
    if (!source || !exact(source, ["title", "url", "note"]) || !text(source.title, 200)) return null;
    if (source.url !== null && !https(source.url)) return null;
    if (source.note !== null && (typeof source.note !== "string" || source.note.length > 400)) return null;
    sources.push({ title: source.title.trim(), url: source.url as string | null, note: source.note as string | null });
  }
  if (fact.sensitivityTier === 2 && sources.length < 2) return null;
  if (fact.verified !== null && (typeof fact.verified !== "string" || !DATE.test(fact.verified))) return null;
  return {
    id: fact.id,
    kind: fact.kind as AdminTehdejsiFact["kind"],
    country: fact.country,
    place: fact.place as string | null,
    yearFrom: fact.yearFrom,
    yearTo: fact.yearTo,
    sensitivityTier: fact.sensitivityTier as 0 | 1 | 2,
    text: fact.text.trim(),
    sources,
    verified: fact.verified as string | null
  };
}

function parseFacts(value: unknown): AdminTehdejsiFacts | null {
  const file = object(value);
  if (!file || !exact(file, ["schemaVersion", "copiedFrom", "copiedAt", "contentHash", "facts"]) ||
      file.schemaVersion !== "tehdejsi-facts/1" || !text(file.copiedFrom, 300) || !instant(file.copiedAt) ||
      typeof file.contentHash !== "string" || !HASH.test(file.contentHash) || !Array.isArray(file.facts) || file.facts.length < 1) return null;
  const facts = file.facts.map(parseFact);
  if (facts.some((fact) => fact === null)) return null;
  const parsed = facts as AdminTehdejsiFact[];
  if (new Set(parsed.map(({ id }) => id)).size !== parsed.length) return null;
  const actualHash = createHash("sha256").update(canonicalJson(file.facts)).digest("hex");
  if (actualHash !== file.contentHash) return null;
  return { copiedFrom: file.copiedFrom.trim(), copiedAt: file.copiedAt, contentHash: file.contentHash, facts: parsed };
}

function parseShortlist(value: unknown): AdminTehdejsiShortlist | null {
  const file = object(value);
  if (!file || !exact(file, ["schemaVersion", "date", "factsHash", "entries"]) || file.schemaVersion !== "tehdejsi-shortlist/1" ||
      typeof file.date !== "string" || !DATE.test(file.date) || typeof file.factsHash !== "string" || !HASH.test(file.factsHash) ||
      !Array.isArray(file.entries) || file.entries.length < 1) return null;
  const entries: AdminTehdejsiShortlistEntry[] = [];
  for (const raw of file.entries) {
    const entry = object(raw); const factors = object(entry?.factors);
    if (!entry || !exact(entry, ["rank", "factId", "score", "factors", "veto"]) || !factors ||
        !exact(factors, ["askability", "anniversary", "sourceConfidence", "countryBalance", "tierCost"])) return null;
    if (!integer(entry.rank, 1) || typeof entry.factId !== "string" || !entry.factId || !finite(entry.score) ||
        !["tier-2-review-required", "recently-used", null].includes(entry.veto as string | null)) return null;
    if (Object.values(factors).some((factor) => !finite(factor))) return null;
    entries.push({
      rank: entry.rank,
      factId: entry.factId,
      score: entry.score,
      factors: factors as unknown as AdminTehdejsiShortlistEntry["factors"],
      veto: entry.veto as AdminTehdejsiShortlistEntry["veto"]
    });
  }
  const expectedRanks = entries.map((_, index) => index + 1);
  if (JSON.stringify(entries.map(({ rank }) => rank).sort((a, b) => a - b)) !== JSON.stringify(expectedRanks)) return null;
  if (new Set(entries.map(({ factId }) => factId)).size !== entries.length) return null;
  return { date: file.date, factsHash: file.factsHash, entries };
}

function parseCycle(value: unknown): AdminTehdejsiCycle | null {
  const file = object(value); const statuses = object(file?.dayStatuses); const stretch = file?.stretch === null ? null : object(file?.stretch);
  if (!file || !exact(file, ["schemaVersion", "startedOn", "phase", "dayStatuses", "chosenFactIds", "shortlistRef", "stretch", "updatedAt"]) ||
      file.schemaVersion !== "tehdejsi-cycle/1" || typeof file.startedOn !== "string" || !DATE.test(file.startedOn) ||
      (file.phase !== "planning" && file.phase !== "production") || !statuses || !exact(statuses, ["planning", "production"]) ||
      !["pending", "active", "completed"].includes(String(statuses.planning)) || !["pending", "active", "completed"].includes(String(statuses.production)) ||
      !Array.isArray(file.chosenFactIds) || file.chosenFactIds.length > 2 || file.chosenFactIds.some((id) => typeof id !== "string" || !id) ||
      (file.shortlistRef !== null && typeof file.shortlistRef !== "string") || !instant(file.updatedAt)) return null;
  if (file.phase === "production" && statuses.planning !== "completed") return null;
  if (statuses.planning === "completed" && file.chosenFactIds.length === 0) return null;
  if (new Set(file.chosenFactIds).size !== file.chosenFactIds.length) return null;
  let parsedStretch: AdminTehdejsiCycle["stretch"] = null;
  if (stretch) {
    if (!exact(stretch, ["count", "reason", "nextAttemptOn"]) || !integer(stretch.count, 1) ||
        !["budget-pressure", "review-required", "no-candidate"].includes(String(stretch.reason)) ||
        typeof stretch.nextAttemptOn !== "string" || !DATE.test(stretch.nextAttemptOn)) return null;
    parsedStretch = stretch as unknown as NonNullable<AdminTehdejsiCycle["stretch"]>;
  } else if (file.stretch !== null) return null;
  return {
    startedOn: file.startedOn,
    phase: file.phase,
    dayStatuses: statuses as unknown as AdminTehdejsiCycle["dayStatuses"],
    chosenFactIds: file.chosenFactIds as string[],
    stretch: parsedStretch,
    updatedAt: file.updatedAt
  };
}

interface ResearchPurchase extends Omit<AdminTehdejsiResearch, "usedBy"> {
  briefHash: string;
}

interface ResearchUse {
  topicKey: string;
  briefHash: string;
  recommendationId: string;
}

function parseResearch(value: unknown): ResearchPurchase | ResearchUse | null {
  const entry = object(value);
  if (!entry || entry.schemaVersion !== "ts-research-ledger/1") return null;
  if (entry.kind === "use") {
    if (!exact(entry, ["schemaVersion", "kind", "topicKey", "briefHash", "at", "recommendationId"]) ||
        typeof entry.topicKey !== "string" || !SLUG.test(entry.topicKey) || typeof entry.briefHash !== "string" || !HASH.test(entry.briefHash) ||
        !instant(entry.at) || typeof entry.recommendationId !== "string" || !SLUG.test(entry.recommendationId)) return null;
    return { topicKey: entry.topicKey, briefHash: entry.briefHash, recommendationId: entry.recommendationId };
  }
  if (entry.kind !== "purchase" || !exact(entry, [
    "schemaVersion", "kind", "topicKey", "briefHash", "cycleId", "provider", "model", "startedAt", "completedAt",
    "tokensIn", "tokensOut", "searches", "costUsd", "dossierRef"
  ])) return null;
  if (typeof entry.topicKey !== "string" || !SLUG.test(entry.topicKey) || typeof entry.briefHash !== "string" || !HASH.test(entry.briefHash) ||
      !text(entry.cycleId, 120) || !text(entry.provider, 120) || !text(entry.model, 160) || !instant(entry.startedAt) || !instant(entry.completedAt) ||
      Date.parse(entry.completedAt) < Date.parse(entry.startedAt) || !integer(entry.tokensIn) || !integer(entry.tokensOut) || !integer(entry.searches, 0, 8) ||
      !finite(entry.costUsd, 0, 0.3) || typeof entry.dossierRef !== "string" || !STATE_PATH.test(entry.dossierRef) || entry.dossierRef.includes("..")) return null;
  return {
    topicKey: entry.topicKey,
    briefHash: entry.briefHash,
    cycleId: entry.cycleId,
    provider: entry.provider.trim(),
    model: entry.model.trim(),
    completedAt: entry.completedAt,
    tokensIn: entry.tokensIn,
    tokensOut: entry.tokensOut,
    searches: entry.searches,
    costUsd: entry.costUsd
  };
}

function projectFeature(value: TehdejsiFeatureRecommendation, raw: string, ratings: readonly RatingRecord[]): AdminTehdejsiFeature {
  return {
    id: value.id,
    date: value.date,
    cycleId: value.cycleId,
    status: value.status,
    factIds: value.evidence.factIds,
    dossierCount: value.evidence.dossierRefs.length,
    sensitivityTier: value.evidence.sensitivityTier,
    tierRaisedBy: value.evidence.tierRaisedBy,
    terminologyCheckedAt: value.evidence.terminologyCheck.checkedAt,
    payload: value.payload,
    media: value.media,
    humanReviewRequired: value.humanReviewRequired,
    humanReviewedAt: value.humanReviewedAt,
    designLab: { ready: value.designLab.readyAt !== null, readyAt: value.designLab.readyAt },
    owner: value.owner,
    generatedAt: value.generatedAt,
    updatedAt: value.updatedAt,
    contentHash: `sha256:${createHash("sha256").update(raw).digest("hex").slice(0, 12)}`,
    ratings: ratings
      .filter((rating) => rating.ventureId === "tehdejsi-svet" && rating.objectKind === "recommendation" && rating.objectRef.id === value.id)
      .sort((left, right) => right.ratedAt.localeCompare(left.ratedAt) || right.id.localeCompare(left.id))
  };
}

async function singleton<T>(file: string, parse: (value: unknown) => T | null): Promise<{ state: AdminTehdejsiState; item: T | null; unreadable: number }> {
  try {
    const item = parse(JSON.parse(await readFile(file, "utf8")) as unknown);
    return item ? { state: "present", item, unreadable: 0 } : { state: "unreadable", item: null, unreadable: 1 };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", item: null, unreadable: 0 }
      : { state: "unreadable", item: null, unreadable: 1 };
  }
}

async function collection<T>(directory: string, parse: (value: unknown, raw: string) => T | null): Promise<ReadResult<T>> {
  let names: string[];
  try {
    names = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(({ name }) => name)
      .sort();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", items: [], unreadable: 0 }
      : { state: "unreadable", items: [], unreadable: 1 };
  }
  const items: T[] = [];
  let unreadable = 0;
  for (const name of names) {
    try {
      const raw = await readFile(path.join(directory, name), "utf8");
      const item = parse(JSON.parse(raw) as unknown, raw);
      if (item) items.push(item); else unreadable += 1;
    } catch { unreadable += 1; }
  }
  return {
    state: items.length ? "present" : unreadable ? "unreadable" : "missing",
    items,
    unreadable
  };
}

async function ledger(file: string): Promise<ReadResult<AdminTehdejsiResearch>> {
  let lines: string[];
  try { lines = (await readFile(file, "utf8")).split(/\r?\n/u).filter((line) => line.trim()); }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", items: [], unreadable: 0 }
      : { state: "unreadable", items: [], unreadable: 1 };
  }
  const purchases: ResearchPurchase[] = [];
  const uses: ResearchUse[] = [];
  let unreadable = 0;
  for (const line of lines) {
    let parsed: ReturnType<typeof parseResearch> = null;
    try { parsed = parseResearch(JSON.parse(line) as unknown); } catch { /* Count below. */ }
    if (!parsed) unreadable += 1;
    else if ("recommendationId" in parsed) uses.push(parsed);
    else purchases.push(parsed);
  }
  const items = purchases.map(({ briefHash, ...purchase }) => ({
    ...purchase,
    usedBy: [...new Set(uses
      .filter((use) => use.topicKey === purchase.topicKey && use.briefHash === briefHash)
      .map(({ recommendationId }) => recommendationId))].sort()
  }));
  return { state: items.length ? "present" : unreadable ? "unreadable" : "missing", items, unreadable };
}

async function ratingsLedger(file: string): Promise<ReadResult<RatingRecord>> {
  let lines: string[];
  try { lines = (await readFile(file, "utf8")).split(/\r?\n/u).filter((line) => line.trim()); }
  catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", items: [], unreadable: 0 }
      : { state: "unreadable", items: [], unreadable: 1 };
  }
  const items: RatingRecord[] = [];
  let unreadable = 0;
  for (const line of lines) {
    let parsed: RatingRecord | null = null;
    try { parsed = parseRatingRecord(JSON.parse(line) as unknown); } catch { /* Count below. */ }
    if (!parsed || parsed.ventureId !== "tehdejsi-svet") unreadable += 1;
    else items.push(parsed);
  }
  return { state: items.length ? "present" : unreadable ? "unreadable" : "missing", items, unreadable };
}

/** Load strict public derivatives only; malformed state is counted and never reaches the admin client. */
export async function readAdminTehdejsiSvet(
  root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")
): Promise<AdminTehdejsiSnapshot> {
  const base = path.join(root, "state", "ventures", "tehdejsi-svet");
  const [facts, shortlists, cycle, research, featureRecords, ratings] = await Promise.all([
    singleton(path.join(base, "facts.json"), parseFacts),
    collection(path.join(base, "shortlists"), (value) => parseShortlist(value)),
    singleton(path.join(base, "cycle.json"), parseCycle),
    ledger(path.join(base, "research-ledger.jsonl")),
    collection(path.join(base, "drafts"), (value, raw) => {
      const parsed = parseTehdejsiFeatureRecommendation(value);
      return parsed ? { parsed, raw } : null;
    }),
    ratingsLedger(path.join(root, "state", "ratings", "tehdejsi-svet", "ledger.jsonl"))
  ]);
  const features: ReadResult<AdminTehdejsiFeature> = {
    state: featureRecords.state,
    unreadable: featureRecords.unreadable,
    items: featureRecords.items.map(({ parsed, raw }) => projectFeature(parsed, raw, ratings.items))
  };
  const latestShortlist = [...shortlists.items].sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  const paidResearch = research.items.filter(({ costUsd }) => costUsd > 0);
  const usedResearch = paidResearch.filter(({ usedBy }) => usedBy.length > 0);
  const counts = {
    facts: facts.unreadable,
    shortlists: shortlists.unreadable,
    cycle: cycle.unreadable,
    ledger: research.unreadable,
    features: features.unreadable,
    ratings: ratings.unreadable
  };
  return {
    stores: {
      facts: facts.state,
      shortlists: shortlists.state,
      cycle: cycle.state,
      ledger: research.state,
      features: features.state,
      ratings: ratings.state
    },
    unreadable: { ...counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0) },
    facts: facts.item,
    shortlist: latestShortlist,
    cycle: cycle.item,
    research: research.items.sort((left, right) => right.completedAt.localeCompare(left.completedAt) || left.topicKey.localeCompare(right.topicKey)),
    researchEfficiency: paidResearch.length ? usedResearch.length / paidResearch.length : null,
    features: features.items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
  };
}
