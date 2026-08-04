import { stat } from "node:fs/promises";
import path from "node:path";
import { pragueClockParts } from "./clock.js";
import type { ScheduledPhase } from "../types.js";

/**
 * The one file that proves a slot already happened on a given Prague day.
 *
 * Three shapes, because the three kinds of slot record themselves in three places and always
 * have: the portfolio board writes a standup, the ten venture rooms write a meeting record, and
 * the two MMA Files article slots write a run file — MeetingRecord has no article kind, so an
 * article slot cannot be filed as one. All three are keyed by the Prague date and the slot, which
 * is what makes "has this slot already run today" a single stat rather than a directory scan.
 *
 * Deliberately not the skip records under `meetings/skips/`. A skip means a gate decided the room
 * would not open and nothing was paid for; a later firing that finds the gate open should still
 * be allowed to hold the meeting. Only a record of the slot actually happening stops a second run.
 */
export function slotRecordPath(phase: ScheduledPhase, date: string): string {
  if (phase === "morning" || phase === "afternoon" || phase === "night") {
    return `standups/${date}-${phase}.json`;
  }
  if (phase === "article-am") return `ventures/mma-files/runs/${date}-am.json`;
  if (phase === "article-pm") return `ventures/mma-files/runs/${date}-pm.json`;
  return `meetings/${date}-${phase}.json`;
}

/**
 * The record this slot already has for the Prague day containing `at`, or null.
 *
 * This is the whole of the double-fire guard's knowledge, and its limits are worth stating
 * plainly. It sees committed state, so it can only answer for a run that has finished and
 * pushed. It cannot see a run that is in flight — no file exists yet — which is why the guard
 * that calls it has to sit behind something that serialises runs rather than in front of it.
 */
export async function findSlotRecord(
  root: string,
  phase: ScheduledPhase,
  at: Date
): Promise<string | null> {
  const relative = slotRecordPath(phase, pragueClockParts(at).date);
  try {
    const entry = await stat(path.join(root, relative));
    return entry.isFile() ? relative : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
