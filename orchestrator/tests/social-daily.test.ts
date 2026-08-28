import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { providerBindingHash } from "../src/contracts/social-provider.js";
import { SocialCampaignSchema, SocialConnectionSchema, SocialProfileSchema } from "../src/contracts/social-distribution.js";
import { SocialPreparedCandidateSchema, SocialRoutineScopeSchema, socialPreparedCandidateHash, type SocialPreparedCandidate } from "../src/contracts/social-operations.js";
import { SocialProfileInventorySchema, SocialProfileStrategySchema } from "../src/contracts/social-inventory.js";
import { assertQueueItemPublishable } from "../src/social/queue.js";
import { buildSocialProfileInventory } from "../src/social/inventory.js";
import { decideSocialProfileDay, type SocialDailySelectionInput } from "../src/social/daily.js";
import { persistSocialDailyDecision } from "../src/social/daily-store.js";
import { loadSocialProviderRegistry, SocialProviderRegistrySchema } from "../src/social/providers.js";
import { loadSocialPublisherRegistry, SocialPublisherRegistrySchema } from "../src/social/publisher-targets.js";
import { SocialRoutineScopeRegistrySchema } from "../src/social/routines.js";
import { loadSocialProfileStrategies } from "../src/social/strategies.js";
import type { AmplifierEligibility } from "../src/social/amplifiers.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";
import { configRoot } from "../src/paths.js";

const now = new Date("2026-08-28T09:00:00.000Z");

