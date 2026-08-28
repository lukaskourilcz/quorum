import { createHash } from "node:crypto";
import type { Channel } from "./channel-registry.js";
import { assertLiveChannel } from "./channel-registry.js";
import type { ResolvedPublisherTarget } from "./publisher-targets.js";
import type { RuntimeQueueItem } from "./queue.js";
import {
  assertQueueItemPublishable,
  claimQueueItem,
  reconcileQueueItem
} from "./queue.js";

export interface PublishAdapter {
  publish(
    channel: Channel,
    item: RuntimeQueueItem,
    idempotencyKey: string,
    target?: ResolvedPublisherTarget
  ): Promise<{ remoteId: string }>;
  verify(
    channel: Channel,
    item: RuntimeQueueItem,
    remoteId: string,
    target?: ResolvedPublisherTarget
  ): Promise<{ remoteId: string; remoteUrl: string }>;
  findByIdempotencyKey?(
    channel: Channel,
    idempotencyKey: string,
    target?: ResolvedPublisherTarget
  ): Promise<{ remoteId: string } | null>;
}

export async function publishQueueItem(
  channel: Channel,
  item: RuntimeQueueItem,
  adapter: PublishAdapter,
  environment: NodeJS.ProcessEnv,
  now = new Date(),
  target?: ResolvedPublisherTarget
): Promise<RuntimeQueueItem> {
  assertLiveChannel(channel, environment);
  assertQueueItemPublishable(item);
  const idempotencyKey = createHash("sha256")
    .update(`${item.channel}:${item.id}:${item.content.contentHash}`)
    .digest("hex");
  const claimed = claimQueueItem(item, idempotencyKey, now);
  if (claimed.status !== "publishing") {
    return claimed;
  }
  try {
    if (adapter.findByIdempotencyKey) {
      const existing = await adapter.findByIdempotencyKey(
        channel,
        idempotencyKey,
        target
      );
      if (existing) {
        return reconcileQueueItem(claimed, {
          outcome: "published",
          remoteId: existing.remoteId
        });
      }
    }
    const result = await adapter.publish(channel, claimed, idempotencyKey, target);
    return reconcileQueueItem(claimed, {
      outcome: "published",
      remoteId: result.remoteId
    });
  } catch (error) {
    return reconcileQueueItem(claimed, {
      outcome: "ambiguous",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
