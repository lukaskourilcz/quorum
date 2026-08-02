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
export type CalendarStatus = "scheduled" | "held" | "missed" | "not-needed" | "skipped";

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

/** A slot a gate turned off before any room opened, with the reason it gives the reader. */
export interface PublicMeetingSkip {
  date: string;
  phase: string;
  reason: string;
}

/** What an MMA Files article slot did. Those two slots have no meeting record. */
export interface PublicArticleSlotOutcome {
  date: string;
  slot: "am" | "pm";
  status: string;
  reason?: string;
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

/**
 * The calendar kind a skipped orchestrator phase belongs to.
 *
 * A skip is recorded under the phase name the workflow resolved, which for the three company
 * shifts is "morning", "afternoon" or "night" while the calendar calls them venture-morning
 * and so on. Every other phase name is already the calendar kind.
 */
function skipKind(phase: string): string {
  if (phase === "morning" || phase === "afternoon" || phase === "night") return `venture-${phase}`;
  return phase;
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
  skips?: readonly PublicMeetingSkip[];
  articleSlots?: readonly PublicArticleSlotOutcome[];
  definitions?: readonly CalendarDefinition[];
}): PublicCalendarFeed {
  const weekOf = mondayOfCalendarWeek(input.weekOf);
  const definitions = input.definitions ?? CALENDAR_SLOTS;
  const skipReasons = new Map((input.skips ?? []).map((skip) => [`${skip.date}:${skipKind(skip.phase)}`, skip.reason]));
  const articleOutcomes = new Map((input.articleSlots ?? []).map((run) => [`${run.date}:article-${run.slot}`, run]));
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
      // The article slots keep their outcome in a run file rather than a meeting record, so
      // both fell through to "missed" every day — including the day one of them published.
      const article = articleOutcomes.get(`${date}:${definition.kind}`);
      if (article) {
        slots.push({
          at: at.toISOString(),
          tz: "Europe/Prague",
          kind: definition.kind,
          status: article.status === "published" ? "held" : "skipped",
          decisionOneLiner: article.status === "published"
            ? "The desk published this slot's article."
            : (article.reason ?? `The desk did not publish this slot: ${article.status}.`).slice(0, 180)
        });
        continue;
      }
      const record = records.get(`${date}:${definition.kind}`);
      slots.push({
        at: at.toISOString(),
        tz: "Europe/Prague",
        kind: definition.kind,
        // A slot a gate turned off reads "skipped" and carries the reason, so it is no longer
        // indistinguishable from one nobody reached. Eleven slots on 2 August showed as plain
        // "Did not happen" with nothing anywhere explaining any of them.
        status: record?.status === "PAUSED"
          ? "not-needed"
          : record
            ? "held"
            : skipReasons.has(`${date}:${definition.kind}`)
              ? "skipped"
              : at.getTime() < input.now.getTime()
                ? "missed"
                : "scheduled",
        ...(record ? {
          meetingHref: record.href,
          decisionOneLiner: record.summary,
          fixture: record.fixture
        } : skipReasons.has(`${date}:${definition.kind}`) ? {
          decisionOneLiner: skipReasons.get(`${date}:${definition.kind}`)!
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
