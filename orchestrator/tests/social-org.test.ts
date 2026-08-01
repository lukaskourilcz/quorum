import { describe, expect, it, vi } from "vitest";
import { assertOrgChangeApproved, type OrgChange } from "../src/org/change.js";
import { assertLiveChannel, type Channel } from "../src/social/channel-registry.js";
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
    const report = await runSocialPublisher({
      validateOnly: false,
      dryIfDisabled: true,
      now: new Date("2026-07-23T09:00:00.000Z"),
      environment: {}
    });

    expect(report.status).toBe("paused");
    expect(report.published).toBe(0);
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
        META_GRAPH_API_VERSION: "v99.0",
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

    const result = await adapter.publish(
      liveChannel,
      queueItem,
      "1".repeat(64)
    );

    expect(result.remoteId).toBe("remote-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/threads");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/threads_publish");
  });
});
