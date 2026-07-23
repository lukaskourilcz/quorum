import { describe, expect, it, vi } from "vitest";
import { assertOrgChangeApproved, type OrgChange } from "../src/org/change.js";
import { assertLiveChannel, type Channel } from "../src/social/channel-registry.js";
import { planSocialPosts } from "../src/social/plan.js";
import {
  claimQueueItem,
  reconcileQueueItem,
  type QueueItem
} from "../src/social/queue.js";
import { publishQueueItem } from "../src/social/publish.js";
import { createMetaPublishAdapter } from "../src/social/meta.js";
import { queuePayloadHash } from "../src/social/queue.js";
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

const queueItem: QueueItem = {
  id: "POST-001",
  channel: "threads",
  payloadHash: "0123456789abcdef",
  scheduledAt: "2026-07-23T08:00:00.000Z",
  state: "queued",
  claimId: null,
  claimedAt: null,
  remoteId: null,
  attemptCount: 0,
  lastError: null
};

describe("social and organization controls", () => {
  it("returns NO_POST when no publishable fact exists", () => {
    expect(planSocialPosts([], false).decision).toBe("NO_POST");
  });

  it("cannot call a publisher while a channel remains draft-only", async () => {
    const publish = vi.fn();
    await expect(
      publishQueueItem(channel, queueItem, { publish }, {})
    ).rejects.toThrow(/draft-only/);
    expect(publish).not.toHaveBeenCalled();
    expect(() => assertLiveChannel(channel, {})).toThrow(/draft-only/);
  });

  it("uses two-phase claim and ambiguous reconciliation", () => {
    const claimed = claimQueueItem(
      queueItem,
      "claim-1",
      new Date("2026-07-23T09:00:00.000Z")
    );
    expect(claimed.state).toBe("claimed");
    const reconciled = reconcileQueueItem(claimed, {
      outcome: "ambiguous",
      error: "Timeout after remote acceptance may have occurred"
    });
    expect(reconciled.state).toBe("ambiguous");
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

  it("keeps the repository publisher in draft-only mode by default", async () => {
    const report = await runSocialPublisher({
      validateOnly: false,
      dryIfDisabled: true,
      now: new Date("2026-07-23T09:00:00.000Z"),
      environment: {}
    });

    expect(report.status).toBe("draft_only");
    expect(report.published).toBe(0);
  });

  it("uses the guarded two-step Threads connector for an approved item", async () => {
    const content = {
      text: "A verified operating update.",
      altText: null,
      assetUrls: []
    };
    const approvedItem: QueueItem = {
      ...queueItem,
      payloadHash: queuePayloadHash({
        id: queueItem.id,
        channel: queueItem.channel,
        scheduledAt: queueItem.scheduledAt,
        content
      }),
      content,
      approval: {
        pulseSelected: true,
        quill: "pass",
        keeper: "pass",
        deterministic: "pass",
        approvedAt: "2026-07-23T07:55:00.000Z"
      }
    };
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
        META_THREADS_USER_ID: "user-1",
        META_THREADS_ACCESS_TOKEN: "secret"
      },
      fetchMock
    );
    const liveChannel: Channel = {
      ...channel,
      mode: "autopublish",
      approvedScopes: ["threads_basic", "threads_content_publish"],
      enabledByHumanAt: "2026-07-23T07:00:00.000Z"
    };

    const result = await adapter.publish(liveChannel, approvedItem, "claim-1");

    expect(result.remoteId).toBe("remote-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/threads");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/threads_publish");
  });
});
