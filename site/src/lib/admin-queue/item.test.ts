import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSocialQueueEvent, socialQueueEventId, socialQueueEventPath } from "./event";
import { approveQueueItem, nextRevisionId, parseQueueItem, parseQueueItemV2, queueItemV2Hash, supersedingQueueItem } from "./item";

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures", name), "utf8")) as Record<string, unknown>;
}

/*
 * The other half of `orchestrator/tests/social-queue-event.test.ts`. The fixtures are shared: the
 * orchestrator proves them against its zod schema and payload hash, this file proves the site's
 * hand mirror still produces them byte for byte.
 */
describe("the site's queue v2 mirror", () => {
  it("hashes the orchestrator's draft fixture to the orchestrator's hash", async () => {
    const draft = parseQueueItemV2(await fixture("social-queue-item-v2.valid.json"));
    expect(draft).not.toBeNull();
    expect(queueItemV2Hash(draft!)).toBe(draft!.content.contentHash);
  });

  it("approves the draft into exactly the committed approved item and event", async () => {
    const draft = parseQueueItemV2(await fixture("social-queue-item-v2.valid.json"))!;
    const expectedItem = await fixture("social-queue-item-v2-approved.valid.json");
    const expectedEvent = parseSocialQueueEvent(await fixture("social-queue-event.valid.json"));
    const eventId = socialQueueEventId(draft.id, "approve", draft.content.contentHash);
    const approved = approveQueueItem(draft, { eventId, publishWindow: draft.publishWindow });
    expect(JSON.parse(JSON.stringify(approved))).toEqual(expectedItem);
    expect(expectedEvent?.id).toBe(eventId);
    expect(expectedEvent?.resultingContentHash).toBe(approved.content.contentHash);
    expect(socialQueueEventPath(expectedEvent!)).toBe("state/social/queue-events/2026-09-26T08-00-00-000Z-ms-2026-09-26-devshark-en-linkedin-approve.json");
  });

  it("refuses what zod would trim, an unknown key and a caption over its platform's limit", async () => {
    const draft = await fixture("social-queue-item-v2.valid.json");
    expect(parseQueueItemV2({ ...draft, audience: " Working developers" })).toBeNull();
    expect(parseQueueItemV2({ ...draft, supersedes: "another" })).toBeNull();
    expect(parseQueueItemV2({ ...draft, content: { ...draft.content as object, text: "x".repeat(3_001) } })).toBeNull();
    expect(parseQueueItemV2({ ...draft, channel: "instagram", utm: { ...draft.utm as object, source: "instagram" }, content: { ...draft.content as object, text: "x".repeat(2_201) } })).toBeNull();
    expect(parseQueueItemV2({ ...draft, sourcePackage: null })).toBeNull();
  });

  it("reads a legacy v1 item with the defaults the v1 schema applies", async () => {
    const legacy = JSON.parse(await readFile(path.resolve(process.cwd(), "../state/social/queue/2026-08-05-cs-instagram.json"), "utf8")) as Record<string, unknown>;
    const parsed = parseQueueItem(legacy);
    expect(parsed?.schemaVersion).toBe(1);
    expect(parsed?.id).toBe("caught-up-2026-08-05-cs-instagram");
    const withoutVenture = { ...legacy };
    delete withoutVenture.venture;
    expect(parseQueueItem(withoutVenture)).toMatchObject({ venture: "caught-up" });
  });

  it("supersedes with a fresh draft and counts revisions from the base id", async () => {
    const draft = parseQueueItemV2(await fixture("social-queue-item-v2.valid.json"))!;
    const now = new Date("2026-09-26T09:00:00.000Z");
    const successor = supersedingQueueItem(draft, { id: `${draft.id}-r1`, text: "Which selector wins?", altText: draft.content.altText, now });
    expect(successor).toMatchObject({ id: `${draft.id}-r1`, status: "draft", createdAt: now.toISOString(), approvalProvenance: { approvalRef: "awaiting-owner-approval" } });
    expect(Object.values(successor.checks).every((state) => state === "pending")).toBe(true);
    expect(queueItemV2Hash(successor)).toBe(successor.content.contentHash);
    expect(successor.content.contentHash).not.toBe(draft.content.contentHash);
    expect(parseQueueItemV2(JSON.parse(JSON.stringify(successor)))).not.toBeNull();
    expect(nextRevisionId(draft.id, [draft.id])).toBe(`${draft.id}-r1`);
    expect(nextRevisionId(`${draft.id}-r1`, [draft.id, `${draft.id}-r1`])).toBe(`${draft.id}-r2`);
    expect(nextRevisionId(draft.id, [draft.id, `${draft.id}-r1`, `${draft.id}-r3`, `${draft.id}-rx`])).toBe(`${draft.id}-r4`);
  });
});
