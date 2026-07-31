import {
  type RunnablePhase,
  ScheduledPhaseSchema,
  type ScheduledPhase
} from "../types.js";
import {
  readVentureRegistry,
  resolveMeetingClock
} from "../ventures/registry.js";

export const PRAGUE_TIME_ZONE = "Europe/Prague";

export const MEETING_CLOCK = resolveMeetingClock(readVentureRegistry());

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
