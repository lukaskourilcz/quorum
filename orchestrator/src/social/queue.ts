import { z } from "zod";

export const QueueItemSchema = z.object({
  id: z.string().min(1),
  channel: z.enum(["threads", "instagram"]),
  payloadHash: z.string().min(16),
  scheduledAt: z.string().datetime(),
  state: z.enum([
    "queued",
    "claimed",
    "published",
    "failed",
    "ambiguous",
    "cancelled"
  ]),
  claimId: z.string().nullable(),
  claimedAt: z.string().datetime().nullable(),
  remoteId: z.string().nullable(),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().nullable()
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export function claimQueueItem(
  item: QueueItem,
  claimId: string,
  now: Date
): QueueItem {
  const parsed = QueueItemSchema.parse(item);
  if (parsed.state !== "queued") {
    return parsed;
  }
  if (new Date(parsed.scheduledAt) > now) {
    return parsed;
  }
  return {
    ...parsed,
    state: "claimed",
    claimId,
    claimedAt: now.toISOString(),
    attemptCount: parsed.attemptCount + 1
  };
}

export function reconcileQueueItem(
  item: QueueItem,
  result:
    | { outcome: "published"; remoteId: string }
    | { outcome: "failed"; error: string }
    | { outcome: "ambiguous"; error: string }
): QueueItem {
  const parsed = QueueItemSchema.parse(item);
  if (parsed.state === "published") {
    return parsed;
  }
  if (parsed.state !== "claimed") {
    throw new Error("Only a claimed queue item can be reconciled");
  }
  if (result.outcome === "published") {
    return {
      ...parsed,
      state: "published",
      remoteId: result.remoteId,
      lastError: null
    };
  }
  return {
    ...parsed,
    state: result.outcome,
    lastError: result.error
  };
}
