import { addCalendarDays, mondayOfCalendarWeek } from "@/lib/calendar-feed-model";
import {
  CALENDAR_WORK_KINDS,
  calendarDaysBetween,
  type CalendarDocument,
  type CalendarEntry,
  type CalendarKind,
  type CalendarPlatform,
  type CalendarProducer,
  type CalendarStatus
} from "@/lib/marketing-calendar-model";

/**
 * What the admin Calendar derives from one parsed plan (quorum#592): the entry views with the
 * Queue's status folded in, the week and month geometry, the aggregates the summary strip reads,
 * and the list filters. Pure and client-safe; the server reader builds the views, the panel
 * recomputes the rest when the owner changes a status.
 */

export interface CalendarQueueLink {
  itemId: string;
  /** The Queue's own status word, e.g. `draft`, `approved`, `published`. */
  status: string;
  designLabHref: string | null;
  permalink: string | null;
}

export interface CalendarEntryView extends CalendarEntry {
  /** What the calendar shows: the Queue's word for queued and published, the owner's otherwise. */
  effectiveStatus: CalendarStatus;
  statusSource: "owner" | "queue";
  queue: CalendarQueueLink | null;
  /** Whether marketingShark wrote a package for this day; null where no package applies. */
  packageExists: boolean | null;
  /** A planned default the rotation adds for a day the document leaves empty. */
  synthetic: boolean;
}

export interface CalendarWeek {
  monday: string;
  days: string[];
  /** The plan's own week number, when this calendar week overlaps the period. */
  planWeek: number | null;
}

export interface CalendarAggregates {
  total: number;
  /** Everything the audience sees: every kind except tasks and reviews. */
  posts: number;
  byPlatform: Partial<Record<CalendarPlatform, number>>;
  byKind: Partial<Record<CalendarKind, number>>;
  byStatus: Partial<Record<CalendarStatus, number>>;
  byProducer: Partial<Record<CalendarProducer, number>>;
  byPillar: Record<string, number>;
  byDay: Record<string, number>;
  effortByDay: Record<string, number>;
  effortByWeek: Record<string, number>;
  effortTotal: number;
  /** Entries whose effort the document does not state. */
  effortUnknown: number;
  periodDays: number;
  /** Mean over the period's days; null for an empty period. */
  effortPerDay: number | null;
  effortPerWeek: number | null;
  ads: { count: number; totalEur: number };
  published: number;
  /** published / posts, 0–100; null when nothing is postable. */
  donePercent: number | null;
  daysWithoutEntry: string[];
}

export function periodDays(period: { start: string; end: string }): string[] {
  const count = calendarDaysBetween(period.start, period.end) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, index) => addCalendarDays(period.start, index));
}

export function periodWeeks(period: { start: string; end: string }): CalendarWeek[] {
  const weeks: CalendarWeek[] = [];
  for (let monday = mondayOfCalendarWeek(period.start); monday <= period.end; monday = addCalendarDays(monday, 7)) {
    weeks.push({ monday, days: Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index)), planWeek: weeks.length + 1 });
  }
  return weeks;
}

export function weekOf(date: string, period: { start: string; end: string }): CalendarWeek {
  const monday = mondayOfCalendarWeek(date);
  const planWeek = periodWeeks(period).findIndex((week) => week.monday === monday);
  return { monday, days: Array.from({ length: 7 }, (_, index) => addCalendarDays(monday, index)), planWeek: planWeek >= 0 ? planWeek + 1 : null };
}

/**
 * The week the page opens on: this week while the plan runs, otherwise the launch week. A
 * requested week is honoured when it is a real date; its Monday is what the grid uses.
 */
export function defaultCalendarWeek(today: string, document: Pick<CalendarDocument, "launch" | "period">, requested?: string | null): string {
  if (requested && /^\d{4}-\d{2}-\d{2}$/u.test(requested) && !Number.isNaN(Date.parse(`${requested}T12:00:00Z`))) {
    return mondayOfCalendarWeek(requested);
  }
  if (today >= document.period.start && today <= document.period.end) return mondayOfCalendarWeek(today);
  return mondayOfCalendarWeek(today > document.period.end ? document.period.end : document.launch);
}

export type CalendarPhase =
  | { phase: "before"; daysToLaunch: number }
  | { phase: "running"; day: number; of: number }
  | { phase: "after"; daysSinceEnd: number };

export function calendarPhase(today: string, document: Pick<CalendarDocument, "launch" | "period">): CalendarPhase {
  const of = calendarDaysBetween(document.period.start, document.period.end) + 1;
  if (today < document.launch) return { phase: "before", daysToLaunch: calendarDaysBetween(today, document.launch) };
  if (today > document.period.end) return { phase: "after", daysSinceEnd: calendarDaysBetween(document.period.end, today) };
  return { phase: "running", day: calendarDaysBetween(document.period.start, today) + 1, of };
}

function bump<K extends string>(record: Partial<Record<K, number>>, key: K, by = 1): void {
  record[key] = (record[key] ?? 0) + by;
}

export function isPost(entry: Pick<CalendarEntry, "kind">): boolean {
  return !CALENDAR_WORK_KINDS.has(entry.kind);
}

