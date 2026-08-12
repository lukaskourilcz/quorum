/**
 * The meeting clock, as the punctual dispatch path needs to read it.
 *
 * The site cannot import from `@boardlessai/orchestrator` — it is a separate package that is not
 * a dependency, and nothing here may pull the council runtime into a Vercel function. So this
 * mirrors `resolveScheduledClock` in `orchestrator/src/ventures/registry.ts` the same way
 * `calendar-feed-model.ts` mirrors the delivery window: same source of truth
 * (`config/ventures.json`), separate derivation, and a test that fails when the two disagree.
 * `orchestrator/tests/vercel-cron.test.ts` pins `site/vercel.json` to the orchestrator's clock,
 * and `cron-slots.test.ts` pins this module to both.
 */

export const PRAGUE_TIME_ZONE = "Europe/Prague";

export const SCHEDULED_PHASES = [
  "cu-edition",
  "morning",
  "afternoon",
  "cu-product",
  "tt-marketing",
  "gv-brief",
  "ms-daily",
  "dm-desk",
  "dm-growth",
  "mma-intake",
  "mma-analysis",
  "mag-editorial",
  "mag-desk",
  "bh-desk",
  "article-am",
  "night"
] as const;

export type ScheduledPhase = (typeof SCHEDULED_PHASES)[number];

export interface CronSlot {
  /** The phase the workflow is dispatched with. */
  phase: ScheduledPhase;
  /** The Europe/Prague wall-clock hour the meeting belongs to. */
  hour: number;
}

/**
 * The three portfolio board slots, which live in code rather than in the venture registry.
 *
 * `PORTFOLIO_BOARD_SLOTS` in the orchestrator holds the same three hours for the same reason:
 * they are the company's own meetings and belong to no venture.
 */
const PORTFOLIO_BOARD_SLOTS: readonly CronSlot[] = [
  { phase: "morning", hour: 6 },
  { phase: "afternoon", hour: 14 },
  { phase: "night", hour: 22 }
];

function isScheduledPhase(value: string): value is ScheduledPhase {
  return (SCHEDULED_PHASES as readonly string[]).includes(value);
}

export function parseScheduledPhase(value: string): ScheduledPhase | null {
  return isScheduledPhase(value) ? value : null;
}

function cadenceHour(cadence: string): number {
  const match = /^daily@(\d{2}):00$/u.exec(cadence);
  const hour = Number(match?.[1]);
  if (!match || !Number.isInteger(hour) || hour < 5 || hour > 23) {
    throw new Error(`Unsupported venture cadence: ${cadence}`);
  }
  return hour;
}

function productionSlots(kind: string, cadence: string): CronSlot[] {
  // One article a day. The evening slot was killed every single day since launch, so the
  // schedule stopped promising two.
  const match = /^daily@(\d{2}):00$/u.exec(cadence);
  if (kind !== "article-production" || !match) {
    throw new Error(`Unsupported production cadence: ${kind} ${cadence}`);
  }
  return [{ phase: "article-am", hour: Number(match[1]) }];
}

interface RawRegistry {
  schemaVersion?: unknown;
  ventures?: unknown;
}

/**
 * Every slot the council is scheduled to hold, sorted by the hour it belongs to.
 *
 * Throws rather than dropping anything it does not recognise. A registry this cannot read is a
 * registry the dispatcher would silently stop firing part of, and a slot that quietly disappears
 * is exactly the failure the calendar spent three days chasing.
 */
export function resolveCronSlots(registry: unknown): CronSlot[] {
  const raw = registry as RawRegistry;
  if (raw?.schemaVersion !== "venture-registry/1" || !Array.isArray(raw.ventures)) {
    throw new Error("Invalid venture registry");
  }
  const ventureSlots = raw.ventures.flatMap((venture) => {
    const value = venture as {
      meetings?: Array<{ kind?: unknown; cadence?: unknown }>;
      productionJobs?: Array<{ kind?: unknown; cadence?: unknown }>;
    };
    const meetings = (value.meetings ?? []).map((meeting) => {
      const phase = parseScheduledPhase(String(meeting.kind));
      if (!phase) throw new Error(`Unsupported venture meeting kind: ${String(meeting.kind)}`);
      return { phase, hour: cadenceHour(String(meeting.cadence)) };
    });
    const jobs = (value.productionJobs ?? []).flatMap((job) =>
      productionSlots(String(job.kind), String(job.cadence))
    );
    return [...meetings, ...jobs];
  });
  const slots = [...PORTFOLIO_BOARD_SLOTS, ...ventureSlots].sort((left, right) => left.hour - right.hour);
  // Two meetings in one Prague hour would make the hour ambiguous, and this dispatcher decides
  // which firing is the live daylight-saving variant by comparing the Prague hour to the slot's.
  // Two slots sharing an hour would make both variants of both look correct on the same day.
  const hours = new Set(slots.map((slot) => slot.hour));
  if (hours.size !== slots.length) throw new Error("Two scheduled meetings share one Prague hour");
  return slots;
}

