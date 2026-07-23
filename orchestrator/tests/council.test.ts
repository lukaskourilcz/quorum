import { describe, expect, it } from "vitest";
import {
  ProposalSchema,
  validateProposalEvidence,
  VoteSchema
} from "../src/council.js";

const validProposal = {
  agent: "PULSE",
  proposal: "Run a bounded offer test.",
  why: "It measures intent.",
  stage: "VALIDATION",
  kpi: "pulse.monetization_intent",
  evidenceRefs: ["E-001", "E-002"],
  hypothesis: "Qualified visitors will request the offer.",
  expectedMetricDelta: {
    metric: "monetizationIntentCount",
    from: 0,
    to: 2,
    byCycle: 8
  },
  confidence: 0.6,
  reviewCycle: 8,
  stopCondition: "No requests after 100 qualified visits",
  estimatedCostUsd: 0,
  tasks: [
    {
      title: "Publish the bounded offer",
      type: "experiment",
      effort: "S",
      experimentId: "EXP-001"
    }
  ],
  risk: "Small sample"
};

describe("council schemas", () => {
  it("requires complete typed task contracts", () => {
    expect(() =>
      ProposalSchema.parse({
        ...validProposal,
        tasks: [
          {
            title: "Buy analytics",
            type: "spend",
            effort: "S",
            experimentId: "EXP-001"
          }
        ]
      })
    ).toThrowError(/requires spend/);
  });

  it("rejects unknown evidence references separately from JSON shape", () => {
    const proposal = ProposalSchema.parse(validProposal);
    expect(
      validateProposalEvidence(proposal, new Set(["E-001"]))
    ).toEqual(["E-002"]);
  });

  it("allows only AUDIT to veto and requires all five candidates", () => {
    expect(() =>
      VoteSchema.parse({
        agent: "VIZE",
        ranking: ["P1", "P2", "P3", "P4", "NO_ACTION"],
        veto: { target: "P2", rule: "2.2.4", reason: "Banned niche" },
        note: ""
      })
    ).toThrowError(/Only AUDIT/);
    expect(() =>
      VoteSchema.parse({
        agent: "AUDIT",
        ranking: ["P1", "P1", "P3", "P4", "NO_ACTION"],
        veto: null,
        note: ""
      })
    ).toThrowError(/every candidate/);
  });
});

