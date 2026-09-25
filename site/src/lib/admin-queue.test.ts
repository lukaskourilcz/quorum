import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAdminQueue } from "@/lib/admin-queue";
import { socialQueueEventId } from "@/lib/admin-queue/event";
import { DRAFT_FILE, queueFixtureRoot, readQueueFixture, writeJson } from "@/lib/admin-queue/fixture-root";
import { supersedingQueueItem, parseQueueItemV2 } from "@/lib/admin-queue/item";

const roots: string[] = [];
const now = new Date("2026-09-26T08:00:00.000Z");
const repository = path.resolve(process.cwd(), "..");

async function root(options?: Parameters<typeof queueFixtureRoot>[0]): Promise<string> {
  const created = await queueFixtureRoot(options);
  roots.push(created);
  return created;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("readAdminQueue", () => {
  it("reads a missing queue directory as an empty queue, not an error", async () => {
    const snapshot = await readAdminQueue(await root({ draft: false }), { now });
    expect(snapshot.items).toEqual([]);
    expect(snapshot.counts).toEqual({ waiting: 0, scheduled: 0, sending: 0, sent: 0, failed: 0, held: 0 });
    expect(snapshot.unreadable).toBe(0);
    expect(snapshot.unavailable).toEqual([]);
  });

  it("counts an unreadable file and a malformed item instead of dropping them silently", async () => {
    const base = await root();
    await writeFile(path.join(base, "state/social/queue/broken.json"), "{ not json");
    await writeJson(base, "state/social/queue/wrong-shape.json", { schemaVersion: 2, id: "wrong-shape" });
    await writeFile(path.join(base, "state/social/queue/README.md"), "# not an item\n");
    const snapshot = await readAdminQueue(base, { now });
    expect(snapshot.unreadable).toBe(1);
    expect(snapshot.dropped.items).toBe(1);
    expect(snapshot.items.map(({ id }) => id)).toEqual(["ms-2026-09-26-devshark-en-linkedin"]);
  });

  it("reads a marketingShark v2 draft as devShark's, with its checks run now", async () => {
    const snapshot = await readAdminQueue(await root(), { now });
    const [item] = snapshot.items;
    expect(item).toMatchObject({
      id: "ms-2026-09-26-devshark-en-linkedin",
      sourceVentureId: "marketingshark",
      ventureKey: "devshark",
      ventureLabel: "devShark",
      platform: "linkedin",
      profileLabel: "devShark on LinkedIn",
      handle: null,
      locale: "en",
      contentKind: "carousel",
      captionLimit: 3_000,
      hashtags: ["#css", "#webdevelopment", "#frontend"],
      frameCount: 5,
      group: "waiting",
      status: "draft",
      ownerChecks: "pending",
      supersedes: null,
      supersededBy: null,
      designLabHref: "/admin?venture=design-lab&tab=studio&brand=devshark",
      permalink: null,
      schemaVersion: 2,
      actions: { approve: true, edit: true, hold: true, reject: true, rerender: false }
    });
    expect(item!.frameHrefs[0]).toBe("/admin/api/queue/frame/ms-2026-09-26-devshark-en-linkedin/1");
    expect(item!.checks.map(({ id, state }) => `${id}:${state}`)).toEqual([
      "schema:pass", "duplicate:pass", "accessibility:pass", "budget:pass", "capability:pass", "authority:pass"
    ]);
    expect(item!.gate).toMatch(/LinkedIn connection is not activated yet/u);
    expect(snapshot.counts.waiting).toBe(1);
    expect(snapshot.ventures).toEqual([{ id: "devshark", label: "devShark", count: 1 }]);
  });

  it("shows a missing capability edge as a failing check before the owner tries to approve", async () => {
    const snapshot = await readAdminQueue(await root({ capabilityEdge: false }), { now });
    expect(snapshot.items[0]!.checks.find(({ id }) => id === "capability")?.state).toBe("fail");
  });

  it("maps a legacy v1 item through the registry and holds it once its window has closed", async () => {
    const base = await root();
    await mkdir(path.join(base, "state/social/queue"), { recursive: true });
    await copyFile(path.join(repository, "state/social/queue/2026-08-05-cs-instagram.json"), path.join(base, "state/social/queue/2026-08-05-cs-instagram.json"));
    const snapshot = await readAdminQueue(base, { now });
    expect(snapshot.items.map(({ ventureKey }) => ventureKey)).toEqual(["devshark", "caught-up"]);
    const legacy = snapshot.items[1]!;
    expect(legacy).toMatchObject({
      id: "caught-up-2026-08-05-cs-instagram",
      ventureLabel: "DNESKAi",
      platform: "instagram",
      schemaVersion: 1,
      group: "held",
      frameCount: 10,
      actions: { approve: false, edit: false, hold: true, reject: true, rerender: false }
    });
    expect(legacy.reason).toMatch(/window closed on/u);
    expect(snapshot.counts).toMatchObject({ waiting: 1, held: 1 });
  });

  it("follows an edit from the replaced item to its successor, and says why a hold stopped one", async () => {
    const base = await root();
    const draft = parseQueueItemV2(await readQueueFixture())!;
    const successor = supersedingQueueItem(draft, { id: `${draft.id}-r1`, text: "Which selector wins?", altText: draft.content.altText, now });
    await writeJson(base, `state/social/queue/${DRAFT_FILE}`, { ...draft, status: "cancelled" });
    await writeJson(base, `state/social/queue/${successor.id}.json`, successor);
    const edit = {
      schemaVersion: "social-queue-event/1", id: socialQueueEventId(draft.id, "edit", draft.content.contentHash), at: now.toISOString(), actor: "owner", action: "edit",
      itemId: draft.id, sourceVentureId: "marketingshark", channel: "linkedin", expectedContentHash: draft.content.contentHash, previousStatus: "draft", nextStatus: "cancelled",
      resultingContentHash: successor.content.contentHash, mode: null, publishWindow: null, deterministicChecks: null, ownerEvidenceFor: [], supersedingItemId: successor.id,
      changedFields: ["caption"], reason: null, tasteNote: null
    };
    await writeJson(base, "state/social/queue-events/2026-09-26T08-00-00-000Z-ms-2026-09-26-devshark-en-linkedin-edit.json", edit);
    await writeJson(base, "state/social/queue-events/garbage.json", { schemaVersion: "social-queue-event/1" });
    const snapshot = await readAdminQueue(base, { now });
    const original = snapshot.items.find(({ id }) => id === draft.id)!;
    const replacement = snapshot.items.find(({ id }) => id === successor.id)!;
    expect(original).toMatchObject({ group: "held", supersededBy: successor.id, reason: `Replaced by ${successor.id}.`, actions: { approve: false, edit: false, hold: false, reject: false } });
    expect(replacement).toMatchObject({ group: "waiting", supersedes: draft.id, caption: "Which selector wins?" });
    expect(snapshot.dropped.events).toBe(1);
  });

  it("explains a failure in one sanitised sentence and names the next safe action", async () => {
    const base = await root();
    const draft = parseQueueItemV2(await readQueueFixture())!;
    const failed = { ...draft, status: "failed", attempt: { idempotencyKey: "c".repeat(64), claimedAt: now.toISOString(), attemptCount: 1, lastError: "Buffer refused the post {\"error\":{\"access_token\":\"secret\"}}" } };
    await writeJson(base, `state/social/queue/${DRAFT_FILE}`, failed);
    const unconfirmed = { ...draft, id: `${draft.id}-r1`, status: "needs_reconciliation" };
    await writeJson(base, "state/social/queue/unconfirmed.json", unconfirmed);
    await writeJson(base, "state/social/posts/receipt.json", {
      schemaVersion: "social-post-receipt/1", queueItemId: draft.id, outcome: "failed", remoteUrl: null, attemptedAt: now.toISOString(),
      error: "LinkedIn page is not connected. Authorization: Bearer abc.def"
    });
    const snapshot = await readAdminQueue(base, { now });
    const failure = snapshot.items.find(({ id }) => id === draft.id)!;
    expect(failure.group).toBe("failed");
    expect(failure.reason).toBe("The provider's answer held credential-like text, so only its receipt keeps the detail.");
    expect(failure.nextSafeAction).toMatch(/^Nothing was published/u);
    const reconcile = snapshot.items.find(({ id }) => id === unconfirmed.id)!;
    expect(reconcile).toMatchObject({ group: "failed", reason: "The publisher could not confirm whether the post went out.", actions: { edit: false, approve: false } });
    expect(reconcile.nextSafeAction).toMatch(/Check the profile/u);
  });

  it("holds an approved item behind a pause file and never ships a file name or credential reference", async () => {
    const base = await root();
    const approved = await readQueueFixture("social-queue-item-v2-approved.valid.json");
    await writeJson(base, `state/social/queue/${DRAFT_FILE}`, approved);
    await writeJson(base, "state/social/pauses/connections/social-connection-devshark-linkedin.json", { paused: true });
    const snapshot = await readAdminQueue(base, { now });
    expect(snapshot.items[0]).toMatchObject({ group: "held", status: "queued", ownerChecks: "pass", reason: "The LinkedIn connection is paused, so nothing sends through it." });
    const serialised = JSON.stringify(snapshot);
    for (const forbidden of [DRAFT_FILE, ".json", "BUFFER_API_KEY", "DEVSHARK_", "state/social", "social-connection-devshark-linkedin.json", "credentialRef"]) {
      expect(serialised, forbidden).not.toContain(forbidden);
    }
  });
});
