import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SocialAttributionEventSchema,
  SocialBoostProposalSchema,
  SocialDistributionBaselineSchema,
  SocialDistributionExperimentRegisterSchema,
  SocialDistributionExperimentSchema,
  SocialMetricObservationSchema,
  socialMetricSnapshotHash,
  type SocialMetricObservation
} from "../src/contracts/social-results.js";

function observation(overrides: Partial<SocialMetricObservation> = {}): SocialMetricObservation {
  const base = {
    schemaVersion: "social-metric-observation/1" as const,
    id: "social-metric-observation-aaaaaaaaaaaaaaaaaaaa",
    idempotencyHash: "a".repeat(64),
    correctionOfRef: null,
    profileId: "social-profile-caught-up",
    targetRole: "primary" as const,
    connectionId: "social-connection-caught-up-threads",
    platform: "threads" as const,
    nativePostId: "threads-post-123",
    publicUrl: "https://www.threads.net/@caughtup/post/example",
    campaignRef: "state/social/campaigns/social-campaign-door-money-release-001.json",
    campaignItemId: "door-money-primary-threads",
    releaseId: "door-money-release-001",
    sourceVentureId: "door-money",
    capabilityRef: null,
    publishedAt: "2026-08-26T08:00:00.000Z",
    observedAt: "2026-08-27T08:00:00.000Z",
    maturityWindow: "24h" as const,
    provider: {
      source: "official-meta" as const,
      providerId: "direct-meta" as const,
      implementationVersion: "direct-meta/1.0.0",
      apiVersion: "v26.0",
      bindingRef: "social-provider-binding-caught-up-threads-direct-meta",
      evidenceRef: "provider-response:bounded-snapshot"
    },
    format: "text" as const,
    locale: "en" as const,
    amplifier: null,
    policyState: {
      amplificationPolicyRef: null,
      strategyRef: "config/social-profile-strategies.json#social-profile-strategy-caught-up",
      originalSupportClassification: "original" as const,
      originalRatio: 1,
      supportRatio: 0,
      runwayState: "healthy" as const,
      cooldownState: "clear" as const,
      campaignState: "completed" as const
    },
    metrics: [
      { name: "verified_publish" as const, value: 1, unavailableReason: null },
      { name: "views" as const, value: 340, unavailableReason: null },
      { name: "likes" as const, value: 12, unavailableReason: null },
      { name: "non_follower_reach_ratio" as const, value: null, unavailableReason: "invalid-denominator" as const }
    ],
    attributionRefs: [],
    unavailableReason: null,
    sourceProvenanceRefs: ["state/social/posts/social-post-receipt-example.json"],
    actualCostUsd: 0,
    droppedMetricCount: 0,
    audienceIdentityExcluded: true as const,
    privateMessageExcluded: true as const,
    rawProviderPayloadExcluded: true as const,
    authorityGranted: false as const,
    ...overrides
  };
  return SocialMetricObservationSchema.parse({ ...base, snapshotHash: socialMetricSnapshotHash(base as Omit<SocialMetricObservation, "snapshotHash">) });
}

function experiment(id: string) {
  return SocialDistributionExperimentSchema.parse({
    schemaVersion: "social-distribution-experiment/1",
    id,
    status: "active",
    hypothesis: "A delayed umbrella item may increase qualified visits without reducing primary reliability.",
    changedVariable: "umbrella-delay",
    control: "Six-hour delay.",
    variant: "Twenty-four-hour delay.",
    primaryMetric: "qualified_actions",
    guardrail: "Verified publish rate must not decrease.",
    scopeProfileIds: ["social-profile-caught-up", "social-profile-boardlessai"],
    startsOn: "2026-09-01",
    endsOn: "2026-09-29",
    minimumSample: 4,
    stopCondition: "Stop on any policy, privacy, capability or reliability incident.",
    baselineRef: "state/social/results/baselines/social-distribution-baseline-2026-08.json",
    evidenceObservationRefs: [],
    verdict: "INSUFFICIENT_DATA",
    hardGatesFrozen: true,
    privacyFrozen: true,
    manipulationExcluded: true,
    maxCostUsd: 0,
    publishingAuthorized: false,
    updatedAt: "2026-08-28T08:00:00.000Z"
  });
}

