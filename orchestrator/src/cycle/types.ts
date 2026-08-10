import path from "node:path";
import { readJson } from "../state.js";
import { stateRoot } from "../paths.js";
import type { ImageProgramReadiness } from "../images/readiness.js";
import type { RunnablePhase } from "../types.js";
import { manualEditionOverride } from "./commissions.js";

/**
 * What a cycle is asked for and what it reports, plus the one question both the dispatcher and
 * the DNESKAi rooms have to ask about a day.
 *
 * Extracted so `cycle.ts` and `cycle/caught-up.ts` can share them without importing each other.
 * Moved verbatim.
 */

export interface CycleOptions {
  phase: RunnablePhase;
  dry: boolean;
  explainBudget: boolean;
  explainRouting: boolean;
  now?: Date;
}

export interface CycleResult {
  cycleId: string;
  phase: RunnablePhase;
  dry: boolean;
  status:
    | "dry_complete"
    | "paused"
    | "live_complete"
    | "preflight_complete"
    /** This slot already had a record for today, so nothing was called and nothing was written. */
    | "already_recorded";
  decision:
    | "INSUFFICIENT_EVIDENCE"
    | "NO_ACTION"
    | "NO_EDITION"
    | "EDITION"
    | "ACCEPT"
    | "VETO"
    | "SUPERSEDE"
    | "DEFER"
    | "PLAN"
    | "PAUSED";
  estimatedWorstCaseUsd: number;
  selectedAgents: string[];
  skippedAgents: string[];
  artifacts: string[];
  /**
   * What the image programme could have done on this run.
   *
   * Reported on every dry cycle rather than only on the ones that produce an article, because a
   * dry run is where the owner checks that the environment is what they think it is: which
   * archives are reachable, what the caps are, how much of the day is already spent, and whether
   * the generated rung is awake. A keyless environment and a spent cap used to look the same
   * from outside — both produce a drawn plate and say nothing about why.
   */
  imageProgram?: ImageProgramReadiness;
  /** Set only on "already_recorded": the record that made this firing a no-op. */
  alreadyRecordedAt?: string;
}

/** A completed article is final for its date; a no-edition board status is provisional. */
export async function hasDeliveredPublishedEdition(
  date: string,
  root = stateRoot
): Promise<boolean> {
  if (manualEditionOverride()) return false;
  const receipt = await readJson<{
    status?: unknown;
    editionStatus?: unknown;
    tags?: unknown;
  } | null>(root, `edition/deliveries/${date}.json`, null);
  if (receipt?.status !== "delivered") return false;
  if (receipt.editionStatus === "edition") return true;
  return Array.isArray(receipt.tags) && receipt.tags.length > 0;
}
