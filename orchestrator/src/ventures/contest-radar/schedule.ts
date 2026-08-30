import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema } from "../../contracts/common.js";
import type { ContestOwnerEvent, ContestRecord } from "../../contracts/contest-radar.js";
import type { ContestCapacity, ContestEntryPolicy } from "./capacity.js";

/**
 * When a repeat entry is next due, and why the scheduler cannot enter it.
 *
 * A contest that permits a daily entry is worth far more than one that permits a single one, and
 * the difference is only realised if somebody remembers to go back. That remembering is the whole
 * product here: the scheduler works out which windows are open today and surfaces them, and a
 * person does the entering.
 *
 * It produces a **reminder**, never an action. There is no submit path in this module, no form
 * post, no queued job that would act while the owner is asleep. The founding decision's line — the
 * venture never acts on a contest — is enforced by there being nothing here that could.
 *
 * A slot the owner already used is closed by their own append-only event rather than by a counter
 * this module keeps. Two sources of truth about "did I enter today" would eventually disagree, and
 * the one that is a record of what a person actually did is the one that should win.
 */

export const ContestEntrySlotSchema = z.strictObject({
  schemaVersion: z.literal("contest-entry-slot/1"),
  contestId: z.string().trim().min(1).max(160),
  /** The period this slot belongs to, as a date the owner can recognise. */
  opensOn: DateSchema,
  closesOn: DateSchema,
  period: z.enum(["total", "daily", "weekly", "monthly", "per-submission"]),
  state: z.enum(["due", "used", "missed", "closed"]),
  /** The owner event that used this slot, when one did. */
  usedByEventId: z.string().trim().min(1).max(160).nullable(),
  reason: z.string().trim().min(1).max(400),
  policyRef: EvidenceRefSchema.nullable()
});

export type ContestEntrySlot = z.infer<typeof ContestEntrySlotSchema>;

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Monday of the week a date falls in, which is the period boundary a weekly rule means. */
function weekStart(date: string): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  const weekday = (at.getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function monthEnd(date: string): string {
  const at = new Date(`${monthStart(date)}T00:00:00.000Z`);
  at.setUTCMonth(at.getUTCMonth() + 1);
  at.setUTCDate(0);
  return at.toISOString().slice(0, 10);
}

function periodBounds(period: ContestEntrySlot["period"], today: string): { opensOn: string; closesOn: string } {
  switch (period) {
    case "daily":
      return { opensOn: today, closesOn: today };
    case "weekly":
      return { opensOn: weekStart(today), closesOn: addDays(weekStart(today), 6) };
    case "monthly":
      return { opensOn: monthStart(today), closesOn: monthEnd(today) };
    default:
      return { opensOn: today, closesOn: today };
  }
}

/**
 * The slots open today for one contest.
 *
 * Everything that would make this unsafe is refused before any window is produced: a closed
 * contest, a deadline in the past, a capacity of zero. A reminder to enter something that has
 * already ended is worse than no reminder, because it costs the owner a click to discover it is
 * useless and teaches them to skim the list.
 */
export function resolveEntrySlots(input: {
  record: Pick<ContestRecord, "id" | "lifecycle" | "dates">;
  policy: ContestEntryPolicy;
  capacity: ContestCapacity;
  ownerEvents: readonly ContestOwnerEvent[];
  today: string;
  policyRef?: string | null;
}): ContestEntrySlot[] {
  const policyRef = input.policyRef ?? null;

  if (input.record.lifecycle === "closed" || input.record.lifecycle === "rejected" || input.record.lifecycle === "archived") {
    return [];
  }

  const deadline = input.record.dates.deadline.value;
  if (typeof deadline === "string" && deadline < input.today) {
    return [ContestEntrySlotSchema.parse({
      schemaVersion: "contest-entry-slot/1",
      contestId: input.record.id,
      opensOn: deadline,
      closesOn: deadline,
      period: input.policy.period ?? "total",
      state: "closed",
      usedByEventId: null,
      reason: `The stated deadline was ${deadline}.`,
      policyRef
    })];
  }

  const period = input.policy.period ?? "total";
  const bounds = periodBounds(period, input.today);
  // A deadline inside the current period ends it early: a weekly slot that closes on Friday is
  // not open until Sunday just because the calendar week is.
  const closesOn = typeof deadline === "string" && deadline < bounds.closesOn ? deadline : bounds.closesOn;

  const entriesThisPeriod = input.ownerEvents.filter((event) =>
    event.contestId === input.record.id
    && event.action === "entered"
    && event.recordedAt.slice(0, 10) >= bounds.opensOn
    && event.recordedAt.slice(0, 10) <= closesOn);

  if (period === "total") {
    // A one-off contest has one slot for its whole life, and the owner's own event closes it.
    const everEntered = input.ownerEvents.find((event) =>
      event.contestId === input.record.id && event.action === "entered");
    if (everEntered) {
      return [ContestEntrySlotSchema.parse({
        schemaVersion: "contest-entry-slot/1",
        contestId: input.record.id,
        opensOn: everEntered.recordedAt.slice(0, 10),
        closesOn,
        period,
        state: "used",
        usedByEventId: everEntered.id,
        reason: "The owner recorded an entry, and this contest permits one.",
        policyRef
      })];
    }
    if (input.capacity.baseCapacity === 0) return [];
    return [ContestEntrySlotSchema.parse({
      schemaVersion: "contest-entry-slot/1",
      contestId: input.record.id,
      opensOn: input.today,
      closesOn,
      period,
      state: "due",
      usedByEventId: null,
      reason: input.capacity.reason,
      policyRef
    })];
  }

  const allowance = Math.max(0, input.capacity.repeatCapacity);
  if (allowance === 0) return [];

  const slots: ContestEntrySlot[] = [];
  for (let index = 0; index < allowance; index += 1) {
    const used = entriesThisPeriod[index];
    slots.push(ContestEntrySlotSchema.parse({
      schemaVersion: "contest-entry-slot/1",
      contestId: input.record.id,
      opensOn: bounds.opensOn,
      closesOn,
      period,
      state: used ? "used" : "due",
      usedByEventId: used?.id ?? null,
      reason: used
        ? "The owner recorded an entry in this period."
        : `The rules permit ${allowance} ${allowance === 1 ? "entry" : "entries"} per ${period.replace("ly", "")} period.`,
      policyRef
    }));
  }
  return slots;
}

/**
 * Every window due today across the whole shortlist, in the order a person should work them.
 *
 * Soonest closing first, because that is the only ordering that stops the owner losing a window
 * they could have made. Nothing here enters anything: the result is a list to read.
 */
export function dueEntrySlots(slots: readonly ContestEntrySlot[]): ContestEntrySlot[] {
  return slots
    .filter((slot) => slot.state === "due")
    .sort((left, right) => left.closesOn.localeCompare(right.closesOn) || left.contestId.localeCompare(right.contestId));
}
