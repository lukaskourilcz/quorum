import { createHash } from "node:crypto";
import {
  PriorityItemSchema,
  PriorityQueueSchema,
  type PriorityItem,
  type PriorityQueue
} from "../contracts/autonomy.js";
import { atomicWriteJson, readJson } from "../state.js";

export const PRIORITY_QUEUE_PATH = "priority-queue.json";

function archivedAtExpiry(queue: PriorityQueue, now: Date): PriorityQueue {
  const at = now.getTime();
  return PriorityQueueSchema.parse({
    ...queue,
    items: queue.items.map((item) =>
      item.status === "open" && Date.parse(item.expires) <= at
        ? { ...item, status: "archived" as const }
        : item
    ),
    updatedAt: now.toISOString()
  });
}

export async function readPriorityQueue(root: string, now = new Date()): Promise<PriorityQueue> {
  const value = await readJson<unknown>(root, PRIORITY_QUEUE_PATH, {
    schemaVersion: "priority-queue/1",
    items: [],
    updatedAt: now.toISOString()
  });
  return archivedAtExpiry(PriorityQueueSchema.parse(value), now);
}

export function openPriorityItems(queue: PriorityQueue, venture?: string): PriorityItem[] {
  return queue.items
    .filter((item) => item.status === "open" && (!venture || item.venture === venture))
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
    items: [...queue.items, item],
    updatedAt: input.now.toISOString()
  }));
  return item;
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
