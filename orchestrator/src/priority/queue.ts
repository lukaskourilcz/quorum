import { createHash } from "node:crypto";
import { z } from "zod";
import {
  PriorityItemSchema,
  PriorityQueueSchema,
  type PriorityItem,
  type PriorityQueue
} from "../contracts/autonomy.js";
import { atomicWriteJson, readJson } from "../state.js";

export const PRIORITY_QUEUE_PATH = "priority-queue.json";

// The items cap in PriorityQueueSchema, restated so the prune below can reason about it.
// A test asserts the two stay equal.
export const PRIORITY_QUEUE_CAP = 200;

// One week, the same window the morning seed gives an item in cycle.ts. A finished item
// is kept for a full window past its own expiry so a recently resolved question is still
// readable in the file, then it goes.
const RESOLVED_RETENTION_MS = 7 * 86_400_000;

// The file on disk is exactly what may already sit over the cap, so it is read with the
// cap lifted. Parsing it with PriorityQueueSchema would throw before the prune could run.
const StoredQueueSchema = PriorityQueueSchema.extend({
  items: z.array(PriorityItemSchema)
});

function archivedAtExpiry(items: readonly PriorityItem[], now: Date): PriorityItem[] {
  const at = now.getTime();
  return items.map((item) =>
    item.status === "open" && Date.parse(item.expires) <= at
      ? PriorityItemSchema.parse({ ...item, status: "archived" as const })
      : item
  );
}

// Prune on read.
//
// Open items do not accumulate: the morning branch skips any venture that already has one,
// and ensurePriorityItem matches open items, so a venture holds at most one at a time.
// Finished items are the other case. An item expires a week after it is seeded,
// archivedAtExpiry retires it, the next morning seeds a replacement, and before this function
// nothing took the retired one back out — so the file gained about one dead item per agenda
// venture per expiry window, with no ceiling short of the cap.
//
// No queue has actually reached the 200-item cap; this prune is what keeps it that way,
// rather than a repair for an outage that already happened. Were the file to reach the cap,
// PriorityQueueSchema.parse would reject it and readPriorityQueue and addPriorityItem would
// both throw, taking the morning cycle down with a zod error and no queue at all.
//
// Only finished items are dropped, and only once they are a full retention window past
// their own expiry: they cannot be selected, and ensurePriorityItem already matches open
// items only, so nothing live is lost.
function withoutStaleResolved(items: readonly PriorityItem[], now: Date): PriorityItem[] {
  const cutoff = now.getTime() - RESOLVED_RETENTION_MS;
  return items.filter((item) => item.status === "open" || Date.parse(item.expires) > cutoff);
}

// An open item is never dropped to fit the cap. Losing unanswered questions to keep a file
// parseable trades a loud failure for a silent one, so recent finished items give way first
// (oldest expiry out first) and a queue that is full of open work says so.
function withinCap(items: readonly PriorityItem[]): PriorityItem[] {
  if (items.length <= PRIORITY_QUEUE_CAP) return [...items];
  const open = items.filter((item) => item.status === "open").length;
  if (open > PRIORITY_QUEUE_CAP) {
    throw new Error(
      `Priority queue holds ${open} open items, past the ${PRIORITY_QUEUE_CAP}-item cap. `
      + "Nothing was dropped. This needs a human: selectPriorityItem, skipPriorityItem and "
      + "archivePriorityItem all read the queue through here first, so every one of them "
      + "raises this same error and the queue cannot clear itself from inside the council. "
      + `Resolve open items in the admin UI, which reads ${PRIORITY_QUEUE_PATH} on its own `
      + "without this cap, or edit that file directly."
    );
  }
  const doomed = new Set(
    items
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item.status !== "open")
      .sort((left, right) =>
        left.item.expires.localeCompare(right.item.expires)
        || left.item.created.localeCompare(right.item.created)
        || left.index - right.index)
      .slice(0, items.length - PRIORITY_QUEUE_CAP)
      .map((entry) => entry.index)
  );
  return items.filter((_, index) => !doomed.has(index));
}

export async function readPriorityQueue(root: string, now = new Date()): Promise<PriorityQueue> {
  const value = await readJson<unknown>(root, PRIORITY_QUEUE_PATH, {
    schemaVersion: "priority-queue/1",
    items: [],
    updatedAt: now.toISOString()
  });
  const stored = StoredQueueSchema.parse(value);
  return PriorityQueueSchema.parse({
    ...stored,
    items: withinCap(withoutStaleResolved(archivedAtExpiry(stored.items, now), now)),
    updatedAt: now.toISOString()
  });
}

