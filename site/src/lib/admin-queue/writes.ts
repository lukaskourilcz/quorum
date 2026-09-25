import "server-only";
import { parseSocialQueueEvent, socialQueueEventPath, type SocialQueueEventRecord } from "./event";
import { nextRevisionId, type QueueItemV2 } from "./item";
import type { QueueState } from "./state";
import { QueueActionError, type QueueStore } from "./store";

/**
 * The writes every superseding action shares: the event checked against its contract, the
 * supersession written as one commit, and the next free revision id. Edit and re-render both go through these,
 * so the two cannot come to disagree about what a supersession writes.
 */

/** The event as `social-queue-event/1` reads it back, or a refusal to write it at all. */
export function validated(event: SocialQueueEventRecord): SocialQueueEventRecord {
  const parsed = parseSocialQueueEvent(JSON.parse(JSON.stringify(event)) as unknown);
  if (!parsed) throw new QueueActionError("CORRUPT", "The queue event could not be validated against social-queue-event/1.");
  return parsed;
}

/**
 * An edit or a re-render: the event, the superseding draft and the cancelled original, in one commit.
 *
 * Written one file at a time, a conflict on the last write (a publisher claim that moved the
 * original in between) left the event and the successor on the branch with the original still live,
 * so the Queue hid the original's actions while the successor was a second approvable copy. Now a
 * conflict anywhere writes nothing.
 */
export async function writeSupersession(store: QueueStore, input: {
  event: SocialQueueEventRecord;
  successor: QueueItemV2;
  original: { relative: string; value: QueueItemV2; version: string };
  message: string;
}): Promise<void> {
  await store.commit([
    { kind: "create", relative: socialQueueEventPath(input.event), value: input.event },
    { kind: "create", relative: `state/social/queue/${input.successor.id}.json`, value: input.successor },
    { kind: "replace", relative: input.original.relative, value: { ...input.original.value, status: "cancelled" }, version: input.original.version }
  ], input.message);
}

export async function writeEvent(store: QueueStore, event: SocialQueueEventRecord): Promise<void> {
  if (!await store.create(socialQueueEventPath(event), event, `admin(queue): record ${event.action} for ${event.itemId}`)) {
    throw new QueueActionError("CONFLICT", "An event with this time and action already exists for the item; reload and decide again.");
  }
}

/**
 * The next `<id>-r<n>` no file holds yet. The Queue names its own revisions that way, so one
 * written since this snapshot was taken (on GitHub, after the last deploy) is found by its file
 * and skipped.
 */
export async function freeRevisionId(state: QueueState, store: QueueStore, itemId: string): Promise<string> {
  const known = state.entries.map(({ item }) => item.id);
  let supersedingId = nextRevisionId(itemId, known);
  for (let probe = 0; probe < 10 && await store.read(`state/social/queue/${supersedingId}.json`) !== null; probe += 1) {
    known.push(supersedingId);
    supersedingId = nextRevisionId(itemId, known);
  }
  if (supersedingId.length > 160) throw new QueueActionError("REFUSED", "This item has been revised too often to take another revision id.");
  return supersedingId;
}
