import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sha256 } from "../src/hashing.js";
import { SocialMetricObservationSchema, socialMetricSnapshotHash, type SocialMetricObservation } from "../src/contracts/social-results.js";
import { SocialStrategyAdjustmentSchema } from "../src/contracts/social-learning.js";
import { SocialProfileStrategySchema } from "../src/contracts/social-inventory.js";
import { applyBoundedSocialStrategyAdjustment, evaluateSocialProfileLearning, loadSocialLearningPolicy } from "../src/social/learning.js";
import { configRoot, repoRoot } from "../src/paths.js";

async function inputs() {
  const [fixtureRaw, strategiesRaw, policy] = await Promise.all([
    readFile(path.join(repoRoot, "contracts/fixtures/social-results-contracts.valid.json"), "utf8"),
    readFile(path.join(configRoot, "social-profile-strategies.json"), "utf8"),
    loadSocialLearningPolicy()
  ]);
  const fixture = JSON.parse(fixtureRaw) as { observation: SocialMetricObservation; experiment: unknown };
  const strategies = JSON.parse(strategiesRaw) as { strategies: unknown[] };
  const current = SocialProfileStrategySchema.parse(strategies.strategies.find((value) => (value as { profileId?: string }).profileId === "social-profile-caught-up"));
  const strategy = SocialProfileStrategySchema.parse({ ...current, recurringFormats: current.recurringFormats.map((format, index) => ({ ...format, id: index === 0 ? "text" : index === 1 ? "carousel" : format.id, ...(index === 1 ? { assetRequirement: "optional-design-lab", altTextRequired: true } : {}) })) });
  return { fixture, strategy, policy };
}

function observation(base: SocialMetricObservation, index: number, format: "text" | "carousel", qualifiedActions: number): SocialMetricObservation {
  const idempotencyHash = sha256(`social-learning:${index}:${format}:${qualifiedActions}`);
  const value = {
    ...base,
    id: `social-metric-observation-${idempotencyHash.slice(0, 20)}`,
    idempotencyHash,
    snapshotHash: "0".repeat(64),
    nativePostId: `post-${index}`,
    publicUrl: `https://example.com/social/post-${index}`,
    publishedAt: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
    observedAt: `2026-08-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
    maturityWindow: "28d" as const,
    format,
    metrics: [
      { name: "verified_publish" as const, value: 1, unavailableReason: null },
      { name: "qualified_actions" as const, value: qualifiedActions, unavailableReason: null },
      { name: "referral_visits" as const, value: qualifiedActions * 2, unavailableReason: null },
      { name: "reach" as const, value: qualifiedActions * 20, unavailableReason: null }
    ],
    unavailableReason: null,
    actualCostUsd: 0
  };
  return SocialMetricObservationSchema.parse({ ...value, snapshotHash: socialMetricSnapshotHash(value) });
}

describe("weekly Social Distribution learning", () => {
  it("keeps an undersized canonical sample explicitly insufficient", async () => {
    const { fixture, strategy, policy } = await inputs(); const observations = [observation(fixture.observation, 0, "text", 1), observation(fixture.observation, 1, "carousel", 4)];
    const result = evaluateSocialProfileLearning({ profileId: strategy.profileId, targetRole: "primary", strategy, observations, operations: [], experiments: [], policy, evaluatedAt: new Date("2026-08-28T12:00:00.000Z") });
    expect(result).toMatchObject({ evaluation: { conclusion: "INSUFFICIENT_DATA", sample: { distinctPosts: 2 }, minimumSample: 8, proposedAdjustmentRef: null }, adjustment: null });
  });

  it("uses robust medians, ignores one outlier and proposes only a one-rank format change", async () => {
    const { fixture, strategy, policy } = await inputs();
    const observations = [0, 1, 2, 3].map((index) => observation(fixture.observation, index, "text", 1))
      .concat([4, 5, 6, 7].map((index) => observation(fixture.observation, index, "carousel", 4)))
      .concat([observation(fixture.observation, 8, "text", 1_000)]);
    const result = evaluateSocialProfileLearning({ profileId: strategy.profileId, targetRole: "primary", strategy, observations, operations: [], experiments: [], policy, evaluatedAt: new Date("2026-08-28T12:00:00.000Z") });
    expect(result.evaluation).toMatchObject({ conclusion: "PROPOSE_BOUNDED_CHANGE", robustMetrics: { qualifiedActionsMedian: 2.5 }, outlierObservationRefs: [expect.stringMatching(/social-metric-observation/u)] });
    expect(result.adjustment).toMatchObject({ status: "proposed", change: { kind: "format-priority", targetRef: "carousel", beforeRank: 1, afterRank: 0, delta: -1 }, createsSourceOrTarget: false, createsCapabilityOrScope: false });
  });

  it("applies only an exact owner-approved one-rank revision and freezes hard gates", async () => {
    const { fixture, strategy, policy } = await inputs(); const observations = [0, 1, 2, 3].map((index) => observation(fixture.observation, index, "text", 1)).concat([4, 5, 6, 7].map((index) => observation(fixture.observation, index, "carousel", 4)));
    const proposed = evaluateSocialProfileLearning({ profileId: strategy.profileId, targetRole: "primary", strategy, observations, operations: [], experiments: [], policy, evaluatedAt: new Date("2026-08-28T12:00:00.000Z") }).adjustment!;
    const approved = SocialStrategyAdjustmentSchema.parse({ ...proposed, status: "owner-approved", ownerDecisionRef: "owner:strategy-adjustment-001", updatedAt: "2026-08-28T13:00:00.000Z" });
    const applied = applyBoundedSocialStrategyAdjustment({ strategy, adjustment: approved, appliedAt: new Date("2026-08-28T14:00:00.000Z") });
    expect(applied.strategy).toMatchObject({ version: "1.0.1", prohibited: strategy.prohibited, policyRefs: strategy.policyRefs, platformCaps: strategy.platformCaps, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false });
    expect(applied.strategy.recurringFormats.map(({ id }) => id)).toEqual(["carousel", "text", "context-card"]);
    expect(applied.adjustment).toMatchObject({ status: "applied", ownerDecisionRef: "owner:strategy-adjustment-001", appliedStrategyRef: "state/social/learning/strategy-versions/social-profile-caught-up/1.0.1.json" });
    expect(() => applyBoundedSocialStrategyAdjustment({ strategy, adjustment: { ...approved, change: { ...approved.change, afterRank: 3, delta: 1 } }, appliedAt: new Date() })).toThrow();
    expect(SocialStrategyAdjustmentSchema.safeParse({ ...approved, hardGatesFrozen: approved.hardGatesFrozen.slice(1) }).success).toBe(false);
  });

  it("rejects more than two active experiments before learning", async () => {
    const { fixture, strategy, policy } = await inputs(); const experiment = fixture.experiment as Record<string, unknown>;
    const experiments = [1, 2, 3].map((index) => ({ ...experiment, id: `social-distribution-experiment-fixture-${index}`, status: "active", scopeProfileIds: [strategy.profileId] }));
    expect(() => evaluateSocialProfileLearning({ profileId: strategy.profileId, targetRole: "primary", strategy, observations: [], operations: [], experiments, policy, evaluatedAt: new Date("2026-08-28T12:00:00.000Z") })).toThrow(/At most two/u);
  });
});
