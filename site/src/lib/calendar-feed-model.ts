import type { PublicStandup } from "@/data/fixtures";
import type { PublicMeetingRecord } from "@/lib/meeting-record-model";

export type CalendarKind =
  | "cu-edition"
  | "venture-morning"
  | "venture-afternoon"
  | "cu-product"
  | "tt-marketing"
  | "incubator-scan"
  | "incubator-synthesis"
  | "mma-intake"
  | "mma-analysis"
  | "mag-editorial"
  | "mag-desk"
  | "article-am"
  | "article-pm"
  | "studio"
  | "venture-night";
export type CalendarStatus = "scheduled" | "held" | "missed" | "not-needed";

export interface CalendarDefinition {
  hour: number;
  kind: CalendarKind;
  label: string;
}

export interface CalendarSlot {
  at: string;
  tz: "Europe/Prague";
  kind: CalendarKind;
  status: CalendarStatus;
  meetingHref?: string;
  decisionOneLiner?: string;
  fixture?: boolean;
}

export interface PublicCalendarFeed {
  schemaVersion: "calendar/1";
  weekOf: string;
  definitions: readonly CalendarDefinition[];
  slots: CalendarSlot[];
}

export const CALENDAR_SLOTS: readonly CalendarDefinition[] = [
  { hour: 5, kind: "cu-edition", label: "Edition room" },
  { hour: 6, kind: "venture-morning", label: "Morning shift" },
  { hour: 7, kind: "incubator-scan", label: "Incubator evidence scan" },
  { hour: 8, kind: "mma-intake", label: "FightAIQ morning data check" },
  { hour: 9, kind: "mag-editorial", label: "MMA Files morning story meeting" },
  { hour: 10, kind: "article-am", label: "MMA Files morning article" },
  { hour: 11, kind: "tt-marketing", label: "Titty Tuesdays marketing" },
  { hour: 13, kind: "studio", label: "Carousel Studio room" },
  { hour: 14, kind: "venture-afternoon", label: "Afternoon shift" },
  { hour: 17, kind: "cu-product", label: "Product room" },
  { hour: 18, kind: "article-pm", label: "MMA Files evening article" },
  { hour: 19, kind: "mma-analysis", label: "FightAIQ evening model check" },
  { hour: 20, kind: "mag-desk", label: "MMA Files evening desk review" },
  { hour: 21, kind: "incubator-synthesis", label: "Incubator synthesis" },
  { hour: 22, kind: "venture-night", label: "Night shift" }
] as const;

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function mondayOfCalendarWeek(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw new Error(`Invalid calendar date: ${date}`);
  const weekday = value.getUTCDay() || 7;
  return addCalendarDays(date, 1 - weekday);
}

export function pragueCalendarDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Prague"
  }).format(now);
}

export function pragueSlotInstant(date: string, hour: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid Prague slot: ${date} ${hour}`);
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour);
  let candidate = desiredAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone: "Europe/Prague"
    }).formatToParts(new Date(candidate));
    const number = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const observedAsUtc = Date.UTC(
      number("year"),
      number("month") - 1,
      number("day"),
      number("hour"),
      number("minute"),
      number("second")
    );
    candidate = desiredAsUtc - (observedAsUtc - candidate);
  }
  return new Date(candidate);
}

function ventureKind(phase: PublicStandup["phase"]): CalendarKind | null {
  if (phase === "morning") return "venture-morning";
  if (phase === "afternoon") return "venture-afternoon";
  if (phase === "night") return "venture-night";
  return null;
}

export function buildPublicCalendarFeed(input: {
  weekOf: string;
  now: Date;
  standups: readonly PublicStandup[];
  meetings: readonly PublicMeetingRecord[];
  definitions?: readonly CalendarDefinition[];
}): PublicCalendarFeed {
  const weekOf = mondayOfCalendarWeek(input.weekOf);
  const definitions = input.definitions ?? CALENDAR_SLOTS;
  const records = new Map<string, { href: string; summary: string; fixture: boolean; status?: PublicMeetingRecord["status"] }>();
  for (const standup of input.standups) {
    const kind = ventureKind(standup.phase);
    if (kind) records.set(`${standup.date}:${kind}`, {
      href: `/standups/${standup.id}/room`,
      summary: standup.decision.summary.slice(0, 180),
      fixture: standup.fixture
    });
  }
  for (const meeting of input.meetings) {
    records.set(`${meeting.date}:${meeting.kind}`, {
      href: `/meetings/${meeting.id}`,
      summary: meeting.decision.summary.slice(0, 180),
      fixture: meeting.fixture,
      status: meeting.status
    });
  }
  const slots: CalendarSlot[] = [];
  for (let day = 0; day < 7; day += 1) {
    const date = addCalendarDays(weekOf, day);
    for (const definition of definitions) {
      const at = pragueSlotInstant(date, definition.hour);
      const record = records.get(`${date}:${definition.kind}`);
      slots.push({
        at: at.toISOString(),
        tz: "Europe/Prague",
        kind: definition.kind,
        status: record?.status === "PAUSED"
          ? "not-needed"
          : record
            ? "held"
            : at.getTime() < input.now.getTime()
              ? "missed"
              : "scheduled",
        ...(record ? {
          meetingHref: record.href,
          decisionOneLiner: record.summary,
          fixture: record.fixture
        } : {})
      });
    }
  }
  return { schemaVersion: "calendar/1", weekOf, definitions, slots };
}

export function calendarStaticWeeks(now: Date, pastWeeks = 8): string[] {
  const current = mondayOfCalendarWeek(pragueCalendarDate(now));
  return Array.from({ length: pastWeeks + 2 }, (_, index) =>
    addCalendarDays(current, (index - pastWeeks) * 7)
  );
}
