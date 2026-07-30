import type { PublicStandup, RoomTranscript } from "@/data/fixtures";

export const BOARDROOM_TIME_ZONE = "Europe/Prague";

export interface RoomTurnTiming {
  iso: string;
  source: "recorded" | "fixture-sequence";
}

const dateTimeFormatter = new Intl.DateTimeFormat("en", {
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
  minute: "2-digit",
  month: "short",
  second: "2-digit",
  timeZone: BOARDROOM_TIME_ZONE,
  year: "numeric"
});

function dateTimeParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    dateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

export function formatRoomDate(value: string) {
  const parts = dateTimeParts(value);
  if (!parts) return "Unknown date";
  return `${parts.month} ${parts.day}, ${parts.year}`;
}

export function formatRoomClock(value: string) {
  const parts = dateTimeParts(value);
  if (!parts) return "Unknown time";
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

export function formatRoomDateTime(value: string) {
  const date = formatRoomDate(value);
  const time = formatRoomClock(value);
  if (date === "Unknown date" || time === "Unknown time") {
    return "Unknown date and time";
  }
  return `${date} · ${time} · ${BOARDROOM_TIME_ZONE}`;
}

export function roomIdForStandup(
  standup: Pick<PublicStandup, "date" | "phase">
) {
  return `ROOM-${standup.date.replaceAll("-", "")}-${standup.phase.toUpperCase()}`;
}

export function resolveRoomTurnTiming(
  transcript: RoomTranscript,
  turnIndex: number
): RoomTurnTiming {
  const turn = transcript.turns[turnIndex] as
    | (RoomTranscript["turns"][number] & { sentAt?: string })
    | undefined;
  const explicitTime = turn?.sentAt;
  if (
    explicitTime &&
    !Number.isNaN(new Date(explicitTime).getTime())
  ) {
    return { iso: new Date(explicitTime).toISOString(), source: "recorded" };
  }

  const openedAt = new Date(transcript.openedAt).getTime();
  const closedAt = new Date(transcript.closedAt).getTime();
  if (Number.isNaN(openedAt) || Number.isNaN(closedAt)) {
    return {
      iso: new Date(0).toISOString(),
      source: "fixture-sequence"
    };
  }

  const boundedIndex = Math.min(
    Math.max(0, turnIndex),
    Math.max(0, transcript.turns.length - 1)
  );
  const intervalCount = Math.max(1, transcript.turns.length - 1);
  const roomDuration = Math.max(0, closedAt - openedAt);
  const offset = Math.round((roomDuration * boundedIndex) / intervalCount);

  return {
    iso: new Date(openedAt + offset).toISOString(),
    source: "fixture-sequence"
  };
}

export function sortBoardroomsNewestFirst(
  records: readonly PublicStandup[]
) {
  return [...records].sort(
    (left, right) =>
      new Date(right.roomTranscript.openedAt).getTime() -
      new Date(left.roomTranscript.openedAt).getTime()
  );
}
