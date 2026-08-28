import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SocialCampaignSchema,
  type SocialProfile
} from "../src/contracts/social-distribution.js";
import { SocialInventoryCandidateSchema, SocialProfileStrategySchema } from "../src/contracts/social-inventory.js";
import type { VentureOperationHealth } from "../src/contracts/venture-operations.js";
import { configRoot, repoRoot } from "../src/paths.js";
import { planOperationsCapacity } from "../src/operations/capacity.js";
import {
  buildSocialProfileInventory,
  createSocialInventoryDueOperation,
  importCapabilityInventoryCandidate
} from "../src/social/inventory.js";
import { writeSocialInventoryBuild } from "../src/social/inventory-store.js";
import { loadSocialPublisherRegistry } from "../src/social/publisher-targets.js";
import { loadSocialProfileStrategies } from "../src/social/strategies.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";

const temporaryRoots: string[] = [];
const now = new Date("2026-08-28T09:00:00.000Z");

function health(): VentureOperationHealth {
  return {
    schemaVersion: "venture-operation-health/1", nodeId: "social-distribution", displayName: "Social Distribution", policyVersion: "1.0.0",
    generatedAt: now.toISOString(), observedAt: now.toISOString(), lifecycleStage: "operating", state: "healthy", reason: "Fixture health",
    lastAttemptedAt: now.toISOString(), lastValidAt: now.toISOString(), lastSuccessfulAt: now.toISOString(), lastNonEmptyAt: now.toISOString(),
    lastExternallyVerifiedAt: null, nextExpectedAt: null, dueWindow: null, latenessMinutes: 0,
    rollingOutcomes: { considered: 1, satisfying: 1, failed: 0, quiet: 0, held: 0, consecutiveFailures: 0 }, dependencyHealthRefs: [],
    queue: { state: "clear", pending: 0 }, autonomyEligible: true, holds: { budget: [], provider: [], source: [], credential: [], owner: [] },
    freshness: { state: "fresh", ageMinutes: 0, lastKnownGoodRef: null }, unavailableReasons: [], ownerAttentionRefs: [], latestRunReceiptRefs: [], snapshotHash: "a".repeat(64)
  };
}

