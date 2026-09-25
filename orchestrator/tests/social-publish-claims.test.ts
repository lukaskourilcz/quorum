import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readSocialPublishClaims, writeSocialPublishClaims } from "../src/social/publish-claims.js";
import { CapabilityAwareQueueItemSchema } from "../src/social/queue.js";
import { runSocialPublisher } from "../src/social/runner.js";
import {
  hashedQueueItem,
  readJsonFile,
  RUNNER_CONNECTION,
  RUNNER_NOW,
  runnerOptions,
  stubAdapter,
  unlockedRunnerRoot,
  writeJsonFile
} from "./fixtures/social-runner-root.js";

/**
 * The publisher claims an item on the branch before it sends it (quorum#574 review). The claim
 * phase writes `publishing` and calls no provider; the workflow pushes that; the send phase acts
 * only on claims the branch still carries, after checking every lock again. The Queue replaces an
 * item only against the version it read, so it can no longer change an item a run is sending.
 */
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const queueFile = (root: string) => path.join(root, "state/social/queue/b-approved.json");

describe("the claim reaches the branch before anything is sent", () => {
  it("writes publishing with its attempt, keeps the file's text for a release, and calls no provider", async () => {
    const { root } = await unlockedRunnerRoot(roots);
    const before = await readFile(queueFile(root), "utf8");
    const adapter = stubAdapter();

    const claimed = await runSocialPublisher(runnerOptions(root, adapter, { phase: "claim" }));

    expect(claimed).toMatchObject({ status: "claimed", claimed: 1, published: 0 });
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(adapter.findByIdempotencyKey).not.toHaveBeenCalled();
    const item = CapabilityAwareQueueItemSchema.parse(await readJsonFile(queueFile(root)));
    expect(item).toMatchObject({ status: "publishing", attempt: { claimedAt: RUNNER_NOW.toISOString(), attemptCount: 1, lastError: null } });
    expect(claimed.claims).toEqual([expect.objectContaining({ queueFile: "b-approved.json", itemId: "fixture-approved", before, idempotencyKey: item.attempt!.idempotencyKey })]);

    const sent = await runSocialPublisher(runnerOptions(root, adapter, { phase: "send", claims: claimed.claims, now: new Date(RUNNER_NOW.getTime() + 60_000) }));

    expect(sent).toMatchObject({ status: "complete", published: 1 });
    expect(adapter.publish).toHaveBeenCalledTimes(1);
    expect(CapabilityAwareQueueItemSchema.parse(await readJsonFile(queueFile(root)))).toMatchObject({ status: "published", attempt: { claimedAt: RUNNER_NOW.toISOString() } });
  });

  it("sends nothing for a claim the branch no longer carries, and leaves the owner's version alone", async () => {
    const { root, approved } = await unlockedRunnerRoot(roots);
    const adapter = stubAdapter();
    const claimed = await runSocialPublisher(runnerOptions(root, adapter, { phase: "claim" }));
    // The owner's hold reached the branch first: the item is cancelled there.
    await writeJsonFile(queueFile(root), { ...approved, status: "cancelled" });
    const held = await readFile(queueFile(root), "utf8");

    const sent = await runSocialPublisher(runnerOptions(root, adapter, { phase: "send", claims: claimed.claims }));

    expect(sent).toMatchObject({ published: 0, released: 0, skipped: 1 });
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(await readFile(queueFile(root), "utf8")).toBe(held);
  });

  it("puts a claim back byte for byte when a pause lands between the claim and the send", async () => {
    const { root } = await unlockedRunnerRoot(roots);
    const before = await readFile(queueFile(root), "utf8");
    const adapter = stubAdapter();
    const claimed = await runSocialPublisher(runnerOptions(root, adapter, { phase: "claim" }));
    await writeJsonFile(path.join(root, `state/social/pauses/connections/${RUNNER_CONNECTION}.json`), { schemaVersion: "social-connection-pause/1", connectionId: RUNNER_CONNECTION, reason: "fixture", pausedAt: RUNNER_NOW.toISOString() });

    const sent = await runSocialPublisher(runnerOptions(root, adapter, { phase: "send", claims: claimed.claims }));

    expect(sent).toMatchObject({ published: 0, released: 1 });
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(await readFile(queueFile(root), "utf8")).toBe(before);
  });

  it("releases every standing claim when the social pause is raised before the send", async () => {
    const { root } = await unlockedRunnerRoot(roots);
    const before = await readFile(queueFile(root), "utf8");
    const adapter = stubAdapter();
    const claimed = await runSocialPublisher(runnerOptions(root, adapter, { phase: "claim" }));
    await writeFile(path.join(root, "state/SOCIAL_PAUSED"), "fixture\n");

    const sent = await runSocialPublisher(runnerOptions(root, adapter, { phase: "send", claims: claimed.claims }));

    expect(sent).toMatchObject({ status: "paused", released: 1, published: 0 });
    expect(adapter.publish).not.toHaveBeenCalled();
    expect(await readFile(queueFile(root), "utf8")).toBe(before);
  });

  it("counts a claim that never finished toward its connection's cadence", async () => {
    const { root, approved } = await unlockedRunnerRoot(roots);
    const stale = hashedQueueItem({ ...approved, id: "fixture-stale-claim", content: { ...approved.content, text: "An earlier post." } });
    await writeJsonFile(path.join(root, "state/social/queue/a-stale.json"), {
      ...stale,
      status: "publishing",
      attempt: { idempotencyKey: "b".repeat(64), claimedAt: new Date(RUNNER_NOW.getTime() - 3_600_000).toISOString(), attemptCount: 1, lastError: null }
    });
    const adapter = stubAdapter();

    const report = await runSocialPublisher(runnerOptions(root, adapter));

    // Six hours between posts on this connection, and the unfinished claim may have gone out an hour ago.
    expect(report).toMatchObject({ status: "draft_only", published: 0, claimed: 0 });
    expect(adapter.publish).not.toHaveBeenCalled();
  });
});

describe("the claims file between the two phases", () => {
  it("round-trips the claims and is written only when something was claimed", async () => {
    const { root } = await unlockedRunnerRoot(roots);
    const claimed = await runSocialPublisher(runnerOptions(root, stubAdapter(), { phase: "claim" }));
    const file = path.join(root, "claims.json");

    await writeSocialPublishClaims(file, claimed.claims);
    expect(await readSocialPublishClaims(file)).toEqual(claimed.claims);
    await writeSocialPublishClaims(file, []);
    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readSocialPublishClaims(file)).toEqual([]);
  });
});
