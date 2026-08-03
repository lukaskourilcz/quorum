import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PriorityQueueSchema, type PriorityItem } from "../src/contracts/autonomy.js";
import {
  addPriorityItem,
  archivePriorityItem,
  openPriorityItems,
  PRIORITY_QUEUE_CAP,
  PRIORITY_QUEUE_PATH,
  readPriorityQueue,
  selectPriorityItem,
  skipPriorityItem
} from "../src/priority/queue.js";

const NOW = new Date("2026-08-01T04:00:00.000Z");
const DAY_MS = 86_400_000;

function item(index: number, overrides: Partial<PriorityItem> = {}): PriorityItem {
  const created = new Date(NOW.getTime() - (30 * DAY_MS) + index).toISOString();
  return {
    schemaVersion: "priority-item/1",
    id: `priority-${index.toString(16).padStart(16, "0")}`,
    venture: "caught-up",
    question: `Question ${index}?`,
    decision_at_stake: `Decision ${index}`,
    evidence_needed: [],
    requested_by: "VIZE",
    created,
    // Long resolved: expired three weeks ago, well past the retention window.
    expires: new Date(NOW.getTime() - (21 * DAY_MS)).toISOString(),
    status: "archived",
    why_not_reason: null,
    consumed_by: null,
    ...overrides
  } as PriorityItem;
}

function openItem(index: number): PriorityItem {
  return item(index, { status: "open", expires: new Date(NOW.getTime() + (7 * DAY_MS)).toISOString() });
}

async function seedQueueFile(root: string, items: PriorityItem[]): Promise<void> {
  await writeFile(path.join(root, PRIORITY_QUEUE_PATH), JSON.stringify({
    schemaVersion: "priority-queue/1",
    items,
    updatedAt: NOW.toISOString()
  }), "utf8");
}

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

  // Without the prune, retired items would build up at about one per agenda venture per
  // expiry window until the file crossed the schema cap, and from then on every read and
  // write would throw. The queue below is seeded past the cap to exercise that; no real
  // queue has got there.
  it("prunes long-resolved items so a queue past the cap still reads and takes new work", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-cap-"));
    const open = [0, 1, 2, 3, 4].map((index) => openItem(index));
    const stale = Array.from({ length: PRIORITY_QUEUE_CAP - 4 }, (_unused, offset) => {
      const index = offset + 5;
      if (index % 3 === 0) return item(index, { status: "selected", consumed_by: "standups/2026-07-04-morning" });
      if (index % 3 === 1) return item(index, { status: "why-not", why_not_reason: "No evidence yet." });
      return item(index);
    });
    await seedQueueFile(root, [...open, ...stale]);
    expect([...open, ...stale].length).toBeGreaterThan(PRIORITY_QUEUE_CAP);

    const queue = await readPriorityQueue(root, NOW);
    expect(queue.items.map((entry) => entry.id)).toEqual(open.map((entry) => entry.id));

    const added = await addPriorityItem({
      root,
      venture: "caught-up",
      question: "Which source gap matters?",
      decisionAtStake: "Whether to add one source tomorrow",
      now: NOW,
      expires: new Date(NOW.getTime() + (7 * DAY_MS))
    });
    const reread = await readPriorityQueue(root, NOW);
    expect(reread.items.map((entry) => entry.id)).toContain(added.id);
    expect(reread.items).toHaveLength(open.length + 1);
  });

  it("drops recently resolved items rather than any open item at the cap", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-open-"));
    const open = Array.from({ length: PRIORITY_QUEUE_CAP }, (_unused, index) => openItem(index));
    // Resolved yesterday, so inside the retention window: still the first thing to go.
    const recent = [0, 1, 2, 3, 4].map((offset) => item(PRIORITY_QUEUE_CAP + offset, {
      status: "why-not",
      why_not_reason: "Answered in the morning room.",
      expires: new Date(NOW.getTime() - DAY_MS).toISOString()
    }));
    await seedQueueFile(root, [...open, ...recent]);

    const queue = await readPriorityQueue(root, NOW);
    expect(queue.items.map((entry) => entry.id)).toEqual(open.map((entry) => entry.id));
    expect(openPriorityItems(queue)).toHaveLength(PRIORITY_QUEUE_CAP);
  });

  it("reports open items past the cap instead of dropping them", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-full-"));
    await seedQueueFile(root, Array.from({ length: PRIORITY_QUEUE_CAP + 1 }, (_unused, index) => openItem(index)));
    await expect(readPriorityQueue(root, NOW)).rejects.toThrow(
      `Priority queue holds ${PRIORITY_QUEUE_CAP + 1} open items, past the ${PRIORITY_QUEUE_CAP}-item cap`
    );
  });

  it("keeps resolved items inside the retention window", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-priority-recent-"));
    const kept = item(1, { expires: new Date(NOW.getTime() - (6 * DAY_MS)).toISOString() });
    const dropped = item(2, { expires: new Date(NOW.getTime() - (8 * DAY_MS)).toISOString() });
    await seedQueueFile(root, [kept, dropped]);
    const queue = await readPriorityQueue(root, NOW);
    expect(queue.items.map((entry) => entry.id)).toEqual([kept.id]);
  });

  it("pins the local cap to the queue contract", () => {
    const build = (count: number) => ({
      schemaVersion: "priority-queue/1",
      items: Array.from({ length: count }, (_unused, index) => openItem(index)),
      updatedAt: NOW.toISOString()
    });
    expect(PriorityQueueSchema.safeParse(build(PRIORITY_QUEUE_CAP)).success).toBe(true);
    expect(PriorityQueueSchema.safeParse(build(PRIORITY_QUEUE_CAP + 1)).success).toBe(false);
  });
});
