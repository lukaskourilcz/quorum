import { z } from "zod";
import { DateTimeSchema, VentureIdSchema } from "./common.js";

/**
 * Why a provider adapter stopped an item before it made any write request.
 *
 * - `publishing-quota-exhausted`: the platform's own publishing limit has no room for one more
 *   post. Instagram counts 100 API posts and Threads 250 in a rolling 24 hours, and a carousel
 *   counts once on both; the adapter reads the live figure rather than trusting those numbers.
 * - `publishing-quota-unreadable`: the limit could not be read, so nothing proves there is room.
 * - `platform-text-limit`: the text is longer than the platform accepts (Threads: 500, counting an
 *   emoji as its UTF-8 bytes). Waiting cannot fix it; an edit that supersedes the item can.
 * - `not-publishable`: the runner's own last check before a send refused the item (a check not
 *   passing, a content hash that no longer matches, frames without alt text). It costs that item
 *   alone, never the run, and the detail names the check.
 */
export const SOCIAL_PUBLISH_HOLD_REASONS = [
  "publishing-quota-exhausted",
  "publishing-quota-unreadable",
  "platform-text-limit",
  "not-publishable"
] as const;
export type SocialPublishHoldReason = (typeof SOCIAL_PUBLISH_HOLD_REASONS)[number];

/** `quota_usage` and `config.quota_total` / `config.quota_duration` as the platform reported them. */
export const PublishingQuotaSchema = z.strictObject({
  usage: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  durationSeconds: z.number().int().positive()
});
export type PublishingQuota = z.infer<typeof PublishingQuotaSchema>;

/**
 * `social-publish-hold/1`: the publisher's record that an item was stopped before sending, by its
 * adapter or by the runner's own publishable check.
 *
 * Written by the social runner alone, one file per queue item under `state/social/publish-holds/`,
 * and removed once the item gets past its adapter's checks. Like an asset hold, the queue item is
 * left exactly as it was: nothing reached the platform, so this is not a failure and not an
 * ambiguous delivery, and it pauses no connection and no venture. An adapter may raise a hold only
 * before its first write request; anything later is an ambiguous outcome.
 */
export const SocialPublishHoldSchema = z.strictObject({
  schemaVersion: z.literal("social-publish-hold/1"),
  queueItemId: z.string().trim().min(1).max(160),
  sourceVentureId: VentureIdSchema,
  channel: z.enum(["instagram", "threads", "linkedin"]),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  connectionId: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  providerId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  reason: z.enum(SOCIAL_PUBLISH_HOLD_REASONS),
  /** The limit as read; null when it was not read or could not be. */
  quota: PublishingQuotaSchema.nullable(),
  /** Sanitised: no token, no account id, no raw provider body. */
  detail: z.string().trim().min(1).max(300),
  checkedAt: DateTimeSchema,
  publishingAuthorized: z.literal(false)
}).superRefine((hold, context) => {
  if (hold.reason === "publishing-quota-exhausted" && (hold.quota === null || hold.quota.usage < hold.quota.total)) {
    context.addIssue({ code: "custom", message: "An exhausted quota records a usage at or above its total", path: ["quota"] });
  }
  if (hold.reason !== "publishing-quota-exhausted" && hold.quota !== null) {
    context.addIssue({ code: "custom", message: "Only an exhausted quota carries the figures it was held on", path: ["quota"] });
  }
});
export type SocialPublishHold = z.infer<typeof SocialPublishHoldSchema>;
