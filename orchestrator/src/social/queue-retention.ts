import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { SocialQueueEventSchema } from "../contracts/social-queue-event.js";
import { SocialQueueRetentionSchema, type SocialQueueRetention } from "../contracts/social-queue-retention.js";
import { sha256 } from "../hashing.js";
import { atomicWriteJson } from "../state.js";
import { retentionKeepFrom } from "./media/retention.js";
import { CapabilityAwareQueueItemSchema } from "./queue.js";

/**
 * How long a closed queue item and its events stay in `state/social/`.
 *
 * The same ninety days as the frames in `site/public/social/` (quorum#570), so an item never
 * outlives the pictures it names by much, and neither directory nears the 2,000 files the Queue
 * reads. The cost is that the Queue's duplicate check no longer sees captions published more than
 * ninety days ago; captions are written for their day, so that is a check nobody needs.
 */
export const SOCIAL_QUEUE_RETENTION_DAYS = 90;

const CLOSED = new Set(["published", "cancelled", "expired", "failed"]);

export function queueRetentionRecordPath(date: string): string {
  return `social/queue-retention/${date}.json`;
}

interface ItemFile {
  file: string;
  bytes: Buffer;
  id: string;
  status: string;
  /** ISO timestamps of everything that happened to the item, from the item itself. */
  times: string[];
}

interface EventFile {
  file: string;
  bytes: Buffer;
  itemId: string;
  linkedIds: string[];
  at: string;
}

async function jsonNames(directory: string): Promise<string[]> {
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? [] : Promise.reject(error));
  return names.filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort();
}

function parseJson(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString("utf8")) as unknown; } catch { return undefined; }
}

