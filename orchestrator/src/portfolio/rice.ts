import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PortfolioRiceInputSchema,
  PortfolioRiceRankingSchema,
  type PortfolioRiceInput,
  type PortfolioRiceRanking,
  type RiceMissingInput,
  type RicePosture,
  type RiceRow,
  type RiceSubjectInput
} from "../contracts/portfolio-rice.js";
import type { VentureRegistry } from "../contracts/venture-registry.js";
import { ScheduledPhaseSchema } from "../types.js";
import { atomicWriteJson } from "../state.js";
import { ventureIdForPhase } from "../ventures/registry.js";
import { ROOM_DEGRADATION_ORDER, signedOwnerDecision, weekdayRoomIsDue } from "./schedule.js";

/**
 * The portfolio RICE scorer. It records a ranking; it decides nothing.
 *
 * Effort is the one factor this repository can measure honestly: every room declares an
 * `envelopeUsd` in `config/ventures.json` and the schedule already enforces those figures, so a
 * venture's monthly effort is its declared worst case and not an estimate. Confidence is the
 * share of a venture's quarterly KPIs that carry a real measurement. Reach and Impact are the
 * owner's, and stay `null` until the owner types them.
 */

/** Thirty days, matching the monthly framing of the `$50` all-in cap and the `$25` model share. */
const DAYS_PER_MONTH = 30;

/**
 * A fixed Monday-to-Sunday week, used only to ask `weekdayRoomIsDue` how often a room is due.
 *
 * A literal week rather than `now`: a scorer whose answer depends on the day it ran would make
 * GoVIRAL's monthly effort change every Monday, and the recorded ranking is compared against the
 * file on disk by `--check`.
 */
const CANONICAL_WEEK = [
  "2026-01-05",
  "2026-01-06",
  "2026-01-07",
  "2026-01-08",
  "2026-01-09",
  "2026-01-10",
  "2026-01-11"
] as const;

function round8(value: number): number {
  return Number(value.toFixed(8));
}

/** How many times a room actually costs its envelope in a thirty-day month. */
export function roomRunsPerMonth(phase: string): number {
  const parsed = ScheduledPhaseSchema.safeParse(phase);
  if (!parsed.success) return DAYS_PER_MONTH;
  const dueDays = CANONICAL_WEEK.filter((date) => weekdayRoomIsDue(parsed.data, date)).length;
  return round8((dueDays / CANONICAL_WEEK.length) * DAYS_PER_MONTH);
}

/** `2x-daily@10:00,18:00` bills twice a day; `daily@10:00` bills once. */
export function productionRunsPerMonth(cadence: string): number {
  return (cadence.startsWith("2x-daily@") ? 2 : 1) * DAYS_PER_MONTH;
}

export interface RiceEffort {
  usdPerMonth: number;
  basis: Array<{ phase: string; envelopeUsd: number; runsPerMonth: number }>;
}

/**
 * A venture's declared worst-case monthly room spend.
 *
 * Read from the registry, never extrapolated into a desk allowance: a venture's daily pipeline can
 * spend outside the envelopes its rooms declare, so this is the cost of opening the rooms and is
 * labelled as such wherever it is shown.
 */
export function effortUsdPerMonth(registry: VentureRegistry, ventureId: string): RiceEffort {
  const venture = registry.ventures.find((candidate) => candidate.id === ventureId);
  if (!venture) return { usdPerMonth: 0, basis: [] };
  const basis = [
    ...venture.meetings.map((meeting) => ({
      phase: meeting.kind,
      envelopeUsd: meeting.envelopeUsd,
      runsPerMonth: roomRunsPerMonth(meeting.kind)
    })),
    ...(venture.productionJobs ?? []).map((job) => ({
      phase: job.kind,
      envelopeUsd: job.envelopeUsd,
      runsPerMonth: productionRunsPerMonth(job.cadence)
    }))
  ].sort((left, right) => left.phase.localeCompare(right.phase));
  const usdPerMonth = round8(basis.reduce((sum, item) => sum + (item.envelopeUsd * item.runsPerMonth), 0));
  return { usdPerMonth, basis };
}

export interface KpiStatusRow {
  venture: string;
  status: string;
}

export interface RiceConfidence {
  confidence: number | null;
  measuredKpis: number;
  totalKpis: number;
}

/**
 * How much of what we claim to track about a venture was actually measured.
 *
 * `null`, not `0`, when a venture has no KPI rows at all: a share with no denominator is an
 * absence, and scoring it as zero confidence would rank a venture nobody has targets for below
 * one whose targets were all missed.
 */
