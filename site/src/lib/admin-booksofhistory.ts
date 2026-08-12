import "server-only";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseBhRecommendation } from "./booksofhistory-features-store";
import { parseOwnerResultEntry, type OwnerResultEntry, type OwnerResultMetrics } from "./owner-result-entry";
import { parseRatingLedger, type RatingRecord } from "./rating-model";

export type BhRecordState = "missing" | "unreadable" | "present";
type Locale = "cs" | "en";

export interface AdminBhShortlistEntry {
  rank: number;
  bookId: string;
  title: string;
  author: string;
  totalScore: number;
  culturalMoment: boolean;
  factors: {
    priors: { score: number; weights: Record<string, number>; values: Record<string, number> };
    anniversary: { multiplier: number; strength: number; events: Array<{ kind: string; milestone: number; daysAway: number | null }> };
    trendCrossover: { multiplier: number; strength: number; signalCount: number };
    diversityPressure: { multiplier: number; pressure: number; byDimension: Record<string, number> };
    lanePerformance: { multiplier: number; lanes: Record<Locale, number> };
    shelfBonus: { multiplier: number; eligibleStoryCount: number; highestScore: number | null };
  };
}

export interface AdminBhShortlist {
  date: string;
  cycleId: string;
  asOf: string;
  entries: AdminBhShortlistEntry[];
}

export interface AdminBhBriefDecision {
  date: string;
  cycleId: string;
  meetingId: string;
  maximumCandidates: number;
  selections: Array<{ bookId: string; shortlistRank: number; selectionReason: string; objective: string }>;
}

export interface AdminBhCycle {
  cycleId: string;
  cycleDays: number;
  phase: "selection" | "research" | "production";
  dayStatuses: Record<"selection" | "research" | "production", string>;
  candidates: Array<{ candidateId: string; source: "shortlist" | "shelf" }>;
  chosenStoryId: string | null;
  stretch: { count: number; reason: string | null; nextAttemptOn: string | null };
  startedOn: string;
  updatedAt: string;
}

export interface AdminBhClaim {
  claimId: string;
  text: string;
  confidence: number;
  corroboration: number;
  verificationState: "verified" | "probable" | "single-source" | "legend" | "rejected";
  publicationSuitable: boolean;
  sources: Array<{ url: string; title: string; category: string }>;
}

export interface AdminBhDossier {
  bookId: string;
  title: string;
  author: string;
  researchedAt: string;
  updatedAt: string;
  claims: AdminBhClaim[];
  stories: Array<{ storyId: string; angle: string; score: number; claimRefs: string[]; used: boolean }>;
  quotes: Array<{ text: string; attribution: string; sourceUrl: string; claimRef: string }>;
}

export interface AdminBhLedgerEntry {
  step: "gather" | "synth" | "supplement";
  provider: string;
  model: string;
  completedAt: string;
  cycleId: string;
  bookId: string;
  dossierId: string;
  reason: string;
  tokensIn: number;
  tokensOut: number;
  searches: number;
  costUsd: number;
  requestingMeetingId: string;
  used: boolean;
}

export interface AdminBhFeature {
  recommendationId: string;
  cycleId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  dossierId: string;
  storyId: string;
  claimRefs: string[];
  payloads: ReturnType<typeof publicFeaturePair>;
  gates: Record<Locale, { passed: boolean; violations: Array<{ code: string; message: string }> }>;
  designLabStatus: string;
  postedUrls: Record<Locale, string | null>;
  resultCounts: Record<Locale, number>;
  results: Record<Locale, AdminBhOwnerResult[]>;
  contentHash: string;
  ratings: RatingRecord[];
}

export interface AdminBhOwnerResult {
  resultId: string;
  locale: Locale;
  platform: string;
  postUrl: string;
  capturedAt: string;
  recordedAt: string;
  metrics: OwnerResultMetrics;
  note: string | null;
}

type ParsedBhFeature = AdminBhFeature & { resultIds: Record<Locale, string[]> };

