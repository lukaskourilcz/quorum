import { z } from "zod";
import { DateSchema, Sha256Schema } from "./common.js";

const CLOSED_STATUSES = ["published", "cancelled", "expired", "failed"] as const;

/** A closed queue item the retention step removed, with the hash that proves which bytes it was. */
const RemovedQueueItemSchema = z.strictObject({
  path: z.string().max(300).regex(/^state\/social\/queue\/[a-z0-9][a-z0-9._-]*\.json$/u),
  id: z.string().trim().min(1).max(160),
  status: z.enum(CLOSED_STATUSES),
  /** The UTC date of the item's last activity: creation, window close, claim or owner event. */
  lastActivity: DateSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative()
});

/** An owner event removed with the items it names. */
const RemovedQueueEventSchema = z.strictObject({
  path: z.string().max(300).regex(/^state\/social\/queue-events\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/u),
  itemId: z.string().trim().min(1).max(160),
  at: DateSchema,
  sha256: Sha256Schema,
  bytes: z.number().int().nonnegative()
});

/**
 * `social-queue-retention/1`: what the daily retention step removed from `state/social/queue/` and
 * `state/social/queue-events/`.
 *
 * Only a closed item (`published`, `cancelled`, `expired`, `failed`) whose last activity falls
 * before `keepFrom` goes, and only together with every item an edit or re-render links it to, so a
 * supersession chain leaves whole or not at all. Its events go with it. Receipts under
 * `state/social/posts/` and holds are never touched. This record keeps the hash of every removed
 * file, so a removal is evidence rather than a silent disappearance.
 */
export const SocialQueueRetentionSchema = z.strictObject({
  schemaVersion: z.literal("social-queue-retention/1"),
  date: DateSchema,
  retentionDays: z.number().int().positive().max(3_650),
  /** The oldest activity date kept: a closed item last active before it is removed. */
  keepFrom: DateSchema,
  removedItems: z.array(RemovedQueueItemSchema).max(20_000),
  removedEvents: z.array(RemovedQueueEventSchema).max(20_000),
  keptItems: z.number().int().nonnegative(),
  keptEvents: z.number().int().nonnegative(),
  /** Closed and old enough, kept because an item it is linked to is still open or recent. */
  heldByLink: z.number().int().nonnegative(),
  /** Files the step could not parse or does not manage (queue v1 migration evidence); never removed. */
  unmanagedCount: z.number().int().nonnegative()
}).superRefine((record, context) => {
  if (record.keepFrom >= record.date) {
    context.addIssue({ code: "custom", message: "keepFrom lies before the day the step ran", path: ["keepFrom"] });
  }
  if (record.removedItems.some((item) => item.lastActivity >= record.keepFrom)) {
    context.addIssue({ code: "custom", message: "A removed item must have been last active before keepFrom", path: ["removedItems"] });
  }
  if (record.removedEvents.some((event) => event.at >= record.keepFrom)) {
    context.addIssue({ code: "custom", message: "A removed event must be dated before keepFrom", path: ["removedEvents"] });
  }
  const removedIds = new Set(record.removedItems.map((item) => item.id));
  if (record.removedEvents.some((event) => !removedIds.has(event.itemId))) {
    context.addIssue({ code: "custom", message: "An event is removed only with the item it names", path: ["removedEvents"] });
  }
});
export type SocialQueueRetention = z.infer<typeof SocialQueueRetentionSchema>;
