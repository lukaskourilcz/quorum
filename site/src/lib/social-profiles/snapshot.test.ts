import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseSocialProfileEvent, resolveSocialProfileSection } from "./model";
import { createAdminSocialProfileSimulations } from "./simulation-fixtures";
import { readAdminSocialProfiles } from "./snapshot";

const repositoryRoot = path.resolve(process.cwd(), "..");
const temporaryRoots: string[] = [];

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-profiles-test-"));
  temporaryRoots.push(root);
  for (const relative of [
    "config/social-publisher-registry.json",
    "config/social-providers.json",
    "config/social-profile-strategies.json",
    "config/social-routine-scopes.json",
    "config/social-amplification-policy.json",
    "config/venture-capabilities.json",
    "state/social/activation.json",
    "state/social/amplifiers/portfolio.json"
  ]) {
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await cp(path.join(repositoryRoot, relative), path.join(root, relative));
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("Social Profiles server snapshot", () => {
  it("keeps real groups, capability truth and missing metrics honest", async () => {
    const snapshot = await readAdminSocialProfiles(repositoryRoot, {
      environment: { NODE_ENV: "test", SOCIAL_KILL_SWITCH: "true", CAUGHT_UP_THREADS_ACCESS_TOKEN: "must-not-cross" },
      now: new Date("2026-08-27T12:00:00.000Z")
    });

    expect(snapshot.ventureProfiles).toHaveLength(6);
    expect(snapshot.amplificationProfiles).toEqual([]);
    expect(snapshot.simulations).toEqual([]);
    expect(snapshot.campaigns).toEqual([]);
    expect(snapshot.campaignDecisions).toEqual([]);
    expect(snapshot.network).toMatchObject({ contacts: [], shareKits: [], benchmark: { target: 50, actual: 0, optedInOrActive: 0, fabricatedProgress: false } });
    expect(snapshot.dropped).toEqual({ profiles: 0, connections: 0, amplifierProposals: 0, events: 0, campaigns: 0, campaignDecisions: 0, campaignEvents: 0, networkContacts: 0, networkContactEvents: 0, networkShareKits: 0, networkShareKitEvents: 0, providerRecords: 0, providerBindings: 0, providerReceipts: 0, providerHealth: 0, inventoryStrategies: 0, inventories: 0, inventoryReceipts: 0, inventoryIncidents: 0, resultObservations: 0, attributionEvents: 0, resultBaselines: 0, resultExperiments: 0, boostProposals: 0, dailyOperations: 0, routineScopes: 0, learningRecords: 0, pauseRecords: 0 });
    expect(snapshot.providerControl).toMatchObject({ summary: { directCoreAvailable: true, activeBindings: 0, heldBindings: 6, ambiguousReceipts: 0 }, authorityGranted: false, purchaseAuthorized: false, automaticFailover: false });
    expect(snapshot.contentRunway).toMatchObject({ summary: { strategies: 6, healthy: 0, lowOrNoRunway: 0, unavailable: 6, actualCostUsd: 0 }, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false });
    expect(snapshot.socialResults).toMatchObject({ summary: { observations: 0, measuredPosts: 0, unavailablePosts: 0, attributedEvents: 0, unattributedEvents: 0, activeExperiments: 0, actualCostUsd: null }, audienceIdentityExposed: false, privateMessagesExposed: false, authorityGranted: false, spendAuthorized: false });
    expect(snapshot.today).toMatchObject({ targetDate: "2026-08-27", operations: [], routineScopes: [], summary: { queued: 0, review: 0, held: 0, paused: 0, noPost: 0, attention: 0, actualCostUsd: 0 }, authorityGranted: false, publishingAuthorized: false });
    expect(snapshot.posture).toMatchObject({ globalKillSwitch: "engaged", liveAuthorityGranted: false });
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.ventureRef === "door-money")).toMatchObject({
      lifecycle: "proposed",
      capability: { decision: "allowed", governingReference: "GitHub #424" },
      connections: [],
      operationalMetrics: null
    });
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.ventureRef === "booksofhistory")?.capability.decision).toBe("denied");
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.ventureRef === "tehdejsi-svet")?.capability.decision).toBe("denied");
    expect(snapshot.ventureProfiles.some(({ profile }) => ["personal-growth", "kvorum"].includes(profile.ventureRef ?? ""))).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain("must-not-cross");
  });

  it("loads the shared fifty-profile matrix only for an explicit non-production request", async () => {
    const shared = createAdminSocialProfileSimulations();
    const preview = await readAdminSocialProfiles(repositoryRoot, { includeSimulations: true, environment: { NODE_ENV: "test" } });
    const production = await readAdminSocialProfiles(repositoryRoot, { includeSimulations: true, environment: { NODE_ENV: "production" } });

    expect(shared).toHaveLength(50);
    expect(preview.simulations).toHaveLength(50);
    expect(preview.simulationsIncluded).toBe(true);
    expect(preview.ventureProfiles).toHaveLength(6);
    expect(preview.simulations[9]?.profile.displayLabel).toContain("extended multilingual");
    expect(preview.simulations.every(({ profile }) => profile.kind === "simulation" && !profile.liveEligible)).toBe(true);
    expect(production.simulations).toEqual([]);
    expect(production.simulationsIncluded).toBe(false);
  });

  it("drops one malformed record and reduces append-only lifecycle evidence", async () => {
    const root = await fixtureRoot();
    const registryPath = path.join(root, "config/social-publisher-registry.json");
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { profiles: unknown[]; connections: unknown[] };
    registry.profiles.push({ schemaVersion: "social-profile/1", id: "broken" });
    registry.connections.push({ schemaVersion: "social-connection/1", id: "broken" });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    const event = {
      schemaVersion: "social-profile-event/1",
      eventId: "social-profile-event-door-money-pause-001",
      at: "2026-08-27T10:00:00.000Z",
      profileId: "social-profile-door-money",
      connectionId: null,
      action: "paused",
      actor: "owner",
      provenanceRef: "admin:social-profiles",
      reason: "Pause the internal proposal while its setup decision is reviewed.",
      supersededEventRef: null
    };
    await mkdir(path.join(root, "state/social/profile-events"), { recursive: true });
    await writeFile(path.join(root, "state/social/profile-events/event.json"), `${JSON.stringify(event, null, 2)}\n`);

    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    expect(snapshot.dropped.profiles).toBe(1);
    expect(snapshot.dropped.connections).toBe(1);
    expect(snapshot.activity).toHaveLength(1);
    expect(snapshot.ventureProfiles.find(({ profile }) => profile.id === event.profileId)?.lifecycle).toBe("paused");
    expect(parseSocialProfileEvent({ ...event, action: "corrected" })).toBeNull();
  });

  it("projects validated campaign evidence without inventing results or Contest Radar records", async () => {
    const root = await fixtureRoot();
    const contracts = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: unknown };
    await mkdir(path.join(root, "state/social/campaigns"), { recursive: true });
    await writeFile(path.join(root, "state/social/campaigns/campaign.json"), `${JSON.stringify(contracts.campaign, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/campaigns/skip.decision.json"), `${JSON.stringify({ schemaVersion: "social-campaign-generation-decision/1", id: "social-campaign-decision-aaaaaaaaaaaaaaaaaaaa", releaseId: "irrelevant-release", sourceVentureId: "mma-files", idempotencyKey: "a".repeat(64), decision: "skip", reasons: ["missing-stale-held-or-denied-capability"], campaignId: null, evidenceRefs: ["fixture:release"], decidedAt: "2026-08-27T00:00:00.000Z", authorityGranted: false, publishingAuthorized: false }, null, 2)}\n`);

    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    expect(snapshot.campaigns).toHaveLength(1);
    expect(snapshot.campaigns[0]).toMatchObject({ campaign: { releaseId: "door-money-release-001", selectionOutcome: "primary-only", measurementAvailability: "manual-only" }, operationalResults: null, appliedEvents: 0, rejectedEvents: 0 });
    expect(snapshot.campaigns[0]!.targetApprovalHashes["door-money-primary"]).toMatch(/^[a-f0-9]{64}$/u);
    expect(snapshot.campaignDecisions).toMatchObject([{ sourceVentureId: "mma-files", decision: "skip" }]);
    expect(JSON.stringify(snapshot)).not.toContain("contest-radar");
  });

  it("keeps Venture result and campaign attribution evidence bounded and unavailable-aware", async () => {
    const root = await fixtureRoot();
    const campaignFixture = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-distribution-contracts.valid.json"), "utf8")) as { campaign: unknown };
    const resultFixture = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-results-contracts.valid.json"), "utf8")) as { observation: Record<string, unknown>; attribution: unknown; baseline: unknown; experiment: unknown; boostProposal: unknown };
    await mkdir(path.join(root, "state/social/campaigns"), { recursive: true });
    await mkdir(path.join(root, "state/social/results/observations"), { recursive: true });
    await mkdir(path.join(root, "state/social/results/attribution"), { recursive: true });
    await mkdir(path.join(root, "state/social/results/baselines"), { recursive: true });
    await mkdir(path.join(root, "state/social/results/boost-proposals"), { recursive: true });
    await writeFile(path.join(root, "state/social/campaigns/campaign.json"), `${JSON.stringify(campaignFixture.campaign, null, 2)}\n`);
    const observation = { ...resultFixture.observation, profileId: "social-profile-door-money", connectionId: "social-connection-door-money-held", platform: "instagram", nativePostId: "instagram-post-123", publicUrl: "https://www.instagram.com/p/example/", campaignRef: "state/social/campaigns/social-campaign-door-money-release-001.json", campaignItemId: "door-money-instagram-001", releaseId: "door-money-release-001", sourceVentureId: "door-money", format: "carousel", unavailableReason: null, metrics: [{ name: "verified_publish", value: 1, unavailableReason: null }, { name: "reach", value: 120, unavailableReason: null }], policyState: { ...(resultFixture.observation.policyState as Record<string, unknown>), campaignState: "completed" } };
    await writeFile(path.join(root, "state/social/results/observations/observation.json"), `${JSON.stringify(observation, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/results/attribution/attribution.json"), `${JSON.stringify(resultFixture.attribution, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/results/baselines/baseline.json"), `${JSON.stringify(resultFixture.baseline, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/results/boost-proposals/proposal.json"), `${JSON.stringify(resultFixture.boostProposal, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/results/experiments.json"), `${JSON.stringify({ schemaVersion: "social-distribution-experiment-register/1", experiments: [resultFixture.experiment], updatedAt: "2026-08-29T12:00:00.000Z", authorityGranted: false }, null, 2)}\n`);

    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    expect(snapshot.socialResults.summary).toMatchObject({ observations: 1, measuredPosts: 1, unavailablePosts: 0, attributedEvents: 1, activeExperiments: 0, actualCostUsd: 0 });
    expect(snapshot.socialResults.profiles[0]).toMatchObject({ profileId: "social-profile-door-money", targetRole: "primary", verifiedPublishRate: 1, totals: { reach: 120, qualifiedActions: 1 }, providerState: "measured" });
    expect(snapshot.socialResults.campaigns[0]).toMatchObject({ sourceVentureId: "door-money", releaseId: "door-money-release-001", primaryOnly: true, qualifiedActions: 1, state: "measured" });
    expect(snapshot.socialResults.boostProposals).toHaveLength(1);
    expect(JSON.stringify(snapshot.socialResults)).not.toMatch(/"(?:visitorId|audienceIds|privateMessage|messageBody)":/iu);
  });

  it("projects a validated no-candidate inventory and receipt without forcing a post", async () => {
    const root = await fixtureRoot();
    const fixture = JSON.parse(await readFile(path.join(repositoryRoot, "contracts/fixtures/social-inventory-contracts.valid.json"), "utf8")) as { inventory: unknown; receipt: unknown };
    await mkdir(path.join(root, "state/social/inventory/social-profile-caught-up"), { recursive: true });
    await mkdir(path.join(root, "state/social/inventory-receipts"), { recursive: true });
    await writeFile(path.join(root, "state/social/inventory/social-profile-caught-up/current.json"), `${JSON.stringify(fixture.inventory, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/inventory-receipts/receipt.json"), `${JSON.stringify(fixture.receipt, null, 2)}\n`);

    const snapshot = await readAdminSocialProfiles(root, { environment: { NODE_ENV: "test" } });
    expect(snapshot.contentRunway.summary).toEqual({ strategies: 6, healthy: 0, lowOrNoRunway: 1, unavailable: 5, actualCostUsd: 0 });
    expect(snapshot.contentRunway.profiles.find(({ strategy }) => strategy.profileId === "social-profile-caught-up")).toMatchObject({
      state: "no-candidate",
      inventory: { candidates: [], coverageDays: 0, queueAuthorized: false, publishingAuthorized: false },
      latestReceipt: { status: "no-candidate", actualCostUsd: 0, authorityGranted: false }
    });
  });

  it("projects one bounded daily receipt and drops secret-bearing or orphan records", async () => {
    const root = await fixtureRoot(); await mkdir(path.join(root, "state/social/profile-operations"), { recursive: true });
    const operation = {
      schemaVersion: "social-profile-operation/1", id: "social-profile-operation-aaaaaaaaaaaaaaaaaaaa", profileId: "social-profile-caught-up", connectionId: "social-connection-caught-up-threads", targetDate: "2026-08-28", selectionWindow: { notBefore: "2026-08-28T08:00:00.000Z", notAfter: "2026-08-28T10:00:00.000Z" }, candidateRefs: ["state/social/inventory-candidates/social-inventory-candidate-aaaaaaaaaaaaaaaaaaaa.json"], selectedCandidateRef: null, immutableHashes: null,
      gates: [{ gate: "routine-scope", status: "hold", reason: "The exact scope is not countersigned.", evidenceRef: "docs/NEEDED.md#social-distribution-connection-001" }], routineScopeRef: null, routineScopeState: "draft-only", queue: null, outcome: "review", reasons: ["draft-only"], providerConnectionState: "unavailable", actualCostUsd: 0, incidentRefs: [], ownerAttentionRefs: ["docs/NEEDED.md#social-distribution-connection-001"], replayed: false, createdAt: "2026-08-28T08:00:00.000Z"
    };
    await writeFile(path.join(root, "state/social/profile-operations/valid.json"), `${JSON.stringify(operation, null, 2)}\n`);
    await writeFile(path.join(root, "state/social/profile-operations/secret.json"), `${JSON.stringify({ ...operation, id: "social-profile-operation-bbbbbbbbbbbbbbbbbbbb", accessToken: "must-not-cross" }, null, 2)}\n`);
    const snapshot = await readAdminSocialProfiles(root, { now: new Date("2026-08-28T08:30:00.000Z"), environment: { NODE_ENV: "test" } });
    expect(snapshot.today.operations).toMatchObject([{ profileId: "social-profile-caught-up", outcome: "review", routineScopeState: "draft-only", reasons: ["draft-only"], queue: null }]);
    expect(snapshot.today.summary).toMatchObject({ review: 1, attention: 1, actualCostUsd: 0 });
    expect(snapshot.dropped.dailyOperations).toBe(1);
    expect(JSON.stringify(snapshot.today)).not.toContain("must-not-cross");
  });

  it("falls unknown section bookmarks back to Venture Profiles", () => {
    expect(resolveSocialProfileSection("campaigns")).toBe("campaigns");
    expect(resolveSocialProfileSection("today")).toBe("today");
    expect(resolveSocialProfileSection("network")).toBe("network");
    expect(resolveSocialProfileSection("providers")).toBe("providers");
    expect(resolveSocialProfileSection("content-runway")).toBe("content-runway");
    expect(resolveSocialProfileSection("results")).toBe("results");
    expect(resolveSocialProfileSection("activity-setup")).toBe("activity-setup");
    expect(resolveSocialProfileSection("future-module")).toBe("venture-profiles");
  });
});
