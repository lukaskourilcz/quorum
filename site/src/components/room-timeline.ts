import type { RoomTranscript } from "@/data/fixtures";
import { formatClock, formatDateTime } from "../lib/utils";

export interface RoomTurnTiming {
  iso: string;
  source: "recorded" | "fixture-sequence";
}

export function formatRoomClock(value: string) {
  const result = formatClock(value, true);
  return result === "Time unavailable" ? "Unknown time" : result;
}

export function formatRoomDateTime(value: string) {
  const result = formatDateTime(value, true);
  return result === "Date and time unavailable" ? "Unknown date and time" : result;
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
