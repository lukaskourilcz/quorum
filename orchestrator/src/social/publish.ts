import { createHash } from "node:crypto";
import type { Channel } from "./channel-registry.js";
import { assertLiveChannel } from "./channel-registry.js";
import type { VerifiedSocialAsset } from "./media/assets.js";
import type { ResolvedPublisherTarget } from "./publisher-targets.js";
import type { PublishingQuota, SocialPublishHoldReason } from "../contracts/social-publish-hold.js";
import type { RuntimeQueueItem } from "./queue.js";
import {
  assertQueueItemPublishable,
  claimQueueItem,
  reconcileQueueItem
} from "./queue.js";

/**
 * An adapter's refusal that is certain to have sent nothing.
 *
 * Thrown only before the adapter's first write request, so the runner can record a hold and leave
 * the item as it was instead of treating the attempt as an ambiguous delivery. Every other error an
 * adapter throws stays ambiguous, because the runner cannot know how far the request got.
 */
export class SocialPublishHoldError extends Error {
  constructor(
    readonly reason: SocialPublishHoldReason,
    detail: string,
    readonly quota: PublishingQuota | null = null
  ) {
    super(detail);
    this.name = "SocialPublishHoldError";
  }
}

/**
 * A provider refused the request outright, so nothing was created on its side.
 *
 * An adapter throws this only when the provider's answer proves the post does not exist: a 429,
 * an authentication or permission refusal, a typed validation or plan-limit error returned
 * instead of a post, or a Meta container that ended `ERROR` or `EXPIRED` before the publish request
 * (`container-failed`). The item then fails for owner review instead of waiting on reconciliation.
 * A timeout, a server error or an unreadable answer is never this: the post may exist, so it stays
 * ambiguous and nothing resends it.
 */
export class ProviderRejectedError extends Error {
  readonly definite = true as const;

  constructor(
    readonly reason: "rate-limited" | "plan-limit" | "invalid-input" | "unauthorized" | "not-found" | "channel-unavailable" | "container-failed",
    message: string,
    readonly retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "ProviderRejectedError";
  }
}

export interface PublishAdapter {
  /**
   * Send the item. May throw `SocialPublishHoldError` before its first write request (a publishing
   * limit with no room, text the platform refuses), and `ProviderRejectedError` when the provider's
   * own answer proves no post exists. Any other error is ambiguous.
   */
  publish(
    channel: Channel,
    item: RuntimeQueueItem,
    idempotencyKey: string,
    target?: ResolvedPublisherTarget,
    /**
     * The item's frames, each proved by `verifySocialAssets` for this run: the exact URL that
     * answered and the bytes it was shown to serve. An adapter uses these URLs and never builds one.
     */
    assets?: readonly VerifiedSocialAsset[]
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
      outcome: error instanceof ProviderRejectedError ? "failed" : "ambiguous",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
