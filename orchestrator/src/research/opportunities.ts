import { z } from "zod";
import { summarizeEvidence, type Evidence } from "./evidence.js";

export const OpportunityDimensionsSchema = z.object({
  audienceReachability: z.number().int().min(1).max(5),
  problemFrequencySeverity: z.number().int().min(1).max(5),
  evidenceQualityIndependence: z.number().int().min(1).max(5),
  willingnessToPay: z.number().int().min(1).max(5),
  distributionChannel: z.number().int().min(1).max(5),
  competitiveGap: z.number().int().min(1).max(5),
  webFeasibility: z.number().int().min(1).max(5),
  longTermMoat: z.number().int().min(1).max(5),
  legalDataFeasibility: z.number().int().min(1).max(5),
  firstMonetizationExperiment: z.number().int().min(1).max(5)
});

export const OpportunitySchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(160),
  fixture: z.boolean().default(false),
  dimensions: OpportunityDimensionsSchema,
  reachableChannelDefined: z.boolean(),
  firstExperimentDefined: z.boolean()
});
export type Opportunity = z.infer<typeof OpportunitySchema>;

export interface OpportunityGate {
  opportunityId: string;
  outcome: "SELECTED" | "REJECTED" | "INSUFFICIENT_EVIDENCE";
  score: number;
  minimumDimension: number;
  independentEvidenceCount: number;
  directEvidenceCount: number;
  passed: boolean;
  reasons: string[];
  evidenceRefs: string[];
}

export function evaluateOpportunity(
  candidate: Opportunity,
  evidence: readonly Evidence[]
): OpportunityGate {
  const parsed = OpportunitySchema.parse(candidate);
  const scores = Object.values(parsed.dimensions);
  const score = scores.reduce((sum, value) => sum + value, 0);
  const minimumDimension = Math.min(...scores);
  const evidenceSummary = summarizeEvidence(evidence, parsed.id);
  const reasons: string[] = [];

  if (parsed.fixture) {
    reasons.push("Fixture candidates cannot establish a real business.");
  }
  if (score < 35) {
    reasons.push(`Score ${score}/50 is below the 35/50 gate.`);
  }
  if (minimumDimension < 2) {
    reasons.push("At least one dimension is below 2/5.");
  }
  if (evidenceSummary.independent < 3) {
    reasons.push("Fewer than three independent eligible evidence sources.");
  }
  if (evidenceSummary.direct < 1) {
    reasons.push("No eligible direct problem or intent signal.");
  }
  if (!parsed.reachableChannelDefined) {
    reasons.push("No reachable distribution channel is defined.");
  }
  if (!parsed.firstExperimentDefined) {
    reasons.push("No bounded first experiment is defined.");
  }

  const structuralPass =
    !parsed.fixture &&
    score >= 35 &&
    minimumDimension >= 2 &&
    parsed.reachableChannelDefined &&
    parsed.firstExperimentDefined;
  const evidencePass =
    evidenceSummary.independent >= 3 && evidenceSummary.direct >= 1;
  const passed = structuralPass && evidencePass;
  return {
    opportunityId: parsed.id,
    outcome: passed
      ? "SELECTED"
      : !evidencePass || parsed.fixture
        ? "INSUFFICIENT_EVIDENCE"
        : "REJECTED",
    score,
    minimumDimension,
    independentEvidenceCount: evidenceSummary.independent,
    directEvidenceCount: evidenceSummary.direct,
    passed,
    reasons,
    evidenceRefs: evidenceSummary.refs
  };
}

export function selectOpportunity(
  candidates: readonly Opportunity[],
  evidence: readonly Evidence[]
): OpportunityGate {
  if (candidates.length === 0) {
    return {
      opportunityId: "NONE",
      outcome: "INSUFFICIENT_EVIDENCE",
      score: 0,
      minimumDimension: 0,
      independentEvidenceCount: 0,
      directEvidenceCount: 0,
      passed: false,
      reasons: ["No opportunity candidates were supplied."],
      evidenceRefs: []
    };
  }
  const results = candidates.map((candidate) =>
    evaluateOpportunity(candidate, evidence)
  );
  return [...results].sort(
    (left, right) =>
      Number(right.passed) - Number(left.passed) ||
      right.score - left.score ||
      left.opportunityId.localeCompare(right.opportunityId)
  )[0]!;
}
