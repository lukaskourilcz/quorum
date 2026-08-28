import { describe, expect, it } from "vitest";
import { parseAdminSocialContinuation, parseAdminSocialLearningCheckpoint, parseAdminSocialLearningEvaluation, parseAdminSocialStrategyAdjustment } from "./learning-model";

const evaluation = {
  schemaVersion: "social-learning-evaluation/1", id: `social-learning-evaluation-${"a".repeat(20)}`, evaluationHash: "a".repeat(64), profileId: "social-profile-caught-up", targetRole: "primary", strategyId: "social-profile-strategy-caught-up", strategyVersion: "1.0.0", evaluatedWeek: "2026-08-31", evaluatedAt: "2026-08-31T00:00:00.000Z", observationRefs: [], operationRefs: [], experimentRefs: [],
  sample: { distinctPosts: 8, measured28dPosts: 8, qualifiedOutcomePosts: 8, unavailablePosts: 0, operationDays: 7, queued: 4, noPost: 3, heldOrFailed: 0, originalPosts: 8, supportPosts: 0, actualCostUsd: 0, ownerAttentionCount: 0 },
  robustMetrics: { publishReliability: 1, qualifiedActionsMedian: 3, referralVisitsMedian: 4, reachMedian: 200, originalRatio: 1, supportRatio: 0 }, outlierObservationRefs: [], minimumSample: 8, conclusion: "STABLE", signals: ["Eight mature posts."], proposedAdjustmentRef: null, hardGatesFrozen: ["purpose", "capability", "privacy", "evidence", "original-support-ratio", "runway", "cooldown", "duplicate", "stagger", "authority", "cost", "kill-switch"], authorityGranted: false, publishingAuthorized: false
};

describe("Social Profiles learning model", () => {
  it("sanitizes a canonical evaluation without returning unknown secret fields", () => {
    const parsed = parseAdminSocialLearningEvaluation({ ...evaluation, accessToken: "must-not-cross" });
    expect(parsed).toMatchObject({ profileId: "social-profile-caught-up", conclusion: "STABLE", sample: { qualifiedOutcomePosts: 8 }, robustMetrics: { qualifiedActionsMedian: 3 }, outlierCount: 0 });
    expect(JSON.stringify(parsed)).not.toContain("must-not-cross");
    expect(parseAdminSocialLearningEvaluation({ ...evaluation, publishingAuthorized: true })).toBeNull();
  });

  it("keeps adjustments, continuation and checkpoint authority advisory", () => {
    const adjustment = parseAdminSocialStrategyAdjustment({ schemaVersion: "social-strategy-adjustment/1", id: `social-strategy-adjustment-${"b".repeat(20)}`, profileId: "social-profile-caught-up", baseVersion: "1.0.0", nextVersion: "1.0.1", status: "proposed", change: { kind: "format-priority", targetRef: "carousel", beforeRank: 1, afterRank: 0, delta: -1 }, explanation: "One rank only.", evidenceObservationRefs: ["state/social/results/observations/a.json", "state/social/results/observations/b.json", "state/social/results/observations/c.json"], ownerDecisionRef: null, appliedStrategyRef: null, updatedAt: "2026-08-31T00:00:00.000Z", authorityGranted: false, publishingAuthorized: false });
    const continuation = parseAdminSocialContinuation({ schemaVersion: "social-continuation-proposal/1", id: `social-continuation-proposal-${"c".repeat(20)}`, profileId: "social-profile-caught-up", targetRole: "primary", validationDays: 28, evaluatedAt: "2026-08-31T00:00:00.000Z", verdict: "CONTINUE", evidence: { independentAudienceReason: "not-applicable", originalConsistency: "sufficient", ratioPolicy: "pass", publishReliability: 1, qualifiedOutcomeSample: 8, supportBaselineComparable: true, policyIncidents: 0, actualCostUsd: 0, ownerAttentionCount: 0, separateProfileJustified: "unavailable" }, reasons: ["Sufficient evidence."], queueAction: "none", ownerDecisionRequired: true, externalAccountAction: "none", accountDeleted: false, accountRetiredAutomatically: false, publishingAuthorized: false });
    const checkpoint = parseAdminSocialLearningCheckpoint({ schemaVersion: "social-learning-checkpoint/1", profileId: "social-profile-caught-up", evaluatedWeek: "2026-08-31", currentEvaluationRef: "state/social/learning/evaluations/social-profile-caught-up/current.json", evaluationRefs: ["state/social/learning/evaluations/social-profile-caught-up/current.json"], adjustmentEventRefs: [], continuationRefs: ["state/social/learning/continuations/social-profile-caught-up/current.json"], strategyVersionRefs: ["state/social/learning/strategy-versions/social-profile-caught-up/1.0.0.json"], correctionCount: 0, generatedAt: "2026-08-31T00:00:00.000Z", authorityGranted: false, publishingAuthorized: false });
    expect(adjustment).toMatchObject({ status: "proposed", change: { delta: -1 }, evidenceCount: 3 });
    expect(continuation).toMatchObject({ verdict: "CONTINUE", externalAccountAction: "none", ownerDecisionRequired: true });
    expect(checkpoint).toMatchObject({ correctionCount: 0 });
  });
});
