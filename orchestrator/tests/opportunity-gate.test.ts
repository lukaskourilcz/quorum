import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_GATE_DORMANT,
  evaluateOpportunity,
  opportunityGateIsLive,
  selectOpportunity,
  type Opportunity
} from "../src/research/opportunities.js";
import type { Evidence } from "../src/research/evidence.js";

const dimensions = (value: number): Opportunity["dimensions"] => ({
  audienceReachability: value,
  problemFrequencySeverity: value,
  evidenceQualityIndependence: value,
  willingnessToPay: value,
  distributionChannel: value,
  competitiveGap: value,
  webFeasibility: value,
  longTermMoat: value,
  legalDataFeasibility: value,
  firstMonetizationExperiment: value
});

function opportunity(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "OPP-001",
    title: "Release-evidence notebook",
    fixture: false,
    dimensions: dimensions(4),
    reachableChannelDefined: true,
    firstExperimentDefined: true,
    ...over
  };
}

const evidence: Evidence[] = [];

describe("the opportunity gate when nothing live is on file", () => {
  it("goes dormant on a fixture-only file instead of publishing a daily rejection", () => {
    // Fifteen board shifts published the same seven reasons about candidates nobody proposed.
    // A gate with no live candidate has not rejected anything; it was not asked a question.
    const gate = selectOpportunity([opportunity({ id: "FIX-OPP-001", fixture: true })], evidence);
    expect(gate.reasons).toEqual([OPPORTUNITY_GATE_DORMANT]);
    expect(gate.passed).toBe(false);
    expect(gate.opportunityId).toBe("NONE");
  });

  it("goes dormant on an empty file for the same reason", () => {
    expect(selectOpportunity([], evidence).reasons).toEqual([OPPORTUNITY_GATE_DORMANT]);
  });

  it("knows a live record when it sees one", () => {
    expect(opportunityGateIsLive([opportunity({ fixture: true })])).toBe(false);
    expect(opportunityGateIsLive([opportunity({ fixture: true }), opportunity()])).toBe(true);
  });
});

describe("the opportunity gate with a live record", () => {
  it("ranks exactly as it did before once anything live is on file", () => {
    const live = opportunity();
    const fixture = opportunity({ id: "FIX-OPP-001", fixture: true });
    // Unchanged on purpose. The ranking is `passed`, then score, then id — so when neither
    // candidate passes and both score the same, `FIX-OPP-001` still sorts ahead of `OPP-001` and
    // is the record the gate reports on. That is today's behaviour and this issue was scoped to
    // leave it bit-identical; it is worth knowing about the day a real opportunity lands beside a
    // fixture, which is why it is written down here rather than discovered then.
    expect(selectOpportunity([fixture, live], evidence)).toEqual(evaluateOpportunity(fixture, evidence));

    // A live record that outscores the fixtures wins, as it always did.
    const strong = opportunity({ id: "OPP-003", dimensions: dimensions(5) });
    expect(selectOpportunity([fixture, strong], evidence)).toEqual(evaluateOpportunity(strong, evidence));
  });

  it("keeps refusing a live record that fails the threshold, with its real reasons", () => {
    const weak = opportunity({ id: "OPP-002", dimensions: dimensions(1) });
    const gate = selectOpportunity([weak], evidence);
    expect(gate.passed).toBe(false);
    expect(gate.reasons).not.toContain(OPPORTUNITY_GATE_DORMANT);
    expect(gate.reasons.join(" ")).toContain("below the 35/50 gate");
    expect(gate.reasons.join(" ")).toContain("independent eligible evidence");
  });
});
