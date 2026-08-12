import { TehdejsiCycleSchema, type TehdejsiCycle } from "../../contracts/tehdejsi-cycle.js";
import { atomicWriteJson, readJson } from "../../state.js";

export const TEHDEJSI_CYCLE_PATH = "ventures/tehdejsi-svet/cycle.json";

function nextDate(date: string): string {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export function createTehdejsiCycle(input: { date: string; now: Date }): TehdejsiCycle {
  return TehdejsiCycleSchema.parse({
    schemaVersion: "tehdejsi-cycle/1",
    startedOn: input.date,
    phase: "planning",
    dayStatuses: { planning: "active", production: "pending" },
    chosenFactIds: [],
    shortlistRef: null,
    stretch: null,
    updatedAt: input.now.toISOString()
  });
}

export type TehdejsiDayOutcome =
  | { completed: true; chosenFactIds?: readonly string[]; shortlistRef?: string }
  | { completed: false; pressure: "budget-pressure" | "review-required" | "no-candidate" };

/**
 * Advance the cycle by one sitting, or record honestly that it did not advance.
 *
 * A day that could not finish stays active and counts a stretch. It is the difference between
 * "we are still on the planning day and here is why" and a skipped day, which would let the
 * production sitting run against a plan that was never made.
 *
 * A completed production day ends the cycle; the caller starts the next one. That keeps the
 * cycle a record of one feature rather than a rolling counter nobody can date.
 */
export function applyTehdejsiCycleDay(input: {
  cycle: TehdejsiCycle;
  date: string;
  now: Date;
  outcome: TehdejsiDayOutcome;
}): TehdejsiCycle {
  const { cycle, outcome } = input;
  if (!outcome.completed) {
    return TehdejsiCycleSchema.parse({
      ...cycle,
      stretch: {
        count: (cycle.stretch?.count ?? 0) + 1,
        reason: outcome.pressure,
        nextAttemptOn: nextDate(input.date)
      },
      updatedAt: input.now.toISOString()
    });
  }
  if (cycle.phase === "planning") {
    const chosen = [...(outcome.chosenFactIds ?? [])];
    if (chosen.length === 0) {
      // Nothing cleared the bar. That is a quiet day, not a completed plan: the cycle holds its
      // planning phase rather than promoting an empty selection into production.
      return TehdejsiCycleSchema.parse({
        ...cycle,
        shortlistRef: outcome.shortlistRef ?? cycle.shortlistRef,
        stretch: {
          count: (cycle.stretch?.count ?? 0) + 1,
          reason: "no-candidate",
          nextAttemptOn: nextDate(input.date)
        },
        updatedAt: input.now.toISOString()
      });
    }
    return TehdejsiCycleSchema.parse({
      ...cycle,
      phase: "production",
      dayStatuses: { planning: "completed", production: "active" },
      chosenFactIds: chosen,
      shortlistRef: outcome.shortlistRef ?? cycle.shortlistRef,
      stretch: null,
      updatedAt: input.now.toISOString()
    });
  }
  return TehdejsiCycleSchema.parse({
    ...cycle,
    dayStatuses: { planning: "completed", production: "completed" },
    stretch: null,
    updatedAt: input.now.toISOString()
  });
}

export function tehdejsiCycleComplete(cycle: TehdejsiCycle | null): boolean {
  return cycle?.dayStatuses.production === "completed";
}

export async function readTehdejsiCycle(root: string): Promise<TehdejsiCycle | null> {
  const raw = await readJson<unknown | null>(root, TEHDEJSI_CYCLE_PATH, null);
  if (raw === null) return null;
  const parsed = TehdejsiCycleSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function writeTehdejsiCycle(root: string, cycle: TehdejsiCycle): Promise<string> {
  await atomicWriteJson(root, TEHDEJSI_CYCLE_PATH, cycle);
  return TEHDEJSI_CYCLE_PATH;
}
