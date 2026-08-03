import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type MmaOrg = "ufc" | "oktagon";
export type SourcedValue = string | number | boolean | null | Array<string | number | boolean>;

export interface PublicFighterField {
  value: SourcedValue;
  sourceRefs: string[];
  retrievedAt: string;
  status: "verified" | "provisional" | "disputed";
  corroborated: boolean;
}

export interface PublicFighter {
  id: string;
  slug: string;
  org: MmaOrg;
  fields: Record<string, PublicFighterField>;
  criticalFields: string[];
  discrepancies: Array<{ field: string; status: "open" | "resolved" }>;
  completeness: number;
  corroboration: number;
  modelEligible: boolean;
  modelVersion: string;
  updatedAt: string;
  historyCount: number;
  sourceCount: number;
  gaps: string[];
  evidenceTier: "primary" | "secondary" | "tertiary";
}

export interface PublicBout {
  id: string;
  org: MmaOrg;
  eventRef: string;
  eventName: string;
  startsAtUtc: string;
  red: string;
  blue: string;
  division: string | null;
  scheduledRounds: 3 | 5 | null;
  status: "proposed" | "announced" | "confirmed" | "weigh-in" | "completed" | "cancelled" | "postponed";
  sourceRefs: string[];
  updatedAt: string;
}

export interface PublicEvent {
  id: string;
  org: MmaOrg;
  name: string;
  venue: string;
  startsAtLocal: string;
  timeZone: string;
  startsAtUtc: string;
  sourceRefs: string[];
  bouts: Array<{ id: string; red: string; blue: string; division: string; scheduledRounds: 3 | 5; status: "announced" | "weigh-in" | "complete" | "cancelled" }>;
  updatedAt: string;
}

export interface PublicFightPrediction {
  boutRef: string;
  redWin: number;
  uncertainty: "clear-lean" | "lean" | "coin-flip" | "divergence";
  modelVersion: string;
  createdAt: string;
}

export interface PublicTrackRecord {
  picks: Array<{ id: string; org: MmaOrg; predicted: number; closing: number | null; result: "win" | "loss" | "void" | "pending"; clv: number | null; brierContribution: number | null }>;
  rollups: Array<{ modelVersion: string; org: MmaOrg; picks: number; brier: number | null; meanClv: number | null }>;
  updatedAt: string;
}

export interface PublicFightStatsEntry {
  id: string;
  boutRef: string;
  eventRef: string;
  fighterRefs: [string, string];
  modelVersion: string;
  redWin: number;
  blueWin: number;
  uncertainty: PublicFightPrediction["uncertainty"];
  calibrationLabel: "early-model";
  marketUsed: boolean;
  status: "active" | "scored" | "void";
  outcome: "red" | "blue" | "draw" | "no-contest" | null;
  brierContribution: number | null;
  sourceRefs: string[];
  generatedAt: string;
  scoredAt: string | null;
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
const orgs = new Set<MmaOrg>(["ufc", "oktagon"]);
const safeText = (value: unknown, maximum = 500): string | null => typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value.trim() : null;
const safeDate = (value: unknown): string | null => {
  const text = safeText(value, 80);
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null;
};
const safeFraction = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
const object = (value: unknown): Record<string, unknown> | null => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

function sourcedValue(value: unknown): SourcedValue | null | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (Array.isArray(value) && value.every((entry) => typeof entry === "string" || typeof entry === "boolean" || (typeof entry === "number" && Number.isFinite(entry)))) return value as Array<string | number | boolean>;
  return undefined;
}

function parseField(value: unknown): PublicFighterField | null {
  const field = object(value);
  const parsedValue = sourcedValue(field?.value);
  const sourceRefs = Array.isArray(field?.sourceRefs) ? field.sourceRefs.map((ref) => safeText(ref, 240)).filter((ref): ref is string => Boolean(ref)) : [];
  const retrievedAt = safeDate(field?.retrievedAt);
  const status = field?.status === "verified" || field?.status === "provisional" || field?.status === "disputed" ? field.status : null;
  if (parsedValue === undefined || sourceRefs.length === 0 || !retrievedAt || !status || typeof field?.corroborated !== "boolean") return null;
  return { value: parsedValue, sourceRefs, retrievedAt, status, corroborated: field.corroborated };
}