/** Prague's UTC offset in whole hours at an instant: 2 under CEST, 1 under CET. */
export function pragueUtcOffsetHours(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (![year, month, day, hour, minute].every(Number.isInteger)) {
    throw new Error("Could not resolve Europe/Prague wall time");
  }
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  return Math.round((asUtc - at.getTime()) / 3_600_000);
}

/** The Europe/Prague wall-clock hour at an instant. */
export function pragueHour(at: Date): number {
  if (Number.isNaN(at.getTime())) throw new Error("Instant is invalid");
  return (at.getUTCHours() + pragueUtcOffsetHours(at) + 24) % 24;
}

/**
 * The two UTC hours a Prague slot needs a cron entry for: summer first, then winter.
 *
 * Vercel cron expressions are UTC only and carry no time zone, so a Prague slot needs one entry
 * per daylight-saving variant and both fire every day of the year. The route refuses the one that
 * is not currently active by checking the Prague hour at the moment it was invoked, which is why
 * neither entry needs to know which half of the year it belongs to.
 */
export function cronUtcHours(hour: number): [number, number] {
  return [(hour - 2 + 24) % 24, (hour - 1 + 24) % 24];
}

/**
 * The Prague hour the edition slot gets a second dispatch at.
 *
 * Mirrors EDITION_RETRY_HOUR in orchestrator/src/meetings/clock.ts, the same way this whole
 * module mirrors the meeting clock, and cron-slots.test.ts fails when the two disagree.
 *
 * It is not in resolveCronSlots and must not be: that list is the meeting clock, one phase per
 * Prague hour, and 09:00 already belongs to the story meeting. This is a second attempt at the
 * 05:00 slot rather than a meeting of its own — the run it dispatches costs $0 and writes
 * nothing on a morning that already published.
 */
export const EDITION_RETRY_HOUR = 9;

export const EDITION_RETRY_PHASE: ScheduledPhase = "cu-edition";

/** Every Prague hour a phase may be dispatched at: its slot, plus the edition retry. */
export function dispatchHoursFor(registry: unknown, phase: ScheduledPhase): number[] {
  const slotHour = resolveCronSlots(registry).find((slot) => slot.phase === phase)?.hour;
  return [
    ...(slotHour === undefined ? [] : [slotHour]),
    ...(phase === EDITION_RETRY_PHASE ? [EDITION_RETRY_HOUR] : [])
  ];
}

/** The cron path this repository schedules a phase under. */
export function cronPathForPhase(phase: ScheduledPhase): string {
  return `/api/cron/${phase}`;
}

/**
 * Every entry `site/vercel.json` must hold, derived from the registry rather than written by hand.
 *
 * The phase travels in the path, not in a query string. Vercel documents the cron `path` only as
 * "must start with `/`" with a 512-character limit, never shows or sanctions a query string, and
 * documents dynamic route segments as the way to give two entries different arguments — so the
 * segment is the supported mechanism and the query string is an assumption this does not make.
 */
export function expectedCronEntries(registry: unknown): Array<{ path: string; schedule: string }> {
  const dispatches = [
    ...resolveCronSlots(registry),
    { phase: EDITION_RETRY_PHASE, hour: EDITION_RETRY_HOUR }
  ];
  return dispatches.flatMap((slot) =>
    cronUtcHours(slot.hour).map((utcHour) => ({
      path: cronPathForPhase(slot.phase),
      schedule: `0 ${utcHour} * * *`
    }))
  );
}
