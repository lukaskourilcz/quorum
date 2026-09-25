import { copyFile, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyQueueAction, parseQueueActionRequest } from "./actions";
import { parseSocialQueueEvent } from "./event";
import { DRAFT_FILE, queueFixtureRoot, readQueueFixture } from "./fixture-root";
import { parseQueueItemV2, queueItemV2Hash } from "./item";
import { QueueActionError } from "./store";

const roots: string[] = [];
const now = new Date("2026-09-26T08:00:00.000Z");
const repository = path.resolve(process.cwd(), "..");
let root = "";
let hash = "";

async function readJson(relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8")) as Record<string, unknown>;
}

async function events(): Promise<string[]> {
  return (await readdir(path.join(root, "state/social/queue-events")).catch(() => [] as string[])).sort();
}

async function refusal(body: unknown, at = now): Promise<QueueActionError> {
  const error = await applyQueueAction(body, { root, now: at }).then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(QueueActionError);
  return error as QueueActionError;
}

beforeEach(async () => {
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  root = await queueFixtureRoot();
  roots.push(root);
  hash = ((await readQueueFixture()).content as { contentHash: string }).contentHash;
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("the Queue's approval", () => {
  it("queues the exact item the owner saw, with the approval event as its provenance", async () => {
    const result = await applyQueueAction({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "window" }, { root, now });
    expect(result).toMatchObject({ changed: true, persistence: "filesystem", event: { action: "approve", nextStatus: "queued" } });
    // Byte for byte the item the orchestrator's publisher test accepts as publishable.
    expect(await readJson(`state/social/queue/${DRAFT_FILE}`)).toEqual(await readQueueFixture("social-queue-item-v2-approved.valid.json"));
    const written = await events();
    expect(written).toEqual(["2026-09-26T08-00-00-000Z-ms-2026-09-26-devshark-en-linkedin-approve.json"]);
    expect(await readJson(`state/social/queue-events/${written[0]}`)).toEqual(await readQueueFixture("social-queue-event.valid.json"));
  });

  it("narrows the window to the next hour for 'publish now', and never past the window's end", async () => {
    await applyQueueAction({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "now" }, { root, now });
    const approved = parseQueueItemV2(await readJson(`state/social/queue/${DRAFT_FILE}`))!;
    expect(approved.publishWindow).toEqual({ notBefore: "2026-09-26T08:00:00.000Z", notAfter: "2026-09-26T09:00:00.000Z" });
    expect(queueItemV2Hash(approved)).toBe(approved.content.contentHash);

    const late = await queueFixtureRoot();
    roots.push(late);
    await applyQueueAction({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "now" }, { root: late, now: new Date("2026-09-26T20:30:00.000Z") });
    const lateItem = JSON.parse(await readFile(path.join(late, `state/social/queue/${DRAFT_FILE}`), "utf8")) as { publishWindow: unknown };
    expect(lateItem.publishWindow).toEqual({ notBefore: "2026-09-26T20:30:00.000Z", notAfter: "2026-09-26T21:00:00.000Z" });
  });

  it("answers a repeated approval as already recorded", async () => {
    const body = { action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "window" };
    await applyQueueAction(body, { root, now });
    const repeat = await applyQueueAction(body, { root, now: new Date("2026-09-26T08:05:00.000Z") });
    expect(repeat.changed).toBe(false);
    expect(await events()).toHaveLength(1);
  });

  it("refuses a stale hash with a conflict and writes nothing", async () => {
    const before = await readFile(path.join(root, `state/social/queue/${DRAFT_FILE}`), "utf8");
    const error = await refusal({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: "f".repeat(64), mode: "window" });
    expect(error.code).toBe("CONFLICT");
    expect(await readFile(path.join(root, `state/social/queue/${DRAFT_FILE}`), "utf8")).toBe(before);
    expect(await events()).toEqual([]);
  });

  it("refuses when a deterministic check fails, naming it", async () => {
    await rm(root, { recursive: true, force: true });
    root = await queueFixtureRoot({ capabilityEdge: false });
    roots.push(root);
    const error = await refusal({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "window" });
    expect(error.code).toBe("REFUSED");
    expect(error.message).toMatch(/capability map does not allow/u);
    expect(await events()).toEqual([]);
  });

  it("refuses an approval after the window closed", async () => {
    const error = await refusal({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "window" }, new Date("2026-09-27T08:00:00.000Z"));
    expect(error).toMatchObject({ code: "REFUSED" });
  });
});

describe("the Queue's edit", () => {
  it("writes a superseding draft, cancels the original and never changes an approved item in place", async () => {
    await applyQueueAction({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "window" }, { root, now });
    const approved = parseQueueItemV2(await readJson(`state/social/queue/${DRAFT_FILE}`))!;
    const first = await applyQueueAction({ action: "edit", itemId: approved.id, expectedContentHash: approved.content.contentHash, edits: { caption: "Which selector wins: .card p or p.note? Count it.", altText: approved.content.altText } }, { root, now });
    expect(first).toMatchObject({ changed: true, supersedingItemId: `${approved.id}-r1`, event: { action: "edit", nextStatus: "cancelled" } });
    const original = parseQueueItemV2(await readJson(`state/social/queue/${DRAFT_FILE}`))!;
    expect(original).toEqual({ ...approved, status: "cancelled" });
    const successor = parseQueueItemV2(await readJson(`state/social/queue/${approved.id}-r1.json`))!;
    expect(successor).toMatchObject({ status: "draft", approvalProvenance: { approvalRef: "awaiting-owner-approval" }, content: { text: "Which selector wins: .card p or p.note? Count it." } });
    expect(queueItemV2Hash(successor)).toBe(successor.content.contentHash);

    const second = await applyQueueAction({ action: "edit", itemId: successor.id, expectedContentHash: successor.content.contentHash, edits: { caption: null, altText: "Five slides on CSS specificity, ending with the answer." } }, { root, now });
    expect(second.supersedingItemId).toBe(`${approved.id}-r2`);
    const eventFiles = await events();
    expect(eventFiles).toHaveLength(3);
    const edits = await Promise.all(eventFiles.filter((file) => file.endsWith("-edit.json")).map((file) => readJson(`state/social/queue-events/${file}`)));
    expect(edits.map((event) => parseSocialQueueEvent(event))).not.toContain(null);
    expect(edits.map((event) => [event.itemId, event.supersedingItemId, event.changedFields])).toEqual(expect.arrayContaining([
      [approved.id, `${approved.id}-r1`, ["caption"]],
      [`${approved.id}-r1`, `${approved.id}-r2`, ["altText"]]
    ]));

    const again = await refusal({ action: "edit", itemId: approved.id, expectedContentHash: approved.content.contentHash, edits: { caption: "Once more.", altText: null } });
    expect(again.code).toBe("REFUSED");
  });

  it("holds an edit to what the platform accepts and refuses an edit that changes nothing", async () => {
    const tooLong = await refusal({ action: "edit", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, edits: { caption: "x".repeat(3_001), altText: null } });
    expect(tooLong.code).toBe("INVALID");
    const draft = parseQueueItemV2(await readQueueFixture())!;
    const unchanged = await refusal({ action: "edit", itemId: draft.id, expectedContentHash: hash, edits: { caption: draft.content.text, altText: draft.content.altText } });
    expect(unchanged.message).toMatch(/changes nothing/u);
  });
});

describe("the Queue's hold and reject", () => {
  it("cancels with the owner's reason, and a rejection leaves a taste note", async () => {
    await applyQueueAction({ action: "reject", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, reason: "The hook promises more than slide two delivers." }, { root, now });
    expect((await readJson(`state/social/queue/${DRAFT_FILE}`)).status).toBe("cancelled");
    const [file] = await events();
    const event = parseSocialQueueEvent(await readJson(`state/social/queue-events/${file}`));
    expect(event).toMatchObject({ action: "reject", previousStatus: "draft", nextStatus: "cancelled", tasteNote: { releaseId: "marketingshark-2026-09-26-devshark", note: "The hook promises more than slide two delivers." } });
  });

  it("holds a legacy v1 item by changing only its status, and refuses to approve one", async () => {
    await copyFile(path.join(repository, "state/social/queue/2026-08-06-cs-threads.json"), path.join(root, "state/social/queue/2026-08-06-cs-threads.json"));
    const legacy = JSON.parse(await readFile(path.join(root, "state/social/queue/2026-08-06-cs-threads.json"), "utf8")) as { id: string; content: { contentHash: string } };
    const approve = await refusal({ action: "approve", itemId: legacy.id, expectedContentHash: legacy.content.contentHash, mode: "window" }, new Date("2026-08-06T12:00:00.000Z"));
    expect(approve.message).toMatch(/legacy v1 item/u);
    await applyQueueAction({ action: "hold", itemId: legacy.id, expectedContentHash: legacy.content.contentHash, reason: "An August edition; nothing to send now." }, { root, now });
    expect(await readJson("state/social/queue/2026-08-06-cs-threads.json")).toEqual({ ...legacy, status: "cancelled" });
  });
});

describe("the Queue's refusals", () => {
  it("refuses to write where the deployment cannot save", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const error = await refusal({ action: "hold", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, reason: "Not today." });
    expect(error.code).toBe("UNCONFIGURED");
    expect((await readJson(`state/social/queue/${DRAFT_FILE}`)).status).toBe("draft");
    expect(await events()).toEqual([]);
  });

  it("names re-render as the Design Lab's step and does nothing", async () => {
    const error = await refusal({ action: "rerender", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash });
    expect(error.code).toBe("UNAVAILABLE");
    expect(await events()).toEqual([]);
  });

  it("answers an unknown item as not found", async () => {
    expect((await refusal({ action: "hold", itemId: "no-such-item", expectedContentHash: hash, reason: "Not today." })).code).toBe("NOT_FOUND");
  });

  it("parses only complete, bounded requests", () => {
    const base = { itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: "a".repeat(64) };
    expect(parseQueueActionRequest({ ...base, action: "approve", mode: "window" })).not.toBeNull();
    for (const bad of [
      { ...base, action: "approve" },
      { ...base, action: "approve", mode: "window", reason: "Because." },
      { ...base, action: "publish", mode: "now" },
      { ...base, action: "hold" },
      { ...base, action: "hold", reason: "Authorization: Bearer ghp_secret" },
      { ...base, action: "edit", edits: { caption: null, altText: null } },
      { ...base, action: "edit", edits: { caption: "Fine.", destination: "https://example.com" } },
      { ...base, action: "approve", mode: "window", channel: "linkedin" },
      { ...base, itemId: "../queue/other", action: "hold", reason: "Not today." }
    ]) {
      expect(parseQueueActionRequest(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
