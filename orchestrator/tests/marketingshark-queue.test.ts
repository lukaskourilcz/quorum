import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalJson, sha256 } from "../src/hashing.js";
import { configRoot, repoRoot } from "../src/paths.js";
import {
  SocialPublisherRegistrySchema,
  loadSocialPublisherRegistry,
  migrateLegacyQueueItem,
  resolvePublisherTarget,
  type SocialPublisherRegistry
} from "../src/social/publisher-targets.js";
import {
  CapabilityAwareQueueItemSchema,
  QueueItemSchema,
  capabilityAwareQueuePayloadHash,
  queuePayloadHash,
  type CapabilityAwareQueueItem
} from "../src/social/queue.js";
import type { VentureCapabilityMap } from "../src/contracts/venture-capability.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";
import { enabledBrands, loadMarketingSharkConfig, type Brand } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import {
  AWAITING_OWNER_APPROVAL,
  buildQueueItems,
  DEVSHARK_SOCIAL_TARGETS,
  marketingSharkCapabilityRef,
  marketingSharkPackageHash
} from "../src/ventures/marketingshark/queue.js";
import { fixtureChumOutput, fixtureHookLines, planBrandDay, runBrandDay } from "../src/ventures/marketingshark/run.js";

// quorum#568 (B1): marketingShark writes queue v2 drafts, one per platform, bound to devShark's own
// profiles, each carrying the package it came from by hash. Nothing here can send.

let brand: Brand;
let built: MarketingSharkPackage;
let root: string;
let map: VentureCapabilityMap;
let items: CapabilityAwareQueueItem[];

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ms-queue-"));
  const config = await loadMarketingSharkConfig();
  brand = enabledBrands(config)[0]!;
  const result = await runBrandDay({
    config, brand, ledger: EMPTY_LEDGER, date: "2026-09-26", cycleId: "test-cycle", root, publicRoot: path.join(root, "public"), dry: true,
    call: async () => {
      const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-09-26" });
      return { usd: 0, output: fixtureChumOutput({ brand, question: plan.question, ...fixtureHookLines(plan, brand) }) };
    }
  });
  expect(result.outcome.status).toBe("drafted");
  built = MarketingSharkPackage.parse(JSON.parse(await readFile(path.join(root, "ventures/marketingshark/packages/2026-09-26/devshark/package.json"), "utf8")));
  map = await loadVentureCapabilityMap(configRoot);
  items = await Promise.all(["linkedin", "instagram", "threads"].map(async (channel) =>
    CapabilityAwareQueueItemSchema.parse(JSON.parse(await readFile(path.join(root, `social/queue/2026-09-26-devshark-en-${channel}.json`), "utf8")))));
});

/** A registry with devShark's Instagram and Threads profiles and connections, cloned from DNESKAi's. */
function withDevShark(committed: SocialPublisherRegistry): SocialPublisherRegistry {
  const profile = committed.profiles.find((candidate) => candidate.id === "social-profile-caught-up")!;
  const profiles = (["instagram", "threads"] as const).map((platform) => ({
    ...structuredClone(profile),
    id: DEVSHARK_SOCIAL_TARGETS[platform].profileId,
    displayLabel: `devShark on ${platform}`,
    ventureRef: "marketingshark",
    brandRef: "devshark",
    languages: ["en" as const],
    supportedVentures: ["marketingshark"],
    provenance: { ...profile.provenance, source: "owner" as const }
  }));
  const connections = (["instagram", "threads"] as const).map((platform) => ({
    ...structuredClone(committed.connections.find((candidate) => candidate.id === `social-connection-caught-up-${platform}`)!),
    id: DEVSHARK_SOCIAL_TARGETS[platform].connectionBindingRef,
    profileId: DEVSHARK_SOCIAL_TARGETS[platform].profileId,
    credentialRef: `DEVSHARK_${platform.toUpperCase()}_ACCESS_TOKEN`,
    nativeAccountIdRef: `DEVSHARK_${platform.toUpperCase()}_USER_ID`
  }));
  return SocialPublisherRegistrySchema.parse({
    ...committed,
    profiles: [...committed.profiles, ...profiles],
    connections: [...committed.connections, ...connections]
  });
}

function activated(registry: SocialPublisherRegistry): SocialPublisherRegistry {
  const result = structuredClone(registry);
  for (const platform of ["instagram", "threads"] as const) {
    const profile = result.profiles.find((candidate) => candidate.id === DEVSHARK_SOCIAL_TARGETS[platform].profileId)!;
    profile.lifecycle = "active";
    profile.liveEligible = true;
    const connection = result.connections.find((candidate) => candidate.id === DEVSHARK_SOCIAL_TARGETS[platform].connectionBindingRef)!;
    connection.mode = "autopublish";
    connection.health = { status: "healthy", unavailableReason: null };
    connection.enabledByHumanAt = "2026-09-26T00:00:00.000Z";
  }
  return SocialPublisherRegistrySchema.parse(result);
}

