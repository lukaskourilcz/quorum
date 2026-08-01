import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addPriorityItem,
  archivePriorityItem,
  openPriorityItems,
  readPriorityQueue,
  selectPriorityItem,
  skipPriorityItem
} from "../src/priority/queue.js";

describe("agentic priority queue", () => {
  it("selects, explains and archives work deterministically", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-"));
    const now = new Date("2026-08-01T04:00:00.000Z");
    const selected = await addPriorityItem({
      root, venture: "caught-up", question: "Which source gap matters?",
      decisionAtStake: "Whether to add one source tomorrow", now,
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    const skipped = await addPriorityItem({
      root, venture: "mma-files", question: "Is the next card complete?",
      decisionAtStake: "Whether to assign the AM article", now: new Date("2026-08-01T04:01:00.000Z"),
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    const archived = await addPriorityItem({
      root, venture: "incubator", question: "Is this proposal evidenced?",
      decisionAtStake: "Whether to bring it to synthesis", now: new Date("2026-08-01T04:02:00.000Z"),
      expires: new Date("2026-08-08T04:00:00.000Z")
    });
    await selectPriorityItem({ root, itemId: selected.id, meetingRef: "standups/2026-08-01-morning", now });
    await skipPriorityItem({ root, itemId: skipped.id, reason: "The evidence file is incomplete.", now });
    await archivePriorityItem({ root, itemId: archived.id, now });
    const queue = await readPriorityQueue(root, now);
    expect(openPriorityItems(queue)).toEqual([]);
    expect(queue.items.map((item) => item.status)).toEqual(["selected", "why-not", "archived"]);
  });
});
