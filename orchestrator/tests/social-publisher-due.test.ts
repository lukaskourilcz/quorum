import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SocialPublishHoldSchema } from "../src/contracts/social-publish-hold.js";
import { repoRoot } from "../src/paths.js";
import { CapabilityAwareQueueItemSchema, type CapabilityAwareQueueItem } from "../src/social/queue.js";
import { runSocialPublisher } from "../src/social/runner.js";
import { hashedQueueItem, pendingDraft, readJsonFile, runnerOptions, stubAdapter, unlockedRunnerRoot, writeJsonFile } from "./fixtures/social-runner-root.js";

/**
 * Only the owner's approval makes a queue v2 item due (quorum#573 review). A draft with pending
 * checks used to be due, reach the publishable check and throw for the whole run, so one
 * unapproved sibling stopped the approved post beside it.
 */
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("only an approved item is due", () => {
  it("sends the approved item while an unapproved draft on a live connection waits untouched", async () => {
    const { root, approved } = await unlockedRunnerRoot(roots);
    const draftFile = path.join(root, "state/social/queue/a-draft.json");
    await writeJsonFile(draftFile, pendingDraft(approved));
    const before = await readFile(draftFile, "utf8");
    const adapter = stubAdapter();

    const report = await runSocialPublisher(runnerOptions(root, adapter));

    // The draft sorts first, as marketingShark's unapproved Instagram and Threads drafts would.
    expect(report).toMatchObject({ status: "complete", due: 1, published: 1, ambiguous: 0, rejected: 0, publishHeld: 0 });
    expect(adapter.publish).toHaveBeenCalledTimes(1);
    expect(adapter.publish.mock.calls[0]![1]).toMatchObject({ id: "fixture-approved" });
    expect(await readFile(draftFile, "utf8")).toBe(before);
    // Not even considered: a draft waits for the owner, so it earns no hold record either.
    await expect(readFile(path.join(root, "state/social/publish-holds/a-draft.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("still sends a legacy v1 draft whose checks all pass, as it always would have", async () => {
    const { root, approved } = await unlockedRunnerRoot(roots);
    await rm(path.join(root, "state/social/queue/b-approved.json"));
    const legacy = await readJsonFile(path.join(repoRoot, "state/social/queue/2026-08-05-cs-threads.json")) as Record<string, unknown>;
    await writeJsonFile(path.join(root, "state/social/queue/legacy.json"), { ...legacy, publishWindow: approved.publishWindow });
    const adapter = stubAdapter();

    const report = await runSocialPublisher(runnerOptions(root, adapter));

    expect(report).toMatchObject({ due: 1, published: 1 });
    expect(adapter.publish.mock.calls[0]![1]).toMatchObject({ id: "caught-up-2026-08-05-cs-threads", migration: { sourceSchemaVersion: 1 } });
  });

  it("leaves DNESKAi's pack draft to the owner, and sends it once the Queue approves it (#583)", async () => {
    const { root, approved } = await unlockedRunnerRoot(roots);
    await rm(path.join(root, "state/social/queue/b-approved.json"));
    // The Threads draft DNESKAi's pack composes, moved into this run's window.
    const composed = CapabilityAwareQueueItemSchema.parse(await readJsonFile(path.join(repoRoot, "contracts/fixtures/caught-up-queue-threads.valid.json")));
    const draft = hashedQueueItem({ ...composed, publishWindow: approved.publishWindow });
    const file = path.join(root, "state/social/queue/2026-08-27-cs-threads.json");
    await writeJsonFile(file, draft);
    const before = await readFile(file, "utf8");

    const waiting = stubAdapter();
    expect(await runSocialPublisher(runnerOptions(root, waiting))).toMatchObject({ due: 0, published: 0, publishHeld: 0 });
    expect(waiting.publish).not.toHaveBeenCalled();
    expect(await readFile(file, "utf8")).toBe(before);

    // What the Queue's approval writes: every check passed, its event as the provenance, a new hash.
    await writeJsonFile(file, hashedQueueItem({
      ...draft,
      status: "queued",
      checks: Object.fromEntries(Object.keys(draft.checks).map((name) => [name, "pass"])) as CapabilityAwareQueueItem["checks"],
      approvalProvenance: { ...draft.approvalProvenance, approvalRef: "social-queue-event-0123456789abcdef01234567" }
    }));
    const adapter = stubAdapter();
    expect(await runSocialPublisher(runnerOptions(root, adapter))).toMatchObject({ status: "complete", due: 1, published: 1 });
    expect(adapter.publish.mock.calls[0]![1]).toMatchObject({ id: "caught-up-2026-08-04-cs-threads", sourceVentureId: "caught-up", migration: null });
  });

  it("holds a queued item that fails its publishable check by itself, and still sends the next one", async () => {
    const { root, approved } = await unlockedRunnerRoot(roots);
    const tampered = { ...approved, id: "fixture-tampered", content: { ...approved.content, text: `${approved.content.text} (changed after approval)` } };
    await writeJsonFile(path.join(root, "state/social/queue/a-tampered.json"), tampered);
    const adapter = stubAdapter();

    const report = await runSocialPublisher(runnerOptions(root, adapter));

    expect(report).toMatchObject({ status: "complete", published: 1, publishHeld: 1 });
    expect(adapter.publish.mock.calls.map(([, item]) => (item as CapabilityAwareQueueItem).id)).toEqual(["fixture-approved"]);
    const hold = SocialPublishHoldSchema.parse(await readJsonFile(path.join(root, "state/social/publish-holds/a-tampered.json")));
    expect(hold).toMatchObject({ queueItemId: "fixture-tampered", reason: "not-publishable", detail: expect.stringContaining("content hash mismatch"), publishingAuthorized: false });
    expect(CapabilityAwareQueueItemSchema.parse(await readJsonFile(path.join(root, "state/social/queue/a-tampered.json"))).status).toBe("queued");
  });
});
