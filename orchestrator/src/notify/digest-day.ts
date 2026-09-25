import { previousPragueDate } from "../cycle/ledger.js";
import { pragueClockParts } from "../meetings/clock.js";

export interface DigestDay {
  /** The Prague day the digest summarises. */
  date: string;
  /** The month the caps are read against: the run's own, whichever day is digested. */
  month: string;
}

/**
 * Which day a digest run is about, which is no longer the day it runs on.
 *
 * `operations-2026-08c` retired the night shift and moved its duties into the 06:00 morning, which
 * reconciles a day that has finished. A morning digesting its own date would summarise six hours,
 * so the workflow passes `--previous-day`; `--date` stays for a hand-run replay.
 *
 * The month is the run's own on purpose. Everything downstream of it is about the present: the
 * headroom the schedule is resolved with, and `sendBudgetAlert`, which writes the office mode. On
 * the first of a month the digested day is still in the closed month, and a month that ended
 * exhausted would have shut the office on the first morning of the next one.
 *
 * Ported from 90f175c0 (`claude/elegant-cori-h9cdgb`), where this lived inline in the CLI.
 */
export function resolveDigestDay(args: readonly string[], now: Date): DigestDay {
  const today = pragueClockParts(now).date;
  const flag = args.indexOf("--date");
  const named = flag >= 0 ? args[flag + 1] : undefined;
  return {
    date: args.includes("--previous-day") ? previousPragueDate(today) : named ?? today,
    month: today.slice(0, 7)
  };
}
