import {
  type RunnablePhase,
  ScheduledPhaseSchema,
  type ScheduledPhase
} from "../types.js";
import {
  CRON_LEAD_HOURS,
  readVentureRegistry,
  resolveScheduledClock
} from "../ventures/registry.js";

export const PRAGUE_TIME_ZONE = "Europe/Prague";

export const MEETING_CLOCK = resolveScheduledClock(readVentureRegistry());

interface PragueClockParts {
  date: string;
  hour: number;
  minute: number;
}

export function pragueClockParts(at: Date): PragueClockParts {
  if (Number.isNaN(at.getTime())) throw new Error("Scheduled time is invalid");
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
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (!year || !month || !day || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error("Could not resolve Europe/Prague wall time");
  }
  return { date: `${year}-${month}-${day}`, hour, minute };
}

/** Prague's UTC offset in whole hours on a given instant: 2 under CEST, 1 under CET. */
export function pragueUtcOffsetHours(at: Date): number {
  const local = pragueClockParts(at);
  const asUtc = Date.UTC(
    Number(local.date.slice(0, 4)),
    Number(local.date.slice(5, 7)) - 1,
    Number(local.date.slice(8, 10)),
    local.hour,
    local.minute
  );
  return Math.round((asUtc - at.getTime()) / 3_600_000);
}

function cronUtcHours(cron: string): number[] {
  const fields = cron.trim().split(/\s+/u);
  if (fields.length !== 5 || fields[0] !== "0") return [];
  const hours = fields[1]!.split(",").map((value) => Number(value));
  return hours.every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23) ? hours : [];
}

/**
 * Resolve the meeting a cron fired for, from the cron itself rather than from the clock.
 *
 * resolveScheduledPhase asks what meeting is due at the moment the job happens to run, inside
 * a grace window capped at 20 minutes. GitHub queues scheduled workflows, and on 2 August it
 * queued them 13 to 54 minutes late: seven of fourteen meetings resolved to "skip" and simply
 * did not happen. The delay is not something this repository can shorten, and widening the
 * window past 30 minutes would start matching the neighbouring hour instead.
 *
 * The cron that fired already names the meeting, so nothing has to be inferred from lateness.
 * A cron can list two hours, one per daylight-saving variant of the same slot, and the same
 * UTC hour can serve one venture's summer slot and another's winter slot; the firing is
 * therefore the most recent listed hour at or before the run, which is the only one that
 * could have triggered it. Six hours is a sanity bound, well past any delay observed.
 */
export function resolveCronPhase(cron: string, at: Date): ScheduledPhase | null {
  const hours = cronUtcHours(cron);
  if (hours.length === 0) return null;
  const nowUtcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  let firedHour: number | null = null;
  let smallestLateness = Number.POSITIVE_INFINITY;
  for (const hour of hours) {
    const lateness = (nowUtcMinutes - hour * 60 + 1_440) % 1_440;
    if (lateness < smallestLateness) {
      smallestLateness = lateness;
      firedHour = hour;
    }
  }
  if (firedHour === null || smallestLateness > 6 * 60) return null;
  // The same lead cronPayloads subtracts when it writes the cron is added back here.
  const pragueHour = (firedHour + pragueUtcOffsetHours(at) + CRON_LEAD_HOURS) % 24;
  return MEETING_CLOCK.find((slot) => slot.hour === pragueHour)?.phase ?? null;
}

export function resolveScheduledPhase(
  at: Date,
  graceMinutes = 20
): ScheduledPhase {
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 20) {
    throw new Error("Clock grace must be an integer from 0 to 20 minutes");
  }
  const local = pragueClockParts(at);
  const localMinute = local.hour * 60 + local.minute;
  const matching = MEETING_CLOCK.filter(
    (slot) => Math.abs(localMinute - slot.hour * 60) <= graceMinutes
  );
  if (matching.length !== 1) {
    throw new Error(
      `No scheduled phase at Europe/Prague ${local.date} ${String(local.hour).padStart(2, "0")}:${String(local.minute).padStart(2, "0")}`
    );
  }
  return matching[0]!.phase;
}

export function resolveManualPhase(value: string): ScheduledPhase {
  return ScheduledPhaseSchema.parse(value);
}

export function isCaughtUpPhase(
  phase: RunnablePhase
): phase is "cu-edition" | "cu-product" {
  return phase === "cu-edition" || phase === "cu-product";
}

export function isPortfolioPhase(
  phase: RunnablePhase
): phase is "tt-marketing" | "incubator-scan" | "incubator-synthesis" | "mma-intake" | "mma-analysis" | "mag-editorial" | "mag-desk" | "studio" {
  return phase === "tt-marketing" || phase === "incubator-scan" || phase === "incubator-synthesis" || phase === "mma-intake" || phase === "mma-analysis" || phase === "mag-editorial" || phase === "mag-desk" || phase === "studio";
}