/** A tiny union-find over item ids: an edit or re-render links an item to its successor. */
function linker() {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = parent.get(id) ?? id;
    while ((parent.get(root) ?? root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  return {
    find,
    link(left: string, right: string) {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent.set(a, b);
    }
  };
}

/**
 * Remove closed queue items last active before the retention window, with their owner events,
 * and record what went.
 *
 * Runs in the cycle's daily queue-health step beside the frame prune, which commits the deletions
 * and the record. Conservative in every direction: a file that does not parse as queue v2 or as a
 * queue event is never removed (the four v1 items are migration evidence the audit counts); an
 * item linked through an edit or re-render to one that is still open or recent stays; and nothing
 * under `state/social/posts/` (the receipts) or the hold directories is read or touched. Every
 * removed file is hashed first. A run that removes nothing writes nothing; a second run the same
 * day adds to that day's record.
 */
export async function pruneSocialQueue(input: {
  stateRoot: string;
  today: string;
  retentionDays?: number;
}): Promise<{ record: SocialQueueRetention; artifacts: string[] }> {
  const retentionDays = input.retentionDays ?? SOCIAL_QUEUE_RETENTION_DAYS;
  const keepFrom = retentionKeepFrom(input.today, retentionDays);
  const queueDirectory = path.join(input.stateRoot, "social", "queue");
  const eventDirectory = path.join(input.stateRoot, "social", "queue-events");

  let unmanagedCount = 0;
  const items: ItemFile[] = [];
  const seenIds = new Set<string>();
  const blockedIds = new Set<string>();
  for (const file of await jsonNames(queueDirectory)) {
    const bytes = await readFile(path.join(queueDirectory, file));
    const parsed = CapabilityAwareQueueItemSchema.safeParse(parseJson(bytes));
    if (!parsed.success) {
      unmanagedCount += 1;
      // A v1 item or a malformed file still names an id when it can; whatever it is linked to stays.
      const raw = parseJson(bytes);
      if (raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id === "string") blockedIds.add((raw as { id: string }).id);
      continue;
    }
    const item = parsed.data;
    // Two files claiming one id: neither is safe to judge alone, so both stay.
    if (seenIds.has(item.id)) blockedIds.add(item.id);
    seenIds.add(item.id);
    const times = [item.createdAt, item.publishWindow.notAfter, ...(item.attempt ? [item.attempt.claimedAt] : [])];
    items.push({ file, bytes, id: item.id, status: item.status, times });
  }

  const events: EventFile[] = [];
  for (const file of await jsonNames(eventDirectory)) {
    const bytes = await readFile(path.join(eventDirectory, file));
    const parsed = SocialQueueEventSchema.safeParse(parseJson(bytes));
    if (!parsed.success) { unmanagedCount += 1; continue; }
    const event = parsed.data;
    const linkedIds = [event.itemId, ...(event.supersedingItemId ? [event.supersedingItemId] : [])];
    events.push({ file, bytes, itemId: event.itemId, linkedIds, at: event.at });
  }

  const links = linker();
  const eventTimes = new Map<string, string[]>();
  for (const event of events) {
    for (const id of event.linkedIds) {
      links.link(event.itemId, id);
      eventTimes.set(id, [...(eventTimes.get(id) ?? []), event.at]);
    }
  }

  const lastActivity = (item: ItemFile): string =>
    [...item.times, ...(eventTimes.get(item.id) ?? [])].map((time) => new Date(time).toISOString().slice(0, 10)).sort().at(-1)!;
  const prunable = (item: ItemFile): boolean => CLOSED.has(item.status) && lastActivity(item) < keepFrom;

  // A group leaves whole or not at all: every item in it must be closed and old, and none of it
  // may be linked to a file the step does not manage.
  const blockedGroups = new Set<string>([...blockedIds].map((id) => links.find(id)));
  for (const item of items) if (!prunable(item)) blockedGroups.add(links.find(item.id));

  const removedItems: SocialQueueRetention["removedItems"] = [];
  const removedIds = new Set<string>();
  let heldByLink = 0;
  for (const item of items) {
    if (!prunable(item)) continue;
    if (blockedGroups.has(links.find(item.id))) { heldByLink += 1; continue; }
    removedItems.push({
      path: `state/social/queue/${item.file}`,
      id: item.id,
      status: item.status as SocialQueueRetention["removedItems"][number]["status"],
      lastActivity: lastActivity(item),
      sha256: sha256(item.bytes),
      bytes: item.bytes.byteLength
    });
    removedIds.add(item.id);
  }
  const removedEvents: SocialQueueRetention["removedEvents"] = events
    .filter((event) => removedIds.has(event.itemId) && event.linkedIds.every((id) => removedIds.has(id) || !seenIds.has(id)))
    .map((event) => ({
      path: `state/social/queue-events/${event.file}`,
      itemId: event.itemId,
      at: new Date(event.at).toISOString().slice(0, 10),
      sha256: sha256(event.bytes),
      bytes: event.bytes.byteLength
    }));

  let record = SocialQueueRetentionSchema.parse({
    schemaVersion: "social-queue-retention/1",
    date: input.today,
    retentionDays,
    keepFrom,
    removedItems,
    removedEvents,
    keptItems: items.length - removedItems.length,
    keptEvents: events.length - removedEvents.length,
    heldByLink,
    unmanagedCount
  });
  if (removedItems.length === 0) return { record, artifacts: [] };

  // Hash first, write the record, then delete: a crash between the two leaves a record that names
  // files still present, which the next run repeats, never files gone with no record.
  const relativeRecord = queueRetentionRecordPath(input.today);
  const earlier = SocialQueueRetentionSchema.safeParse(
    await readFile(path.join(input.stateRoot, relativeRecord), "utf8").then((raw) => JSON.parse(raw) as unknown).catch(() => null)
  );
  if (earlier.success && earlier.data.keepFrom === keepFrom) {
    const items = new Set(record.removedItems.map((item) => item.path));
    const eventPaths = new Set(record.removedEvents.map((event) => event.path));
    record = SocialQueueRetentionSchema.parse({
      ...record,
      removedItems: [...earlier.data.removedItems.filter((item) => !items.has(item.path)), ...record.removedItems],
      removedEvents: [...earlier.data.removedEvents.filter((event) => !eventPaths.has(event.path)), ...record.removedEvents]
    });
  }
  await atomicWriteJson(input.stateRoot, relativeRecord, record);
  for (const removed of [...removedItems, ...removedEvents]) {
    await unlink(path.join(input.stateRoot, removed.path.replace(/^state\//u, "")));
  }
  return { record, artifacts: [relativeRecord] };
}
