import { createHash } from "node:crypto";
import { z } from "zod";

const CheckStatusSchema = z.enum(["pending", "pass", "fail"]);

export const QueueContentSchema = z.object({
  text: z.string().min(1).max(2_200),
  altText: z.string().min(1).max(1_000).nullable(),
  assetPaths: z
    .array(z.string().regex(/^\/social\/[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/))
    .max(10),
  factualClaimRefs: z.array(z.string().min(1)),
  rendererVersion: z.literal("carousel-studio-1"),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/)
});

const QueueAttemptSchema = z.object({
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/),
  claimedAt: z.string().datetime(),
  attemptCount: z.number().int().positive(),
  lastError: z.string().nullable()
});

export const QueueItemSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    venture: z.enum(["caught-up", "mma-files", "titty-tuesdays", "marketingshark"]).default("caught-up"),
    locale: z.enum(["en", "cs"]).nullable().default(null),
    variant: z.enum(["A", "B"]).default("A"),
    campaignId: z.string().min(1),
    experimentId: z.string().nullable(),
    channel: z.enum(["threads", "instagram"]),
    objective: z.enum([
      "qualified_visit",
      "value_action",
      "opt_in",
      "monetization_intent",
      "trust"
    ]),
    audience: z.string().min(1),
    destination: z.url(),
    utm: z.object({
      source: z.enum(["threads", "instagram"]),
      medium: z.literal("organic_social"),
      campaign: z.string().min(1),
      content: z.string().min(1)
    }),
    content: QueueContentSchema,
    publishWindow: z.object({
      notBefore: z.string().datetime(),
      notAfter: z.string().datetime()
    }),
    status: z.enum([
      "draft",
      "approved",
      "queued",
      "publishing",
      "published",
      "failed",
      "expired",
      "needs_reconciliation",
      "cancelled"
    ]),
    checks: z.object({
      schema: CheckStatusSchema,
      brand: CheckStatusSchema,
      claims: CheckStatusSchema,
      quill: CheckStatusSchema,
      keeper: CheckStatusSchema,
      duplicate: CheckStatusSchema,
      accessibility: CheckStatusSchema,
      budget: CheckStatusSchema
    }),
    // PULSE selects for every venture that publishes today. MAKO directs marketingShark, whose
    // items are drafts a human completes; widening the enum records who actually chose, and
    // changes nothing about assertQueueItemPublishable below -- an item still needs status
    // queued, every check passing and a matching payload hash before the publisher will touch it.
    selectedBy: z.enum(["PULSE", "MAKO"]),
    createdAt: z.string().datetime(),
    attempt: QueueAttemptSchema.nullable(),
    receiptId: z.string().nullable()
  })
  .superRefine((item, context) => {
    if (
      new Date(item.publishWindow.notAfter).getTime() <=
      new Date(item.publishWindow.notBefore).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "publishWindow.notAfter must be after notBefore",
        path: ["publishWindow", "notAfter"]
      });
    }
    if (item.utm.source !== item.channel) {
      context.addIssue({
        code: "custom",
        message: "UTM source must match the channel",
        path: ["utm", "source"]
      });
    }
  });

export type QueueItem = z.infer<typeof QueueItemSchema>;

export function queuePayloadHash(
  item: Pick<
    QueueItem,
    | "id"
    | "venture"
    | "locale"
    | "variant"
    | "campaignId"
    | "experimentId"
    | "channel"
    | "objective"
    | "audience"
    | "destination"
    | "utm"
    | "content"
    | "publishWindow"
    | "selectedBy"
  >
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        id: item.id,
        venture: item.venture,
        locale: item.locale,
        variant: item.variant,
        campaignId: item.campaignId,
        experimentId: item.experimentId,
        channel: item.channel,
        objective: item.objective,
        audience: item.audience,
        destination: item.destination,
        utm: item.utm,
        content: {
          text: item.content.text,
          altText: item.content.altText,
          assetPaths: item.content.assetPaths,
          factualClaimRefs: item.content.factualClaimRefs,
          rendererVersion: item.content.rendererVersion
        },
        publishWindow: item.publishWindow,
        selectedBy: item.selectedBy
      })
    )
    .digest("hex");
}

export function assertQueueItemPublishable(item: QueueItem): void {
  const parsed = QueueItemSchema.parse(item);
  if (!["queued", "publishing"].includes(parsed.status)) {
    throw new Error(`Queue item ${parsed.id} is not queued for publishing`);
  }
  if (Object.values(parsed.checks).some((status) => status !== "pass")) {
    throw new Error(`Queue item ${parsed.id} has incomplete approval checks`);
  }
  if (queuePayloadHash(parsed) !== parsed.content.contentHash) {
    throw new Error(`Queue item ${parsed.id} content hash mismatch`);
  }
  if (parsed.channel === "threads" && parsed.content.assetPaths.length > 0) {
    throw new Error("The guarded Threads connector currently supports text only");
  }
  if (parsed.channel === "instagram" && (parsed.content.assetPaths.length < 1 || parsed.content.assetPaths.length > 10)) {
    throw new Error("The guarded Instagram connector requires one to ten hosted images");
  }
  if (parsed.channel === "instagram" && !parsed.content.altText) {
    throw new Error("Instagram media requires alt text in the immutable receipt");
  }
  if (parsed.venture === "titty-tuesdays") {
    const pragueWeekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Prague",
      weekday: "long"
    }).format(new Date(parsed.publishWindow.notBefore));
    if (pragueWeekday !== "Tuesday") {
      throw new Error("Titty Tuesdays posts must open on Tuesday in Europe/Prague");
    }
  }
}

export function claimQueueItem(
  item: QueueItem,
  idempotencyKey: string,
  now: Date
): QueueItem {
  const parsed = QueueItemSchema.parse(item);
  if (parsed.status !== "queued") {
    return parsed;
  }
  if (new Date(parsed.publishWindow.notBefore) > now) {
    return parsed;
  }
  if (new Date(parsed.publishWindow.notAfter) < now) {
    return {
      ...parsed,
      status: "expired"
    };
  }
  return {
    ...parsed,
    status: "publishing",
    attempt: {
      idempotencyKey,
      claimedAt: now.toISOString(),
      attemptCount: (parsed.attempt?.attemptCount ?? 0) + 1,
      lastError: null
    }
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
  if (parsed.status === "published") {
    return parsed;
  }
  if (parsed.status !== "publishing" || !parsed.attempt) {
    throw new Error("Only a publishing queue item can be reconciled");
  }
  const receiptId = `${parsed.id}-attempt-${parsed.attempt.attemptCount}`;
  if (result.outcome === "published") {
    return {
      ...parsed,
      status: "published",
      receiptId,
      attempt: {
        ...parsed.attempt,
        lastError: null
      }
    };
  }
  return {
    ...parsed,
    status:
      result.outcome === "ambiguous" ? "needs_reconciliation" : "failed",
    receiptId,
    attempt: {
      ...parsed.attempt,
      lastError: result.error
    }
  };
}
