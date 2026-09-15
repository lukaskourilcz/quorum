import path from "node:path";
import { readJson } from "../state.js";
import { stateRoot } from "../paths.js";
import type { ImageProgramReadiness } from "../images/readiness.js";
import type { RunnablePhase } from "../types.js";
import type { VentureDayStep } from "./venture-day.js";
import { manualEditionOverride } from "./commissions.js";
import { editionQueue } from "../delivery/outbox.js";

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
  /**
   * Set only on a venture day: what each of its rooms did, in the order the day ran them.
   *
   * Deliberately reported rather than written to a state file of its own. Every room already
   * writes its record and, when it does not meet, its reason record — those files are the account
   * of the day, and a second summary beside them would be a second copy of one fact to keep in
   * sync. This exists so the run log and the CLI can print the day without opening five files.
   */
  steps?: readonly VentureDayStep[];
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

/**
 * The record that settles a day's edition, or null while the day is still open.
 *
 * Two records settle it. A delivery receipt saying an edition reached the magazine is the final
 * one. An edition package still waiting in the outbox is the other: written, paid for and queued,
 * with nothing between it and readers but the delivery queue, which ships one package per run,
 * oldest first. Reading the receipt alone made the 09:00 retry write a second edition on 10 and
 * 11 September while each day's 05:00 edition was still waiting its turn behind older packages —
 * two production runs paid for one day, and the loser refused by the magazine as `hash_conflict`
 * and parked for the owner.
 *
 * A queued package the magazine has already refused for a reason a byte-identical retry cannot
 * change does not settle the day: the retry is the regeneration it waits for. A queued no-edition
 * notice does not settle it either, because replacing that notice is what the retry exists for.
 * The manual override still wins, exactly as it does for the delivered receipt.
 */
export async function editionRecordForDay(date: string, root = stateRoot): Promise<string | null> {
  if (await hasDeliveredPublishedEdition(date, root)) return `edition/deliveries/${date}.json`;
  if (manualEditionOverride()) return null;
  const queued = (await editionQueue(root)).find((entry) =>
    entry.date === date && entry.editionStatus === "edition" && entry.state === "pending");
  return queued ? `edition/outbox/${date}-${queued.packageHash}.json` : null;
}