export function confidenceFromKpis(statuses: readonly KpiStatusRow[], ventureId: string): RiceConfidence {
  const scoped = statuses.filter((status) => status.venture === ventureId);
  const measuredKpis = scoped.filter((status) => status.status !== "unavailable").length;
  if (scoped.length === 0) return { confidence: null, measuredKpis: 0, totalKpis: 0 };
  return {
    confidence: round8(measuredKpis / scoped.length),
    measuredKpis,
    totalKpis: scoped.length
  };
}

/**
 * Whether the ranking is allowed to decide anything, which needs two independent yeses.
 *
 * The config switch is the owner saying they want it; the countersigned decision record is the
 * owner saying it on paper. Either one alone holds. Nothing in this repository reads the result
 * to gate a room, so today this only labels the artifact — the mechanism exists so that turning
 * it on is a recorded decision rather than a code change nobody signed.
 */
export function resolveRiceEnforcement(input: {
  config: PortfolioRiceInput;
  decisionRaw: string;
}): { enforcement: RicePosture; heldBecause: string[] } {
  const heldBecause: string[] = [];
  if (!input.config.rankingEnforced) heldBecause.push("config/portfolio-rice.json sets rankingEnforced to false");
  if (signedOwnerDecision(input.decisionRaw) !== "countersigned") {
    heldBecause.push(`${input.config.decisionRef} is not countersigned`);
  }
  return heldBecause.length === 0
    ? { enforcement: "owner-enforced", heldBecause }
    : { enforcement: "information-only", heldBecause };
}

/**
 * `ROOM_DEGRADATION_ORDER` collapsed to ventures, lowest priority first, duplicates removed.
 *
 * Resolved through the registry rather than through `PHASE_VENTURES`. That map answers a
 * different question — which ventures the owner's pause switch can stand down — and deliberately
 * omits GoVIRAL because its brief is shared machinery the whole portfolio consumes. Reading it
 * here silently dropped `gv-brief` from the comparison, which would have declared agreement on a
 * list with a room missing from it.
 */
export function declaredVentureOrder(registry: VentureRegistry): string[] {
  const seen: string[] = [];
  for (const phase of ROOM_DEGRADATION_ORDER) {
    const ventureId = ventureIdForPhase(registry, phase);
    if (ventureId !== "global" && !seen.includes(ventureId)) seen.push(ventureId);
  }
  return seen;
}

function scoreRow(input: {
  subject: RiceSubjectInput;
  effort: RiceEffort;
  confidence: RiceConfidence;
}): RiceRow {
  const { subject, effort, confidence } = input;
  // A confidence of 0 is a measurement, not an absence: the venture has KPI rows and none of
  // them carried a number, so RICE ranks it last on a real reading. Only a venture with no rows
  // at all is `null`, and that row goes unscored rather than to the bottom of the list.
  const missingInputs: RiceMissingInput[] = [];
  if (subject.reach === null) missingInputs.push("reach");
  if (subject.impact === null) missingInputs.push("impact");
  if (confidence.confidence === null) missingInputs.push("confidence");
  if (effort.usdPerMonth <= 0) missingInputs.push("effort");
  const score = missingInputs.length === 0
    ? round8((subject.reach! * subject.impact! * confidence.confidence!) / effort.usdPerMonth)
    : null;
  return {
    id: subject.id,
    kind: subject.kind,
    label: subject.label,
    reach: subject.reach,
    impact: subject.impact,
    confidence: confidence.confidence,
    confidenceBasis: { measuredKpis: confidence.measuredKpis, totalKpis: confidence.totalKpis },
    effortUsdPerMonth: effort.usdPerMonth,
    effortBasis: effort.basis,
    score,
    status: score === null ? "unavailable" : "scored",
    missingInputs,
    source: subject.source
  };
}

function compareAgainstDegradationOrder(registry: VentureRegistry, rows: readonly RiceRow[]): {
  declaredVentureOrder: string[];
  agreesWithDeclaredOrder: boolean | null;
  comparison: PortfolioRiceRanking["comparison"];
} {
  const declared = declaredVentureOrder(registry);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const unavailableVentures = declared.filter((id) => byId.get(id)?.status !== "scored");
  const comparableVentures = declared.filter((id) => byId.get(id)?.status === "scored");
  if (unavailableVentures.length > 0) {
    return {
      declaredVentureOrder: declared,
      agreesWithDeclaredOrder: null,
      comparison: { comparableVentures, scoredAscending: [], unavailableVentures }
    };
  }
  const scoredAscending = [...comparableVentures].sort((left, right) => {
    const delta = byId.get(left)!.score! - byId.get(right)!.score!;
    // A tie keeps the declared order, so an equal score never reads as a disagreement.
    return delta !== 0 ? delta : declared.indexOf(left) - declared.indexOf(right);
  });
  return {
    declaredVentureOrder: declared,
    agreesWithDeclaredOrder: scoredAscending.every((id, index) => id === comparableVentures[index]),
    comparison: { comparableVentures, scoredAscending, unavailableVentures }
  };
}