export interface AdminBooksofhistorySnapshot {
  stores: Record<"seed" | "shortlists" | "briefs" | "cycle" | "dossiers" | "ledger" | "features" | "results" | "ratings", BhRecordState>;
  unreadable: Record<"seed" | "shortlists" | "briefs" | "cycle" | "dossiers" | "ledger" | "features" | "results" | "ratings" | "total", number>;
  seedBooks: number | null;
  shortlist: AdminBhShortlist | null;
  brief: AdminBhBriefDecision | null;
  cycle: AdminBhCycle | null;
  dossiers: AdminBhDossier[];
  ledger: AdminBhLedgerEntry[];
  researchEfficiency: number | null;
  features: AdminBhFeature[];
}

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown, max = 1_000): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null;
const number = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const day = (value: unknown): string | null => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
const instant = (value: unknown): string | null => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
const slug = (value: unknown): string | null => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) ? value : null;
const stringArray = (value: unknown, max = 100): string[] | null =>
  Array.isArray(value) && value.length <= max && value.every((entry) => typeof entry === "string") ? value as string[] : null;

function label(reference: unknown): string | null {
  const value = text(reference, 500);
  if (!value) return null;
  const fragment = value.split("#").at(-1) ?? value;
  return path.basename(fragment).replace(/\.(?:json|md)$/u, "");
}

async function jsonNames(directory: string): Promise<{ state: BhRecordState; names: string[] }> {
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    return { state: names.length ? "present" : "missing", names };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing", names: [] };
    throw error;
  }
}

async function collection<T>(directory: string, parse: (value: unknown) => T | null): Promise<{ state: BhRecordState; items: T[]; unreadable: number }> {
  const listed = await jsonNames(directory);
  const items: T[] = [];
  let unreadable = 0;
  for (const name of listed.names) {
    try {
      const parsed = parse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown);
      if (parsed) items.push(parsed); else unreadable += 1;
    } catch { unreadable += 1; }
  }
  return { state: items.length ? "present" : unreadable ? "unreadable" : listed.state, items, unreadable };
}

async function singleton<T>(file: string, parse: (value: unknown) => T | null): Promise<{ state: BhRecordState; item: T | null; unreadable: number }> {
  try {
    const item = parse(JSON.parse(await readFile(file, "utf8")) as unknown);
    return item ? { state: "present", item, unreadable: 0 } : { state: "unreadable", item: null, unreadable: 1 };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", item: null, unreadable: 0 }
      : { state: "unreadable", item: null, unreadable: 1 };
  }
}

function parseSeed(value: unknown): number | null {
  const seed = object(value);
  if (seed?.schemaVersion !== "bh-seed/1" || !Array.isArray(seed.books) || seed.books.length < 1) return null;
  return seed.books.every((book) => slug(object(book)?.bookId) && text(object(book)?.title, 240) && text(object(book)?.author, 160)) ? seed.books.length : null;
}

function numericRecord(value: unknown): Record<string, number> | null {
  const raw = object(value);
  if (!raw) return null;
  const entries = Object.entries(raw);
  return entries.length && entries.every(([, entry]) => number(entry, 0, 400) !== null) ? Object.fromEntries(entries) as Record<string, number> : null;
}