const environment = {
  DEVSHARK_INSTAGRAM_ACCESS_TOKEN: "fixture-token",
  DEVSHARK_INSTAGRAM_USER_ID: "fixture-user",
  DEVSHARK_THREADS_ACCESS_TOKEN: "fixture-token",
  DEVSHARK_THREADS_USER_ID: "fixture-user"
};

function rehash(item: CapabilityAwareQueueItem): CapabilityAwareQueueItem {
  return CapabilityAwareQueueItemSchema.parse({ ...item, content: { ...item.content, contentHash: capabilityAwareQueuePayloadHash(item) } });
}

describe("marketingShark's queue drafts", () => {
  it("writes one English queue v2 draft per platform, bound to devShark's own profile", () => {
    expect(items.map((item) => item.channel)).toEqual(["linkedin", "instagram", "threads"]);
    for (const item of items) {
      expect(item).toMatchObject({
        schemaVersion: 2,
        sourceVentureId: "marketingshark",
        releaseId: built.id,
        action: "publish-original",
        locale: "en",
        status: "draft",
        selectedBy: "MAKO",
        migration: null,
        target: {
          ...DEVSHARK_SOCIAL_TARGETS[item.channel as keyof typeof DEVSHARK_SOCIAL_TARGETS],
          profileRole: "venture-primary",
          role: "primary",
          amplifierEligibilityRef: null,
          campaignApprovalRef: null
        },
        utm: { source: item.channel, medium: "organic_social" },
        approvalProvenance: {
          approvalRef: AWAITING_OWNER_APPROVAL,
          selectionRef: "state/meetings/2026-09-26-ms-daily.json",
          policyRef: "state/decisions/2026-09-26-devshark-social-queue.md"
        }
      });
      expect(Object.values(item.checks)).toHaveLength(11);
      expect(Object.values(item.checks).every((status) => status === "pending")).toBe(true);
      expect(capabilityAwareQueuePayloadHash(item)).toBe(item.content.contentHash);
    }
  });

  it("carries the package by path and hash, and the hash is the committed file's", async () => {
    const onDisk = JSON.parse(await readFile(path.join(root, "ventures/marketingshark/packages/2026-09-26/devshark/package.json"), "utf8")) as unknown;
    for (const item of items) {
      expect(item.sourcePackage).toEqual({
        schemaVersion: "approved-publish-package/1",
        artifactRef: "state/ventures/marketingshark/packages/2026-09-26/devshark/package.json",
        packageHash: sha256(canonicalJson(onDisk))
      });
    }
    expect(marketingSharkPackageHash(built)).toBe(items[0]!.sourcePackage!.packageHash);
  });

  it("names the exact, current capability edge it crossed", () => {
    const reference = marketingSharkCapabilityRef(map)!;
    expect(reference).toEqual({
      mapVersion: map.mapVersion,
      source: "marketingshark",
      target: "social-distribution",
      capability: "approved-publish-package",
      dataSchemaVersion: "approved-publish-package/1",
      decisionReference: "state/decisions/2026-09-26-devshark-social-queue.md"
    });
    for (const item of items) expect(item.target.capabilityRef).toEqual(reference);
  });

  it("gives each platform its own caption, and the frames that platform takes", () => {
    const [linkedin, instagram, threads] = items as [CapabilityAwareQueueItem, CapabilityAwareQueueItem, CapabilityAwareQueueItem];
    expect(linkedin.content.text).toBe(`${built.descriptions.linkedin.en}\n\n${built.hashtags.linkedin.en.join(" ")}`);
    expect(instagram.content.text).toBe(`${built.descriptions.instagram.en}\n\n${built.hashtags.instagram.en.join(" ")}`);
    expect(threads.content.text).toBe(built.descriptions.threads.en);
    expect(new Set(items.map((item) => item.content.text)).size).toBe(3);

    // Instagram takes JPEG only; LinkedIn takes the PNGs; Threads stays text until B5.
    const frames = built.render.frames.filter((frame) => frame.locale === "en");
    expect(instagram.content.assetPaths).toEqual(frames.map((frame) => frame.jpeg.path));
    expect(instagram.content.assetPaths.every((asset) => asset.endsWith(".jpg"))).toBe(true);
    expect(linkedin.content.assetPaths).toEqual(frames.map((frame) => frame.png.path));
    expect(threads.content.assetPaths).toEqual([]);
    for (const item of items) {
      expect(item.content.altText).toBe(built.carousels.en.slides.map((slide) => slide.alt).join(" "));
      expect(item.content.factualClaimRefs).toEqual([`marketingshark:question:${built.question.id}`]);
    }
  });

  it("never resolves to an eligible target from the committed registry", async () => {
    const registry = await loadSocialPublisherRegistry(configRoot);
    for (const item of items) {
      const resolution = resolvePublisherTarget({ item, registry, capabilityMap: map, environment });
      // `denied` while the profiles are unregistered, `held` once #569 registers them held.
      expect(["denied", "held"], item.channel).toContain(resolution.decision);
    }
  });

  it("is held on registered devShark connections, and eligible only once the owner activates one", async () => {
    const registered = withDevShark(await loadSocialPublisherRegistry(configRoot));
    const [, instagram, threads] = items as [CapabilityAwareQueueItem, CapabilityAwareQueueItem, CapabilityAwareQueueItem];
    for (const item of [instagram, threads]) {
      const held = resolvePublisherTarget({ item, registry: registered, capabilityMap: map, environment });
      expect(held.decision, item.channel).toBe("held");
      expect(held.reasons).toEqual(expect.arrayContaining(["profile-not-live-eligible", "connection-not-human-activated"]));
      expect(resolvePublisherTarget({ item, registry: activated(registered), capabilityMap: map, environment }).decision, item.channel).toBe("eligible");
    }
  });

  it("is denied without an exact, current reference to marketingShark's edge", async () => {
    const active = activated(withDevShark(await loadSocialPublisherRegistry(configRoot)));
    const instagram = items[1]!;
    const stale = rehash({ ...instagram, target: { ...instagram.target, capabilityRef: { ...instagram.target.capabilityRef!, mapVersion: "1.3.0" } } });
    const missing = rehash({ ...instagram, target: { ...instagram.target, capabilityRef: null } });
    for (const item of [stale, missing]) {
      expect(resolvePublisherTarget({ item, registry: active, capabilityMap: map, environment })).toMatchObject({
        decision: "denied",
        reasons: ["missing-stale-held-or-denied-capability"]
      });
    }
    const closed = structuredClone(map);
    closed.edges.find((edge) => edge.source === "marketingshark" && edge.target === "social-distribution")!.decision = "held";
    expect(resolvePublisherTarget({ item: instagram, registry: active, capabilityMap: closed, environment }).decision).toBe("denied");
    expect(marketingSharkCapabilityRef(closed)).toBeNull();
  });

  it("still builds identically from the same package", () => {
    const again = buildQueueItems({ built, brand, now: new Date(items[0]!.createdAt), capabilityRef: marketingSharkCapabilityRef(map)! });
    expect(again.map(({ item }) => item)).toEqual(items);
  });
});

