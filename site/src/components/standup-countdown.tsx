"use client";

import { useEffect, useState } from "react";
import {
  formatStandupOccurrence,
  getNextStandup,
  getStandupCountdown,
  type StandupCountdownParts,
  type StandupOccurrence
} from "@/components/standup-countdown-model";

interface CountdownSnapshot {
  countdown: StandupCountdownParts;
  occurrence: StandupOccurrence;
}

const countdownUnits = [
  ["days", "days"],
  ["hours", "hours"],
  ["minutes", "minutes"],
  ["seconds", "seconds"]
] as const;

function createSnapshot(now: Date): CountdownSnapshot {
  const occurrence = getNextStandup(now);
  return {
    countdown: getStandupCountdown(occurrence, now),
    occurrence
  };
}

function formatCounterValue(value: number) {
  return String(value).padStart(2, "0");
}

export function StandupCountdown() {
  const [snapshot, setSnapshot] = useState<CountdownSnapshot | null>(null);

  useEffect(() => {
    const update = () => setSnapshot(createSnapshot(new Date()));
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const accessibleLabel = snapshot
    ? `Next shift starts ${formatStandupOccurrence(snapshot.occurrence)}. Starts in ${snapshot.countdown.days} days, ${snapshot.countdown.hours} hours, ${snapshot.countdown.minutes} minutes and ${snapshot.countdown.seconds} seconds.`
    : "Loading the next scheduled shift.";

  return (
    <div className="flex w-full flex-wrap items-end gap-x-8 gap-y-4 border-l-2 border-[var(--accent)] pl-4 md:pl-5 xl:w-auto xl:shrink-0 xl:justify-end">
      <div className="min-w-52">
        <p className="mono-label text-[0.65625rem] text-[var(--accent)]">
          Next shift starts in
        </p>
        {snapshot ? (
          <time
            className="mt-1.5 block text-sm leading-6 text-[var(--mist)]"
            dateTime={snapshot.occurrence.iso}
          >
            {formatStandupOccurrence(snapshot.occurrence)}
          </time>
        ) : (
          <p
            aria-hidden="true"
            className="mt-1.5 text-sm leading-6 text-[var(--mist)]"
          >
            &nbsp;
          </p>
        )}
      </div>

      <div
        aria-label={accessibleLabel}
        aria-live="off"
        className="grid grid-cols-4 gap-3 sm:gap-5"
        role="timer"
      >
        {countdownUnits.map(([key, label]) => (
          <span className="min-w-12" key={key}>
            <span className="block font-mono text-2xl font-semibold leading-none tracking-[-0.04em] text-[var(--foreground)] tabular-nums md:text-3xl">
              {snapshot
                ? formatCounterValue(snapshot.countdown[key])
                : "--"}
            </span>
            <span className="mt-1.5 block font-mono text-[0.5625rem] uppercase tracking-[0.1em] text-[var(--fog)]">
              {label}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
