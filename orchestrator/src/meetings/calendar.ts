import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CalendarFeedSchema,
  type CalendarFeed
} from "../contracts/calendar.js";
import { MeetingRecordSchema, type MeetingRecord } from "../contracts/meeting-record.js";
import { MeetingSkipSchema, type MeetingSkip } from "../contracts/meeting-skip.js";
import { atomicWriteJson } from "../state.js";
import { StandupSchema } from "../standup/schema.js";
import { CRON_DELIVERY_WINDOW_HOURS, MEETING_CLOCK, PRAGUE_TIME_ZONE } from "./clock.js";
import { meetingRef } from "./record.js";
import { CRON_LEAD_HOURS } from "../ventures/registry.js";

/**
 * How long past its Prague instant a slot is still waiting rather than lost.
 *
 * The cron fires CRON_LEAD_HOURS before the slot and resolveCronDelivery will still name the
 * meeting up to CRON_DELIVERY_WINDOW_HOURS after that cron, so the last moment a run can arrive
 * and still open this room is that many hours past the slot. Deriving it from the two constants
 * the resolver already enforces is what stops the calendar and the resolver disagreeing about
 * when a slot is beyond rescue.
 */
export const SLOT_DELIVERY_GRACE_MS =
  (CRON_DELIVERY_WINDOW_HOURS - CRON_LEAD_HOURS) * 3_600_000;

/** What the calendar says about a slot whose run has not arrived but still can. */
export const LATE_SLOT_REASON = "The run for this slot has not arrived yet.";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOfWeek(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new Error(`Invalid calendar date: ${date}`);
  const weekday = value.getUTCDay() || 7;
  return addDays(date, 1 - weekday);
}

export function pragueSlotInstant(date: string, hour: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day || !Number.isInteger(hour)) {
    throw new Error(`Invalid Prague slot: ${date} ${hour}`);
  }
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  const guess = new Date(desiredAsUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(guess);
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const observedAsUtc = Date.UTC(
    number("year"),
    number("month") - 1,
    number("day"),
    number("hour"),
    number("minute")
  );
  const instant = new Date(desiredAsUtc - (observedAsUtc - guess.getTime()));
  return instant;
}

function recordKind(record: MeetingRecord): CalendarFeed["slots"][number]["kind"] | null {
  if (record.kind === "cu-edition" || record.kind === "cu-product" || record.kind === "tt-marketing" || record.kind === "gv-brief" || record.kind === "ms-daily" || record.kind === "bh-desk" || record.kind === "incubator-scan" || record.kind === "incubator-synthesis" || record.kind === "mma-intake" || record.kind === "mma-analysis" || record.kind === "mag-editorial" || record.kind === "mag-desk" || record.kind === "studio") return record.kind;
  if (record.phase === "morning") return "venture-morning";
  if (record.phase === "afternoon") return "venture-afternoon";
  if (record.phase === "night") return "venture-night";
  return null;
}

function slotKind(phase: (typeof MEETING_CLOCK)[number]["phase"]): CalendarFeed["slots"][number]["kind"] {
  if (phase === "morning") return "venture-morning";
  if (phase === "afternoon") return "venture-afternoon";
  if (phase === "night") return "venture-night";
  return phase;
}

function recordReference(record: MeetingRecord): string {
  // Every venture record loadMeetingRecords returns was read from standups/, so that is what a
  // venture slot points at. A venture cycle also writes meetings/<cycleId>.json, but that file
  // is a thin room summary on schemaVersion 1: it fails MeetingRecordSchema and is dropped by
  // the loop below, so the calendar never holds it. Naming it from the cycle id anyway pointed
  // the slot at a file the calendar had not read, and it resolved only where a cycle happened
  // to leave both files behind. The 1 August morning and afternoon standups were published
  // without their summaries, and the two slots referenced files that were never written.
  if (record.kind === "venture") return `standups/${record.date}-${record.phase}`;
  if (record.kind === "tt-marketing" || record.kind === "gv-brief" || record.kind === "ms-daily" || record.kind === "bh-desk" || record.kind === "incubator-scan" || record.kind === "incubator-synthesis" || record.kind === "mma-intake" || record.kind === "mma-analysis" || record.kind === "mag-editorial" || record.kind === "mag-desk" || record.kind === "studio") {
    return `meetings/${record.date}-${record.kind}`;
  }
  return meetingRef(record.date, record.kind);
}

