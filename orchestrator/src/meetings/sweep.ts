import type { VentureRegistry } from "../contracts/venture-registry.js";
import { CRON_LEAD_HOURS, resolveScheduledClock } from "../ventures/registry.js";
import { CRON_DELIVERY_WINDOW_HOURS, pragueClockParts } from "./clock.js";
import { findSlotRecord } from "./slot-record.js";
import type { ScheduledPhase } from "../types.js";

/**
 * Eighteen GitHub crons and eighteen Vercel dispatches were firing for the same eleven slots.
 * Measured over 5-6 August the two paths are not equals: a Vercel dispatch arrives on the slot's
 * own hour and averages 5.8 billable minutes of real work, while a GitHub cron arrives hours late
 * and averages 0.9 minutes of guard-exit — it is the backup, and it was being billed like a
 * primary. Three sweeps a day, evenly spread, are enough for a backup: each one looks for a slot
 * today that has no record and can still be opened, and opens the oldest. The hours themselves
 * live in ventures/registry.ts, beside the rest of the cron arithmetic.
 */
export interface SweepOutcome {
  /** The slot to rescue, or null when every slot today is accounted for. */
  phase: ScheduledPhase | null;
  reason: string;
}

/**
 * The one slot a backstop sweep should open, if any.
 *
 * Rescue, never a second opinion. A slot is a candidate only when its Prague hour has passed, it
 * has no committed record, and a run starting now would still be inside the window in which a
 * firing can name it — the same window `resolveCronDelivery` enforces for a late cron, so a sweep
 * can never open a room the punctual path would have refused as too late. The oldest candidate
 * wins, because the day is meant to run in order and a later slot's packet may read an earlier
 * slot's record.
 */
export async function resolveBackstopSweep(input: {
  registry: VentureRegistry;
  stateRoot: string;
  now: Date;
}): Promise<SweepOutcome> {
  const local = pragueClockParts(input.now);
  const openable = resolveScheduledClock(input.registry)
    .filter((slot) => slot.hour <= local.hour)
    .filter((slot) => local.hour - slot.hour <= CRON_DELIVERY_WINDOW_HOURS - CRON_LEAD_HOURS)
    .sort((left, right) => left.hour - right.hour);
  for (const slot of openable) {
    if (await findSlotRecord(input.stateRoot, slot.phase, input.now)) continue;
    return {
      phase: slot.phase,
      reason: `The ${String(slot.hour).padStart(2, "0")}:00 slot has no record and can still be opened.`
    };
  }
  return {
    phase: null,
    reason: openable.length === 0
      ? "No slot today has passed its hour yet."
      : "Every slot that could still be opened today already has a record."
  };
}
