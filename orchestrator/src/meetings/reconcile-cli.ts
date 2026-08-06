import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CalendarFeed } from "../contracts/calendar.js";
import { MeetingSkipSchema } from "../contracts/meeting-skip.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  loadMeetingRecords,
  loadMeetingSkips,
  mondayOfWeek,
  pragueSlotInstant
} from "./calendar.js";
import { MEETING_CLOCK, pragueClockParts } from "./clock.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

/**
 * What a slot gets when the day ends with nothing recorded against it.
 *
 * Every existing recorder in cycle.yml — the gate recorder, the release-gate recorder and the
 * failure recorder — is a step inside the run it describes. So a run stopped before those steps,
 * or one whose commit never lands, leaves no meeting record, no article run file and no skip. A
 * cron GitHub never delivered does it; so does a cancelled run, a runner that dies mid-job, or a
 * push that keeps failing. Nothing left in the repository tells those apart, so the reason states
 * the absence and stops there rather than naming a cause it cannot establish — it is published on
 * the calendar, where a wrong cause reads as fact. Without a record the calendar falls through to
 * its "at < now" branch, which renders the slot red as "missed" and says nothing, which is exactly
 * the state the owner keeps having to ask about.
 *
 * It describes the missing meeting and not the missing files. The first version listed what was
 * absent from the repository — "no meeting record, no article run and no skip" — which is the
 * evidence for the sentence, not the sentence, and it ended on "The cause is unknown", which
 * reads as an admission rather than an answer. What a visitor needs is that the meeting did not
 * happen, that nobody knows why, and that it therefore cost nothing.
 */
export const NO_RECORD_REASON =
  "No run arrived for this slot. Nothing was written down about why, nobody was asked anything and nothing was spent.";

type SlotKind = CalendarFeed["slots"][number]["kind"];

/** The phase a calendar slot was built from — the inverse of calendar.ts's private slotKind. */
function slotPhase(kind: SlotKind): string {
  if (kind === "venture-morning") return "morning";
  if (kind === "venture-afternoon") return "afternoon";
  if (kind === "venture-night") return "night";
  return kind;
}

/** Yesterday on the Prague calendar, which is the day boundary every slot is defined against. */
export function previousPragueDate(now: Date): string {
  // Anchored at noon, like calendar.ts's addDays: subtracting 24 hours from the instant would
  // land on the same date across a daylight-saving switch.
  const value = new Date(`${pragueClockParts(now).date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export interface ReconcileResult {
  date: string;
  recorded: string[];
}

/**
 * Give every slot of a finished day a record, so nothing on the calendar is red without a reason.
 *
 * The decision of what is unaccounted for is delegated to buildCalendarFeed rather than
 * recomputed here: a slot is missing precisely when the feed calls it "missed", which already
 * means no meeting record, no article-slot run and no existing skip. That keeps one definition
 * of the truth, so a slot can never be reconciled as absent while the calendar shows it held.
 *
 * "missed" and not "late": a slot inside its delivery window still has a run on the way, and
 * the reason written below states that no record exists — which would be false by the time it
 * was read. The window is SLOT_DELIVERY_GRACE_MS, five hours, so yesterday's last slot at 22:00
 * Prague clears it at 03:00 today and the 08:15 reconcile job sees every slot of the finished
 * day as missed. Run earlier than that by hand and the still-open slots are left alone, which
 * is the conservative half of the same rule rather than a gap in it.
 */
export async function reconcileMeetingDay(
  root: string,
  date: string,
  now: Date
): Promise<ReconcileResult> {
  if (date >= pragueClockParts(now).date) {
    // Crons fire an hour ahead of their slot (CRON_LEAD_HOURS) and GitHub queues them late by
    // anything from minutes to hours, so a slot earlier today may still be on its way. Writing
    // "no record of this slot exists" for one would be false by the time anybody reads it, and
    // the record is what the calendar then shows.
    throw new Error(`Only a finished Prague day can be reconciled: ${date}`);
  }
  const feed = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: await loadMeetingRecords(root),
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now
  });
  const statuses = new Map(
    feed.slots.map((slot) => [`${slot.at}:${slotPhase(slot.kind)}`, slot.status])
  );
  const recorded: string[] = [];
  for (const definition of MEETING_CLOCK) {
    // Matched on the slot's own instant rather than on a date prefix of the UTC timestamp: a
    // Prague slot early enough in the day belongs to the previous UTC date.
    const at = pragueSlotInstant(date, definition.hour).toISOString();
    if (statuses.get(`${at}:${definition.phase}`) !== "missed") continue;
    const relative = `meetings/skips/${date}-${definition.phase}.json`;
    await atomicWriteJson(root, relative, MeetingSkipSchema.parse({
      schemaVersion: "meeting-skip/1",
      date,
      phase: definition.phase,
      reason: NO_RECORD_REASON,
      decidedAt: now.toISOString()
    }));
    recorded.push(`state/${relative}`);
  }
  return { date, recorded };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const now = new Date(valueAfter(args, "--now") ?? Date.now());
  const date = valueAfter(args, "--date")?.trim() || previousPragueDate(now);
  console.log(JSON.stringify(await reconcileMeetingDay(stateRoot, date, now)));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