describe("marketingShark in the legacy queue mapping", () => {
  it("maps a v1 marketingShark item onto devShark's per-platform profiles once they are registered", async () => {
    const registered = withDevShark(await loadSocialPublisherRegistry(configRoot));
    const mapped = SocialPublisherRegistrySchema.parse({
      ...registered,
      legacyQueueMappings: [...registered.legacyQueueMappings, {
        venture: "marketingshark",
        profileId: DEVSHARK_SOCIAL_TARGETS.instagram.profileId,
        connections: {
          threads: DEVSHARK_SOCIAL_TARGETS.threads.connectionBindingRef,
          instagram: DEVSHARK_SOCIAL_TARGETS.instagram.connectionBindingRef
        },
        mappingRef: "GitHub #568"
      }]
    });
    const legacy = QueueItemSchema.parse(JSON.parse(await readFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"), "utf8")));
    for (const channel of ["threads", "instagram"] as const) {
      const base = { ...legacy, id: `ms-legacy-${channel}`, venture: "marketingshark" as const, channel, utm: { ...legacy.utm, source: channel } };
      const item = QueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: queuePayloadHash(base) } });
      expect(migrateLegacyQueueItem(item, mapped).target).toMatchObject({
        profileId: DEVSHARK_SOCIAL_TARGETS[channel].profileId,
        connectionBindingRef: DEVSHARK_SOCIAL_TARGETS[channel].connectionBindingRef,
        role: "primary",
        // A migrated marketingShark item carries no capability reference, so the publisher denies it.
        capabilityRef: null
      });
    }

    // A mapping may never borrow another venture's connection.
    const borrowed = {
      ...mapped,
      legacyQueueMappings: mapped.legacyQueueMappings.map((mapping) => mapping.venture === "marketingshark"
        ? { ...mapping, connections: { ...mapping.connections, threads: "social-connection-caught-up-threads" } }
        : mapping)
    };
    expect(SocialPublisherRegistrySchema.safeParse(borrowed).success).toBe(false);
  });

  it("is registered wherever the registry carries marketingShark's own profiles", async () => {
    // B2 (#569) registers devShark's profiles in the other lane of this programme. The day they
    // share a registry with this code, a v1 marketingShark item must migrate rather than throw
    // inside the migration audit, so the mapping has to be there too:
    //   { "venture": "marketingshark", "profileId": "social-profile-devshark-instagram",
    //     "connections": { "threads": "social-connection-devshark-threads",
    //                      "instagram": "social-connection-devshark-instagram" },
    //     "mappingRef": "GitHub #568" }
    const registry = await loadSocialPublisherRegistry(configRoot);
    const owned = registry.profiles.filter((profile) => profile.ventureRef === "marketingshark" && profile.role === "venture-primary");
    const hasMetaConnections = ["instagram", "threads"].every((platform) =>
      registry.connections.some((connection) => connection.platform === platform && owned.some((profile) => profile.id === connection.profileId)));
    if (hasMetaConnections) {
      expect(registry.legacyQueueMappings.map((mapping) => mapping.venture)).toContain("marketingshark");
    } else {
      expect(registry.legacyQueueMappings.map((mapping) => mapping.venture)).not.toContain("marketingshark");
    }
  });
});
