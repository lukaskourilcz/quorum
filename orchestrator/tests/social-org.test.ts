import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { configRoot, repoRoot } from "../src/paths.js";
import { assertOrgChangeApproved, type OrgChange } from "../src/org/change.js";
import { assertLiveChannel, type Channel } from "../src/social/channel-registry.js";
import { socialChannelsEnabled } from "../src/social/activation.js";
import { planSocialPosts } from "../src/social/plan.js";
import {
  assertQueueItemPublishable,
  claimQueueItem,
  QueueItemSchema,
  queuePayloadHash,
  reconcileQueueItem,
  type QueueItem
} from "../src/social/queue.js";
import { publishQueueItem } from "../src/social/publish.js";
import { createMetaPublishAdapter } from "../src/social/meta.js";
import { runSocialPublisher } from "../src/social/runner.js";
import {
  loadSocialPublisherRegistry,
  migrateLegacyQueueItem,
  resolvePublisherTarget
} from "../src/social/publisher-targets.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";

const channel: Channel = {
  id: "threads",
  specialist: "THREADS",
  mode: "draft",
  connector: "meta_threads",
  credentialRef: "META_THREADS_ACCESS_TOKEN",
  approvedScopes: [],
  nativeFormats: ["text"],
  maxOrganicPostsPerDay: 2,
  minHoursBetweenPosts: 6,
  timezone: "Europe/Prague",
  enabledByHumanAt: null
};

function createQueueItem(): QueueItem {
  const item: QueueItem = {
    schemaVersion: 1,
    id: "SOC-20260723-001",
    venture: "caught-up",
    locale: "en",
    variant: "A",
    campaignId: "CAM-DAILY-STANDUP",
    experimentId: null,
    channel: "threads",
    objective: "trust",
    audience: "AI company operators",
    destination: "https://example.invalid/standups/2026-07-23-founding",
    utm: {
      source: "threads",
      medium: "organic_social",
      campaign: "daily_standup",
      content: "SOC-20260723-001"
    },
    content: {
      text: "A verified operating update.",
      altText: null,
      assetPaths: [],
      factualClaimRefs: ["FIXTURE-EVIDENCE-001"],
      rendererVersion: "carousel-studio-1",
      contentHash: "0".repeat(64)
    },
    publishWindow: {
      notBefore: "2026-07-23T08:00:00.000Z",
      notAfter: "2026-07-23T10:00:00.000Z"
    },
    status: "queued",
    checks: {
      schema: "pass",
      brand: "pass",
      claims: "pass",
      quill: "pass",
      keeper: "pass",
      duplicate: "pass",
      accessibility: "pass",
      budget: "pass"
    },
    selectedBy: "PULSE",
    createdAt: "2026-07-23T07:55:00.000Z",
    attempt: null,
    receiptId: null
  };
  return QueueItemSchema.parse({
    ...item,
    content: {
      ...item.content,
      contentHash: queuePayloadHash(item)
    }
  });
}

const queueItem = createQueueItem();

