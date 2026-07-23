import { z } from "zod";
import { createHash } from "node:crypto";

export const QueueContentSchema = z.object({
  text: z.string().min(1).max(2_200),
  altText: z.string().min(1).max(1_000).nullable(),
  assetUrls: z.array(z.url().refine((url) => url.startsWith("https://"))).max(10)
});

export const QueueApprovalSchema = z.object({
  pulseSelected: z.literal(true),
  quill: z.literal("pass"),
  keeper: z.literal("pass"),
  deterministic: z.literal("pass"),
  approvedAt: z.string().datetime()
});

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
  lastError: z.string().nullable(),
  content: QueueContentSchema.optional(),
  approval: QueueApprovalSchema.optional()
});
export type QueueItem = z.infer<typeof QueueItemSchema>;

export function queuePayloadHash(
  item: Pick<QueueItem, "id" | "channel" | "scheduledAt" | "content">
): string {
  if (!item.content) {
    throw new Error(`Queue item ${item.id} has no publishable content`);
  }
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: item.id,
        channel: item.channel,
        scheduledAt: item.scheduledAt,
        content: item.content
      })
    )
    .digest("hex");
}

export function assertQueueItemPublishable(item: QueueItem): void {
  const parsed = QueueItemSchema.parse(item);
  if (!parsed.content || !parsed.approval) {
    throw new Error(`Queue item ${parsed.id} is missing content or approval`);
  }
  if (queuePayloadHash(parsed) !== parsed.payloadHash) {
    throw new Error(`Queue item ${parsed.id} payload hash mismatch`);
  }
  if (parsed.channel === "threads" && parsed.content.assetUrls.length > 0) {
    throw new Error("The guarded Threads connector currently supports text only");
  }
  if (parsed.channel === "instagram" && parsed.content.assetUrls.length !== 1) {
    throw new Error("The guarded Instagram connector requires one HTTPS image");
  }
  if (parsed.channel === "instagram" && !parsed.content.altText) {
    throw new Error("Instagram media requires alt text in the immutable receipt");
  }
}

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