export function buildCalendarFeed(input: {
  weekOf: string;
  records: readonly MeetingRecord[];
  skips?: readonly MeetingSkip[];
  articleSlots?: readonly ArticleSlotOutcome[];
  now: Date;
}): CalendarFeed {
  const weekOf = mondayOfWeek(input.weekOf);
  const skipReasons = new Map((input.skips ?? []).map((skip) => [`${skip.date}:${skip.phase}`, skip.reason]));
  const articleOutcomes = new Map((input.articleSlots ?? []).map((outcome) => [`${outcome.date}:article-${outcome.slot}`, outcome]));
  const bySlot = new Map<string, MeetingRecord>();
  for (const record of input.records) {
    const kind = recordKind(record);
    if (kind) bySlot.set(`${record.date}:${kind}`, record);
  }
  const slots: CalendarFeed["slots"] = [];
  for (let day = 0; day < 7; day += 1) {
    const date = addDays(weekOf, day);
    for (const definition of MEETING_CLOCK) {
      const kind = slotKind(definition.phase);
      const at = pragueSlotInstant(date, definition.hour);
      const record = bySlot.get(`${date}:${kind}`);
      // A slot a gate turned off is not the same as one nobody reached. Both used to read
      // "missed", which is how eleven meetings could fail to happen on 2 August with nothing
      // anywhere saying why. The recorded reason is what the calendar shows for a skip.
      const skip = skipReasons.get(`${date}:${definition.phase}`);
      // The article slots keep their outcome in a run file rather than a meeting record, so
      // they are read from there; a published slot is held, and a killed or blocked one is a
      // skip carrying the reason it was given.
      const article = articleOutcomes.get(`${date}:${kind}`);
      if (article) {
        slots.push({
          at: at.toISOString(),
          tz: PRAGUE_TIME_ZONE,
          kind,
          status: article.status === "published" ? "held" : "skipped",
          ...(article.status === "published"
            ? { decisionOneLiner: "The desk published this slot's article." }
            : { decisionOneLiner: (article.reason ?? `The desk did not publish this slot: ${article.status}.`).slice(0, 180) })
        });
        continue;
      }
      // A slot whose instant has passed is not yet a slot that was missed. GitHub queues these
      // workflows: on 4 August it delivered the day's crons 2h23m to 2h55m late, so every
      // meeting ran and every one was called "missed" first. The slot audited that morning as
      // "two runs succeeded and wrote nothing" was article-am, which had simply not been
      // delivered yet: its cron arrived 2h41m late and it published at 09:49 UTC, cycle(104),
      // 1h49m after its slot — the whole of which the board spent saying it did not happen.
      // The slot stays "late" for as long as a run for it can still arrive and name it, and
      // only then is it lost.
      const elapsed = input.now.getTime() - at.getTime();
      const status = record?.status === "PAUSED"
        ? "not-needed"
        : record
          ? "held"
          : skip
            ? "skipped"
            : elapsed <= 0
              ? "scheduled"
              : elapsed <= SLOT_DELIVERY_GRACE_MS
                ? "late"
                : "missed";
      slots.push({
        at: at.toISOString(),
        tz: PRAGUE_TIME_ZONE,
        kind,
        status,
        ...(record
          ? {
              meetingRef: recordReference(record),
              decisionOneLiner: record.decision.summary.slice(0, 180)
            }
          : skip
            ? { decisionOneLiner: skip.slice(0, 180) }
            : status === "late"
              ? { decisionOneLiner: LATE_SLOT_REASON }
              : {})
      });
    }
  }
  return CalendarFeedSchema.parse({ schemaVersion: "calendar/1", weekOf, slots });
}

async function jsonFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory))
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(directory, file));
  } catch {
    return [];
  }
}

/** Every recorded skip under a state root, so the calendar can explain a slot nobody opened. */
export interface ArticleSlotOutcome {
  date: string;
  slot: "am" | "pm";
  status: string;
  reason?: string;
}

/**
 * What the two MMA Files article slots actually did, which no meeting record can carry.
 *
 * Article production writes a run file and nothing else, and MeetingRecord has no kind for
 * article-am or article-pm, so both slots fell through to "at < now ? missed". The calendar
 * marked 2 August 10:00 as missed on the day that slot published the Shevchenko profile.
 */
export async function loadArticleSlotOutcomes(root: string): Promise<ArticleSlotOutcome[]> {
  const files = await jsonFiles(path.join(root, "ventures", "mma-files", "runs"));
  const outcomes: ArticleSlotOutcome[] = [];
  for (const file of files) {
    const value = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    const { date, slot, status, reason } = value;
    if (typeof date === "string" && (slot === "am" || slot === "pm") && typeof status === "string") {
      outcomes.push({ date, slot, status, ...(typeof reason === "string" ? { reason } : {}) });
    }
  }
  return outcomes;
}

export async function loadMeetingSkips(root: string): Promise<MeetingSkip[]> {
  const files = await jsonFiles(path.join(root, "meetings", "skips"));
  const skips: MeetingSkip[] = [];
  for (const file of files) {
    const parsed = MeetingSkipSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (parsed.success) skips.push(parsed.data);
  }
  return skips;
}

export async function loadMeetingRecords(root: string): Promise<MeetingRecord[]> {
  const [files, standupFiles] = await Promise.all([
    jsonFiles(path.join(root, "meetings")),
    jsonFiles(path.join(root, "standups"))
  ]);
  const records: MeetingRecord[] = [];
  for (const file of files) {
    const parsed = MeetingRecordSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (parsed.success) records.push(parsed.data);
  }
  for (const file of standupFiles) {
    const parsed = StandupSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    if (parsed.success) {
      records.push(MeetingRecordSchema.parse({
        ...parsed.data,
        schemaVersion: "meeting-record/2",
        kind: "venture"
      }));
    }
  }
  return records;
}

export async function writeCalendarFeed(
  root: string,
  feed: CalendarFeed
): Promise<string> {
  const relativePath = `calendar/${feed.weekOf}.json`;
  await atomicWriteJson(root, relativePath, CalendarFeedSchema.parse(feed));
  return relativePath;
}