function parseShortlist(value: unknown): AdminBhShortlist | null {
  const shortlist = object(value);
  const date = day(shortlist?.date); const cycleId = text(shortlist?.cycleId, 120); const asOf = instant(shortlist?.asOf);
  if (shortlist?.schemaVersion !== "bh-shortlist/1" || !date || !cycleId || !asOf || !Array.isArray(shortlist.entries)) return null;
  const entries = shortlist.entries.map((raw): AdminBhShortlistEntry | null => {
    const item = object(raw); const factors = object(item?.factors); const priors = object(factors?.priors);
    const anniversary = object(factors?.anniversary); const trend = object(factors?.trendCrossover);
    const diversity = object(factors?.diversityPressure); const lanes = object(factors?.lanePerformance); const shelf = object(factors?.shelfBonus);
    const rank = number(item?.rank, 1, 10); const bookId = slug(item?.bookId); const title = text(item?.title, 240); const author = text(item?.author, 160); const totalScore = number(item?.totalScore, 0, 400);
    const weights = numericRecord(priors?.weights); const values = numericRecord(priors?.values); const priorsScore = number(priors?.score, 0, 100);
    const laneValues = numericRecord(lanes?.lanes); const dimensions = numericRecord(diversity?.byDimension);
    if (!rank || !bookId || !title || !author || totalScore === null || !weights || !values || priorsScore === null || !laneValues || !dimensions || !Array.isArray(anniversary?.events) || !Array.isArray(trend?.matchedSignalIds) || !Array.isArray(shelf?.eligibleStoryIds)) return null;
    const events = anniversary.events.flatMap((rawEvent) => { const event = object(rawEvent); const kind = text(event?.kind, 40); const milestone = number(event?.milestone, 1, 200); const daysAway = event?.daysAway === null ? null : number(event?.daysAway, 0, 60); return kind && milestone !== null && (event?.daysAway === null || daysAway !== null) ? [{ kind, milestone, daysAway }] : []; });
    if (events.length !== anniversary.events.length) return null;
    const multiplier = number(anniversary.multiplier, 1, 1.25); const strength = number(anniversary.strength, 0, 1);
    const trendMultiplier = number(trend?.multiplier, 1, 1.2); const trendStrength = number(trend?.strength, 0, 1);
    const diversityMultiplier = number(diversity?.multiplier, 0.65, 1); const pressure = number(diversity?.pressure, 0, 1);
    const laneMultiplier = number(lanes?.multiplier, 0.75, 1.25); const shelfMultiplier = number(shelf?.multiplier, 1, 1.6); const highestScore = shelf?.highestScore === null ? null : number(shelf?.highestScore, 70, 100);
    if ([multiplier, strength, trendMultiplier, trendStrength, diversityMultiplier, pressure, laneMultiplier, shelfMultiplier].some((entry) => entry === null) || laneValues.cs === undefined || laneValues.en === undefined) return null;
    return { rank, bookId, title, author, totalScore, culturalMoment: item?.culturalMoment === true, factors: { priors: { score: priorsScore, weights, values }, anniversary: { multiplier: multiplier!, strength: strength!, events }, trendCrossover: { multiplier: trendMultiplier!, strength: trendStrength!, signalCount: trend.matchedSignalIds.length }, diversityPressure: { multiplier: diversityMultiplier!, pressure: pressure!, byDimension: dimensions }, lanePerformance: { multiplier: laneMultiplier!, lanes: { cs: laneValues.cs, en: laneValues.en } }, shelfBonus: { multiplier: shelfMultiplier!, eligibleStoryCount: shelf.eligibleStoryIds.length, highestScore } } };
  });
  return entries.length > 0 && entries.every((entry) => entry !== null) ? { date, cycleId, asOf, entries: entries as AdminBhShortlistEntry[] } : null;
}

function parseBrief(value: unknown): AdminBhBriefDecision | null {
  const brief = object(value); const date = day(brief?.date); const cycleId = text(brief?.cycleId, 120); const meetingId = label(brief?.requestingMeetingRef); const maximumCandidates = number(brief?.maximumCandidates, 2, 3);
  if (brief?.schemaVersion !== "bh-research-brief/1" || !date || !cycleId || !meetingId || !maximumCandidates || !Array.isArray(brief.briefs) || brief.briefs.length < 2 || brief.briefs.length > 3) return null;
  const selections = brief.briefs.flatMap((raw) => { const item = object(raw); const bookId = slug(item?.bookId); const shortlistRank = number(item?.shortlistRank, 1, 10); const selectionReason = text(item?.selectionReason, 500); const objective = text(item?.objective, 800); return bookId && shortlistRank && selectionReason && objective ? [{ bookId, shortlistRank, selectionReason, objective }] : []; });
  return selections.length === brief.briefs.length ? { date, cycleId, meetingId, maximumCandidates, selections } : null;
}

