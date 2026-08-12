import { BhCycleSchema, type BhCycle } from "../../contracts/bh-cycle.js";
import { atomicWriteJson, readJson } from "../../state.js";

export const BOOKSOFHISTORY_CYCLE_PATH = "ventures/booksofhistory/cycle.json";

export interface BooksofHistoryPhaseOutcome {
  completed: boolean;
  /** Selection may prove that an already-paid shelf story makes research unnecessary. */
  shelfShortcut?: boolean;
  pressure?: "budget-pressure" | "incomplete-phase";
  candidateSet?: BhCycle["candidateSet"];
  chosenStory?: BhCycle["chosenStory"];
}

function dateFromInstant(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function nextWorkingDate(date: string): string {
  let candidate = addDays(date, 1);
  while ([0, 6].includes(new Date(`${candidate}T12:00:00.000Z`).getUTCDay())) {
    candidate = addDays(candidate, 1);
  }
  return candidate;
}

/** Working days that passed without the current phase receiving its next attempt. */
export function missedWorkingDays(previousRunDate: string, runDate: string): number {
  let missed = 0;
  for (let date = addDays(previousRunDate, 1); date < runDate; date = addDays(date, 1)) {
    if (![0, 6].includes(new Date(`${date}T12:00:00.000Z`).getUTCDay())) missed += 1;
  }
  return missed;
}

export function createBooksofHistoryCycle(input: {
  date: string;
  now: Date;
  cycleDays?: number;
}): BhCycle {
  return BhCycleSchema.parse({
    schemaVersion: "bh-cycle/1",
    currentCycleId: `bh-${input.date.replaceAll("-", "")}-001`,
    cycleDays: input.cycleDays ?? 3,
    phase: "selection",
    dayStatuses: { selection: "active", research: "pending", production: "pending" },
    candidateSet: [],
    chosenStory: null,
    stretch: { count: 0, reason: null, nextAttemptOn: null },
    startedOn: input.date,
    updatedAt: input.now.toISOString()
  });
}

export function booksofHistoryCycleComplete(cycle: BhCycle): boolean {
  return cycle.phase === "production" && cycle.dayStatuses.production === "completed";
}

export function applyBooksofHistoryCycleDay(input: {
  cycle: BhCycle;
  date: string;
  now: Date;
  outcome: BooksofHistoryPhaseOutcome;
}): BhCycle {
  const cycle = structuredClone(input.cycle);
  const previousRunDate = dateFromInstant(cycle.updatedAt);
  const missed = missedWorkingDays(previousRunDate, input.date);
  if (missed > 0) {
    cycle.stretch = {
      count: cycle.stretch.count + missed,
      reason: "missed-day",
      nextAttemptOn: input.date
    };
  }

  if (input.outcome.candidateSet !== undefined) cycle.candidateSet = input.outcome.candidateSet;
  if (input.outcome.chosenStory !== undefined) cycle.chosenStory = input.outcome.chosenStory;

  if (!input.outcome.completed) {
    const reason = input.outcome.pressure ?? "incomplete-phase";
    cycle.stretch = {
      count: cycle.stretch.count + 1,
      reason,
      nextAttemptOn: nextWorkingDate(input.date)
    };
    cycle.updatedAt = input.now.toISOString();
    return BhCycleSchema.parse(cycle);
  }

  if (cycle.phase === "selection") {
    cycle.dayStatuses.selection = "completed";
    if (input.outcome.shelfShortcut) {
      cycle.dayStatuses.research = "not-needed";
      cycle.dayStatuses.production = "active";
      cycle.phase = "production";
    } else {
      cycle.dayStatuses.research = "active";
      cycle.phase = "research";
    }
  } else if (cycle.phase === "research") {
    cycle.dayStatuses.research = "completed";
    cycle.dayStatuses.production = "active";
    cycle.phase = "production";
  } else {
    cycle.dayStatuses.production = "completed";
  }
  cycle.updatedAt = input.now.toISOString();
  return BhCycleSchema.parse(cycle);
}

export async function readBooksofHistoryCycle(root: string): Promise<BhCycle | null> {
  const value = await readJson<unknown | null>(root, BOOKSOFHISTORY_CYCLE_PATH, null);
  return value === null ? null : BhCycleSchema.parse(value);
}

/** The only writer for the persistent BOOKSOFHISTORY cycle path. */
export async function writeBooksofHistoryCycle(root: string, cycle: BhCycle): Promise<void> {
  await atomicWriteJson(root, BOOKSOFHISTORY_CYCLE_PATH, BhCycleSchema.parse(cycle));
}