export function calendarAggregates(document: CalendarDocument, entries: readonly CalendarEntryView[]): CalendarAggregates {
  const days = periodDays(document.period);
  const result: CalendarAggregates = {
    total: entries.length,
    posts: 0,
    byPlatform: {},
    byKind: {},
    byStatus: {},
    byProducer: {},
    byPillar: {},
    byDay: {},
    effortByDay: {},
    effortByWeek: {},
    effortTotal: 0,
    effortUnknown: 0,
    periodDays: days.length,
    effortPerDay: null,
    effortPerWeek: null,
    ads: {
      count: document.ads.length,
      totalEur: Math.round(document.ads.reduce((sum, ad) => sum + ad.totalEur, 0) * 100) / 100
    },
    published: 0,
    donePercent: null,
    daysWithoutEntry: []
  };
  for (const entry of entries) {
    if (isPost(entry)) {
      result.posts += 1;
      if (entry.effectiveStatus === "published") result.published += 1;
    }
    bump(result.byPlatform, entry.platform);
    bump(result.byKind, entry.kind);
    bump(result.byStatus, entry.effectiveStatus);
    bump(result.byProducer, entry.producer);
    bump(result.byPillar, entry.pillar ?? "none");
    bump(result.byDay, entry.date);
    if (entry.effortMin === null) {
      result.effortUnknown += 1;
      continue;
    }
    result.effortTotal += entry.effortMin;
    bump(result.effortByDay, entry.date, entry.effortMin);
    bump(result.effortByWeek, mondayOfCalendarWeek(entry.date), entry.effortMin);
  }
  if (days.length) {
    result.effortPerDay = Math.round(result.effortTotal / days.length);
    result.effortPerWeek = Math.round((result.effortTotal / days.length) * 7);
  }
  result.donePercent = result.posts ? Math.round((result.published / result.posts) * 100) : null;
  result.daysWithoutEntry = days.filter((day) => !result.byDay[day]);
  return result;
}

/** The first entry at or after `now` (Prague wall time) that is still to be done. */
export function nextUp(entries: readonly CalendarEntryView[], today: string, clock: string): CalendarEntryView | null {
  const now = `${today}T${clock}`;
  return entries.find((entry) => `${entry.date}T${entry.time}` >= now
    && entry.effectiveStatus !== "published" && entry.effectiveStatus !== "skipped") ?? null;
}

export interface CalendarFilters {
  platform: CalendarPlatform | null;
  kind: CalendarKind | null;
  status: CalendarStatus | null;
  pillar: string | null;
  producer: CalendarProducer | null;
  query: string;
  upcomingOnly: boolean;
}

export const EMPTY_CALENDAR_FILTERS: CalendarFilters = {
  platform: null, kind: null, status: null, pillar: null, producer: null, query: "", upcomingOnly: false
};

function folded(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("en");
}

export function filterCalendarEntries(
  entries: readonly CalendarEntryView[],
  filters: CalendarFilters,
  today: string,
  ignore: keyof CalendarFilters | null = null
): CalendarEntryView[] {
  const needle = filters.query.trim() ? folded(filters.query.trim()) : "";
  return entries.filter((entry) =>
    (ignore === "platform" || !filters.platform || entry.platform === filters.platform)
    && (ignore === "kind" || !filters.kind || entry.kind === filters.kind)
    && (ignore === "status" || !filters.status || entry.effectiveStatus === filters.status)
    && (ignore === "pillar" || !filters.pillar || (entry.pillar ?? "none") === filters.pillar)
    && (ignore === "producer" || !filters.producer || entry.producer === filters.producer)
    && (!filters.upcomingOnly || entry.date >= today)
    && (!needle || folded([entry.title, entry.hook ?? "", entry.body, entry.cta ?? "", entry.measure ?? "", entry.id].join(" ")).includes(needle)));
}

/** Counts per value of one filter, with every other filter applied — what each option would show. */
export function filterCounts<K extends "platform" | "kind" | "status" | "pillar" | "producer">(
  entries: readonly CalendarEntryView[],
  filters: CalendarFilters,
  today: string,
  key: K
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of filterCalendarEntries(entries, filters, today, key)) {
    const value = key === "status" ? entry.effectiveStatus : key === "pillar" ? entry.pillar ?? "none" : entry[key as "platform" | "kind" | "producer"];
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

/** Splits a body written as "Slide 1: …; slide 2 = …" into its beats; anything else stays one paragraph. */
export function bodyBeats(body: string): string[] {
  const parts = body.split(/(?=\b(?:[Ss]lid(?:e|es|y)|S)\s?\d+(?:\s?[–-]\s?\d+)?\s?[=:])/u).map((part) => part.replace(/[;,]\s*$/u, "").trim()).filter(Boolean);
  return parts.length >= 3 ? parts : [body];
}

const shortDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** "Thu 5 Nov" */
export function formatCalendarDate(date: string): string {
  return shortDate.format(new Date(`${date}T12:00:00Z`)).replace(",", "");
}

/** "5 Nov" */
export function formatDayMonth(date: string): string {
  return dayMonth.format(new Date(`${date}T12:00:00Z`));
}

/** "2–8 Nov" or "30 Nov – 6 Dec" */
export function formatDateRange(start: string, end: string): string {
  const [from, to] = [new Date(`${start}T12:00:00Z`), new Date(`${end}T12:00:00Z`)];
  if (from.getUTCMonth() === to.getUTCMonth()) return `${from.getUTCDate()}–${formatDayMonth(end)}`;
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}`;
}

/** "1 h 28 min", "45 min"; null stays null. */
export function formatEffort(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}