function parseCycle(value: unknown): AdminBhCycle | null {
  const cycle = object(value); const cycleId = slug(cycle?.currentCycleId); const cycleDays = number(cycle?.cycleDays, 2, 7); const statuses = object(cycle?.dayStatuses); const stretch = object(cycle?.stretch);
  if (cycle?.schemaVersion !== "bh-cycle/1" || !cycleId || !cycleDays || !["selection", "research", "production"].includes(String(cycle.phase)) || !statuses || !stretch || !Array.isArray(cycle.candidateSet)) return null;
  const candidates = cycle.candidateSet.flatMap((raw): AdminBhCycle["candidates"] => { const item = object(raw); const candidateId = slug(item?.candidateId); const source: AdminBhCycle["candidates"][number]["source"] | null = item?.source === "shortlist" || item?.source === "shelf" ? item.source : null; return candidateId && source ? [{ candidateId, source }] : []; });
  const chosen = cycle.chosenStory === null ? null : label(object(cycle.chosenStory)?.storyRef);
  const count = number(stretch.count, 0, 30); const startedOn = day(cycle.startedOn); const updatedAt = instant(cycle.updatedAt);
  if (candidates.length !== cycle.candidateSet.length || count === null || !startedOn || !updatedAt || ![statuses.selection, statuses.research, statuses.production].every((status) => typeof status === "string")) return null;
  return { cycleId, cycleDays, phase: cycle.phase as AdminBhCycle["phase"], dayStatuses: statuses as AdminBhCycle["dayStatuses"], candidates, chosenStoryId: chosen, stretch: { count, reason: text(stretch.reason, 80), nextAttemptOn: stretch.nextAttemptOn === null ? null : day(stretch.nextAttemptOn) }, startedOn, updatedAt };
}

function parseDossier(value: unknown): AdminBhDossier | null {
  const dossier = object(value); const bookId = slug(dossier?.bookId); const title = text(dossier?.title, 240); const author = text(dossier?.author, 160); const researchedAt = instant(dossier?.researchedAt); const updatedAt = instant(dossier?.updatedAt);
  if (dossier?.schemaVersion !== "bh-dossier/1" || !bookId || !title || !author || !researchedAt || !updatedAt || !Array.isArray(dossier.claims) || !Array.isArray(dossier.storyCandidates) || !Array.isArray(dossier.quotes)) return null;
  const claims = dossier.claims.flatMap((raw): AdminBhClaim[] => { const item = object(raw); const claimId = text(item?.claimId, 120); const claimText = text(item?.text, 1_000); const confidence = number(item?.confidence, 0, 1); const corroboration = number(item?.corroboration, 1, 20); const state = ["verified", "probable", "single-source", "legend", "rejected"].includes(String(item?.verificationState)) ? item?.verificationState as AdminBhClaim["verificationState"] : null; if (!claimId || !claimText || confidence === null || corroboration === null || !state || !Array.isArray(item?.sources)) return []; const sources = item.sources.flatMap((rawSource) => { const source = object(rawSource); const url = text(source?.url, 2_000); const sourceTitle = text(source?.title, 300); const category = text(source?.category, 40); return url?.startsWith("https://") && sourceTitle && category ? [{ url, title: sourceTitle, category }] : []; }); return sources.length === item.sources.length ? [{ claimId, text: claimText, confidence, corroboration, verificationState: state, publicationSuitable: item?.publicationSuitable === true, sources }] : []; });
  const stories = dossier.storyCandidates.flatMap((raw) => { const item = object(raw); const storyId = text(item?.storyId, 120); const angle = text(item?.angle, 300); const score = number(item?.score, 0, 100); const claimRefs = stringArray(item?.claimRefs, 20); return storyId && angle && score !== null && claimRefs ? [{ storyId, angle, score, claimRefs, used: item?.used === true }] : []; });
  const quotes = dossier.quotes.flatMap((raw) => { const item = object(raw); const quoteText = text(item?.text, 300); const attribution = text(item?.attribution, 300); const sourceUrl = text(item?.sourceUrl, 2_000); const claimRef = text(item?.claimRef, 120); return quoteText && attribution && sourceUrl?.startsWith("https://") && claimRef ? [{ text: quoteText, attribution, sourceUrl, claimRef }] : []; });
  return claims.length === dossier.claims.length && stories.length === dossier.storyCandidates.length && quotes.length === dossier.quotes.length ? { bookId, title, author, researchedAt, updatedAt, claims, stories, quotes } : null;
}

