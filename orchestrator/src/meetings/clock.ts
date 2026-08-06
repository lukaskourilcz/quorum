import {
  type RunnablePhase,
  ScheduledPhaseSchema,
  type ScheduledPhase
} from "../types.js";
import {
  CRON_LEAD_HOURS,
  cronHeadStartMinutes,
  cronSlotHour,
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

/** When a cron fires: the minute it fires on, and every UTC hour it can fire in. */
interface CronFiring {
  minute: number;
  hours: number[];
}

/**
 * Read a cron's firing, or null for an expression this resolver will not act on.
 *
 * The minute is now read rather than skipped over, and it decides two things. It refuses an
 * expression that names no single minute — a `*` or a step, which fires more often than a meeting
 * exists for. And through cronSlotHour it decides whether the firing belongs to the hour it fires
 * in or to the next one, which is what lets the whole schedule sit at CRON_MINUTE, five minutes
 * ahead of the hours it serves, without a single slot moving.
 */
function parseCronFiring(cron: string): CronFiring | null {
  const fields = cron.trim().split(/\s+/u);
  if (fields.length !== 5) return null;
  // Plain digits only. Number() would take "0x11" for 17 and "+5" for 5, and a minute field this
  // resolver misreads is a run attributed to a meeting it was never scheduled for.
  if (!/^\d{1,2}$/u.test(fields[0]!) || Number(fields[0]) > 59) return null;
  const hours = fields[1]!.split(",").map((value) => Number(value));
  if (!hours.every((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)) return null;
  return { minute: Number(fields[0]), hours };
}

/**
 * How long after its cron a delivered run may still name the meeting that cron was for.
 *
 * A firing beyond this is treated as belonging to no meeting rather than to a slot most of a
 * day away, which is what a bare modulo would give. The calendar reads the same constant, so
 * the window in which a slot is still waiting for its run and the window in which a delivered
 * run can still be recorded against that slot are one number, not two that can drift apart —
 * the discipline CRON_LEAD_HOURS already enforces between cronPayloads and this resolver.
 *
 * Six hours is the boundary and not an arbitrary grace: past it a delivered cron can no longer
 * name its slot, so the meeting genuinely cannot be recorded any more. The worst delivery seen
 * is 3h20m — cron `0 3` on 3 August, which arrived at 06:20 UTC — with 4 August's five runs
 * between 2h23m and 2h55m. Six hours is under twice that, so the bound is not generous, and a
 * queue that slipped much further would start discarding firings.
 *
 * Counted from the top of the hour the cron belongs to, not from the firing. Since the firing is
 * CRON_MINUTE's head start ahead of that hour, the queue delay this actually tolerates is six
 * hours plus the head start — 6h05m today.
 */
export const CRON_DELIVERY_WINDOW_HOURS = 6;

/**
 * What a fired cron means, including the two ways it can mean no meeting.
 *
 * `latenessMinutes` is signed, and counted from the top of the hour the cron belongs to rather
 * than from the moment it fired. That anchor is what keeps this resolver and the calendar
 * describing the same instant as "beyond rescue": the calendar gives up
 * CRON_DELIVERY_WINDOW_HOURS - CRON_LEAD_HOURS after the slot, the hour a cron belongs to sits
 * exactly CRON_LEAD_HOURS before its slot, so window-from-the-hour lands on the calendar's
 * boundary exactly, for any CRON_MINUTE. Anchoring on the firing instead would put the two a head
 * start apart and let one still be waiting while the other had already stopped being able to open
 * the room.
 *
 * The sign carries the head start: a punctual delivery on the current CRON_MINUTE reads -5,
 * meaning it arrived five minutes before the hour it is for. Under a CRON_MINUTE inside its own
 * hour the same field reads positive on a punctual run instead.
 */
export type CronDelivery =
  /** The cron names this meeting and arrived inside the delivery window. */
  | { outcome: "meeting"; phase: ScheduledPhase; latenessMinutes: number }
  /**
   * The cron arrived so late that it can no longer be attributed with confidence, or the hour
   * it names has no Prague slot — the inactive daylight-saving variant of a cron. Neither is a
   * meeting that failed to happen.
   */
  | { outcome: "no-meeting"; reason: "unparseable" | "no-slot" }
  /**
   * The cron names this meeting but was delivered past the window. The room can no longer be
   * opened, and the slot is owed a stated reason rather than silence.
   */
  | { outcome: "beyond-window"; phase: ScheduledPhase; latenessMinutes: number };

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
 * could have triggered it. CRON_DELIVERY_WINDOW_HOURS is the sanity bound.
 *
 * "Names the meeting" means through cronSlotHour, not by reading the hour field. The crons fire at
 * CRON_MINUTE of the hour before the one they serve, so the literal hour in `55 2 * * *` is 2 and
 * the hour it belongs to is 3. Taking the literal would hand every firing the previous slot, and
 * would do it without a single test going red: cronPayloads writes the cron from the same registry
 * this reads back, so a missing carry moves both sides together and the suite agrees with the
 * mistake. Which meeting a cron belongs to is decided in exactly one place, and this is not it.
 *
 * The three outcomes are kept apart because the caller has to write a different thing for each:
 * a run that opens the room, a skip that names the slot it lost, and nothing at all for a
 * firing that never had a meeting behind it.
 */
export function resolveCronDelivery(cron: string, at: Date): CronDelivery {
  const firing = parseCronFiring(cron);
  if (!firing) return { outcome: "no-meeting", reason: "unparseable" };
  const nowUtcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes();
  let firedHour: number | null = null;
  let smallestElapsed = Number.POSITIVE_INFINITY;
  for (const hour of firing.hours) {
    const elapsed = (nowUtcMinutes - (hour * 60 + firing.minute) + 1_440) % 1_440;
    if (elapsed < smallestElapsed) {
      smallestElapsed = elapsed;
      firedHour = hour;
    }
  }
  if (firedHour === null) return { outcome: "no-meeting", reason: "unparseable" };
  // Both of the transformations cronPayloads applied when it wrote the cron are undone here: the
  // carry into the hour the firing belongs to, then the lead onto the Prague slot.
  const pragueHour =
    (cronSlotHour(firedHour, firing.minute) + pragueUtcOffsetHours(at) + CRON_LEAD_HOURS) % 24;
  const phase = MEETING_CLOCK.find((slot) => slot.hour === pragueHour)?.phase;
  if (!phase) return { outcome: "no-meeting", reason: "no-slot" };
  const latenessMinutes = smallestElapsed - cronHeadStartMinutes(firing.minute);
  return latenessMinutes > CRON_DELIVERY_WINDOW_HOURS * 60
    ? { outcome: "beyond-window", phase, latenessMinutes }
    : { outcome: "meeting", phase, latenessMinutes };
}

/** The meeting a cron fired for, or null when no room can be opened for that firing. */
export function resolveCronPhase(cron: string, at: Date): ScheduledPhase | null {
  const delivery = resolveCronDelivery(cron, at);
  return delivery.outcome === "meeting" ? delivery.phase : null;
}

/**
 * The Prague hour the edition slot gets a second dispatch at, and why it is not a meeting.
 *
 * Every delivered edition except 6 August needed a second run, and every second run that ran
 * succeeded — the first attempt was losing to a source gate, a reserve refusal or a transient
 * provider failure, all of which pass an hour later. So the 05:00 slot gets one more firing the
 * same morning.
 *
 * It is deliberately not a slot on MEETING_CLOCK. A slot is a meeting: it owns a Prague hour, it
 * owes the calendar a record, and resolveScheduledPhase below has to be able to name exactly one
 * phase for an hour — 09:00 already belongs to the story meeting. This is a second attempt at a
 * slot that already exists, so it lives in the dispatch layer only: the punctual Vercel route
 * fires it, the run reaches hasDeliveredPublishedEdition, and a morning that already published
 * costs $0 and writes nothing.
 */
export const EDITION_RETRY_HOUR = 9;

export const EDITION_RETRY_PHASE = "cu-edition" as const;

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
): phase is "tt-marketing" | "mma-intake" | "mma-analysis" | "mag-editorial" | "mag-desk" {
  return phase === "tt-marketing" || phase === "mma-intake" || phase === "mma-analysis" || phase === "mag-editorial" || phase === "mag-desk";
}