export function parsePublicFighter(value: unknown): PublicFighter | null {
  const record = object(value);
  if (record?.schemaVersion !== "fighter-card/1") return null;
  const id = safeText(record.id, 160);
  const slug = safeText(record.slug, 120);
  const org = orgs.has(record.org as MmaOrg) ? record.org as MmaOrg : null;
  const rawFields = object(record.fields);
  const fields = rawFields ? Object.fromEntries(Object.entries(rawFields).flatMap(([key, item]) => {
    const field = parseField(item);
    return field ? [[key, field]] : [];
  })) : null;
  const criticalFields = Array.isArray(record.criticalFields) ? record.criticalFields.map((item) => safeText(item, 80)).filter((item): item is string => Boolean(item)) : null;
  const rawDiscrepancies = Array.isArray(record.discrepancies) ? record.discrepancies : null;
  const discrepancies: PublicFighter["discrepancies"] | null = rawDiscrepancies?.flatMap((item) => {
    const entry = object(item);
    const field = safeText(entry?.field, 80);
    const status = entry?.status === "open" || entry?.status === "resolved" ? entry.status : null;
    return field && status ? [{ field, status }] : [];
  }) ?? null;
  const completeness = safeFraction(record.completeness);
  const corroboration = safeFraction(record.corroboration);
  const modelVersion = safeText(record.modelVersion, 80);
  const updatedAt = safeDate(record.updatedAt);
  const quality = object(record.quality);
  const gaps = Array.isArray(quality?.gaps) ? quality.gaps.map((item) => safeText(item, 120)).filter((item): item is string => Boolean(item)) : null;
  const evidenceTier = quality?.evidenceTier === "primary" || quality?.evidenceTier === "secondary" || quality?.evidenceTier === "tertiary" ? quality.evidenceTier : null;
  const historyCount = Array.isArray(record.history) ? record.history.length : null;
  const sourceCount = Array.isArray(record.sources) ? record.sources.length : null;
  if (!id || !slug || !org || id !== `${org}:${slug}` || !fields || Object.keys(fields).length !== Object.keys(rawFields ?? {}).length || !criticalFields?.length || !discrepancies || discrepancies.length !== rawDiscrepancies?.length || completeness === null || corroboration === null || typeof record.modelEligible !== "boolean" || !modelVersion || !updatedAt || !gaps || !evidenceTier || historyCount === null || sourceCount === null) return null;
  return { id, slug, org, fields, criticalFields, discrepancies, completeness, corroboration, modelEligible: record.modelEligible, modelVersion, updatedAt, historyCount, sourceCount, gaps, evidenceTier };
}

export function parsePublicEvent(value: unknown): PublicEvent | null {
  const record = object(value);
  const id = safeText(record?.id, 160);
  const org = orgs.has(record?.org as MmaOrg) ? record?.org as MmaOrg : null;
  const name = safeText(record?.name, 160);
  const venue = safeText(record?.venue, 160);
  const startsAtLocal = safeDate(record?.startsAtLocal);
  const startsAtUtc = safeDate(record?.startsAtUtc);
  const timeZone = safeText(record?.timeZone, 80);
  const sourceRefs = Array.isArray(record?.sourceRefs) ? record.sourceRefs.map((item) => safeText(item, 240)).filter((item): item is string => Boolean(item)) : [];
  const updatedAt = safeDate(record?.updatedAt);
  const rawBouts = Array.isArray(record?.bouts) ? record.bouts : null;
  const bouts: PublicEvent["bouts"] | null = rawBouts?.flatMap((item) => {
    const bout = object(item);
    const boutId = safeText(bout?.id, 160);
    const red = safeText(bout?.red, 160);
    const blue = safeText(bout?.blue, 160);
    const division = safeText(bout?.division, 80);
    const scheduledRounds = bout?.scheduledRounds === 3 || bout?.scheduledRounds === 5 ? bout.scheduledRounds : null;
    const status = ["announced", "weigh-in", "complete", "cancelled"].includes(String(bout?.status)) ? bout?.status as PublicEvent["bouts"][number]["status"] : null;
    return boutId && red && blue && division && scheduledRounds && status ? [{ id: boutId, red, blue, division, scheduledRounds, status }] : [];
  }) ?? null;
  if (record?.schemaVersion !== "event-card/1" || !id || !org || !name || !venue || !startsAtLocal || !startsAtUtc || !timeZone || sourceRefs.length === 0 || !updatedAt || !bouts?.length || bouts.length !== rawBouts?.length) return null;
  return { id, org, name, venue, startsAtLocal, timeZone, startsAtUtc, sourceRefs, bouts, updatedAt };
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map((entry) => entry.isDirectory() ? jsonFiles(path.join(directory, entry.name)) : Promise.resolve(entry.name.endsWith(".json") ? [path.join(directory, entry.name)] : [])))).flat().sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function getPublicFighters(rootDirectory = repositoryRoot): Promise<{ fighters: PublicFighter[]; unreadable: string[] }> {
  const root = path.join(rootDirectory, "state", "mma", "fighters");
  const fighters: PublicFighter[] = [];
  const unreadable: string[] = [];
  for (const file of await jsonFiles(root)) {
    try {
      const parsed = parsePublicFighter(JSON.parse(await readFile(file, "utf8")));
      if (parsed) fighters.push(parsed); else unreadable.push(path.relative(root, file));
    } catch { unreadable.push(path.relative(root, file)); }
  }
  return { fighters: fighters.sort((left, right) => left.org.localeCompare(right.org) || fighterName(left).localeCompare(fighterName(right))), unreadable };
}

