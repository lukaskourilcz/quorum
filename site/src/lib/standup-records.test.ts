import { describe, expect, it, vi } from "vitest";
import liveNightCheckpoint from "../../../state/standups/2026-08-01-night.json";

vi.mock("server-only", () => ({}));

import { parsePublicStandupRecord } from "./standup-records";

describe("public standup record boundary", () => {
  it("accepts a genuine idle checkpoint with no fabricated council vote", () => {
    expect(parsePublicStandupRecord(liveNightCheckpoint)).toMatchObject({
      id: "20260801201444-night",
      phase: "night",
      fixture: false,
      status: "NO_ACTION",
      proposals: [],
      voteMatrix: []
    });
  });

  it("rejects an empty active room", () => {
    const malformed = structuredClone(liveNightCheckpoint);
    malformed.status = "PLAN";
    expect(parsePublicStandupRecord(malformed)).toBeNull();
  });
});

describe("a meeting that happened is never discarded for its shape", () => {
  it("keeps a live standup whose room produced three proposals and two votes", () => {
    // The 3 August morning board met, six seats spoke and it cost $0.0249, but the parser
    // demanded exactly four proposals and four votes and threw the record away, so the
    // calendar rendered the slot as "Did not happen". StandupSchema puts no length on
    // either array, so the site was asserting a shape nothing promised.
    const record = liveStandupFixture({ proposals: 3, votes: 2 });
    const parsed = parsePublicStandupRecord(record);
    expect(parsed).not.toBeNull();
    expect(parsed!.proposals).toHaveLength(3);
    expect(parsed!.voteMatrix).toHaveLength(2);
  });

  it("still refuses a record that names no participant at all", () => {
    const record = liveStandupFixture({ proposals: 3, votes: 2 });
    expect(parsePublicStandupRecord({ ...record, participantReasons: [] })).toBeNull();
  });
});

function liveStandupFixture(input: { proposals: number; votes: number }) {
  const seats = ["VIZE", "FORGE", "PULSE", "AUDIT", "LEDGER"] as const;
  return {
    schemaVersion: 1,
    fixture: false,
    cycleId: "20260803083318-morning",
    date: "2026-08-03",
    phase: "morning",
    status: "NO_ACTION",
    stage: "VALIDATION",
    operatingBrief: "Four live council positions reviewed the morning shift internal work item.",
    participantReasons: seats.map((agent) => ({ agent, reason: "spoke in the room", participated: true })),
    ledger: { estimatedCycleUsd: 0.036254, actualCycleUsd: 0.024923, monthAllInUsd: 1.2287447, monthCapUsd: 30 },
    proposals: seats.slice(0, input.proposals).map((agent) => ({ agent, summary: "A bounded next step.", evidenceRefs: [] })),
    voteMatrix: seats.slice(0, input.votes).map((voter) => ({ voter, firstChoice: "A bounded next step.", veto: false })),
    decision: { outcome: "NO_ACTION", summary: "No externally consequential action was approved.", evidenceRefs: [] },
    tasks: [],
    growthPlan: "NO_POST — no public distribution event was recorded.",
    roomTranscript: {
      openedAt: "2026-08-03T08:33:18.686Z",
      closedAt: "2026-08-03T08:33:38.994Z",
      gavel: "VIZE",
      setting: "The morning shift opens on the bounded internal work item.",
      turns: [{ agent: "VIZE", mode: "gavel", sentAt: "2026-08-03T08:33:18.686Z", text: "The morning shift opens." }]
    },
    generatedAt: "2026-08-03T08:33:38.994Z"
  };
}

describe("a room claiming a decision must show the work", () => {
  it("rejects a PLAN with no proposal and no vote", () => {
    const record = { ...liveStandupFixture({ proposals: 0, votes: 0 }), status: "PLAN" };
    expect(parsePublicStandupRecord(record)).toBeNull();
  });

  it("accepts a PLAN that shows one proposal and one vote", () => {
    const record = { ...liveStandupFixture({ proposals: 1, votes: 1 }), status: "PLAN" };
    expect(parsePublicStandupRecord(record)).not.toBeNull();
  });
});
