import { describe, expect, it } from "vitest";
import { standups, type RoomTranscript } from "../data/fixtures";
import {
  formatRoomDateTime,
  resolveRoomTurnTiming,
  roomIdForStandup,
  sortBoardroomsNewestFirst
} from "./room-timeline";

describe("Boardroom timeline", () => {
  it("creates stable room IDs from date and phase", () => {
    expect(roomIdForStandup(standups[0]!)).toBe(
      "ROOM-20260723-FOUNDING"
    );
  });

  it("places fixture messages in order within the recorded room bounds", () => {
    const transcript = standups[0]!.roomTranscript;
    const timestamps = transcript.turns.map((_, index) =>
      resolveRoomTurnTiming(transcript, index)
    );

    expect(timestamps[0]).toEqual({
      iso: transcript.openedAt,
      source: "fixture-sequence"
    });
    expect(timestamps.at(-1)).toEqual({
      iso: transcript.closedAt,
      source: "fixture-sequence"
    });
    expect(
      timestamps.every(
        (timing, index) =>
          index === 0 ||
          new Date(timing.iso).getTime() >=
            new Date(timestamps[index - 1]!.iso).getTime()
      )
    ).toBe(true);
  });

  it("prefers an explicit future sentAt value", () => {
    const transcript: RoomTranscript & {
      turns: Array<
        RoomTranscript["turns"][number] & {
          sentAt: string;
        }
      >;
    } = {
      openedAt: "2026-07-23T05:28:00.000Z",
      closedAt: "2026-07-23T05:30:00.000Z",
      gavel: "VIZE",
      setting: "Fixture",
      turns: [
        {
          agent: "VIZE",
          mode: "gavel",
          sentAt: "2026-07-23T05:28:17.000Z",
          text: "Open."
        }
      ]
    };

    expect(resolveRoomTurnTiming(transcript, 0)).toEqual({
      iso: "2026-07-23T05:28:17.000Z",
      source: "recorded"
    });
  });

  it("formats an unambiguous Prague date and time", () => {
    expect(formatRoomDateTime("2026-07-23T05:28:00.000Z")).toBe(
      "Jul 23, 2026 · 07:28:00 Prague time"
    );
  });

  it("sorts rooms by their opening timestamp", () => {
    expect(sortBoardroomsNewestFirst(standups)[0]).toBe(standups[0]);
  });
});
