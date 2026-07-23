import { describe, expect, it } from "vitest";
import type { Evidence } from "../src/research/evidence.js";
import {
  deduplicateEvidence,
  summarizeEvidence
} from "../src/research/evidence.js";
import {
  evaluateOpportunity,
  type Opportunity
} from "../src/research/opportunities.js";

const baseOpportunity: Opportunity = {
  id: "OPP-001",
  title: "Evidence-backed test",
  fixture: false,
  dimensions: {
    audienceReachability: 4,
    problemFrequencySeverity: 4,
    evidenceQualityIndependence: 4,
    willingnessToPay: 3,
    distributionChannel: 4,
    competitiveGap: 3,
    webFeasibility: 5,
    longTermMoat: 3,
    legalDataFeasibility: 4,
    firstMonetizationExperiment: 3
  },
  reachableChannelDefined: true,
  firstExperimentDefined: true
};

function evidence(
  id: string,
  host: string,
  direct = false,
  fixture = false
): Evidence {
  return {
    id,
    ts: "2026-07-23T00:00:00.000Z",
    sourceUrl: `https://${host}/signal/${id}`,
    sourceType: "interview",
    claim: `Problem signal ${id}`,
    quoteOrSignal: "Attributed and bounded signal.",
    capturedAt: "2026-07-23T00:00:00.000Z",
    confidence: fixture ? 0 : 0.8,
    opportunityId: "OPP-001",
    direct,
    fixture
  };
}

describe("evidence and opportunity gate", () => {
  it("requires three independent real sources and one direct signal", () => {
    const entries = [
      evidence("E-001", "one.example", true),
      evidence("E-002", "two.example"),
      evidence("E-003", "three.example")
    ];
    const result = evaluateOpportunity(baseOpportunity, entries);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(37);
    expect(result.independentEvidenceCount).toBe(3);
  });

  it("never counts fixtures as founding evidence", () => {
    const entries = [
      evidence("FIX-E-001", "one.example", true, true),
      evidence("FIX-E-002", "two.example", false, true),
      evidence("FIX-E-003", "three.example", false, true)
    ];
    const result = evaluateOpportunity(baseOpportunity, entries);
    expect(result.outcome).toBe("INSUFFICIENT_EVIDENCE");
    expect(result.evidenceRefs).toEqual([]);
  });

  it("deduplicates canonical source and claim pairs", () => {
    const first = evidence("E-001", "one.example");
    const duplicate = {
      ...first,
      id: "E-002",
      sourceUrl: `${first.sourceUrl}?utm_source=test`
    };
    expect(deduplicateEvidence([first, duplicate])).toHaveLength(1);
    expect(summarizeEvidence([first, duplicate], "OPP-001").eligible).toBe(1);
  });
});
