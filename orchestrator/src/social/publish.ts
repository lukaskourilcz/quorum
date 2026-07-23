import { createHash } from "node:crypto";
import type { Channel } from "./channel-registry.js";
import { assertLiveChannel } from "./channel-registry.js";
import type { QueueItem } from "./queue.js";
import { claimQueueItem, reconcileQueueItem } from "./queue.js";

export interface PublishAdapter {
  publish(
    channel: Channel,
    item: QueueItem,
    idempotencyKey: string
  ): Promise<{ remoteId: string }>;
  findByIdempotencyKey?(
    channel: Channel,
    idempotencyKey: string
  ): Promise<{ remoteId: string } | null>;
}

export async function publishQueueItem(
  channel: Channel,
  item: QueueItem,
  adapter: PublishAdapter,
  environment: NodeJS.ProcessEnv,
  now = new Date()
): Promise<QueueItem> {
  assertLiveChannel(channel, environment);
  const idempotencyKey = createHash("sha256")
    .update(`${item.channel}:${item.id}:${item.payloadHash}`)
    .digest("hex");
  const claimed = claimQueueItem(item, idempotencyKey, now);
  if (claimed.state !== "claimed") {
    return claimed;
  }
  try {
    if (adapter.findByIdempotencyKey) {
      const existing = await adapter.findByIdempotencyKey(
        channel,
        idempotencyKey
      );
      if (existing) {
        return reconcileQueueItem(claimed, {
          outcome: "published",
          remoteId: existing.remoteId
        });
      }
    }
    const result = await adapter.publish(channel, claimed, idempotencyKey);
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
