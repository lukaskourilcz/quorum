import type { RunnablePhase } from "../types.js";
import type { CycleOptions, CycleResult } from "./types.js";

/**
 * A venture's whole day as one meeting, run as the sequence of rooms it always was.
 *
 * The owner's 2026-08-29 instruction: one calendar slot per venture per day, and everything that
 * venture does happens inside it. The clock is what consolidates — never the rooms. Each step
 * below is the existing phase, run through the existing `runCycle`, so it keeps its own meeting
 * record, budget reservation, receipts, gates, prompts and tests. Six records still describe the
 * MMA day; only the six dispatches become one.
 *
 * Three mechanics fall out of that choice rather than being built, and each replaces something
 * this module would otherwise have had to get right:
 *
 * - **Idempotency.** `slotRecordPath` points at the room's own record, so a re-fired day finds
 *   each completed room's file and skips it (`already_recorded`, $0, nothing written). A day that
 *   died halfway resumes exactly where it stopped.
 * - **The edition retry.** `runCycle` bypasses that guard for `cu-edition` at `EDITION_RETRY_HOUR`
 *   and `hasDeliveredPublishedEdition` short-circuits a day already delivered. Firing `cu-day` at
 *   the retry hour therefore re-runs only the undelivered edition, and the product room's record
 *   makes it a no-op. Passing every step the day's own `now` is what keeps that true.
 * - **A spent cap.** Every room reserves before it calls (`docs/ENGINEERING.md` rule 5), so a room
 *   that cannot afford to meet throws at its reservation, costs nothing, and writes the standard
 *   budget-stop record. The obvious alternative — short-circuiting the rest of the day on the
 *   first refusal — would have been cheaper by nothing and would have skipped exactly the reason
 *   records rule 6 exists to demand. So the day runs every step and lets each account for itself.
 *
 * The one thing this module does own is the file lock. `withFileLock` is not re-entrant, so the
 * day must not hold `.lock` across its steps; each step takes and releases it exactly as it does
 * when dispatched alone. What serialises whole runs is the workflow's concurrency group, which is
 * where it was before.
 */

export interface VentureDayDefinition {
  /** The venture whose pause switch silences this day, and whose registry slot names its hour. */
  venture: string;
  /** The rooms, in the order the day works through them. */
  steps: readonly RunnablePhase[];
}

/**
 * The days, and the rooms each one runs.
 *
 * Order is the working order, which is also the order the separate hours used to run in: a data
 * check before the desk that reads it, the editorial meeting before the article it commissions,
 * the evening review last. `article-pm` is deliberately absent — the registry has promised one
 * article a day since the evening slot was killed, and a day must not run a room its venture does
 * not schedule. It stays individually runnable, like every retired phase.
 */
export const VENTURE_DAYS = {
  "cu-day": {
    venture: "caught-up",
    steps: ["cu-edition", "cu-product"]
  },
  "mma-day": {
    venture: "mma-files",
    steps: ["mma-intake", "mag-editorial", "article-am", "mma-analysis", "mag-desk"]
  },
  "dm-day": {
    venture: "door-money",
    steps: ["dm-desk", "dm-growth"]
  }
} as const satisfies Readonly<Record<string, VentureDayDefinition>>;

export type VentureDayPhase = keyof typeof VENTURE_DAYS;

export const VENTURE_DAY_PHASES = Object.keys(VENTURE_DAYS) as readonly VentureDayPhase[];

export function isVentureDayPhase(phase: string): phase is VentureDayPhase {
  return Object.hasOwn(VENTURE_DAYS, phase);
}

/** One room's outcome inside a day, as the run log and the CLI report it. */
export interface VentureDayStep {
  phase: RunnablePhase;
  /** `failed` is this module's own: the room threw and the day carried on past it. */
  status: CycleResult["status"] | "failed";
  decision: CycleResult["decision"] | null;
  estimatedWorstCaseUsd: number;
  /** Why, when the outcome needs one: the record that made it a no-op, or the error. */
  note: string | null;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/**
 * What the day says it did, from what its rooms did.
 *
 * A day is only `already_recorded` when every room was — a partially resumed day did work and has
 * to report that it did. `PAUSED` likewise means the whole day was refused, not that one room was.
 */
function summarise(steps: readonly VentureDayStep[], dry: boolean): Pick<CycleResult, "status" | "decision"> {
  if (steps.length > 0 && steps.every((step) => step.status === "already_recorded")) {
    return { status: "already_recorded", decision: "NO_ACTION" };
  }
  if (steps.length > 0 && steps.every((step) => step.status === "paused")) {
    return { status: "paused", decision: "PAUSED" };
  }
  // The first room that actually decided something is the day's headline; a day of no-ops says so.
  const decided = steps.find((step) =>
    step.decision !== null && step.decision !== "NO_ACTION" && step.decision !== "PAUSED");
  return {
    status: dry ? "dry_complete" : "live_complete",
    decision: decided?.decision ?? "NO_ACTION"
  };
}

/**
 * Run one venture's day.
 *
 * `runStep` is passed in rather than imported so this module stays a leaf: `cycle.ts` dispatches
 * to the day and the day calls back into `cycle.ts`, which as an import would be a ring around
 * two modules that both initialise arrays at load time.
 *
 * A room that throws is recorded and the day continues, because the rooms behind it do not depend
 * on it having succeeded — they already tolerate an upstream that never ran, which is what being
 * six separate dispatches has always required of them. The failures travel back on the result so
 * the caller can commit the work that did land before it fails the run; swallowing them here and
 * reporting a clean day is the one thing this must never do.
 */
export async function runVentureDay(
  phase: VentureDayPhase,
  options: CycleOptions,
  runStep: (options: CycleOptions) => Promise<CycleResult>
): Promise<CycleResult> {
  const now = options.now ?? new Date();
  const cycleId = `${now.toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14)}-${phase}`;
  const steps: VentureDayStep[] = [];
  const artifacts: string[] = [];
  const selected: string[] = [];
  const skipped: string[] = [];
  let estimatedWorstCaseUsd = 0;

  for (const step of VENTURE_DAYS[phase].steps) {
    try {
      // The day's own `now`, not the room's old hour: it is what makes the retry hour reach
      // `cu-edition` and what keeps a Thursday a Thursday for the growth room.
      const result = await runStep({ ...options, phase: step, now });
      steps.push({
        phase: step,
        status: result.status,
        decision: result.decision,
        estimatedWorstCaseUsd: result.estimatedWorstCaseUsd,
        note: result.alreadyRecordedAt ?? null
      });
      artifacts.push(...result.artifacts);
      selected.push(...result.selectedAgents);
      skipped.push(...result.skippedAgents);
      estimatedWorstCaseUsd += result.estimatedWorstCaseUsd;
    } catch (error) {
      steps.push({
        phase: step,
        status: "failed",
        decision: null,
        estimatedWorstCaseUsd: 0,
        note: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300)
      });
    }
  }

  const selectedAgents = unique(selected);
  return {
    cycleId,
    phase,
    dry: options.dry,
    ...summarise(steps, options.dry),
    estimatedWorstCaseUsd,
    selectedAgents,
    // A room that stood one seat down while another seated it did not skip the day.
    skippedAgents: unique(skipped).filter((agent) => !selectedAgents.includes(agent)),
    artifacts,
    steps
  };
}