export async function getPublicEvents(rootDirectory = repositoryRoot): Promise<{ events: PublicEvent[]; unreadable: string[] }> {
  const root = path.join(rootDirectory, "state", "mma", "events");
  const events: PublicEvent[] = [];
  const unreadable: string[] = [];
  for (const file of await jsonFiles(root)) {
    try {
      const parsed = parsePublicEvent(JSON.parse(await readFile(file, "utf8")));
      if (parsed) events.push(parsed); else unreadable.push(path.relative(root, file));
    } catch { unreadable.push(path.relative(root, file)); }
  }
  return { events: events.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc)), unreadable };
}

export function parsePublicBout(value: unknown): PublicBout | null {
  const record = object(value);
  const event = object(record?.event);
  const fighters = object(record?.fighters);
  const id = safeText(record?.id, 180);
  const org = orgs.has(record?.org as MmaOrg) ? record?.org as MmaOrg : null;
  const eventRef = safeText(event?.ref, 180);
  const eventName = safeText(event?.name, 160);
  const startsAtUtc = safeDate(event?.startsAtUtc);
  const red = safeText(fighters?.red, 160);
  const blue = safeText(fighters?.blue, 160);
  const division = record?.division === null ? null : safeText(record?.division, 80);
  const scheduledRounds = record?.scheduledRounds === null ? null : record?.scheduledRounds === 3 || record?.scheduledRounds === 5 ? record.scheduledRounds : undefined;
  const statuses = new Set<PublicBout["status"]>(["proposed", "announced", "confirmed", "weigh-in", "completed", "cancelled", "postponed"]);
  const status = statuses.has(record?.status as PublicBout["status"]) ? record?.status as PublicBout["status"] : null;
  const sourceRefs = Array.isArray(record?.sourceRefs) ? record.sourceRefs.map((item) => safeText(item, 240)).filter((item): item is string => Boolean(item)) : [];
  const updatedAt = safeDate(record?.updatedAt);
  if (record?.schemaVersion !== "bout/1" || !id || !org || !eventRef || !eventName || !startsAtUtc || !red || !blue || division === undefined || scheduledRounds === undefined || !status || sourceRefs.length === 0 || !updatedAt) return null;
  return { id, org, eventRef, eventName, startsAtUtc, red, blue, division, scheduledRounds, status, sourceRefs, updatedAt };
}

export async function getPublicBouts(rootDirectory = repositoryRoot): Promise<{ bouts: PublicBout[]; unreadable: string[] }> {
  const root = path.join(rootDirectory, "state", "mma", "bouts");
  const bouts: PublicBout[] = [];
  const unreadable: string[] = [];
  for (const file of await jsonFiles(root)) {
    try {
      const parsed = parsePublicBout(JSON.parse(await readFile(file, "utf8")));
      if (parsed) bouts.push(parsed); else unreadable.push(path.relative(root, file));
    } catch { unreadable.push(path.relative(root, file)); }
  }
  return { bouts: bouts.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc) || left.id.localeCompare(right.id)), unreadable };
}

export function parsePublicModelRun(value: unknown): PublicFightPrediction[] | null {
  const run = object(value);
  const modelVersion = safeText(run?.modelVersion, 80);
  const createdAt = safeDate(run?.createdAt);
  if (run?.schemaVersion !== "model-run/1" || !modelVersion || !createdAt || !Array.isArray(run.bouts)) return null;
  const output = run.bouts.flatMap((value) => {
    const bout = object(value);
    const probabilities = object(bout?.probabilities);
    const boutRef = safeText(bout?.boutRef, 160);
    const redWin = safeFraction(probabilities?.blendedRedWin);
    const uncertainty: PublicFightPrediction["uncertainty"] | null = probabilities?.uncertainty === "clear-lean" || probabilities?.uncertainty === "lean" || probabilities?.uncertainty === "coin-flip" || probabilities?.uncertainty === "divergence" ? probabilities.uncertainty : null;
    return boutRef && redWin !== null && uncertainty ? [{ boutRef, redWin, uncertainty, modelVersion, createdAt }] : [];
  });
  return output.length === run.bouts.length ? output : null;
}