async function inputs(profileId = "social-profile-caught-up") {
  const [publisher, strategies] = await Promise.all([loadSocialPublisherRegistry(), loadSocialProfileStrategies()]);
  return {
    profile: publisher.profiles.find(({ id }) => id === profileId)!,
    strategy: strategies.strategies.find(({ profileId: id }) => id === profileId)!
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Social Distribution rolling inventory", () => {
  it("runs through existing capacity planning and builds a zero-cost seven-day original runway without a release", async () => {
    const { profile, strategy } = await inputs();
    const due = createSocialInventoryDueOperation({ profileId: profile.id, now, inputHash: "a".repeat(64), configHash: "b".repeat(64), lowRunway: false });
    const capacity = planOperationsCapacity({
      period: "2026-08-28", generatedAt: now.toISOString(), jobs: [due], healthByNode: new Map([["social-distribution", health()]]),
      budget: { maximumUsd: 0, spentUsd: 0 }, providerHeadroom: {}, activeLeases: [],
      deployment: { guardActive: true, releaseReady: false, evidenceRef: "scripts/deploy/check.mjs" }
    });
    expect(capacity.jobs[0]).toMatchObject({ decision: "run", phase: "inventory-weekly", expectedCostUsd: 0, providerIds: [], modelVersion: null });
    const result = buildSocialProfileInventory({ profile, strategy, campaigns: [], now, mode: "weekly", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/2026-08-28.json", modelAvailable: false });
    expect(result.inventory).toMatchObject({ state: "healthy", horizonDays: 7, coverageDays: 7, counts: { original: 7, reserve: 2, recurring: 1, campaign: 0, eligible: 9, held: 1 }, queueAuthorized: false, publishingAuthorized: false });
    expect(result.receipt).toMatchObject({ status: "built", actualCostUsd: 0, providerCalls: 0, modelUnavailable: true, queueAuthorized: false, publishingAuthorized: false });
    expect(result.incidents).toEqual([]);
    expect(result.inventory.candidates.every(({ finalCopy, estimatedCostUsd, queueAuthorized, publishingAuthorized }) => !finalCopy && estimatedCostUsd === 0 && !queueAuthorized && !publishingAuthorized)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/queueItem|publishWindow|accessToken|portfolio scan/iu);
  });

  it("reuses unchanged inventory and performs no repeated paid/model call", async () => {
    const { profile, strategy } = await inputs();
    const base = { profile, strategy, campaigns: [], now, mode: "refill" as const, capacityDecision: "run" as const, capacityPlanRef: "state/operations/capacity/2026-08-28.json", sourceSignatures: ["owned:unchanged"] };
    const first = buildSocialProfileInventory(base);
    const second = buildSocialProfileInventory({ ...base, currentInventory: first.inventory, modelAvailable: false });
    expect(second.inventory).toEqual(first.inventory);
    expect(second.receipt).toMatchObject({ status: "reused", reusedCandidates: 10, generatedCandidates: 0, actualCostUsd: 0, providerCalls: 0, providerCallsAvoided: 1 });
  });

  it("records LOW_RUNWAY and NO_CANDIDATE honestly without forcing content", async () => {
    const { profile, strategy } = await inputs();
    const lowStrategy = SocialProfileStrategySchema.parse({ ...strategy, recurringFormats: strategy.recurringFormats.map((format) => format.candidateClass === "original" ? { ...format, candidateClass: "recurring" } : format) });
    const low = buildSocialProfileInventory({ profile, strategy: lowStrategy, campaigns: [], now, mode: "refill", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/current.json" });
    expect(low.inventory.state).toBe("low-runway");
    expect(low.incidents).toMatchObject([{ code: "LOW_RUNWAY", recoveryPerformed: false }]);
    const noStrategy = SocialProfileStrategySchema.parse({ ...strategy, recurringFormats: strategy.recurringFormats.map((format) => ({ ...format, assetRequirement: "required-design-lab", altTextRequired: true })) });
    const empty = buildSocialProfileInventory({ profile, strategy: noStrategy, campaigns: [], now, mode: "refill", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/current.json" });
    expect(empty.inventory.state).toBe("no-candidate");
    expect(empty.receipt.status).toBe("no-candidate");
    expect(empty.incidents).toMatchObject([{ code: "NO_CANDIDATE", recoveryPerformed: false }]);
  });

  it("imports only an accepted #410 campaign reference and does not recalculate its target", async () => {
    const { profile, strategy } = await inputs("social-profile-door-money");
    const fixture = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: Record<string, unknown> };
    const raw = structuredClone(fixture.campaign) as { status: string; holdReasons: string[]; channelItems: Array<{ status: string; approval: { status: string; bindingHash: string; approvalRef: string | null; approvedAt: string | null; approvedBy: string | null } }> };
    raw.status = "approved"; raw.holdReasons = [];
    for (const item of raw.channelItems) { item.status = "approved"; item.approval = { ...item.approval, status: "approved", approvalRef: "owner:campaign-approval-001", approvedAt: "2026-08-28T08:00:00.000Z", approvedBy: "owner" }; }
    const campaign = SocialCampaignSchema.parse(raw);
    const result = buildSocialProfileInventory({ profile, strategy, campaigns: [campaign], now, mode: "weekly", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/current.json" });
    expect(result.inventory.counts.campaign).toBe(1);
    expect(result.inventory.candidates.find(({ candidateType }) => candidateType === "campaign")).toMatchObject({
      sourceKind: "accepted-campaign", campaignRef: `state/social/campaigns/${campaign.id}.json`, authorityClass: "campaign-reference", finalCopy: false
    });
    const unaccepted = buildSocialProfileInventory({ profile, strategy, campaigns: [{ ...campaign, status: "draft" }], now, mode: "weekly", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/current.json" });
    expect(unaccepted.inventory.counts.campaign).toBe(0);
  });

  it("accepts Door Money only through its exact bounded package and rejects GoVIRAL copy, denied capabilities and isolated sources", async () => {
    const { profile, strategy } = await inputs("social-profile-door-money");
    const capabilityMap = await loadVentureCapabilityMap(configRoot);
    const approved = importCapabilityInventoryCandidate({
      profile, strategy, capabilityMap, sourceKind: "approved-package", sourceVentureId: "door-money",
      sourceRef: "state/ventures/door-money/packages/release-001.json", evidenceRefs: ["owner:package-approval-001"],
      contentBrief: "Plan one lesson from the bounded package without manuscript access.", now
    });
    expect(approved).toMatchObject({ decision: "eligible", candidate: { sourceKind: "approved-package", finalCopy: false, queueAuthorized: false, publishingAuthorized: false } });
    expect(importCapabilityInventoryCandidate({ profile, strategy, capabilityMap, sourceKind: "approved-package", sourceVentureId: "door-money", sourceRef: "state/ventures/door-money/manuscript.md", evidenceRefs: ["owner:approval"], contentBrief: "Private source", now })).toMatchObject({ decision: "denied", reasons: ["door-money-approved-package-required"] });
    expect(importCapabilityInventoryCandidate({ profile, strategy, capabilityMap, sourceKind: "goviral-intelligence", sourceVentureId: "goviral", sourceRef: "state/goviral/packet.json", evidenceRefs: ["packet:accepted"], contentBrief: "Use this final post", finalCopy: true, cta: "Buy now", now })).toMatchObject({ decision: "denied", reasons: ["goviral-final-copy-or-cta-forbidden"] });
    expect(importCapabilityInventoryCandidate({ profile, strategy, capabilityMap, sourceKind: "approved-package", sourceVentureId: "personal-growth", sourceRef: "state/personal-growth/private.json", evidenceRefs: ["private"], contentBrief: "Forbidden", now })).toMatchObject({ decision: "denied", reasons: ["permanently-isolated-inventory-source"] });
    expect(importCapabilityInventoryCandidate({ profile, strategy, capabilityMap, sourceKind: "approved-package", sourceVentureId: "door-money", sourceRef: "state/ventures/door-money/packages/*.json", evidenceRefs: ["wildcard"], contentBrief: "Forbidden", now })).toMatchObject({ decision: "denied", reasons: ["wildcard-or-portfolio-source-forbidden"] });
  });

  it("rejects sensitive/malformed actions and stores inventory without creating a queue", async () => {
    const { profile, strategy } = await inputs();
    const result = buildSocialProfileInventory({ profile, strategy, campaigns: [], now, mode: "weekly", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/current.json" });
    expect(SocialInventoryCandidateSchema.safeParse({ ...result.inventory.candidates[0], action: "publish", finalCopy: true }).success).toBe(false);
    expect(SocialInventoryCandidateSchema.safeParse({ ...result.inventory.candidates[0], profileId: "distribution-contact-example" }).success).toBe(false);
    const root = await mkdtemp(path.join(os.tmpdir(), "social-inventory-store-")); temporaryRoots.push(root);
    await writeSocialInventoryBuild(root, result);
    expect(JSON.parse(await readFile(path.join(root, `social/inventory/${profile.id}/current.json`), "utf8"))).toMatchObject({ profileId: profile.id, queueAuthorized: false });
    await expect(readFile(path.join(root, "social/queue/item.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("holds the builder when capacity does not authorize work", async () => {
    const { profile, strategy } = await inputs();
    const result = buildSocialProfileInventory({ profile, strategy, campaigns: [], now, mode: "weekly", capacityDecision: "held", capacityPlanRef: "state/operations/capacity/current.json" });
    expect(result.inventory.state).toBe("held");
    expect(result.receipt.status).toBe("held");
    expect(result.incidents).toMatchObject([{ code: "BUILD_HELD", recoveryPerformed: false }]);
  });
});