export function scorePortfolio(input: {
  registry: VentureRegistry;
  config: PortfolioRiceInput;
  kpiStatuses: readonly KpiStatusRow[];
  decisionRaw: string;
  quarterId: string;
  now: Date;
}): PortfolioRiceRanking {
  const config = PortfolioRiceInputSchema.parse(input.config);
  const rows = config.subjects
    .map((subject) => scoreRow({
      subject,
      effort: subject.kind === "venture"
        ? effortUsdPerMonth(input.registry, subject.id)
        : { usdPerMonth: 0, basis: [] },
      confidence: confidenceFromKpis(input.kpiStatuses, subject.id)
    }))
    // Scored rows first, highest score first; unavailable rows after them by id. Sorting by id
    // inside each group keeps the file byte-stable when the input file is reordered.
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "scored" ? -1 : 1;
      if (left.status === "scored" && left.score !== right.score) return right.score! - left.score!;
      return left.id.localeCompare(right.id);
    });
  const enforcement = resolveRiceEnforcement({ config, decisionRaw: input.decisionRaw });
  const agreement = compareAgainstDegradationOrder(input.registry, rows);
  return PortfolioRiceRankingSchema.parse({
    schemaVersion: "portfolio-rice-ranking/1",
    quarterId: input.quarterId,
    generatedAt: input.now.toISOString(),
    method: "reach x impact x confidence / effort-usd-per-month",
    posture: config.posture,
    enforcement: enforcement.enforcement,
    enforcementHeldBecause: enforcement.heldBecause,
    rows,
    declaredDegradationOrder: [...ROOM_DEGRADATION_ORDER],
    declaredVentureOrder: agreement.declaredVentureOrder,
    agreesWithDeclaredOrder: agreement.agreesWithDeclaredOrder,
    comparison: agreement.comparison
  });
}

export function riceRankingPath(quarterId: string): string {
  return `kpis/rice/${quarterId}.json`;
}

/**
 * Score the portfolio from the two files on disk, or return `null` and say why.
 *
 * Never throws. A missing or malformed `config/portfolio-rice.json` costs the ranking and
 * nothing else — the quarter-end packet the owner is actually waiting on must not fail because
 * an advisory artifact could not be produced.
 */
export async function buildQuarterlyRiceRanking(input: {
  repoRoot: string;
  registry: VentureRegistry;
  kpiStatuses: readonly KpiStatusRow[];
  quarterId: string;
  now: Date;
}): Promise<{ ranking: PortfolioRiceRanking } | { ranking: null; reason: string }> {
  let config: PortfolioRiceInput;
  try {
    config = PortfolioRiceInputSchema.parse(
      JSON.parse(await readFile(path.join(input.repoRoot, "config", "portfolio-rice.json"), "utf8"))
    );
  } catch (error) {
    return { ranking: null, reason: `config/portfolio-rice.json is unreadable: ${(error as Error).message}` };
  }
  let decisionRaw = "";
  try {
    decisionRaw = await readFile(path.join(input.repoRoot, config.decisionRef), "utf8");
  } catch {
    // An absent decision record is a pending signature, which is already the safer answer.
    decisionRaw = "";
  }
  try {
    return {
      ranking: scorePortfolio({
        registry: input.registry,
        config,
        kpiStatuses: input.kpiStatuses,
        decisionRaw,
        quarterId: input.quarterId,
        now: input.now
      })
    };
  } catch (error) {
    return { ranking: null, reason: `the ranking did not validate: ${(error as Error).message}` };
  }
}

export async function writeQuarterlyRiceRanking(input: {
  repoRoot: string;
  stateRoot: string;
  registry: VentureRegistry;
  kpiStatuses: readonly KpiStatusRow[];
  quarterId: string;
  now: Date;
}): Promise<string | null> {
  const built = await buildQuarterlyRiceRanking(input);
  if (!built.ranking) {
    console.warn(`Portfolio RICE ranking skipped: ${built.reason}`);
    return null;
  }
  const relative = riceRankingPath(input.quarterId);
  await atomicWriteJson(input.stateRoot, relative, built.ranking);
  return relative;
}
