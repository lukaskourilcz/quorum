import { rm } from "node:fs/promises";
import path from "node:path";
import { SocialPublishHoldSchema, type SocialPublishHold } from "../contracts/social-publish-hold.js";
import { atomicWriteJson } from "../state.js";
import type { SocialPublishHoldError } from "./publish.js";
import type { CapabilityAwareQueueItem } from "./queue.js";

/** Where the runner records why an adapter held an item: one file per queue file, same name. */
export function socialPublishHoldPath(queueFileName: string): string {
  return `social/publish-holds/${queueFileName}`;
}

/**
 * Write the `social-publish-hold/1` record for an item its adapter refused before any write.
 * The social runner is the only caller, so it stays the only writer of `state/social/publish-holds/`.
 */
export async function recordPublishHold(input: {
  stateRoot: string;
  queueFileName: string;
  item: CapabilityAwareQueueItem;
  providerId: string;
  hold: SocialPublishHoldError;
  /** The hold's message after the runner redacted every credential value from it. */
  detail: string;
  now: Date;
}): Promise<SocialPublishHold> {
  const record = SocialPublishHoldSchema.parse({
    schemaVersion: "social-publish-hold/1",
    queueItemId: input.item.id,
    sourceVentureId: input.item.sourceVentureId,
    channel: input.item.channel,
    profileId: input.item.target.profileId,
    connectionId: input.item.target.connectionBindingRef,
    providerId: input.providerId,
    reason: input.hold.reason,
    quota: input.hold.quota,
    detail: input.detail.replace(/\s+/gu, " ").trim().slice(0, 300) || "no detail",
    checkedAt: input.now.toISOString(),
    publishingAuthorized: false
  });
  await atomicWriteJson(input.stateRoot, socialPublishHoldPath(input.queueFileName), record);
  return record;
}

/** The item got past its adapter's checks, so an earlier hold no longer describes it. */
export async function clearPublishHold(stateRoot: string, queueFileName: string): Promise<void> {
  await rm(path.join(stateRoot, socialPublishHoldPath(queueFileName)), { force: true });
}
