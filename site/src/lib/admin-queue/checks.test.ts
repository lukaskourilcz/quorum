import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EDGE_BOUND_SOURCES, runDeterministicChecks } from "./checks";
import { queueFixtureRoot, readQueueFixture } from "./fixture-root";
import { parseQueueItemV2, queueItemV2Hash, type QueueItemV2 } from "./item";
import { readQueueState } from "./state";

const repository = path.resolve(process.cwd(), "..");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function rehashed(item: QueueItemV2): QueueItemV2 {
  return { ...item, content: { ...item.content, contentHash: queueItemV2Hash(item) } };
}

describe("the Queue's capability check", () => {
  it("names exactly the edge-bound sources the publisher's target resolver names", async () => {
    const source = await readFile(path.join(repository, "orchestrator/src/social/publisher-targets.ts"), "utf8");
    const declared = /export const EDGE_BOUND_SOURCES = (\[[^\]]*\]) as const;/u.exec(source)?.[1];
    expect(declared).toBeDefined();
    expect(JSON.parse(declared!)).toEqual([...EDGE_BOUND_SOURCES]);
  });

  it("passes DNESKAi's pack draft on its own profile, which needs no edge (quorum#583)", async () => {
    const root = await queueFixtureRoot({ draft: false });
    roots.push(root);
    const { registry } = await readQueueState(root);
    // The Threads draft the orchestrator's pack composes for the contract's edition fixture.
    const draft = parseQueueItemV2(await readQueueFixture("caught-up-queue-threads.valid.json"));
    expect(draft).not.toBeNull();
    expect(draft!.target.capabilityRef).toBeNull();
    expect(runDeterministicChecks(draft!, [], registry)).toMatchObject({
      failures: [],
      results: { schema: "pass", capability: "pass", authority: "pass" }
    });

    // The exemption covers the venture's own primary profile and nothing else.
    const devsharkThreads = { profileId: "social-profile-devshark-threads", connectionBindingRef: "social-connection-devshark-threads" };
    const elsewhere = rehashed({ ...draft!, target: { ...draft!.target, ...devsharkThreads } });
    expect(runDeterministicChecks(elsewhere, [], registry).results).toMatchObject({ capability: "fail", authority: "fail" });
    // An edge-bound source on its own primary profile still needs its exact edge.
    const edgeBound = rehashed({ ...draft!, sourceVentureId: "marketingshark", target: { ...draft!.target, ...devsharkThreads } });
    expect(runDeterministicChecks(edgeBound, [], registry).results).toMatchObject({ capability: "fail", authority: "pass" });
  });
});