async function activeInputs(): Promise<SocialDailySelectionInput> {
  const [publisherRaw, providerRaw, strategies, capabilityMap] = await Promise.all([loadSocialPublisherRegistry(), loadSocialProviderRegistry(), loadSocialProfileStrategies(), loadVentureCapabilityMap(configRoot)]);
  const publisher = structuredClone(publisherRaw); const provider = structuredClone(providerRaw);
  const profile = publisher.profiles.find(({ id }) => id === "social-profile-caught-up")!;
  profile.lifecycle = "active"; profile.liveEligible = true; profile.updatedAt = now.toISOString();
  const connection = publisher.connections.find(({ id }) => id === "social-connection-caught-up-threads")!;
  connection.mode = "autopublish"; connection.health = { status: "healthy", unavailableReason: null }; connection.enabledByHumanAt = "2026-08-27T00:00:00.000Z";
  const binding = provider.bindings.find(({ connectionId }) => connectionId === connection.id)!;
  binding.mode = "active"; binding.ownerActivationRef = "owner:connection-activation-001"; binding.authorityRef = "owner:publish-authority-001"; binding.effectiveAt = "2026-08-27T00:00:00.000Z"; binding.health = { state: "healthy", unavailableReason: "none", lastVerifiedAt: "2026-08-27T00:00:00.000Z" }; binding.bindingHash = providerBindingHash(binding);
  const strategy = strategies.strategies.find(({ profileId }) => profileId === profile.id)!;
  const inventory = buildSocialProfileInventory({ profile, strategy, campaigns: [], now, mode: "weekly", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/2026-08-28.json" }).inventory;
  const candidate = inventory.candidates.filter(({ state, candidateType }) => state === "eligible" && candidateType === "original").sort((left, right) => left.usefulWindow.earliest.localeCompare(right.usefulWindow.earliest))[0]!;
  const preparedBase = {
    schemaVersion: "social-prepared-candidate/1" as const,
    candidateId: candidate.id,
    sourceVentureId: "caught-up",
    releaseId: "caught-up-original-2026-08-28",
    campaignId: "caught-up-original-2026-08-28",
    target: { profileId: profile.id, profileRole: "venture-primary" as const, role: "primary" as const, connectionId: connection.id, capabilityRef: null, amplifierEligibilityRef: null, campaignApprovalRef: null },
    sourcePackage: { schemaVersion: "approved-publish-package/1" as const, artifactRef: "state/ventures/caught-up/packages/2026-08-28.json", packageHash: "a".repeat(64) },
    objective: "trust" as const,
    audience: "People evaluating evidence-backed AI products.",
    destination: "https://example.com/caught-up",
    utm: { source: candidate.platform, medium: "organic_social" as const, campaign: "caught-up-original-2026-08-28", content: candidate.formatId },
    content: { text: "A bounded evidence-backed update.", altText: null, assetPaths: [], factualClaimRefs: ["evidence:caught-up-update"], rendererVersion: "carousel-studio-1" as const },
    publishWindow: { notBefore: candidate.usefulWindow.earliest, notAfter: candidate.usefulWindow.latest },
    formatId: candidate.formatId,
    sourceKind: "strategy-owned" as const,
    contentClass: "original" as const,
    riskClass: "low" as const,
    evidenceRefs: ["config/social-profile-strategies.json", "owner:prepared-content-001"],
    checks: { schema: "pass" as const, brand: "pass" as const, claims: "pass" as const, quill: "pass" as const, keeper: "pass" as const, duplicate: "pass" as const, accessibility: "pass" as const, budget: "pass" as const, capability: "pass" as const, policy: "pass" as const },
    approvalRef: "owner:prepared-content-001",
    estimatedCostUsd: 0,
    queueAuthorized: false as const,
    publishingAuthorized: false as const
  };
  const prepared = SocialPreparedCandidateSchema.parse({ ...preparedBase, preparedHash: socialPreparedCandidateHash(preparedBase as Omit<SocialPreparedCandidate, "preparedHash">) });
  const scope = SocialRoutineScopeSchema.parse({
    schemaVersion: "social-routine-scope/1", id: "social-routine-scope-caught-up-threads-original", version: "1.0.0", status: "active", profileId: profile.id, connectionId: connection.id, platform: candidate.platform, locales: [candidate.locale], allowedContentClasses: ["original"], allowedFormats: [candidate.formatId], allowedSourceKinds: ["strategy-owned"],
    evidenceRequirements: { minimumEvidenceRefs: 2, approvedPackageRequired: true, campaignApprovalRequired: false, claimsRequired: true, accessibilityRequired: true }, bounds: { maximumPostsPerDay: 1, minimumHoursBetweenPosts: 20, maximumItemCostUsd: 0 }, effectiveOn: "2026-08-28", expiresOn: "2026-09-28", prohibitedRiskClasses: ["political", "sensitive", "novel", "paid", "policy-changing"], prohibitedActions: ["account-create", "oauth", "credential-change", "provider-change", "engagement", "dm", "ad", "contest", "silent-failover"], approvalRef: "owner:scope-approval-001", countersignatureRef: "owner:scope-countersignature-001", revocationRef: null, killBehavior: "pause-and-preserve-evidence", history: [{ revision: 1, at: "2026-08-28T00:00:00.000Z", action: "countersigned", actor: "owner", evidenceRef: "owner:scope-countersignature-001", reason: "Exact low-risk original Threads format." }], authorityGranted: false, publishingAuthorized: false
  });
  return {
    profile, connection, strategy, inventory, campaigns: [], preparedCandidates: [prepared],
    routineScopes: SocialRoutineScopeRegistrySchema.parse({ schemaVersion: "social-routine-scope-registry/1", version: "1.0.0", defaultMode: "draft-only", updatedAt: "2026-08-28T00:00:00.000Z", ownerDecisionRef: "owner:routine-scope-registry", scopes: [scope] }),
    publisherRegistry: SocialPublisherRegistrySchema.parse(publisher), providerRegistry: SocialProviderRegistrySchema.parse(provider), capabilityMap,
    environment: { META_GRAPH_API_VERSION: "v26.0", CAUGHT_UP_THREADS_ACCESS_TOKEN: "token", CAUGHT_UP_THREADS_USER_ID: "user-id" }, now,
    policy: { originalSupportRatioEligible: true, cooldownClear: true, campaignCapacityAvailable: true, budgetRemainingUsd: 0, runwayComplete: true }, sent: { sentToday: 0, lastSentAt: null, similarityHashes: [] }, kills: { global: false, profile: false, connection: false }, ambiguousDelivery: false
  };
}

function rehashPrepared(prepared: SocialPreparedCandidate, changes: Partial<SocialPreparedCandidate>): SocialPreparedCandidate {
  const { preparedHash: _preparedHash, ...base } = { ...prepared, ...changes };
  return SocialPreparedCandidateSchema.parse({ ...base, preparedHash: socialPreparedCandidateHash(base) });
}

async function acceptedAmplifierCampaignInputs(): Promise<SocialDailySelectionInput> {
  const input = await activeInputs();
  const fixture = JSON.parse(await readFile(path.join(configRoot, "../contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: unknown };
  const capabilityRef = (input.capabilityMap.edges.find(({ source, target, capability }) => source === "door-money" && target === "social-distribution" && capability === "approved-publish-package"))!;
  const reference = { mapVersion: input.capabilityMap.mapVersion, source: "door-money" as const, target: "social-distribution" as const, capability: "approved-publish-package" as const, dataSchemaVersion: "approved-publish-package/1" as const, decisionReference: capabilityRef.governingReference };
  const profile = SocialProfileSchema.parse({
    schemaVersion: "social-profile/1", id: "social-profile-founders-ledger", displayLabel: "Founders Ledger", kind: "owned-brand", role: "owned-amplifier", ownerRef: "boardlessai", ventureRef: null, brandRef: "founders-ledger",
    purpose: "Explain one bounded founder-finance idea with original context.", audience: "English-speaking early-stage founders.", languages: ["en"], markets: ["US"], supportedTopics: ["founder-finance"], supportedVentures: ["door-money"], capabilityRefs: [reference], amplifierArchetype: "topic-editorial",
    amplifierEligibility: { verdict: "accept", evaluatedAt: "2026-08-27T00:00:00.000Z", purposeGateRef: "fixture:owner-amplifier-decision-001", canonicalPolicyRef: "GitHub #415" }, originalContentPromise: "Four useful original explainers for every support post.", recurringFormatRefs: ["one-number", "decision-tree"], avatar: { kind: "descriptor", descriptor: "Abstract ledger mark", reference: null }, lifecycle: "active", liveEligible: true,
    createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z", provenance: { source: "owner", recordedBy: "owner", evidenceRefs: ["fixture:owner-amplifier-decision-001"], fixtureKey: null }, notes: "Transparent owned amplifier fixture."
  });
  const connection = SocialConnectionSchema.parse({ ...(input.connection as Record<string, unknown>), id: "social-connection-founders-ledger-threads", profileId: profile.id, publicHandle: "@foundersledger", credentialRef: "FOUNDERS_LEDGER_THREADS_ACCESS_TOKEN", nativeAccountIdRef: "FOUNDERS_LEDGER_THREADS_USER_ID" });
  const publisher = structuredClone(input.publisherRegistry); publisher.profiles.push(profile); publisher.connections.push(connection);
  const provider = structuredClone(input.providerRegistry); const binding = structuredClone(provider.bindings.find(({ connectionId }) => connectionId === (input.connection as { id: string }).id)!);
  Object.assign(binding, { id: "social-provider-binding-founders-ledger-threads-direct-meta", connectionId: "social-connection-founders-ledger-threads", credentialRefs: ["FOUNDERS_LEDGER_THREADS_ACCESS_TOKEN", "FOUNDERS_LEDGER_THREADS_USER_ID"] }); binding.bindingHash = providerBindingHash(binding); provider.bindings.push(binding);
  const strategy = SocialProfileStrategySchema.parse({ ...(input.strategy as Record<string, unknown>), id: "social-profile-strategy-founders-ledger", profileId: profile.id, profileRole: "owned-amplifier", purpose: profile.purpose, audience: profile.audience, languages: profile.languages, markets: profile.markets, allowedCapabilities: [reference], localeToneGuidance: [{ locale: "en", guidance: "Clear founder-finance context with explicit evidence boundaries." }] });
  const campaignRaw = structuredClone(SocialCampaignSchema.parse(fixture.campaign));
  const primaryTarget = campaignRaw.targets[0]!; const primaryItem = campaignRaw.channelItems[0]!;
  const amplifierTarget = { ...primaryTarget, id: "founders-ledger-amplifier", role: "amplifier", profileId: profile.id, ventureRef: null, capabilityRef: reference, amplifierEligibilityRef: "fixture:owner-amplifier-decision-001", reasons: ["fit"], selection: { hardGates: [{ gate: "real-owned-profile", status: "pass", reason: "Transparent active owned amplifier.", evidenceRef: "fixture:owner-amplifier-decision-001" }], score: { total: 92, components: [{ component: "audience-fit", value: 92, weight: 1, reason: "Bounded audience fit.", evidenceRef: "fixture:owner-amplifier-decision-001" }] } } };
  const approvedAt = "2026-08-28T08:00:00.000Z"; const approvalRef = "owner:campaign-item-approval-001";
  const amplifierItem = { ...primaryItem, id: "founders-ledger-threads-001", targetId: amplifierTarget.id, channel: "threads", locale: "en", connectionRef: "social-connection-founders-ledger-threads", providerRef: "direct-meta", audience: profile.audience, copy: { ...primaryItem.copy, text: "Cash timing is not profit: map the invoice, payment, and obligation dates.", commentaryType: "profile-native-commentary", assets: [] }, assetHashes: [], window: { notBefore: "2026-08-28T10:00:00.000Z", notAfter: "2026-08-28T12:00:00.000Z" }, utm: { source: "threads", medium: "organic_social", campaign: "door-money-release-001", content: "founders-ledger-threads-001" }, approval: { status: "approved", bindingHash: "4".repeat(64), approvalRef, approvedAt, approvedBy: "owner" }, status: "approved" };
  const campaign = SocialCampaignSchema.parse({ ...campaignRaw, status: "approved", selectionOutcome: "selected", holdReasons: [], targets: [...campaignRaw.targets, amplifierTarget], channelItems: [...campaignRaw.channelItems, amplifierItem], updatedAt: approvedAt });
  const built = buildSocialProfileInventory({ profile, strategy, campaigns: [campaign], now, mode: "weekly", capacityDecision: "run", capacityPlanRef: "state/operations/capacity/2026-08-28.json" }).inventory;
  const candidate = built.candidates.find(({ candidateType }) => candidateType === "campaign")!;
  const inventory = SocialProfileInventorySchema.parse({ ...built, candidates: [candidate], counts: { original: 0, reserve: 0, recurring: 0, campaign: 1, eligible: 1, held: 0 }, ratioProjection: { ...built.ratioProjection, original: 0, support: 1 } });
  const preparedBase = { schemaVersion: "social-prepared-candidate/1" as const, candidateId: candidate.id, sourceVentureId: "door-money" as const, releaseId: campaign.releaseId, campaignId: campaign.id, target: { profileId: profile.id, profileRole: "owned-amplifier" as const, role: "amplifier" as const, connectionId: connection.id, capabilityRef: reference, amplifierEligibilityRef: amplifierTarget.amplifierEligibilityRef, campaignApprovalRef: approvalRef }, sourcePackage: campaign.sourcePackage, objective: "qualified_visit" as const, audience: amplifierItem.audience, destination: amplifierItem.copy.destination, utm: amplifierItem.utm, content: { text: amplifierItem.copy.text, altText: null, assetPaths: [], factualClaimRefs: amplifierItem.copy.factualClaimRefs, rendererVersion: "carousel-studio-1" as const }, publishWindow: amplifierItem.window, formatId: amplifierItem.copy.commentaryType, sourceKind: "accepted-campaign" as const, contentClass: "campaign-amplifier" as const, riskClass: "low" as const, evidenceRefs: [campaign.releaseVerification.evidenceRef, approvalRef], checks: { schema: "pass" as const, brand: "pass" as const, claims: "pass" as const, quill: "pass" as const, keeper: "pass" as const, duplicate: "pass" as const, accessibility: "pass" as const, budget: "pass" as const, capability: "pass" as const, policy: "pass" as const }, approvalRef, estimatedCostUsd: 0, queueAuthorized: false as const, publishingAuthorized: false as const };
  const prepared = SocialPreparedCandidateSchema.parse({ ...preparedBase, preparedHash: socialPreparedCandidateHash(preparedBase as Omit<SocialPreparedCandidate, "preparedHash">) });
  const scope = SocialRoutineScopeSchema.parse({ ...(input.routineScopes as ReturnType<typeof SocialRoutineScopeRegistrySchema.parse>).scopes[0], id: "social-routine-scope-founders-ledger-threads-campaign", profileId: profile.id, connectionId: connection.id, locales: ["en"], allowedContentClasses: ["campaign-amplifier"], allowedFormats: [candidate.formatId], allowedSourceKinds: ["accepted-campaign"], evidenceRequirements: { minimumEvidenceRefs: 2, approvedPackageRequired: true, campaignApprovalRequired: true, claimsRequired: true, accessibilityRequired: true } });
  const eligibility = { supportEligibility: { eligible: true, reasons: [] }, purposeEvidenceRef: "fixture:owner-amplifier-decision-001" } as unknown as AmplifierEligibility;
  return { ...input, profile, connection, strategy, inventory, campaigns: [campaign], preparedCandidates: [prepared], routineScopes: SocialRoutineScopeRegistrySchema.parse({ ...(input.routineScopes as Record<string, unknown>), scopes: [scope] }), publisherRegistry: SocialPublisherRegistrySchema.parse(publisher), providerRegistry: SocialProviderRegistrySchema.parse(provider), environment: { ...input.environment, FOUNDERS_LEDGER_THREADS_ACCESS_TOKEN: "token", FOUNDERS_LEDGER_THREADS_USER_ID: "user-id" }, amplifierEligibility: { [profile.id]: eligibility } };
}

describe("deterministic Social Distribution daily selection", () => {
  it("queues one exact low-risk original only inside the countersigned scope", async () => {
    const input = await activeInputs(); const result = decideSocialProfileDay(input);
    expect(result.operation).toMatchObject({ outcome: "queued", routineScopeState: "matched", providerConnectionState: "ready", reasons: ["selected"], replayed: false });
    expect(result.queueItem).toMatchObject({ schemaVersion: 2, status: "queued", selectedBy: "PULSE", target: { profileId: "social-profile-caught-up", connectionBindingRef: "social-connection-caught-up-threads" } });
    expect(() => assertQueueItemPublishable(result.queueItem!)).not.toThrow();
    expect(result.operation.queue?.payloadHash).toBe(result.queueItem?.content.contentHash);
  });

  it("keeps the production draft-only default in review and never creates a queue item", async () => {
    const input = await activeInputs(); input.routineScopes = { ...(input.routineScopes as Record<string, unknown>), scopes: [] };
    const result = decideSocialProfileDay(input);
    expect(result.operation).toMatchObject({ outcome: "review", routineScopeState: "draft-only", reasons: ["draft-only"], queue: null });
    expect(result.queueItem).toBeNull();
  });

  it("queues one exact accepted amplifier campaign without recalculating #410", async () => {
    const result = decideSocialProfileDay(await acceptedAmplifierCampaignInputs());
    expect(result.operation).toMatchObject({ outcome: "queued", reasons: ["selected"], routineScopeState: "matched", providerConnectionState: "ready" });
    expect(result.queueItem).toMatchObject({ sourceVentureId: "door-money", action: "publish-original", target: { role: "amplifier", profileId: "social-profile-founders-ledger", campaignApprovalRef: "owner:campaign-item-approval-001" } });
  });

  it("uses explicit NO_POST outcomes for amplifier ratio, cooldown, runway, capacity and expiry", async () => {
    for (const [policy, reason] of [
      [{ originalSupportRatioEligible: false }, "original-support-ratio"],
      [{ cooldownClear: false }, "cooldown"],
      [{ runwayComplete: false }, "incomplete-runway"],
      [{ campaignCapacityAvailable: false }, "campaign-capacity"]
    ] as const) {
      const input = await acceptedAmplifierCampaignInputs(); input.policy = { ...input.policy, ...policy };
      expect(decideSocialProfileDay(input).operation).toMatchObject({ outcome: "NO_POST", reasons: [reason], selectedCandidateRef: null, queue: null });
    }
    const expired = await acceptedAmplifierCampaignInputs(); expired.campaigns = [SocialCampaignSchema.parse({ ...(expired.campaigns[0] as Record<string, unknown>), status: "expired" })];
    expect(decideSocialProfileDay(expired).operation).toMatchObject({ outcome: "NO_POST", reasons: ["expired-campaign"], queue: null });
  });

  it("holds a stale amplifier capability before queue construction", async () => {
    const input = await acceptedAmplifierCampaignInputs(); const inventory = structuredClone(input.inventory as ReturnType<typeof SocialProfileInventorySchema.parse>);
    inventory.candidates[0]!.capabilityRef!.mapVersion = "0.0.1"; input.inventory = SocialProfileInventorySchema.parse(inventory);
    const result = decideSocialProfileDay(input);
    expect(result.operation).toMatchObject({ outcome: "held", reasons: ["denied-capability"], queue: null });
    expect(result.operation.gates.find(({ gate }) => gate === "capability")).toMatchObject({ status: "fail" });
  });

  it("keeps format mismatch and sensitive content review-only", async () => {
    const mismatch = await activeInputs(); const registry = structuredClone(mismatch.routineScopes as ReturnType<typeof SocialRoutineScopeRegistrySchema.parse>); registry.scopes[0]!.allowedFormats = ["different-format"];
    expect(decideSocialProfileDay({ ...mismatch, routineScopes: SocialRoutineScopeRegistrySchema.parse(registry) }).operation).toMatchObject({ outcome: "review", routineScopeState: "mismatch", reasons: ["routine-scope-mismatch"] });
    const sensitive = await activeInputs(); sensitive.preparedCandidates = [rehashPrepared(sensitive.preparedCandidates[0] as SocialPreparedCandidate, { riskClass: "sensitive" })];
    expect(decideSocialProfileDay(sensitive).operation).toMatchObject({ outcome: "review", reasons: ["sensitive-review"], queue: null });
  });

  it("records duplicate and cadence NO_POST without filler", async () => {
    const duplicate = await activeInputs(); duplicate.sent.similarityHashes = (duplicate.inventory as { candidates: Array<{ similarityHash: string }> }).candidates.map(({ similarityHash }) => similarityHash);
    expect(decideSocialProfileDay(duplicate).operation).toMatchObject({ outcome: "NO_POST", reasons: ["duplicate-similarity"], selectedCandidateRef: null, queue: null });
    const cadence = await activeInputs(); cadence.sent.sentToday = 1;
    expect(decideSocialProfileDay(cadence).operation).toMatchObject({ outcome: "NO_POST", reasons: ["rest-cadence-window"], selectedCandidateRef: null });
  });

  it("holds one connection on provider outage without failover or regeneration", async () => {
    const input = await activeInputs(); const registry = structuredClone(input.providerRegistry); const binding = registry.bindings.find(({ connectionId }) => connectionId === (input.connection as { id: string }).id)!; binding.health = { state: "degraded", unavailableReason: "provider-outage", lastVerifiedAt: now.toISOString() }; binding.bindingHash = providerBindingHash(binding); input.providerRegistry = SocialProviderRegistrySchema.parse(registry);
    const result = decideSocialProfileDay(input);
    expect(result.operation).toMatchObject({ outcome: "held", reasons: ["provider-held"], providerConnectionState: "held", queue: null });
    expect(result.operation.gates.find(({ gate }) => gate === "provider")).toMatchObject({ status: "hold" });
  });

  it("pauses on every kill level and holds ambiguity for #409/#417 reconciliation", async () => {
    for (const level of ["global", "profile", "connection"] as const) {
      const input = await activeInputs(); input.kills[level] = true;
      expect(decideSocialProfileDay(input).operation).toMatchObject({ outcome: "paused", queue: null });
    }
    const ambiguous = await activeInputs(); ambiguous.ambiguousDelivery = true;
    expect(decideSocialProfileDay(ambiguous).operation).toMatchObject({ outcome: "held", reasons: ["ambiguous-delivery-reconciliation"], providerConnectionState: "ambiguous", queue: null });
  });

  it("replays the same effective input without creating a second queue item", async () => {
    const input = await activeInputs(); const first = decideSocialProfileDay(input); const replay = decideSocialProfileDay({ ...input, existingOperation: first.operation });
    expect(replay).toMatchObject({ operation: { id: first.operation.id, idempotencyKey: first.operation.idempotencyKey }, queueItem: null, replayed: true });
  });

  it("persists one append-only operation and one matching canonical queue handoff", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-daily-store-"));
    try {
      const decision = decideSocialProfileDay(await activeInputs());
      const first = await persistSocialDailyDecision(root, decision);
      const second = await persistSocialDailyDecision(root, decision);
      expect(first).toMatchObject({ appended: true, replayed: false });
      expect(second).toMatchObject({ appended: false, replayed: true });
      const operation = JSON.parse(await readFile(path.join(root, `social/profile-operations/${decision.operation.id}.json`), "utf8")) as unknown;
      const queue = JSON.parse(await readFile(path.join(root, `social/queue/${decision.queueItem!.id}.json`), "utf8")) as unknown;
      expect(operation).toEqual(decision.operation);
      expect(queue).toEqual(decision.queueItem);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("holds malformed inventory and non-live authority instead of inventing a candidate", async () => {
    const malformed = await activeInputs(); malformed.inventory = { schemaVersion: "social-profile-inventory/1", profileId: "broken" };
    expect(decideSocialProfileDay(malformed).operation).toMatchObject({ outcome: "held", reasons: ["malformed-strategy-inventory"], queue: null });
    const nonLive = await activeInputs(); const registry = structuredClone(nonLive.publisherRegistry); const profile = registry.profiles.find(({ id }) => id === (nonLive.profile as { id: string }).id)!; profile.lifecycle = "proposed"; profile.liveEligible = false; nonLive.profile = profile; nonLive.publisherRegistry = SocialPublisherRegistrySchema.parse(registry);
    expect(decideSocialProfileDay(nonLive).operation).toMatchObject({ outcome: "held", reasons: ["connection-held"], queue: null });
  });
});
