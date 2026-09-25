import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SocialQueueEventSchema } from "../src/contracts/social-queue-event.js";
import { repoRoot } from "../src/paths.js";
import {
  assertQueueItemPublishable,
  capabilityAwareQueuePayloadHash,
  CapabilityAwareQueueItemSchema
} from "../src/social/queue.js";

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", name), "utf8")) as Record<string, unknown>;
}

/*
 * The Admin Queue (quorum#573) rewrites queue items without the orchestrator: the site has no zod
 * and no dependency on this package, so `site/src/lib/admin-queue/item.ts` mirrors the v2 schema
 * and its payload hash by hand. These three fixtures are the handshake. The draft's hash was
 * computed here; the approved item and the event were produced by the site's approve path; and
 * `site/src/lib/admin-queue/item.test.ts` asserts the site still produces exactly them. If either
 * side's hash or approval rules drift, one of the two suites fails.
 */
describe("the Admin Queue's approval, read by the publisher", () => {
  it("hashes the draft fixture the way the publisher does", async () => {
    const draft = CapabilityAwareQueueItemSchema.parse(await fixture("social-queue-item-v2.valid.json"));
    expect(capabilityAwareQueuePayloadHash(draft)).toBe(draft.content.contentHash);
    expect(draft.status).toBe("draft");
    expect(() => assertQueueItemPublishable(draft)).toThrow(/not queued/u);
  });

  it("accepts the site's approved item as publishable, and nothing edited after it", async () => {
    const approved = CapabilityAwareQueueItemSchema.parse(await fixture("social-queue-item-v2-approved.valid.json"));
    expect(capabilityAwareQueuePayloadHash(approved)).toBe(approved.content.contentHash);
    expect(() => assertQueueItemPublishable(approved)).not.toThrow();
    const edited = { ...approved, content: { ...approved.content, text: `${approved.content.text} Edited after approval.` } };
    expect(() => assertQueueItemPublishable(edited)).toThrow(/content hash mismatch/u);
  });

  it("binds the approval event to the hash the owner saw and the hash that was approved", async () => {
    const draft = CapabilityAwareQueueItemSchema.parse(await fixture("social-queue-item-v2.valid.json"));
    const approved = CapabilityAwareQueueItemSchema.parse(await fixture("social-queue-item-v2-approved.valid.json"));
    const event = SocialQueueEventSchema.parse(await fixture("social-queue-event.valid.json"));
    expect(event.itemId).toBe(draft.id);
    expect(event.expectedContentHash).toBe(draft.content.contentHash);
    expect(event.resultingContentHash).toBe(approved.content.contentHash);
    expect(approved.approvalProvenance.approvalRef).toBe(event.id);
    expect(approved.publishWindow).toEqual(event.publishWindow);
  });
});

describe("social-queue-event/1", () => {
  const cancel = {
    action: "hold",
    previousStatus: "draft",
    nextStatus: "cancelled",
    resultingContentHash: null,
    mode: null,
    publishWindow: null,
    deterministicChecks: null,
    ownerEvidenceFor: [],
    reason: "Not this week; the question repeats Monday's."
  };

  it("never records an approval as a publication or without the owner's evidence", async () => {
    const valid = await fixture("social-queue-event.valid.json");
    expect(SocialQueueEventSchema.safeParse(valid).success).toBe(true);
    for (const mutation of [
      { nextStatus: "published" },
      { ownerEvidenceFor: ["brand", "claims"] },
      { deterministicChecks: null },
      { mode: null },
      { publishWindow: { notBefore: "2026-09-26T21:00:00.000Z", notAfter: "2026-09-26T06:00:00.000Z" } },
      { deterministicChecks: { schema: "pass", duplicate: "fail", accessibility: "pass", budget: "pass", capability: "pass", authority: "pass" } },
      { actor: "system" }
    ]) {
      expect(SocialQueueEventSchema.safeParse({ ...valid, ...mutation }).success, JSON.stringify(mutation)).toBe(false);
    }
  });

  it("makes a hold say why, and only a rejection leave a taste note", async () => {
    const valid = await fixture("social-queue-event.valid.json");
    const hold = { ...valid, ...cancel };
    expect(SocialQueueEventSchema.safeParse(hold).success).toBe(true);
    expect(SocialQueueEventSchema.safeParse({ ...hold, reason: null }).success).toBe(false);
    expect(SocialQueueEventSchema.safeParse({ ...hold, tasteNote: { releaseId: "marketingshark-2026-09-26-devshark", note: "Too similar." } }).success).toBe(false);
    const reject = { ...hold, action: "reject", tasteNote: { releaseId: "marketingshark-2026-09-26-devshark", note: "The hook promises more than slide two delivers." } };
    expect(SocialQueueEventSchema.safeParse(reject).success).toBe(true);
    expect(SocialQueueEventSchema.safeParse({ ...reject, tasteNote: null }).success).toBe(false);
  });

  it("lets an edit supersede an item only with its next revision", async () => {
    const valid = await fixture("social-queue-event.valid.json");
    const edit = {
      ...valid,
      ...cancel,
      action: "edit",
      reason: null,
      supersedingItemId: "ms-2026-09-26-devshark-en-linkedin-r1",
      resultingContentHash: "b".repeat(64),
      changedFields: ["caption"]
    };
    expect(SocialQueueEventSchema.safeParse(edit).success).toBe(true);
    expect(SocialQueueEventSchema.safeParse({ ...edit, itemId: "ms-2026-09-26-devshark-en-linkedin-r1", supersedingItemId: "ms-2026-09-26-devshark-en-linkedin-r2" }).success).toBe(true);
    for (const mutation of [
      { supersedingItemId: "another-item-r1" },
      { supersedingItemId: null },
      { changedFields: [] },
      { nextStatus: "draft" },
      { resultingContentHash: null }
    ]) {
      expect(SocialQueueEventSchema.safeParse({ ...edit, ...mutation }).success, JSON.stringify(mutation)).toBe(false);
    }
  });
});