/**
 * The questions the board can still commission a room for.
 *
 * "why-not" is not a closed question — it is one the board declined on a particular morning, and
 * the starvation review publishes exactly that wording. Filtering it out here meant the board
 * skipped every item it did not select, and from the next morning on it was handed an empty list
 * and told by its own prompt that an empty list means request nothing. Five seeded questions on
 * 1 August, none ever asked again: the room met every day and could not have commissioned
 * anything if it had wanted to. "archived" is the terminal one.
 */
export function openPriorityItems(queue: PriorityQueue, venture?: string): PriorityItem[] {
  return queue.items
    .filter((item) => (item.status === "open" || item.status === "why-not") && (!venture || item.venture === venture))
    .sort((left, right) => left.created.localeCompare(right.created) || left.id.localeCompare(right.id));
}

export async function addPriorityItem(input: {
  root: string;
  venture: string;
  question: string;
  decisionAtStake: string;
  evidenceNeeded?: string[];
  requestedBy?: string;
  now: Date;
  expires: Date;
}): Promise<PriorityItem> {
  const queue = await readPriorityQueue(input.root, input.now);
  const id = `priority-${createHash("sha256")
    .update(`${input.venture}\n${input.question.trim()}\n${input.decisionAtStake.trim()}\n${input.now.toISOString()}`)
    .digest("hex")
    .slice(0, 16)}`;
  const item = PriorityItemSchema.parse({
    schemaVersion: "priority-item/1",
    id,
    venture: input.venture,
    question: input.question,
    decision_at_stake: input.decisionAtStake,
    evidence_needed: [...new Set(input.evidenceNeeded ?? [])].slice(0, 12),
    requested_by: input.requestedBy ?? "VIZE",
    created: input.now.toISOString(),
    expires: input.expires.toISOString(),
    status: "open",
    why_not_reason: null,
    consumed_by: null
  });
  await atomicWriteJson(input.root, PRIORITY_QUEUE_PATH, PriorityQueueSchema.parse({
    schemaVersion: "priority-queue/1",
    // The read pruned by age; this only bites when the append itself lands on the cap, and
    // it fails loudly rather than with a bare zod message when open work fills the queue.
    items: withinCap([...queue.items, item]),
    updatedAt: input.now.toISOString()
  }));
  return item;
}

export async function ensurePriorityItem(input: {
  root: string;
  venture: string;
  question: string;
  decisionAtStake: string;
  evidenceNeeded?: string[];
  requestedBy?: string;
  now: Date;
  expires: Date;
}): Promise<{ item: PriorityItem; created: boolean }> {
  const queue = await readPriorityQueue(input.root, input.now);
  // Match only OPEN items. Matching across every status meant a question that had been
  // consumed or had expired still counted as present, so the morning seed could run exactly
  // once per venture for the life of the repo and the agenda loop would go quiet a week
  // later with nothing in the queue and no way to refill it.
  const existing = queue.items.find((item) =>
    item.status === "open"
    && item.venture === input.venture
    && item.question === input.question.trim()
    && item.decision_at_stake === input.decisionAtStake.trim()
  );
  if (existing) return { item: existing, created: false };
  return { item: await addPriorityItem(input), created: true };
}

async function transition(input: {
  root: string;
  itemId: string;
  now: Date;
  status: "selected" | "why-not" | "archived";
  consumedBy?: string;
  reason?: string;
}): Promise<PriorityItem> {
  const queue = await readPriorityQueue(input.root, input.now);
  let result: PriorityItem | null = null;
  const items = queue.items.map((item) => {
    if (item.id !== input.itemId) return item;
    if (item.status !== "open" && !(item.status === input.status)) {
      throw new Error(`Priority item ${item.id} is ${item.status}, not open`);
    }
    result = PriorityItemSchema.parse({
      ...item,
      status: input.status,
      why_not_reason: input.status === "why-not" ? input.reason : null,
      consumed_by: input.status === "selected" ? input.consumedBy : null
    });
    return result;
  });
  if (!result) throw new Error(`Unknown priority item ${input.itemId}`);
  await atomicWriteJson(input.root, PRIORITY_QUEUE_PATH, PriorityQueueSchema.parse({
    schemaVersion: "priority-queue/1",
    items,
    updatedAt: input.now.toISOString()
  }));
  return result;
}

export function selectPriorityItem(input: {
  root: string;
  itemId: string;
  meetingRef: string;
  now: Date;
}): Promise<PriorityItem> {
  return transition({ ...input, status: "selected", consumedBy: input.meetingRef });
}

export function skipPriorityItem(input: {
  root: string;
  itemId: string;
  reason: string;
  now: Date;
}): Promise<PriorityItem> {
  return transition({ ...input, status: "why-not", reason: input.reason });
}

export function archivePriorityItem(input: {
  root: string;
  itemId: string;
  now: Date;
}): Promise<PriorityItem> {
  return transition({ ...input, status: "archived" });
}
