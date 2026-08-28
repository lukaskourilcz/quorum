import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configRoot, repoRoot } from "../src/paths.js";
import type { AmplifierEligibility } from "../src/social/amplifiers.js";
import {
  CapabilityAwareQueueItemSchema,
  QueueItemSchema,
  assertQueueItemPublishable,
  capabilityAwareQueuePayloadHash,
  queuePayloadHash,
  type CapabilityAwareQueueItem
} from "../src/social/queue.js";
import {
  SocialPublisherRegistrySchema,
  loadSocialPublisherRegistry,
  migrateLegacyQueueItem,
  resolvePublisherTarget,
  type SocialPublisherRegistry
} from "../src/social/publisher-targets.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";

const environment = {
  CAUGHT_UP_THREADS_ACCESS_TOKEN: "fixture-token",
  CAUGHT_UP_THREADS_USER_ID: "fixture-user",
  CAUGHT_UP_INSTAGRAM_ACCESS_TOKEN: "fixture-token",
  CAUGHT_UP_INSTAGRAM_USER_ID: "fixture-user"
};

function activate(
  registry: SocialPublisherRegistry,
  profileId = "social-profile-caught-up",
  connectionId = "social-connection-caught-up-threads"
): SocialPublisherRegistry {
  const result = structuredClone(registry);
  const profile = result.profiles.find((candidate) => candidate.id === profileId)!;
  profile.lifecycle = "active";
  profile.liveEligible = true;
  const connection = result.connections.find((candidate) => candidate.id === connectionId)!;
  connection.mode = "autopublish";
  connection.health = { status: "healthy", unavailableReason: null };
  connection.enabledByHumanAt = "2026-08-27T00:00:00.000Z";
  return SocialPublisherRegistrySchema.parse(result);
}

function rehash(item: CapabilityAwareQueueItem): CapabilityAwareQueueItem {
  return CapabilityAwareQueueItemSchema.parse({
    ...item,
    content: { ...item.content, contentHash: capabilityAwareQueuePayloadHash(item) }
  });
}

async function legacyQueueItem(): Promise<unknown> {
  return JSON.parse(await readFile(
    path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"),
    "utf8"
  )) as unknown;
}