export async function getPublicPredictions(rootDirectory = repositoryRoot): Promise<PublicFightPrediction[]> {
  const root = path.join(rootDirectory, "state", "mma", "model-runs");
  const latest = new Map<string, PublicFightPrediction>();
  for (const file of await jsonFiles(root)) {
    try {
      for (const prediction of parsePublicModelRun(JSON.parse(await readFile(file, "utf8"))) ?? []) {
        const current = latest.get(prediction.boutRef);
        if (!current || current.createdAt < prediction.createdAt) latest.set(prediction.boutRef, prediction);
      }
    } catch {
      // A malformed model run is omitted from the public projection.
    }
  }
  return [...latest.values()].sort((left, right) => left.boutRef.localeCompare(right.boutRef));
}

export function parsePublicTrackRecord(value: unknown): PublicTrackRecord | null {
  const record = object(value);
  const updatedAt = safeDate(record?.updatedAt);
  if (record?.schemaVersion !== "track-record/1" || !updatedAt || !Array.isArray(record.picks) || !Array.isArray(record.rollups)) return null;
  const picks = record.picks.flatMap((value) => {
    const pick = object(value);
    const id = safeText(pick?.id, 160);
    const org = orgs.has(pick?.org as MmaOrg) ? pick?.org as MmaOrg : null;
    const predicted = safeFraction(pick?.predicted);
    const closing = pick?.closing === null ? null : safeFraction(pick?.closing) ?? undefined;
    const clv = pick?.clv === null ? null : typeof pick?.clv === "number" && Number.isFinite(pick.clv) ? pick.clv : undefined;
    const brier = pick?.brierContribution === null ? null : safeFraction(pick?.brierContribution) ?? undefined;
    const result: PublicTrackRecord["picks"][number]["result"] | null =
      pick?.result === "win" || pick?.result === "loss" || pick?.result === "void" || pick?.result === "pending"
        ? pick.result
        : null;
    return id && org && predicted !== null && closing !== undefined && clv !== undefined && brier !== undefined && result ? [{ id, org, predicted, closing, result, clv, brierContribution: brier }] : [];
  });
  const rollups = record.rollups.flatMap((value) => {
    const rollup = object(value);
    const modelVersion = safeText(rollup?.modelVersion, 80);
    const org = orgs.has(rollup?.org as MmaOrg) ? rollup?.org as MmaOrg : null;
    const picks = typeof rollup?.picks === "number" && Number.isInteger(rollup.picks) && rollup.picks >= 0 ? rollup.picks : null;
    const brier = rollup?.brier === null ? null : safeFraction(rollup?.brier) ?? undefined;
    const meanClv = rollup?.meanClv === null ? null : typeof rollup?.meanClv === "number" && Number.isFinite(rollup.meanClv) ? rollup.meanClv : undefined;
    return modelVersion && org && picks !== null && brier !== undefined && meanClv !== undefined ? [{ modelVersion, org, picks, brier, meanClv }] : [];
  });
  return picks.length === record.picks.length && rollups.length === record.rollups.length ? { picks, rollups, updatedAt } : null;
}

export async function getPublicTrackRecord(rootDirectory = repositoryRoot): Promise<PublicTrackRecord | null> {
  try {
    return parsePublicTrackRecord(JSON.parse(await readFile(path.join(rootDirectory, "state", "mma", "track-record.json"), "utf8")));
  } catch {
    return null;
  }
}

