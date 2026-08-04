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
    priorityProposal: null,
    sentAt: new Date(
      Date.parse("2026-07-31T04:00:00.000Z") + index * 1_000
    ).toISOString()
  }));
}

function liveStandup(
  audit: "approve" | "hold" = "approve",
  priorityProposal?: NonNullable<Parameters<typeof createLiveStandup>[0]["priorityProposal"]>
) {
  return createLiveStandup({
    cycleId: "20260731040000-morning",
    phase: "morning",
    stage: "DISCOVERY",
    room,
    estimatedCycleUsd: 0.03,
    now: new Date("2026-07-31T04:00:00.000Z"),
    ...(priorityProposal ? { priorityProposal } : {}),
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

describe("a proposed question on the public record", () => {
  const accepted = {
    proposedBy: "FORGE" as const,
    venture: "titty-tuesdays",
    question: "Which campaign format has never been tested against the season brief?",
    decisionAtStake: "Whether the next slot repeats a tested format or trials a new one.",
    outcome: "accepted" as const,
    reason: "FORGE proposed it at the 2026-07-31 morning board and the meeting carried.",
    priorityItemId: "priority-0123456789abcdef"
  };

  it("says nothing at all on a meeting where no seat proposed", () => {
    const standup = liveStandup();

    expect(standup.priorityProposal).toBeUndefined();
    expect(standup.proposals.map((entry) => entry.agent)).toEqual(["VIZE", "FORGE", "PULSE", "AUDIT"]);
  });

  it("reaches the record, the seat's line and the room transcript", () => {
    const standup = liveStandup("approve", accepted);

    // The structured field, for anything that reads the JSON.
    expect(standup.priorityProposal).toEqual(accepted);

    // proposals[] is what /standups/[date] renders, and roomTranscript is what
    // /standups/[date]/room renders. Both are generic over their contents, so a proposal put
    // through them is visible on the published pages without a site change.
    const line = standup.proposals.at(-1)!;
    expect(line.agent).toBe("FORGE");
    expect(line.summary).toContain("Which campaign format");
    expect(line.evidenceRefs).toEqual(["priority-0123456789abcdef"]);

    const turn = standup.roomTranscript.turns.find((entry) => entry.text.includes("Which campaign format"));
    expect(turn?.agent).toBe("FORGE");
    expect(turn?.text).toContain("It would settle:");
    expect(turn?.text).toContain("question list");
  });

  it("publishes a refusal as plainly as an acceptance", () => {
    const standup = liveStandup("approve", {
      ...accepted,
      outcome: "refused",
      reason: "The queue already holds priority-0123456789abcdef for titty-tuesdays at 0.91 wording overlap (why-not).",
      priorityItemId: null
    });

    expect(standup.priorityProposal?.outcome).toBe("refused");
    const turn = standup.roomTranscript.turns.find((entry) => entry.text.includes("Which campaign format"));
    expect(turn?.text).toContain("It was not added.");
    expect(turn?.text).toContain("wording overlap");
    // A refused proposal points at no queue item, so it cites none.
    expect(standup.proposals.at(-1)!.evidenceRefs).toEqual([]);
  });

  it("keeps the transcript inside its 24-turn contract with everything switched on", () => {
    const standup = liveStandup("approve", accepted);
    expect(standup.roomTranscript.turns.length).toBeLessThanOrEqual(24);
  });
});
