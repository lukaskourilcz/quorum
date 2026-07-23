import { describe, expect, it, vi } from "vitest";
import {
  anonymizeProposals,
  chairForMeeting,
  resolveConsensus,
  scoreBorda
} from "../src/consensus.js";
import {
  ProposalSchema,
  VoteSchema,
  type CandidateId,
  type Proposal
} from "../src/council.js";
import type { CouncilAgent } from "../src/types.js";

const council: CouncilAgent[] = ["VIZE", "FORGE", "PULSE", "AUDIT"];

function proposal(agent: CouncilAgent): Proposal {
  return ProposalSchema.parse({
    agent,
    proposal: `${agent} bounded test`,
    why: "It creates a measurable learning.",
    stage: "DISCOVERY",
    kpi: null,
    evidenceRefs: ["E-001"],
    hypothesis: "A measured action will reveal demand.",
    expectedMetricDelta: {
      metric: "qualifiedActionRate",
      from: 0,
      to: 0.05,
      byCycle: 8
    },
    confidence: 0.5,
    reviewCycle: 8,
    stopCondition: "No actions after 100 qualified visits",
    estimatedCostUsd: 0,
    tasks: [],
    risk: "Low evidence density"
  });
}

function vote(agent: CouncilAgent, ranking: CandidateId[]) {
  return VoteSchema.parse({ agent, ranking, veto: null, note: "" });
}

describe("council consensus", () => {
  it("anonymizes and seed-shuffles deterministically", () => {
    const first = anonymizeProposals(council.map(proposal), 42);
    const second = anonymizeProposals(council.map(proposal), 42);
    expect(first).toEqual(second);
    expect(first.map(({ author }) => author)).not.toEqual(council);
    expect(first[0]?.proposal).not.toHaveProperty("agent");
  });

  it("scores all five Borda candidates including NO_ACTION", () => {
    const scores = scoreBorda([
      vote("VIZE", ["NO_ACTION", "P1", "P2", "P3", "P4"]),
      vote("FORGE", ["NO_ACTION", "P2", "P1", "P4", "P3"]),
      vote("PULSE", ["P1", "NO_ACTION", "P2", "P3", "P4"]),
      vote("AUDIT", ["NO_ACTION", "P1", "P3", "P2", "P4"])
    ]);
    expect(scores.NO_ACTION).toBe(15);
    expect(scores.P4).toBeLessThan(scores.P1);
  });

  it("lets AUDIT veto and rechecks every promoted fallback", async () => {
    const anonymized = anonymizeProposals(council.map(proposal), 7);
    const votes = [
      vote("VIZE", ["P1", "P2", "P3", "P4", "NO_ACTION"]),
      vote("FORGE", ["P1", "P2", "P3", "P4", "NO_ACTION"]),
      vote("PULSE", ["P1", "P2", "P3", "P4", "NO_ACTION"]),
      VoteSchema.parse({
        agent: "AUDIT",
        ranking: ["P1", "P2", "P3", "P4", "NO_ACTION"],
        veto: { target: "P1", rule: "2.2.3", reason: "Unsupported claim" },
        note: ""
      })
    ];
    const keeper = vi.fn(async (candidate) => candidate.publicId === "P3");
    const result = await resolveConsensus({
      anonymized,
      votes,
      meetingNo: 0,
      keeperPasses: keeper
    });
    expect(result.vetoed).toContain("P1");
    expect(result.keeperRejected).toContain("P2");
    expect(result.winnerId).toBe("P3");
    expect(keeper).toHaveBeenCalledTimes(2);
  });

  it("uses the rotating chair only for a score tie", () => {
    expect(chairForMeeting(0)).toBe("VIZE");
    expect(chairForMeeting(1)).toBe("PULSE");
    expect(chairForMeeting(2)).toBe("FORGE");
    expect(chairForMeeting(3)).toBe("AUDIT");
  });
});