export function parsePublicFightStatsEntry(value: unknown): PublicFightStatsEntry | null {
  const entry = object(value);
  const id = safeText(entry?.id, 160);
  const boutRef = safeText(entry?.boutRef, 180);
  const eventRef = safeText(entry?.eventRef, 180);
  const fighterRefs = Array.isArray(entry?.fighterRefs) && entry.fighterRefs.length === 2
    ? entry.fighterRefs.map((item) => safeText(item, 160))
    : null;
  const modelVersion = safeText(entry?.modelVersion, 100);
  const redWin = safeFraction(entry?.redWin);
  const blueWin = safeFraction(entry?.blueWin);
  const uncertainty = entry?.uncertainty === "clear-lean" || entry?.uncertainty === "lean" || entry?.uncertainty === "coin-flip" || entry?.uncertainty === "divergence" ? entry.uncertainty : null;
  const status = entry?.status === "active" || entry?.status === "scored" || entry?.status === "void" ? entry.status : null;
  const outcome = entry?.outcome === null || entry?.outcome === "red" || entry?.outcome === "blue" || entry?.outcome === "draw" || entry?.outcome === "no-contest" ? entry.outcome : undefined;
  const brierContribution = entry?.brierContribution === null ? null : safeFraction(entry?.brierContribution);
  const sourceRefs = Array.isArray(entry?.sourceRefs) ? entry.sourceRefs.map((item) => safeText(item, 240)) : null;
  const generatedAt = safeDate(entry?.generatedAt);
  const scoredAt = entry?.scoredAt === null ? null : safeDate(entry?.scoredAt);
  const invalidScoring = status === "active"
    ? outcome !== null || brierContribution !== null || scoredAt !== null
    : status === "scored"
      ? (outcome !== "red" && outcome !== "blue") || brierContribution === null || scoredAt === null
      : brierContribution !== null;
  if (entry?.schemaVersion !== "fightaiq-stats/1" || !id || !boutRef || !eventRef || !fighterRefs?.[0] || !fighterRefs[1] || !modelVersion || redWin === null || blueWin === null || Math.abs(redWin + blueWin - 1) > 0.000001 || !uncertainty || entry?.calibrationLabel !== "early-model" || typeof entry?.marketUsed !== "boolean" || !status || outcome === undefined || brierContribution === undefined || !sourceRefs?.length || sourceRefs.some((item) => !item) || !generatedAt || scoredAt === undefined || invalidScoring) return null;
  return { id, boutRef, eventRef, fighterRefs: [fighterRefs[0], fighterRefs[1]], modelVersion, redWin, blueWin, uncertainty, calibrationLabel: "early-model", marketUsed: entry.marketUsed, status, outcome, brierContribution, sourceRefs: sourceRefs as string[], generatedAt, scoredAt };
}

export async function getPublicFightStatsEntries(rootDirectory = repositoryRoot): Promise<PublicFightStatsEntry[]> {
  const root = path.join(rootDirectory, "state", "mma", "stats");
  const latest = new Map<string, PublicFightStatsEntry>();
  for (const file of await jsonFiles(root)) {
    try {
      const entry = parsePublicFightStatsEntry(JSON.parse(await readFile(file, "utf8")));
      if (!entry) continue;
      const current = latest.get(entry.boutRef);
      if (!current || current.generatedAt < entry.generatedAt) latest.set(entry.boutRef, entry);
    } catch {
      // A malformed private record does not reach the public Stats page.
    }
  }
  return [...latest.values()].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
}

export function fighterName(fighter: PublicFighter): string {
  return typeof fighter.fields.name?.value === "string" ? fighter.fields.name.value : fighter.slug.replaceAll("-", " ");
}

/**
 * The link goes to /cs because that is the only locale MMA Files publishes: the desk makes one
 * `writeCzech` call and stores `localizations: { cs }` (orchestrator/src/mma-files/pipeline.ts).
 * It built /en until now. The only caller today is `FighterLink`, which is rendered from the
 * admin panel, but this module also feeds the public /metrics page, so it is held to the public
 * rule rather than the admin exception. `czech-only-publishing.test.ts` now walks `src/lib` and
 * fails on the next /en link that appears here.
 *
 * The pattern is anchored and admits only lowercase slug characters, so no `ref` can steer the
 * path outside `/cs/fighters/<org>/<slug>`; anything else returns null and `FighterLink` renders
 * plain text instead of a link.
 */
export function fighterHref(ref: string): string | null {
  const match = /^(ufc|oktagon):([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(ref);
  return match ? `https://mma-files.vercel.app/cs/fighters/${match[1]}/${match[2]}` : null;
}

export async function getFightAiQMode(rootDirectory = repositoryRoot): Promise<"data-only" | "live-analysis"> {
  const registry = JSON.parse(await readFile(path.join(rootDirectory, "config", "ventures.json"), "utf8")) as { ventures?: Array<{ id?: string; mode?: string }> };
  const mode = registry.ventures?.find((venture) => venture.id === "fightaiq")?.mode;
  return mode === "live-analysis" ? mode : "data-only";
}