describe("Social Distribution result contracts", () => {
  it("keeps the exported contract fixture valid", async () => {
    const fixture = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/social-results-contracts.valid.json"), "utf8")) as Record<string, unknown>;
    expect(SocialMetricObservationSchema.safeParse(fixture.observation).success).toBe(true);
    expect(SocialAttributionEventSchema.safeParse(fixture.attribution).success).toBe(true);
    expect(SocialDistributionBaselineSchema.safeParse(fixture.baseline).success).toBe(true);
    expect(SocialDistributionExperimentSchema.safeParse(fixture.experiment).success).toBe(true);
    expect(SocialBoostProposalSchema.safeParse(fixture.boostProposal).success).toBe(true);
  });

  it("accepts bounded primary, umbrella and amplifier observations without identities", () => {
    const primary = observation();
    const capabilityRef = { mapVersion: "1.0.0", source: "door-money", target: "social-distribution" as const, capability: "approved-publish-package" as const, dataSchemaVersion: "approved-publish-package/1" as const, decisionReference: "GitHub #424" };
    const umbrella = observation({ id: "social-metric-observation-bbbbbbbbbbbbbbbbbbbb", idempotencyHash: "b".repeat(64), profileId: "social-profile-boardlessai", targetRole: "umbrella", capabilityRef, policyState: { ...primary.policyState, amplificationPolicyRef: "config/social-amplification-policy.json", originalSupportClassification: "support" } });
    const amplifier = observation({ id: "social-metric-observation-cccccccccccccccccccc", idempotencyHash: "c".repeat(64), profileId: "social-profile-amplifier-evidence", targetRole: "amplifier", capabilityRef, amplifier: { archetype: "topic-editorial", policyRef: "config/social-amplification-policy.json", strategyRef: "config/social-profile-strategies.json#amplifier" }, policyState: { ...primary.policyState, amplificationPolicyRef: "config/social-amplification-policy.json", originalSupportClassification: "support" } });
    expect([primary.targetRole, umbrella.targetRole, amplifier.targetRole]).toEqual(["primary", "umbrella", "amplifier"]);
    expect(JSON.stringify([primary, umbrella, amplifier])).not.toMatch(/audienceIdentity(?!Excluded)|privateMessage(?!Excluded)|sister/iu);
  });

  it("rejects fake zeroes, identity fields, missing capability and malformed snapshots", () => {
    const valid = observation();
    expect(SocialMetricObservationSchema.safeParse({ ...valid, metrics: [{ name: "reach", value: null, unavailableReason: null }] }).success).toBe(false);
    expect(SocialMetricObservationSchema.safeParse({ ...valid, audienceIds: ["person-1"] }).success).toBe(false);
    expect(SocialMetricObservationSchema.safeParse({ ...valid, targetRole: "sister" }).success).toBe(false);
    expect(SocialMetricObservationSchema.safeParse({ ...valid, targetRole: "umbrella", capabilityRef: null }).success).toBe(false);
    expect(SocialMetricObservationSchema.safeParse({ ...valid, metrics: [{ name: "views", value: 341, unavailableReason: null }] }).success).toBe(false);
  });

  it("keeps exact UTM matches aggregate and unmatched visits unattributed", () => {
    const common = {
      schemaVersion: "social-attribution-event/1" as const,
      id: "social-attribution-event-aaaaaaaaaaaaaaaaaaaa",
      idempotencyHash: "a".repeat(64),
      source: "first-party-destination" as const,
      eventType: "qualified-action" as const,
      eventCount: 1,
      occurredAt: "2026-08-27T09:00:00.000Z",
      observedAt: "2026-08-27T09:05:00.000Z",
      destination: "https://example.com/release",
      deduplicationKey: "b".repeat(64),
      evidenceRefs: ["destination-analytics:event-aggregate"],
      identityExcluded: true as const,
      fingerprintingExcluded: true as const,
      consentInferred: false as const,
      sharingInferred: false as const,
      relationshipKitRef: null,
      contestRef: null,
      authorityGranted: false as const
    };
    expect(SocialAttributionEventSchema.parse({ ...common, utm: { source: "threads", medium: "organic_social", campaign: "door-money-release-001", content: "door-money-primary-threads" }, attribution: { state: "attributed", campaignRef: "state/social/campaigns/social-campaign-door-money-release-001.json", campaignItemId: "door-money-primary-threads", profileId: "social-profile-caught-up", targetRole: "primary" } }).attribution.state).toBe("attributed");
    expect(SocialAttributionEventSchema.parse({ ...common, utm: { source: null, medium: null, campaign: null, content: null }, attribution: { state: "unattributed", campaignRef: null, campaignItemId: null, profileId: null, targetRole: null } }).attribution.state).toBe("unattributed");
    expect(SocialAttributionEventSchema.safeParse({ ...common, visitorId: "fingerprint", utm: { source: null, medium: null, campaign: null, content: null }, attribution: { state: "unattributed", campaignRef: null, campaignItemId: null, profileId: null, targetRole: null } }).success).toBe(false);
  });

  it("enforces the 28-day baseline, two-experiment ceiling and manipulation boundary", () => {
    expect(SocialDistributionBaselineSchema.parse({ schemaVersion: "social-distribution-baseline/1", id: "social-distribution-baseline-2026-08", startsOn: "2026-08-01", endsOn: "2026-08-29", evaluatedAt: "2026-08-29T12:00:00.000Z", elapsedDays: 28, status: "complete", observationRefs: [], attributionRefs: [], acceptedObservationCount: 0, droppedObservationCount: 0, metricsAvailable: false, ownerDecisionRequired: true, authorityGranted: false }).status).toBe("complete");
    expect(SocialDistributionBaselineSchema.safeParse({ schemaVersion: "social-distribution-baseline/1", id: "social-distribution-baseline-short", startsOn: "2026-08-01", endsOn: "2026-08-08", evaluatedAt: "2026-08-08T12:00:00.000Z", elapsedDays: 7, status: "complete", observationRefs: [], attributionRefs: [], acceptedObservationCount: 0, droppedObservationCount: 0, metricsAvailable: false, ownerDecisionRequired: true, authorityGranted: false }).success).toBe(false);
    const experiments = [experiment("social-distribution-experiment-delay-a"), experiment("social-distribution-experiment-delay-b")];
    expect(SocialDistributionExperimentRegisterSchema.safeParse({ schemaVersion: "social-distribution-experiment-register/1", experiments, updatedAt: "2026-08-28T08:00:00.000Z", authorityGranted: false }).success).toBe(true);
    expect(SocialDistributionExperimentRegisterSchema.safeParse({ schemaVersion: "social-distribution-experiment-register/1", experiments: [...experiments, experiment("social-distribution-experiment-delay-c")], updatedAt: "2026-08-28T08:00:00.000Z", authorityGranted: false }).success).toBe(false);
    expect(() => experiment("social-distribution-experiment-fake-account")).not.toThrow();
    expect(SocialDistributionExperimentSchema.safeParse({ ...experiments[0], hypothesis: "Use a fake account repost ring." }).success).toBe(false);
  });

  it("permits only a non-executing held organic-winner proposal", () => {
    expect(SocialBoostProposalSchema.parse({ schemaVersion: "social-boost-proposal/1", id: "social-boost-proposal-aaaaaaaaaaaaaaaaaaaa", status: "held-owner-proposal", contentRef: "state/social/posts/social-post-receipt-example.json", destinationRef: "https://example.com/release", thresholdVersion: "1.0.0", baselineRef: "state/social/results/baselines/social-distribution-baseline-2026-08.json", organicObservationRefs: ["state/social/results/observations/one.json", "state/social/results/observations/two.json"], primaryMetric: "qualified_actions", observedValue: 4, thresholdValue: 3, sampleSize: 2, contentChecksPassed: true, destinationChecksPassed: true, budgetAuthorityRef: "state/BUDGETS.md", proposedAt: "2026-08-29T12:00:00.000Z", ownerDecisionRequired: true, adApiCalled: false, purchaseAuthorized: false, spendAuthorized: false, publishingAuthorized: false })).toMatchObject({ status: "held-owner-proposal", adApiCalled: false, purchaseAuthorized: false });
  });
});
