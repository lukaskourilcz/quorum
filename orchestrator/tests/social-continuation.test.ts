import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SocialLearningEvaluationSchema, socialLearningEvaluationHash, type SocialLearningEvaluation } from "../src/contracts/social-learning.js";
import { proposeSocialContinuation, type SocialContinuationEvidence } from "../src/social/continuation.js";
import { evaluateSocialProfileLearning, loadSocialLearningPolicy } from "../src/social/learning.js";
import { configRoot } from "../src/paths.js";

async function base(targetRole: "primary" | "amplifier", posts = 8): Promise<{ evaluation: SocialLearningEvaluation; policy: Awaited<ReturnType<typeof loadSocialLearningPolicy>> }> {
  const [strategiesRaw, policy] = await Promise.all([
    readFile(path.join(configRoot, "social-profile-strategies.json"), "utf8"),
    loadSocialLearningPolicy()
  ]);
  const strategies = JSON.parse(strategiesRaw) as { strategies: unknown[] };
  const strategy = strategies.strategies[0]!;
  const profileId = (strategy as { profileId: string }).profileId;
  const evaluation = evaluateSocialProfileLearning({ profileId, targetRole, strategy, observations: [], operations: [], experiments: [], policy: { ...policy, minimumMeasuredPosts: posts }, evaluatedAt: new Date("2026-08-28T12:00:00.000Z") }).evaluation;
  const complete = { ...evaluation, sample: { ...evaluation.sample, distinctPosts: posts }, minimumSample: posts, conclusion: "STABLE" as const };
  const evaluationHash = socialLearningEvaluationHash(complete);
  return { evaluation: SocialLearningEvaluationSchema.parse({ ...complete, id: `social-learning-evaluation-${evaluationHash.slice(0, 20)}`, evaluationHash }), policy };
}

const evidence: SocialContinuationEvidence = {
  independentAudienceReason: "recorded",
  originalConsistency: "sufficient",
  ratioPolicy: "pass",
  qualifiedOutcomeSample: 8,
  supportBaselineComparable: true,
  policyIncidents: 0,
  separateProfileJustified: "yes"
};

describe("Social Distribution continuation proposals", () => {
  it("waits for the full review window and sufficient usefulness sample", async () => {
    const { evaluation, policy } = await base("primary");
    const proposal = proposeSocialContinuation({ evaluation, policy, validationStartedAt: new Date("2026-08-10T00:00:00.000Z"), evaluatedAt: new Date("2026-08-28T12:00:00.000Z"), evidence });
    expect(proposal).toMatchObject({ verdict: "INSUFFICIENT_DATA", validationDays: 28, queueAction: "none", ownerDecisionRequired: true });
  });

  it("continues a mature primary profile without granting authority", async () => {
    const { evaluation, policy } = await base("primary");
    const proposal = proposeSocialContinuation({ evaluation, policy, validationStartedAt: new Date("2026-07-01T00:00:00.000Z"), evaluatedAt: new Date("2026-08-28T12:00:00.000Z"), evidence: { ...evidence, independentAudienceReason: "not-applicable", separateProfileJustified: "unavailable" } });
    expect(proposal).toMatchObject({ verdict: "CONTINUE", validationDays: 28, externalAccountAction: "none", publishingAuthorized: false });
  });

  it("requests a queue pause for repeated policy incidents without touching the account", async () => {
    const { evaluation, policy } = await base("amplifier");
    const proposal = proposeSocialContinuation({ evaluation, policy, validationStartedAt: new Date("2026-05-01T00:00:00.000Z"), evaluatedAt: new Date("2026-08-28T12:00:00.000Z"), evidence: { ...evidence, policyIncidents: 2 } });
    expect(proposal).toMatchObject({ verdict: "PAUSE", validationDays: 75, queueAction: "request-pause", externalAccountAction: "none", accountDeleted: false });
  });

  it("can propose retirement but cannot retire or delete an amplifier", async () => {
    const { evaluation, policy } = await base("amplifier");
    const proposal = proposeSocialContinuation({ evaluation, policy, validationStartedAt: new Date("2026-05-01T00:00:00.000Z"), evaluatedAt: new Date("2026-08-28T12:00:00.000Z"), evidence: { ...evidence, independentAudienceReason: "missing", separateProfileJustified: "no" } });
    expect(proposal).toMatchObject({ verdict: "RETIRE", queueAction: "none", ownerDecisionRequired: true, externalAccountAction: "none", accountRetiredAutomatically: false, publishingAuthorized: false });
  });
});
