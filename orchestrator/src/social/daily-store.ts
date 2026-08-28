import { canonicalJson } from "../hashing.js";
import {
  SocialProfileOperationSchema,
  type SocialProfileOperation
} from "../contracts/social-operations.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";
import {
  CapabilityAwareQueueItemSchema,
  type CapabilityAwareQueueItem
} from "./queue.js";
import type { SocialDailyDecisionResult } from "./daily.js";

export interface StoredSocialDailyDecision {
  operation: SocialProfileOperation;
  queueItem: CapabilityAwareQueueItem | null;
  appended: boolean;
  replayed: boolean;
}

function operationPath(operation: SocialProfileOperation): string {
  return `social/profile-operations/${operation.id}.json`;
}

function queuePath(queue: CapabilityAwareQueueItem): string {
  return `social/queue/${queue.id}.json`;
}

function exactSame(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function validateHandoff(operation: SocialProfileOperation, queue: CapabilityAwareQueueItem | null): void {
  if (operation.outcome === "queued") {
    if (!queue || operation.queue?.itemId !== queue.id
      || operation.queue.itemRef !== `state/social/queue/${queue.id}.json`
      || operation.queue.payloadHash !== queue.content.contentHash) {
      throw new Error("Queued daily operation and canonical queue handoff do not match");
    }
    return;
  }
  if (queue !== null || operation.queue !== null) {
    throw new Error("A non-queued daily operation cannot persist a queue handoff");
  }
}

export async function persistSocialDailyDecision(
  stateRoot: string,
  decision: SocialDailyDecisionResult
): Promise<StoredSocialDailyDecision> {
  const operation = SocialProfileOperationSchema.parse(decision.operation);
  const queue = decision.queueItem === null ? null : CapabilityAwareQueueItemSchema.parse(decision.queueItem);
  validateHandoff(operation, queue);
  const lock = `social/locks/${operation.profileId}-${operation.connectionId}-${operation.targetDate}.lock`;

  return withFileLock(stateRoot, lock, async () => {
    const existing = await readJson<unknown | null>(stateRoot, operationPath(operation), null);
    if (existing !== null) {
      const stored = SocialProfileOperationSchema.parse(existing);
      if (!exactSame(stored, operation)) {
        throw new Error(`Daily operation conflict for ${operation.id}`);
      }
      if (queue) {
        const existingQueue = await readJson<unknown | null>(stateRoot, queuePath(queue), null);
        if (existingQueue === null) await atomicWriteJson(stateRoot, queuePath(queue), queue);
        else if (!exactSame(CapabilityAwareQueueItemSchema.parse(existingQueue), queue)) {
          throw new Error(`Queue handoff conflict for ${queue.id}`);
        }
      }
      return { operation: stored, queueItem: queue, appended: false, replayed: true };
    }

    if (queue) {
      const existingQueue = await readJson<unknown | null>(stateRoot, queuePath(queue), null);
      if (existingQueue !== null && !exactSame(CapabilityAwareQueueItemSchema.parse(existingQueue), queue)) {
        throw new Error(`Queue handoff conflict for ${queue.id}`);
      }
    }

    await atomicWriteJson(stateRoot, operationPath(operation), operation);
    if (queue) await atomicWriteJson(stateRoot, queuePath(queue), queue);
    return { operation, queueItem: queue, appended: true, replayed: false };
  });
}