describe("social and organization controls", () => {
  it("returns NO_POST when no publishable fact exists", () => {
    expect(planSocialPosts([], false).decision).toBe("NO_POST");
  });

  it("cannot call a publisher while a channel remains draft-only", async () => {
    const publish = vi.fn();
    const verify = vi.fn();
    await expect(
      publishQueueItem(channel, queueItem, { publish, verify }, {})
    ).rejects.toThrow(/draft-only/);
    expect(publish).not.toHaveBeenCalled();
    expect(() => assertLiveChannel(channel, {})).toThrow(/draft-only/);
  });

  it("uses two-phase claim and ambiguous reconciliation", () => {
    const claimed = claimQueueItem(
      queueItem,
      "1".repeat(64),
      new Date("2026-07-23T09:00:00.000Z")
    );
    expect(claimed.status).toBe("publishing");
    const reconciled = reconcileQueueItem(claimed, {
      outcome: "ambiguous",
      error: "Timeout after remote acceptance may have occurred"
    });
    expect(reconciled.status).toBe("needs_reconciliation");
    expect(reconciled.receiptId).toBe("SOC-20260723-001-attempt-1");
  });

  it("invalidates approval when immutable publication content changes", () => {
    const changed = {
      ...queueItem,
      content: {
        ...queueItem.content,
        text: "Unreviewed replacement copy."
      }
    };
    expect(() => assertQueueItemPublishable(changed)).toThrow(
      /content hash mismatch/
    );
  });

  it("prevents self-approved control changes", () => {
    const change: OrgChange = {
      id: "ORG-001",
      proposedAt: "2026-07-23T00:00:00.000Z",
      proposer: "FORGE",
      subjectAgent: "FORGE",
      tier: "B",
      change: "Modify release control",
      expectedMetric: "releaseSuccessRate",
      baseline: 0.8,
      expectedDelta: 0.05,
      reviewCycle: 20,
      approvers: ["PEOPLE", "AUDIT"],
      status: "approved"
    };
    expect(() => assertOrgChangeApproved(change)).toThrow(/own control/);
  });

  it("keeps the repository publisher paused unless the supreme kill switch is explicitly off", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-paused-"));
    try {
      const report = await runSocialPublisher({
        validateOnly: false,
        dryIfDisabled: true,
        now: new Date("2026-07-23T09:00:00.000Z"),
        environment: {},
        repoRoot: root,
        stateRoot: path.join(root, "state"),
        configRoot: path.join(root, "config")
      });

      expect(report.status).toBe("paused");
      expect(report.published).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("uses the guarded two-step Threads connector for an approved item", async () => {
    const responses = [
      new Response(JSON.stringify({ id: "container-1" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }),
      new Response(JSON.stringify({ id: "remote-1" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    ];
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockImplementation(async () => responses.shift()!);
    const adapter = createMetaPublishAdapter(
      {
        META_GRAPH_API_VERSION: "v26.0",
        CAUGHT_UP_THREADS_USER_ID: "user-1",
        CAUGHT_UP_THREADS_ACCESS_TOKEN: "secret"
      },
      fetchMock
    );
    const liveChannel: Channel = {
      ...channel,
      mode: "autopublish",
      approvedScopes: ["threads_basic", "threads_content_publish"],
      enabledByHumanAt: "2026-07-23T07:00:00.000Z"
    };
    const registry = structuredClone(await loadSocialPublisherRegistry());
    const profile = registry.profiles.find((candidate) => candidate.id === "social-profile-caught-up")!;
    profile.lifecycle = "active";
    profile.liveEligible = true;
    const connection = registry.connections.find((candidate) => candidate.id === "social-connection-caught-up-threads")!;
    connection.mode = "autopublish";
    connection.health = { status: "healthy", unavailableReason: null };
    connection.enabledByHumanAt = "2026-07-23T07:00:00.000Z";
    const migrated = migrateLegacyQueueItem(queueItem, registry);
    const target = resolvePublisherTarget({
      item: migrated,
      registry,
      capabilityMap: await loadVentureCapabilityMap(configRoot),
      environment: {
        CAUGHT_UP_THREADS_USER_ID: "user-1",
        CAUGHT_UP_THREADS_ACCESS_TOKEN: "secret"
      }
    }).target!;

    const result = await adapter.publish(
      liveChannel,
      migrated,
      "1".repeat(64),
      target
    );

    expect(result.remoteId).toBe("remote-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/threads");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/threads_publish");
  });
});

/**
 * Roughly 1.4-2.1 MB of PNG frames per edition day were being committed into
 * `site/public/social/`, plus MMA SVG variants, while both channels had `enabledByHumanAt: null`
 * and no credentials -- inventory nothing could consume, deterministically re-buildable from the
 * packages committed beside it, and re-rendered on request by the admin decks tab anyway.
 */
describe("composing social inventory needs somewhere for it to go", () => {
  it("is closed while no channel has been enabled by the owner", async () => {
    const channels = JSON.parse(
      await readFile(path.join(repoRoot, "config", "channels.json"), "utf8")
    ) as { channels: Array<{ enabledByHumanAt: string | null }> };

    expect(channels.channels.every((channel) => channel.enabledByHumanAt === null)).toBe(true);
    expect(await socialChannelsEnabled(path.join(repoRoot, "config"))).toBe(false);
  });

  it("opens the moment one channel is enabled, with no code change", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-channels-"));
    await writeFile(
      path.join(root, "channels.json"),
      JSON.stringify({ channels: [
        { id: "threads", enabledByHumanAt: null },
        { id: "instagram", enabledByHumanAt: "2026-09-01T00:00:00.000Z" }
      ] }),
      "utf8"
    );

    expect(await socialChannelsEnabled(root)).toBe(true);
  });

  it("answers no rather than throwing when the file is missing or unreadable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-channels-empty-"));

    expect(await socialChannelsEnabled(root)).toBe(false);
  });
});
