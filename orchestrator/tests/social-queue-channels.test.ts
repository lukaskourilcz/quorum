import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { configRoot, repoRoot } from "../src/paths.js";
import { loadSocialPublisherRegistry, migrateLegacyQueueItem } from "../src/social/publisher-targets.js";
import {
  CapabilityAwareQueueItemSchema,
  QueueItemSchema,
  QUEUE_TEXT_LIMITS,
  assertQueueItemPublishable,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "../src/social/queue.js";

// quorum#568 (B1): marketingShark drafts one devShark item per platform, and LinkedIn is one of
// them. The queue has to be able to hold that item; only the Buffer transport (#571) can send it,
// and only once every gate before it has opened.

async function v2Item(): Promise<CapabilityAwareQueueItem> {
  const legacy = JSON.parse(await readFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"), "utf8")) as unknown;
  return migrateLegacyQueueItem(legacy, await loadSocialPublisherRegistry(configRoot));
}

function onChannel(item: CapabilityAwareQueueItem, channel: CapabilityAwareQueueItem["channel"], text = item.content.text) {
  const base = { ...item, channel, utm: { ...item.utm, source: channel }, content: { ...item.content, text } };
  return { ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } };
}

describe("queue v2 channels", () => {
  it("holds a LinkedIn caption up to LinkedIn's own limit and no further", async () => {
    const item = await v2Item();
    expect(CapabilityAwareQueueItemSchema.safeParse(onChannel(item, "linkedin", "x".repeat(QUEUE_TEXT_LIMITS.linkedin))).success).toBe(true);
    expect(CapabilityAwareQueueItemSchema.safeParse(onChannel(item, "linkedin", "x".repeat(QUEUE_TEXT_LIMITS.linkedin + 1))).success).toBe(false);
  });

  it("keeps the 2,200-character cap for Instagram and Threads that the v1 schema applies", async () => {
    const item = await v2Item();
    for (const channel of ["instagram", "threads"] as const) {
      expect(CapabilityAwareQueueItemSchema.safeParse(onChannel(item, channel, "x".repeat(2_200))).success, channel).toBe(true);
      expect(CapabilityAwareQueueItemSchema.safeParse(onChannel(item, channel, "x".repeat(2_201))).success, channel).toBe(false);
    }
  });

  it("still requires the UTM source to name the item's own channel", async () => {
    const item = onChannel(await v2Item(), "linkedin");
    expect(CapabilityAwareQueueItemSchema.safeParse({ ...item, utm: { ...item.utm, source: "instagram" } }).success).toBe(false);
  });

  // quorum#571 built the LinkedIn transport (Buffer), so the item-level refusal by name is gone.
  // What an item carries still has to be something Buffer can send: JPEG or PNG, with alt text.
  it("passes a checked LinkedIn item only with JPEG or PNG images that carry alt text", async () => {
    const base = onChannel(await v2Item(), "linkedin");
    const queued = (content: Partial<CapabilityAwareQueueItem["content"]>) => {
      const next = { ...base, status: "queued" as const, content: { ...base.content, ...content } };
      return CapabilityAwareQueueItemSchema.parse({ ...next, content: { ...next.content, contentHash: capabilityAwareQueuePayloadHash(next) } });
    };
    expect(Object.values(base.checks).every((status) => status === "pass")).toBe(true);
    expect(() => assertQueueItemPublishable(queued({ assetPaths: [] }))).not.toThrow();
    expect(() => assertQueueItemPublishable(queued({ assetPaths: ["/social/devshark/2026-09-26/en/1.jpg"], altText: "Slide one" }))).not.toThrow();
    expect(() => assertQueueItemPublishable(queued({ assetPaths: ["/social/devshark/2026-09-26/en/1.jpg"], altText: null }))).toThrow(/alt text/u);
    expect(() => assertQueueItemPublishable(queued({ assetPaths: ["/social/devshark/2026-09-26/en/1.svg"], altText: "Slide one" }))).toThrow(/JPEG or PNG/u);
  });

  it("leaves LinkedIn out of the v1 schema, which cannot name a target profile", async () => {
    const legacy = JSON.parse(await readFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json"), "utf8")) as Record<string, unknown>;
    expect(QueueItemSchema.safeParse({ ...legacy, channel: "linkedin", utm: { ...(legacy.utm as object), source: "linkedin" } }).success).toBe(false);
  });
});