describe("capability-aware social publisher targets", () => {
  it("loads explicit held profile/connection bindings with separate per-profile caps", async () => {
    const registry = await loadSocialPublisherRegistry(configRoot);

    expect(SocialPublisherRegistrySchema.safeParse(registry).success).toBe(true);
    expect(registry.profiles.map((profile) => profile.id)).toEqual([
      "social-profile-caught-up",
      "social-profile-mma-files",
      "social-profile-titty-tuesdays"
    ]);
    expect(registry.connections).toHaveLength(6);
    expect(registry.connections.every((connection) =>
      connection.mode === "held"
      && connection.enabledByHumanAt === null
      && connection.credentialRef !== null
      && connection.nativeAccountIdRef !== null
    )).toBe(true);
    expect(registry.connections.filter((connection) => connection.platform === "threads")).toHaveLength(3);
    expect(new Set(registry.connections.map((connection) => `${connection.profileId}:${connection.platform}`)).size).toBe(6);
  });

  it("migrates legacy primary items deterministically without reclassifying their history", async () => {
    const [legacy, registry] = await Promise.all([legacyQueueItem(), loadSocialPublisherRegistry(configRoot)]);
    const first = migrateLegacyQueueItem(legacy, registry);
    const second = migrateLegacyQueueItem(legacy, registry);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaVersion: 2,
      sourceVentureId: "caught-up",
      target: {
        profileId: "social-profile-caught-up",
        profileRole: "venture-primary",
        role: "primary",
        connectionBindingRef: "social-connection-caught-up-threads"
      },
      action: "publish-original",
      migration: { sourceSchemaVersion: 1, mappingRef: "GitHub #409" }
    });
    expect(first.migration?.sourceContentHash).toBe((legacy as { content: { contentHash: string } }).content.contentHash);
    expect(capabilityAwareQueuePayloadHash(first)).toBe(first.content.contentHash);
    expect(() => assertQueueItemPublishable({ ...first, status: "queued" })).not.toThrow();

    const legacyBase = QueueItemSchema.parse(legacy);
    for (const [venture, profileId] of [
      ["caught-up", "social-profile-caught-up"],
      ["mma-files", "social-profile-mma-files"],
      ["titty-tuesdays", "social-profile-titty-tuesdays"]
    ] as const) {
      const candidateBase = { ...legacyBase, id: `${venture}-legacy-fixture`, venture };
      const candidate = QueueItemSchema.parse({
        ...candidateBase,
        content: { ...candidateBase.content, contentHash: queuePayloadHash(candidateBase) }
      });
      expect(migrateLegacyQueueItem(candidate, registry)).toMatchObject({
        sourceVentureId: venture,
        target: { profileId, role: "primary" },
        migration: { sourceContentHash: candidate.content.contentHash }
      });
    }
  });

  it("holds the committed registry and becomes eligible only after explicit profile/connection activation", async () => {
    const [legacy, committed, capabilityMap] = await Promise.all([
      legacyQueueItem(),
      loadSocialPublisherRegistry(configRoot),
      loadVentureCapabilityMap(configRoot)
    ]);
    const item = migrateLegacyQueueItem(legacy, committed);
    const held = resolvePublisherTarget({ item, registry: committed, capabilityMap, environment });
    expect(held).toMatchObject({ decision: "held", authorityGranted: false, publishingAuthorized: false });
    expect(held.reasons).toEqual(expect.arrayContaining(["profile-not-live-eligible", "connection-not-human-activated"]));

    const active = activate(committed);
    const eligible = resolvePublisherTarget({ item, registry: active, capabilityMap, environment });
    expect(eligible).toMatchObject({
      decision: "eligible",
      target: {
        credentialRef: "CAUGHT_UP_THREADS_ACCESS_TOKEN",
        nativeAccountIdRef: "CAUGHT_UP_THREADS_USER_ID",
        providerId: "direct-meta",
        apiVersion: "v26.0"
      },
      authorityGranted: false,
      publishingAuthorized: false
    });
  });

  it("fails closed on missing/expired references and profile or connection pause", async () => {
    const [legacy, committed, capabilityMap] = await Promise.all([
      legacyQueueItem(),
      loadSocialPublisherRegistry(configRoot),
      loadVentureCapabilityMap(configRoot)
    ]);
    const item = migrateLegacyQueueItem(legacy, committed);
    const active = activate(committed);
    expect(resolvePublisherTarget({ item, registry: active, capabilityMap, environment: {} }).reasons)
      .toEqual(expect.arrayContaining(["credential-unavailable", "native-account-id-unavailable"]));
    expect(resolvePublisherTarget({ item, registry: active, capabilityMap, environment, pausedProfileIds: new Set([item.target.profileId]) }).reasons)
      .toContain("profile-paused");
    expect(resolvePublisherTarget({ item, registry: active, capabilityMap, environment, pausedConnectionIds: new Set([item.target.connectionBindingRef]) }).reasons)
      .toContain("connection-paused");

    const expired = structuredClone(active);
    expired.connections.find((connection) => connection.id === item.target.connectionBindingRef)!.tokenExpiresAt = "2026-08-01T00:00:00.000Z";
    expect(resolvePublisherTarget({ item, registry: expired, capabilityMap, environment, now: new Date("2026-08-27T00:00:00.000Z") }).reasons)
      .toContain("credential-expired");
  });

  it("allows an exact umbrella edge and rejects its stale form", async () => {
    const [legacy, committed, capabilityMap] = await Promise.all([
      legacyQueueItem(),
      loadSocialPublisherRegistry(configRoot),
      loadVentureCapabilityMap(configRoot)
    ]);
    const primary = committed.profiles.find((profile) => profile.id === "social-profile-caught-up")!;
    const primaryConnection = committed.connections.find((connection) => connection.id === "social-connection-caught-up-threads")!;
    const capabilityRef = {
      mapVersion: capabilityMap.mapVersion,
      source: "door-money" as const,
      target: "social-distribution" as const,
      capability: "approved-publish-package" as const,
      dataSchemaVersion: "approved-publish-package/1" as const,
      decisionReference: "GitHub #424"
    };
    const umbrellaProfile = {
      ...primary,
      id: "social-profile-boardlessai-umbrella",
      displayLabel: "BoardlessAI",
      role: "company-umbrella" as const,
      ventureRef: null,
      supportedVentures: [],
      capabilityRefs: [],
      lifecycle: "active" as const,
      liveEligible: true
    };
    const umbrellaConnection = {
      ...primaryConnection,
      id: "social-connection-boardlessai-umbrella-threads",
      profileId: umbrellaProfile.id,
      mode: "autopublish" as const,
      health: { status: "healthy" as const, unavailableReason: null },
      enabledByHumanAt: "2026-08-27T00:00:00.000Z"
    };
    const registry = SocialPublisherRegistrySchema.parse({
      ...committed,
      profiles: [...committed.profiles, umbrellaProfile],
      connections: [...committed.connections, umbrellaConnection]
    });
    const migrated = migrateLegacyQueueItem(legacy, committed);
    const exact = rehash({
      ...migrated,
      sourceVentureId: "door-money",
      releaseId: "door-money-release-001",
      campaignId: "door-money-campaign-001",
      target: {
        profileId: umbrellaProfile.id,
        profileRole: "company-umbrella",
        role: "umbrella",
        connectionBindingRef: umbrellaConnection.id,
        capabilityRef,
        amplifierEligibilityRef: null,
        campaignApprovalRef: null
      },
      sourcePackage: {
        schemaVersion: "approved-publish-package/1",
        artifactRef: "state/ventures/door-money/packages/release-001.json",
        packageHash: "a".repeat(64)
      },
      migration: null,
      approvalProvenance: { approvalRef: "fixture:approval", selectionRef: "fixture:selection", policyRef: null }
    });
    expect(resolvePublisherTarget({ item: exact, registry, capabilityMap, environment })).toMatchObject({ decision: "eligible" });

    const stale = rehash({ ...exact, target: { ...exact.target, capabilityRef: { ...capabilityRef, mapVersion: "1.0.0" } } });
    expect(resolvePublisherTarget({ item: stale, registry, capabilityMap, environment })).toMatchObject({
      decision: "denied",
      reasons: ["missing-stale-held-or-denied-capability"]
    });
  });

  it("requires both #415 support eligibility and exact campaign approval for an amplifier", async () => {
    const [legacy, committed, capabilityMap] = await Promise.all([
      legacyQueueItem(),
      loadSocialPublisherRegistry(configRoot),
      loadVentureCapabilityMap(configRoot)
    ]);
    const primary = committed.profiles[0]!;
    const primaryConnection = committed.connections.find((connection) => connection.id === "social-connection-caught-up-threads")!;
    const capabilityRef = {
      mapVersion: capabilityMap.mapVersion,
      source: "door-money" as const,
      target: "social-distribution" as const,
      capability: "approved-publish-package" as const,
      dataSchemaVersion: "approved-publish-package/1" as const,
      decisionReference: "GitHub #424"
    };
    const amplifierProfile = {
      ...primary,
      id: "social-profile-founders-ledger",
      displayLabel: "Founders Ledger",
      role: "owned-amplifier" as const,
      ventureRef: null,
      supportedVentures: ["door-money" as const],
      capabilityRefs: [capabilityRef],
      amplifierArchetype: "topic-editorial" as const,
      amplifierEligibility: {
        verdict: "accept" as const,
        evaluatedAt: "2026-08-27T00:00:00.000Z",
        purposeGateRef: "fixture:amplifier-purpose-001",
        canonicalPolicyRef: "GitHub #415"
      },
      recurringFormatRefs: ["one-number", "decision-tree"],
      lifecycle: "active" as const,
      liveEligible: true
    };
    const amplifierConnection = {
      ...primaryConnection,
      id: "social-connection-founders-ledger-threads",
      profileId: amplifierProfile.id,
      mode: "autopublish" as const,
      health: { status: "healthy" as const, unavailableReason: null },
      enabledByHumanAt: "2026-08-27T00:00:00.000Z"
    };
    const registry = SocialPublisherRegistrySchema.parse({
      ...committed,
      profiles: [...committed.profiles, amplifierProfile],
      connections: [...committed.connections, amplifierConnection]
    });
    const migrated = migrateLegacyQueueItem(legacy, committed);
    const item = rehash({
      ...migrated,
      sourceVentureId: "door-money",
      releaseId: "door-money-release-001",
      campaignId: "door-money-campaign-001",
      target: {
        profileId: amplifierProfile.id,
        profileRole: "owned-amplifier",
        role: "amplifier",
        connectionBindingRef: amplifierConnection.id,
        capabilityRef,
        amplifierEligibilityRef: "fixture:amplifier-purpose-001",
        campaignApprovalRef: "fixture:campaign-approval-001"
      },
      sourcePackage: {
        schemaVersion: "approved-publish-package/1",
        artifactRef: "state/ventures/door-money/packages/release-001.json",
        packageHash: "b".repeat(64)
      },
      migration: null,
      approvalProvenance: { approvalRef: "fixture:approval", selectionRef: "fixture:selection", policyRef: "GitHub #415" }
    });
    expect(resolvePublisherTarget({ item, registry, capabilityMap, environment })).toMatchObject({
      decision: "denied",
      reasons: ["amplifier-eligibility-or-campaign-approval-missing"]
    });
    const eligibility = {
      supportEligibility: { eligible: true, reasons: [] },
      purposeEvidenceRef: "fixture:amplifier-purpose-001"
    } as unknown as AmplifierEligibility;
    expect(resolvePublisherTarget({
      item,
      registry,
      capabilityMap,
      environment,
      amplifierEligibility: { [amplifierProfile.id]: eligibility }
    })).toMatchObject({ decision: "eligible" });
  });

  it("structurally rejects sister/engagement/contact/private payload and isolated sources", async () => {
    const [legacy, committed, capabilityMap] = await Promise.all([
      legacyQueueItem(),
      loadSocialPublisherRegistry(configRoot),
      loadVentureCapabilityMap(configRoot)
    ]);
    const item = migrateLegacyQueueItem(legacy, committed);
    expect(CapabilityAwareQueueItemSchema.safeParse({ ...item, action: "like" }).success).toBe(false);
    expect(CapabilityAwareQueueItemSchema.safeParse({ ...item, target: { ...item.target, role: "sister" } }).success).toBe(false);
    expect(CapabilityAwareQueueItemSchema.safeParse({ ...item, target: { ...item.target, profileId: "distribution-contact-example" } }).success).toBe(false);
    expect(CapabilityAwareQueueItemSchema.safeParse({ ...item, accessToken: "secret" }).success).toBe(false);
    expect(CapabilityAwareQueueItemSchema.safeParse({ ...item, sourceVentureId: "door-money", migration: null, sourcePackage: null }).success).toBe(false);

    for (const sourceVentureId of ["personal-growth", "kvorum", "goviral"] as const) {
      const isolated = rehash({ ...item, sourceVentureId });
      expect(resolvePublisherTarget({ item: isolated, registry: activate(committed), capabilityMap, environment })).toMatchObject({
        decision: "denied",
        reasons: ["permanently-isolated-source"]
      });
    }

    const simulationRegistry = structuredClone(committed);
    const simulation = simulationRegistry.profiles.find((profile) => profile.id === item.target.profileId)!;
    simulation.kind = "simulation";
    simulation.role = "simulation";
    simulation.lifecycle = "simulation";
    simulation.liveEligible = false;
    simulation.ventureRef = null;
    simulation.supportedVentures = [];
    simulation.capabilityRefs = [];
    simulation.createdAt = simulation.updatedAt;
    simulation.provenance = {
      source: "fixture",
      recordedBy: "system",
      evidenceRefs: ["fixture:simulation"],
      fixtureKey: "simulation"
    };
    expect(resolvePublisherTarget({ item, registry: simulationRegistry, capabilityMap, environment })).toMatchObject({ decision: "denied" });

    const malformedConnection = structuredClone(committed);
    malformedConnection.connections.find((connection) => connection.id === item.target.connectionBindingRef)!.nativeAccountIdRef = null;
    expect(resolvePublisherTarget({ item, registry: malformedConnection, capabilityMap, environment })).toMatchObject({
      decision: "denied",
      reasons: ["malformed-queue-or-publisher-registry"]
    });
  });

  it("contains no venture credential-prefix branching in the runtime adapter", async () => {
    const [meta, activation] = await Promise.all([
      readFile(path.join(repoRoot, "orchestrator/src/social/meta.ts"), "utf8"),
      readFile(path.join(repoRoot, "orchestrator/src/social/activation.ts"), "utf8")
    ]);
    expect(meta).not.toContain("VENTURE_PREFIX");
    expect(meta).not.toMatch(/CAUGHT_UP_|MMA_FILES_|TITTY_TUESDAYS_/u);
    expect(activation).not.toMatch(/CAUGHT_UP_.*ACCESS_TOKEN|MMA_FILES_.*ACCESS_TOKEN|TITTY_TUESDAYS_.*ACCESS_TOKEN/u);
  });
});
