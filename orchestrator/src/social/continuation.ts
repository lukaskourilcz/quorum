import {
  SocialContinuationProposalSchema,
  SocialLearningEvaluationSchema,
  socialContinuationProposalHash,
  type SocialContinuationProposal
} from "../contracts/social-learning.js";
import { SocialLearningPolicySchema } from "./learning.js";

export interface SocialContinuationEvidence {
  independentAudienceReason: "recorded" | "missing" | "not-applicable";
  originalConsistency: "sufficient" | "insufficient" | "unavailable";
  ratioPolicy: "pass" | "incident" | "unavailable";
  qualifiedOutcomeSample: number;
  supportBaselineComparable: boolean;
  policyIncidents: number;
  separateProfileJustified: "yes" | "no" | "unavailable";
}

function addUtcDays(value: Date, days: number): Date {
  const result = new Date(value);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function proposeSocialContinuation(input: {
  evaluation: unknown;
  policy: unknown;
  validationStartedAt: Date;
  evaluatedAt: Date;
  evidence: SocialContinuationEvidence;
}): SocialContinuationProposal {
  const evaluation = SocialLearningEvaluationSchema.parse(input.evaluation);
  const policy = SocialLearningPolicySchema.parse(input.policy);
  const validationDays = evaluation.targetRole === "amplifier" ? policy.amplifierReviewDays : policy.primaryReviewDays;
  const reviewDueAt = addUtcDays(input.validationStartedAt, validationDays);
  const reviewDate = reviewDueAt.toISOString().slice(0, 10);
  const mature = input.evaluatedAt.getTime() >= reviewDueAt.getTime();
  const sufficientSample = evaluation.sample.distinctPosts >= evaluation.minimumSample
    && input.evidence.qualifiedOutcomeSample >= policy.minimumMeasuredPosts;
  const reliability = evaluation.robustMetrics.publishReliability;

  let verdict: SocialContinuationProposal["verdict"];
  const reasons: string[] = [];
  if (!mature || !sufficientSample) {
    verdict = "INSUFFICIENT_DATA";
    if (!mature) reasons.push(`The ${validationDays}-day validation window is not complete.`);
    if (!sufficientSample) reasons.push("The independent usefulness sample is below the recorded minimum.");
  } else if (
    input.evidence.policyIncidents >= 2
    || (reliability !== null && reliability < policy.minimumPublishReliability)
    || evaluation.sample.ownerAttentionCount > policy.maximumOwnerAttentionPerWindow
  ) {
    verdict = "PAUSE";
    if (input.evidence.policyIncidents >= 2) reasons.push("Repeated policy incidents require an owner-reviewed queue pause.");
    if (reliability !== null && reliability < policy.minimumPublishReliability) reasons.push("Verified publish reliability is below the recorded floor.");
    if (evaluation.sample.ownerAttentionCount > policy.maximumOwnerAttentionPerWindow) reasons.push("Owner-attention load exceeds the bounded review threshold.");
  } else if (
    evaluation.targetRole === "amplifier"
    && (input.evidence.independentAudienceReason === "missing" || input.evidence.separateProfileJustified === "no")
  ) {
    verdict = "RETIRE";
    reasons.push("The amplifier has no recorded independent audience reason or separate-profile justification.");
    reasons.push("Retirement remains an owner decision; no external account action is authorized.");
  } else if (
    input.evidence.originalConsistency === "insufficient"
    || input.evidence.ratioPolicy === "incident"
    || (evaluation.targetRole !== "primary" && !input.evidence.supportBaselineComparable)
  ) {
    verdict = "NARROW";
    if (input.evidence.originalConsistency === "insufficient") reasons.push("Original-content consistency is below the recorded operating promise.");
    if (input.evidence.ratioPolicy === "incident") reasons.push("The original/support ratio requires a narrower operating envelope.");
    if (evaluation.targetRole !== "primary" && !input.evidence.supportBaselineComparable) reasons.push("The support baseline is not independently comparable.");
  } else {
    verdict = "CONTINUE";
    reasons.push("The completed window has a sufficient independent sample and no bounded pause or narrowing trigger.");
  }

  const base = {
    schemaVersion: "social-continuation-proposal/1" as const,
    id: `social-continuation-proposal-${"0".repeat(20)}`,
    proposalHash: "0".repeat(64),
    profileId: evaluation.profileId,
    targetRole: evaluation.targetRole,
    reviewDate,
    validationDays,
    evaluatedAt: input.evaluatedAt.toISOString(),
    verdict,
    evidence: {
      learningEvaluationRef: `state/social/learning/evaluations/${evaluation.profileId}/${evaluation.evaluatedWeek}.json`,
      independentAudienceReason: input.evidence.independentAudienceReason,
      originalConsistency: input.evidence.originalConsistency,
      ratioPolicy: input.evidence.ratioPolicy,
      publishReliability: reliability,
      qualifiedOutcomeSample: input.evidence.qualifiedOutcomeSample,
      supportBaselineComparable: input.evidence.supportBaselineComparable,
      policyIncidents: input.evidence.policyIncidents,
      actualCostUsd: evaluation.sample.actualCostUsd,
      ownerAttentionCount: evaluation.sample.ownerAttentionCount,
      separateProfileJustified: input.evidence.separateProfileJustified
    },
    reasons,
    queueAction: verdict === "PAUSE" ? "request-pause" as const : "none" as const,
    ownerDecisionRequired: true as const,
    externalAccountAction: "none" as const,
    accountDeleted: false as const,
    accountRetiredAutomatically: false as const,
    publishingAuthorized: false as const
  };
  const proposalHash = socialContinuationProposalHash(base);
  return SocialContinuationProposalSchema.parse({
    ...base,
    id: `social-continuation-proposal-${proposalHash.slice(0, 20)}`,
    proposalHash
  });
}
