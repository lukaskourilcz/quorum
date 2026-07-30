import { describe, expect, it } from "vitest";
import type { RoomTranscript } from "../data/fixtures";
import {
  buildReplayMomentUrl,
  buildReplayPlaylist,
  clearReplayMomentUrl,
  findPlaylistTurnAtOrAfter,
  normalizeTurnIndexes,
  parseReplayMoment
} from "./decision-replay-model";

const transcript = {
  openedAt: "2026-07-23T05:28:00.000Z",
  closedAt: "2026-07-23T05:30:00.000Z",
  gavel: "VIZE",
  setting: "Fixture",
  turns: [
    { agent: "VIZE", mode: "gavel", text: "Open." },
    {
      agent: "FORGE",
      addressedTo: "AUDIT",
      mode: "response",
      text: "Reply."
    },
    { agent: "AUDIT", mode: "veto", text: "Hold." },
    { agent: "VIZE", mode: "close", text: "Closed." }
  ]
} satisfies RoomTranscript;

describe("Decision Replay model", () => {
  it("normalizes custom cuts into unique valid turns", () => {
    expect(normalizeTurnIndexes(4, [3, 1, 1, -1, 7])).toEqual([1, 3]);
    expect(normalizeTurnIndexes(3)).toEqual([0, 1, 2]);
  });

  it("keeps a followed seat's statements and addressed exchanges", () => {
    expect(
      buildReplayPlaylist({
        followedAgent: "AUDIT",
        transcript,
        turnIndexes: [0, 1, 2, 3]
      })
    ).toEqual([1, 2]);
  });

  it("finds the next available turn for a chapter jump", () => {
    expect(findPlaylistTurnAtOrAfter([0, 4, 7, 11], 5)).toBe(7);
    expect(findPlaylistTurnAtOrAfter([0, 4, 7, 11], 12)).toBe(11);
  });

  it("parses only valid shareable moments", () => {
    expect(
      parseReplayMoment({
        agentIds: new Set(["VIZE", "AUDIT"]),
        cutIds: new Set(["full", "evidence"]),
        search: "?turn=3&cut=evidence&seat=AUDIT",
        turnCount: 4
      })
    ).toEqual({
      turnIndex: 2,
      cutId: "evidence",
      followedAgent: "AUDIT"
    });
    expect(
      parseReplayMoment({
        agentIds: new Set(["VIZE"]),
        cutIds: new Set(["full"]),
        search: "?turn=9",
        turnCount: 4
      })
    ).toBeNull();
  });

  it("builds and clears exact-moment URLs", () => {
    const shared = buildReplayMomentUrl(
      "https://example.com/standups/day/room?ref=home",
      {
        turnIndex: 2,
        cutId: "evidence",
        followedAgent: "AUDIT"
      }
    );
    expect(shared).toBe(
      "https://example.com/standups/day/room?ref=home&turn=3&cut=evidence&seat=AUDIT#decision-replay"
    );
    expect(clearReplayMomentUrl(shared)).toBe(
      "https://example.com/standups/day/room?ref=home"
    );
  });
});
