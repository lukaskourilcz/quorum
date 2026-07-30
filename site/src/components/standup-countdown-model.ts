export const STANDUP_TIME_ZONE = "Europe/Prague";

export const STANDUP_SCHEDULE = [
  {
    hour: 7,
    label: "AM council",
    minute: 30,
    phase: "am"
  },
  {
    hour: 19,
    label: "PM council",
    minute: 30,
    phase: "pm"
  }
] as const;

export interface StandupOccurrence {
  iso: string;
  label: (typeof STANDUP_SCHEDULE)[number]["label"];
  phase: (typeof STANDUP_SCHEDULE)[number]["phase"];
}

export interface StandupCountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMilliseconds: number;
}

interface ZonedDateParts {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  year: number;
}

const zonedPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "2-digit",
  second: "2-digit",
  timeZone: STANDUP_TIME_ZONE,
  year: "numeric"
});

const standupLabelFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "short",
  timeZone: STANDUP_TIME_ZONE,
  year: "numeric"
});

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) {
  const part = parts.find((candidate) => candidate.type === type);
  if (!part) {
    throw new Error(`Missing ${type} in Prague date formatter`);
  }
  return part.value;
}

function getZonedDateParts(date: Date): ZonedDateParts {
  const parts = zonedPartsFormatter.formatToParts(date);

  return {
    day: Number(getPart(parts, "day")),
    hour: Number(getPart(parts, "hour")),
    minute: Number(getPart(parts, "minute")),
    month: Number(getPart(parts, "month")),
    second: Number(getPart(parts, "second")),
    year: Number(getPart(parts, "year"))
  };
}

function localPragueTimeToUtc(
  date: Pick<ZonedDateParts, "day" | "month" | "year">,
  hour: number,
  minute: number
) {
  const wallClock = Date.UTC(
    date.year,
    date.month - 1,
    date.day,
    hour,
    minute
  );
  let candidate = wallClock;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const candidateParts = getZonedDateParts(new Date(candidate));
    const candidateAsWallClock = Date.UTC(
      candidateParts.year,
      candidateParts.month - 1,
      candidateParts.day,
      candidateParts.hour,
      candidateParts.minute,
      candidateParts.second
    );
    candidate = wallClock - (candidateAsWallClock - candidate);
  }

  return new Date(candidate);
}

function nextCivilDate(
  date: Pick<ZonedDateParts, "day" | "month" | "year">
) {
  const nextDate = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  return {
    day: nextDate.getUTCDate(),
    month: nextDate.getUTCMonth() + 1,
    year: nextDate.getUTCFullYear()
  };
}

export function getNextStandup(now: Date): StandupOccurrence {
  const localDate = getZonedDateParts(now);

  for (const slot of STANDUP_SCHEDULE) {
    const target = localPragueTimeToUtc(
      localDate,
      slot.hour,
      slot.minute
    );
    if (target.getTime() >= now.getTime()) {
      return {
        iso: target.toISOString(),
        label: slot.label,
        phase: slot.phase
      };
    }
  }

  const tomorrow = nextCivilDate(localDate);
  const firstSlot = STANDUP_SCHEDULE[0];
  const target = localPragueTimeToUtc(
    tomorrow,
    firstSlot.hour,
    firstSlot.minute
  );

  return {
    iso: target.toISOString(),
    label: firstSlot.label,
    phase: firstSlot.phase
  };
}

export function getStandupCountdown(
  occurrence: StandupOccurrence,
  now: Date
): StandupCountdownParts {
  const totalMilliseconds = Math.max(
    0,
    new Date(occurrence.iso).getTime() - now.getTime()
  );
  const totalSeconds = Math.floor(totalMilliseconds / 1_000);

  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    totalMilliseconds
  };
}

export function formatStandupOccurrence(occurrence: StandupOccurrence) {
  const parts = standupLabelFormatter.formatToParts(
    new Date(occurrence.iso)
  );

  return `${getPart(parts, "month")} ${getPart(parts, "day")}, ${getPart(parts, "year")} · ${getPart(parts, "hour")}:${getPart(parts, "minute")} · Prague`;
}
