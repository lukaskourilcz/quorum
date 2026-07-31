import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CalendarFeedSchema,
  type CalendarFeed
} from "../contracts/calendar.js";
import { MeetingRecordSchema, type MeetingRecord } from "../contracts/meeting-record.js";
import { atomicWriteJson } from "../state.js";
import { StandupSchema } from "../standup/schema.js";
import { MEETING_CLOCK, PRAGUE_TIME_ZONE } from "./clock.js";
import { meetingRef } from "./record.js";

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
  if (record.kind === "cu-edition" || record.kind === "cu-product") return record.kind;
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
  if (record.kind === "venture") return `meetings/${record.cycleId}`;
  if (record.kind === "tt-marketing") return `meetings/${record.date}-${record.kind}`;
  return meetingRef(record.date, record.kind);
}

export function buildCalendarFeed(input: {
  weekOf: string;
  records: readonly MeetingRecord[];
  now: Date;
}): CalendarFeed {
  const weekOf = mondayOfWeek(input.weekOf);
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
      const status = record ? "held" : at.getTime() < input.now.getTime() ? "missed" : "scheduled";
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