function parseLedger(value: unknown): AdminBhLedgerEntry | null {
  const item = object(value); const meeting = label(item?.requestingMeetingRef); const completedAt = instant(item?.completedAt); const bookId = slug(item?.bookId); const dossierRef = text(item?.dossierRef, 500); const dossierId = dossierRef ? slug(dossierRef.split("/").at(-2)) : null; const cycleId = text(item?.cycleId, 120); const provider = text(item?.provider, 120); const model = text(item?.model, 160); const reason = text(item?.reason, 80); const tokensIn = number(item?.tokensIn); const tokensOut = number(item?.tokensOut); const searches = number(item?.searches, 0, 8); const costUsd = number(item?.costUsd, 0, 0.1);
  if (item?.schemaVersion !== "bh-research-ledger/1" || !["gather", "synth", "supplement"].includes(String(item.step)) || !meeting || !completedAt || !bookId || !dossierId || !cycleId || !provider || !model || !reason || typeof item.used !== "boolean" || [tokensIn, tokensOut, searches, costUsd].some((entry) => entry === null)) return null;
  return { step: item.step as AdminBhLedgerEntry["step"], provider, model, completedAt, cycleId, bookId, dossierId, reason, tokensIn: tokensIn!, tokensOut: tokensOut!, searches: searches!, costUsd: costUsd!, requestingMeetingId: meeting, used: item.used === true };
}

function publicFeaturePair(recommendation: NonNullable<ReturnType<typeof parseBhRecommendation>>) {
  const one = (locale: Locale) => { const feature = recommendation.payloads[locale]; return { locale, headline: feature.headline, slides: feature.slides, caption: feature.caption, quotes: feature.quotes }; };
  return { cs: one("cs"), en: one("en") };
}

function parseFeature(value: unknown): ParsedBhFeature | null {
  const item = parseBhRecommendation(value);
  if (!item) return null;
  const dossierSegments = item.evidence.dossierRef.split("/");
  const dossierId = slug(dossierSegments.at(-2)) ?? label(item.evidence.dossierRef) ?? "unknown";
  const violations = (locale: Locale) => item.gateResults[locale].violations.flatMap((raw) => {
    const violation = object(raw); const code = text(violation?.code, 100); const message = text(violation?.message, 500);
    return code && message ? [{ code, message }] : [];
  });
  const csViolations = violations("cs"); const enViolations = violations("en");
  if (csViolations.length !== item.gateResults.cs.violations.length || enViolations.length !== item.gateResults.en.violations.length) return null;
  const payloads = publicFeaturePair(item);
  const contentHash = `sha256:${createHash("sha256").update(JSON.stringify(payloads)).digest("hex").slice(0, 12)}`;
  return { recommendationId: item.recommendationId, cycleId: item.cycleId, status: item.status, createdAt: item.createdAt, updatedAt: item.updatedAt, dossierId, storyId: label(item.evidence.storyRef) ?? "unknown", claimRefs: item.evidence.claimRefs, payloads, gates: { cs: { passed: item.gateResults.cs.passed, violations: csViolations }, en: { passed: item.gateResults.en.passed, violations: enViolations } }, designLabStatus: item.designLab.status, postedUrls: item.owner.postedUrls, resultCounts: { cs: item.owner.resultRefs.cs.length, en: item.owner.resultRefs.en.length }, results: { cs: [], en: [] }, resultIds: { cs: item.owner.resultRefs.cs.map(label).filter((id): id is string => id !== null), en: item.owner.resultRefs.en.map(label).filter((id): id is string => id !== null) }, contentHash, ratings: [] };
}

function publicResult(entry: OwnerResultEntry): AdminBhOwnerResult {
  return {
    resultId: entry.resultId,
    locale: entry.locale,
    platform: entry.platform,
    postUrl: entry.postUrl,
    capturedAt: entry.capturedAt,
    recordedAt: entry.recordedAt,
    metrics: entry.metrics,
    note: entry.note
  };
}

async function dossierFiles(directory: string): Promise<{ state: BhRecordState; files: string[] }> {
  try {
    const books = (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    const files = books.map((book) => path.join(directory, book, "dossier.json"));
    return { state: files.length ? "present" : "missing", files };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing", files: [] }; throw error; }
}

async function readDossiers(directory: string) {
  const listed = await dossierFiles(directory); const items: AdminBhDossier[] = []; let unreadable = 0;
  for (const file of listed.files) { try { const parsed = parseDossier(JSON.parse(await readFile(file, "utf8"))); if (parsed) items.push(parsed); else unreadable += 1; } catch { unreadable += 1; } }
  return { state: items.length ? "present" as const : unreadable ? "unreadable" as const : listed.state, items, unreadable };
}

async function readLedger(file: string) {
  try {
    const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim()); const items: AdminBhLedgerEntry[] = []; let unreadable = 0;
    for (const line of lines) { try { const parsed = parseLedger(JSON.parse(line)); if (parsed) items.push(parsed); else unreadable += 1; } catch { unreadable += 1; } }
    return { state: items.length ? "present" as const : unreadable ? "unreadable" as const : "missing" as const, items, unreadable };
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "missing" as const, items: [], unreadable: 0 }; throw error; }
}

