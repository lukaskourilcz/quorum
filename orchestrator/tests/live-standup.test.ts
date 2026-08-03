import { describe, expect, it } from "vitest";
import { RoomPacketSchema } from "../src/boardroom/room.js";
import { createLiveStandup, type RecordedPosition } from "../src/standup/live.js";

const room = RoomPacketSchema.parse({
  roomId: "ROOM-20260731-MORNING",
  topicType: "council",
  objective: "Review a bounded internal work item",
  owner: "VIZE",
  evidenceRefs: [],
  decisionNeeded: "NO_ACTION",
  riskTags: [],
  budgetImpactUsd: 0.03,
  selectedParticipants: [
    "VIZE",
    "FORGE",
    "PULSE",
    "AUDIT",
    "LEDGER"
  ].map((agent) => ({
    agent,
    reason: "required for the shift",
    mandatoryRule: "daily-standup"
  })),
  skippedParticipants: [],
  maxRounds: 2,
  maxTurns: 6,
  maxTotalTokens: 12000,
  expiresAt: "2026-07-31T04:30:00.000Z"
});

function positions(audit: "approve" | "hold" = "approve"): RecordedPosition[] {
  return ["VIZE", "FORGE", "PULSE", "AUDIT"].map((agent, index) => ({
    agent: agent as RecordedPosition["agent"],
    publicSummary: `${agent} recorded a bounded public position.`,
    recommendation: agent === "AUDIT" ? audit : "approve",
    risk: "Keep the work inside the internal operating queue.",
    meetingRequest: null,
    sentAt: new Date(
      Date.parse("2026-07-31T04:00:00.000Z") + index * 1_000
    ).toISOString()
  }));
}

function liveStandup(audit: "approve" | "hold" = "approve") {
  return createLiveStandup({
    cycleId: "20260731040000-morning",
    phase: "morning",
    stage: "DISCOVERY",
    room,
    estimatedCycleUsd: 0.03,
    now: new Date("2026-07-31T04:00:00.000Z"),
    council: {
      item: {
        id: "OPS-OBSERVE",
        phase: "morning",
        owner: "FORGE",
        title: "Verify the public shift record",
        summary: "Check that the latest committed shift record is complete."
      },
      positions: positions(audit),
      droppedSeats: [],
      scope: "Internal only.",
      actualCycleUsd: 0.0123,
      monthCapUsd: 30,
    monthAllInUsd: 0.0123
    }
  });
}

describe("live shift standup", () => {
  it("preserves all four recorded council timestamps in a public transcript", () => {
    const standup = liveStandup();

    expect(standup.fixture).toBe(false);
    expect(standup.status).toBe("PLAN");
    expect(standup.roomTranscript.turns).toHaveLength(7);
    expect(standup.roomTranscript.turns.slice(2, 6).map((turn) => turn.sentAt)).toEqual(
      positions().map((position) => position.sentAt)
    );
    expect(standup.ledger.actualCycleUsd).toBe(0.0123);
  });

  it("holds the item when AUDIT does not approve it", () => {
    const standup = liveStandup("hold");

    expect(standup.status).toBe("NO_ACTION");
    expect(standup.tasks[0]?.status).toBe("blocked");
    expect(standup.voteMatrix.find((vote) => vote.voter === "AUDIT")?.veto).toBe(true);
  });

  it("records SPARK's single pre-checked morning handoff", () => {
    const standup = createLiveStandup({
      cycleId: "20260731040000-morning",
      phase: "morning",
      stage: "DISCOVERY",
      room,
      estimatedCycleUsd: 0.04,
      now: new Date("2026-07-31T04:00:00.000Z"),
      council: {
        item: {
          id: "OPS-OBSERVE",
          phase: "morning",
          owner: "FORGE",
          title: "Verify the public shift record",
          summary: "Check that the latest committed shift record is complete."
        },
        positions: positions(),
        droppedSeats: [],
        scope: "Internal only.",
        actualCycleUsd: 0.0123,
        monthCapUsd: 30,
    monthAllInUsd: 0.0123
      },
      caughtUpIdea: {
        entry: {
          schemaVersion: "idea-ledger/1",
          id: "idea-2026-07-31-a3f9",
          fingerprint: `sha256:${"a".repeat(64)}`,
          title: "Reader source-confidence cue",
          summary: "Show source independence beside each edition.",
          origin: { agent: "SPARK", meetingRef: "standups/2026-07-31-morning" },
          status: "proposed",
          statusHistory: [{
            status: "proposed",
            at: "2026-07-31T04:00:00.000Z",
            meetingRef: "standups/2026-07-31-morning",
            reason: "VAULT novel: no comparable idea."
          }],
          similarTo: []
        },
        verdict: "novel",
        reason: "No comparable idea.",
        modelCalled: true,
        autoRejected: false,
        comparedIds: []
      }
    });
    expect(standup.caughtUpIdeaRef).toBe("idea-2026-07-31-a3f9");
    expect(standup.proposals.filter((proposal) => proposal.agent === "SPARK")).toHaveLength(1);
    expect(standup.roomTranscript.turns.some((turn) => turn.agent === "SPARK")).toBe(true);
  });
});
