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

describe("independence cannot be manufactured by the author", () => {
  const declaring = (id: string, host: string, independenceKey?: string, direct = false): Evidence => ({
    ...evidence(id, host, direct),
    ...(independenceKey === undefined ? {} : { independenceKey })
  });

  it("counts one publisher once, whatever independenceKey claims", () => {
    // The gate's whole purpose is that three mirrors of one story cannot found a venture.
    // independenceKey used to be returned verbatim, so three arbitrary strings on one host
    // read as three independent sources. Now the host decides.
    const sameHost = [
      declaring("E-1", "example.com", "alpha", true),
      declaring("E-2", "example.com", "beta"),
      declaring("E-3", "example.com", "gamma")
    ];
    expect(summarizeEvidence(sameHost, "OPP-001").independent).toBe(1);
    expect(evaluateOpportunity(baseOpportunity, sameHost).passed).toBe(false);
    expect(evaluateOpportunity(baseOpportunity, sameHost).reasons)
      .toContain("Fewer than three independent eligible evidence sources.");
  });

  it("still passes on three genuinely different publishers", () => {
    const distinct = [
      declaring("E-1", "alpha.com", undefined, true),
      declaring("E-2", "beta.org"),
      declaring("E-3", "gamma.net")
    ];
    expect(summarizeEvidence(distinct, "OPP-001").independent).toBe(3);
    expect(evaluateOpportunity(baseOpportunity, distinct).passed).toBe(true);
  });

  it("lets independenceKey merge hosts that share an owner, but never split one", () => {
    // Narrowing is the one legitimate use: a syndication network or a rebrand.
    const syndicated = [
      declaring("E-1", "alpha.com", "wire-network", true),
      declaring("E-2", "beta.org", "wire-network"),
      declaring("E-3", "gamma.net")
    ];
    expect(summarizeEvidence(syndicated, "OPP-001").independent).toBe(2);
    expect(evaluateOpportunity(baseOpportunity, syndicated).passed).toBe(false);
  });

  it("resolves conflicting declarations for one host deterministically", () => {
    const forward = [declaring("E-1", "alpha.com", "zulu", true), declaring("E-2", "alpha.com", "alpha-owner")];
    const reversed = [...forward].reverse();
    expect(summarizeEvidence(forward, "OPP-001").independent)
      .toBe(summarizeEvidence(reversed, "OPP-001").independent);
    expect(summarizeEvidence(forward, "OPP-001").independent).toBe(1);
  });

  it("treats www and casing as the same publisher", () => {
    const entries = [
      { ...evidence("E-1", "example.com", true), sourceUrl: "https://WWW.Example.com/a" },
      { ...evidence("E-2", "example.com"), sourceUrl: "https://example.com/b" },
      declaring("E-3", "other.com")
    ];
    expect(summarizeEvidence(entries, "OPP-001").independent).toBe(2);
  });
});