async function readRatings(file: string): Promise<{ state: BhRecordState; items: RatingRecord[]; unreadable: number }> {
  try {
    const parsed = parseRatingLedger(await readFile(file, "utf8"));
    return parsed ? { state: "present", items: parsed, unreadable: 0 } : { state: "unreadable", items: [], unreadable: 1 };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing", items: [], unreadable: 0 }
      : { state: "unreadable", items: [], unreadable: 1 };
  }
}

export async function readAdminBooksofhistory(
  root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..")
): Promise<AdminBooksofhistorySnapshot> {
  const base = path.join(root, "state/ventures/booksofhistory");
  const [seed, shortlists, briefs, cycle, dossiers, ledger, features, results, ratings] = await Promise.all([
    singleton(path.join(base, "seed/library.json"), parseSeed),
    collection(path.join(base, "shortlists"), parseShortlist),
    collection(path.join(base, "briefs"), parseBrief),
    singleton(path.join(base, "cycle.json"), parseCycle),
    readDossiers(path.join(base, "dossiers")),
    readLedger(path.join(base, "research-ledger.jsonl")),
    collection(path.join(base, "recommendations"), parseFeature),
    collection(path.join(base, "results"), (value) => {
      const result = parseOwnerResultEntry(value);
      return result?.ventureId === "booksofhistory" ? result : null;
    }),
    readRatings(path.join(root, "state/ratings/booksofhistory/ledger.jsonl"))
  ]);
  const latestShortlist = [...shortlists.items].sort((left, right) => right.asOf.localeCompare(left.asOf))[0] ?? null;
  const latestBrief = [...briefs.items].sort((left, right) => right.date.localeCompare(left.date))[0] ?? null;
  const paidDossiers = new Set(ledger.items.filter(({ costUsd }) => costUsd > 0).map(({ dossierId }) => dossierId));
  const usedDossiers = new Set(ledger.items.filter(({ used, dossierId }) => used && paidDossiers.has(dossierId)).map(({ dossierId }) => dossierId));
  const counts = { seed: seed.unreadable, shortlists: shortlists.unreadable, briefs: briefs.unreadable, cycle: cycle.unreadable, dossiers: dossiers.unreadable, ledger: ledger.unreadable, features: features.unreadable, results: results.unreadable, ratings: ratings.unreadable };
  return {
    stores: { seed: seed.state, shortlists: shortlists.state, briefs: briefs.state, cycle: cycle.state, dossiers: dossiers.state, ledger: ledger.state, features: features.state, results: results.state, ratings: ratings.state },
    unreadable: { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) },
    seedBooks: seed.item,
    shortlist: latestShortlist,
    brief: latestBrief,
    cycle: cycle.item,
    dossiers: dossiers.items.sort((left, right) => left.title.localeCompare(right.title)),
    ledger: ledger.items.sort((left, right) => right.completedAt.localeCompare(left.completedAt)),
    researchEfficiency: paidDossiers.size ? usedDossiers.size / paidDossiers.size : null,
    features: features.items
      .map(({ resultIds, ...feature }) => ({
        ...feature,
        results: {
          cs: results.items.filter((result) => result.recommendationId === feature.recommendationId && result.locale === "cs" && result.postUrl === feature.postedUrls.cs && resultIds.cs.includes(result.resultId)).map(publicResult).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt)),
          en: results.items.filter((result) => result.recommendationId === feature.recommendationId && result.locale === "en" && result.postUrl === feature.postedUrls.en && resultIds.en.includes(result.resultId)).map(publicResult).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt))
        },
        ratings: ratings.items.filter((rating) => rating.objectKind === "social-variant" && rating.objectRef.id === feature.recommendationId).sort((left, right) => right.ratedAt.localeCompare(left.ratedAt))
      }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  };
}
