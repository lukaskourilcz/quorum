import { createHash } from "node:crypto";
import { z } from "zod";
import { EvidenceRefSchema, Sha256Schema, VentureIdSchema } from "../contracts/common.js";
import { SocialCapabilityRefSchema } from "../contracts/social-distribution.js";

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

const QueueTargetSchema = z.strictObject({
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  profileRole: z.enum(["venture-primary", "company-umbrella", "owned-amplifier"]),
  role: z.enum(["primary", "umbrella", "amplifier"]),
  connectionBindingRef: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  capabilityRef: SocialCapabilityRefSchema.nullable(),
  amplifierEligibilityRef: EvidenceRefSchema.nullable(),
  campaignApprovalRef: EvidenceRefSchema.nullable()
}).superRefine((target, context) => {
  const expectedProfileRole = {
    primary: "venture-primary",
    umbrella: "company-umbrella",
    amplifier: "owned-amplifier"
  } as const;
  if (target.profileRole !== expectedProfileRole[target.role]) {
    context.addIssue({ code: "custom", message: "Target role and profile role do not match", path: ["profileRole"] });
  }
  if (target.role === "primary" && (target.amplifierEligibilityRef !== null || target.campaignApprovalRef !== null)) {
    context.addIssue({ code: "custom", message: "A primary target cannot carry amplifier approval", path: ["role"] });
  }
  if (target.role === "umbrella" && (target.capabilityRef === null || target.amplifierEligibilityRef !== null || target.campaignApprovalRef !== null)) {
    context.addIssue({ code: "custom", message: "An umbrella target needs only its exact capability reference", path: ["role"] });
  }
  if (target.role === "amplifier" && (target.capabilityRef === null || target.amplifierEligibilityRef === null || target.campaignApprovalRef === null)) {
    context.addIssue({ code: "custom", message: "An amplifier target needs exact capability, #415 eligibility and campaign approval", path: ["role"] });
  }
});

export const CapabilityAwareQueueItemSchema = z.strictObject({
  schemaVersion: z.literal(2),
  id: z.string().trim().min(1).max(160),
  sourceVentureId: VentureIdSchema,
  releaseId: z.string().trim().min(1).max(200),
  campaignId: z.string().trim().min(1).max(200),
  experimentId: z.string().trim().min(1).max(200).nullable(),
  target: QueueTargetSchema,
  action: z.literal("publish-original"),
  sourcePackage: z.strictObject({
    schemaVersion: z.literal("approved-publish-package/1"),
    artifactRef: EvidenceRefSchema,
    packageHash: Sha256Schema
  }).nullable(),
  locale: z.enum(["en", "cs"]).nullable(),
  variant: z.enum(["A", "B"]),
  channel: z.enum(["threads", "instagram"]),
  objective: z.enum(["qualified_visit", "value_action", "opt_in", "monetization_intent", "trust"]),
  audience: z.string().trim().min(1).max(500),
  destination: z.url(),
  utm: z.strictObject({
    source: z.enum(["threads", "instagram"]),
    medium: z.literal("organic_social"),
    campaign: z.string().trim().min(1).max(200),
    content: z.string().trim().min(1).max(200)
  }),
  content: QueueContentSchema,
  publishWindow: z.strictObject({
    notBefore: z.string().datetime(),
    notAfter: z.string().datetime()
  }),
  status: z.enum(["draft", "approved", "queued", "publishing", "published", "failed", "expired", "needs_reconciliation", "cancelled"]),
  checks: z.strictObject({
    schema: CheckStatusSchema,
    brand: CheckStatusSchema,
    claims: CheckStatusSchema,
    quill: CheckStatusSchema,
    keeper: CheckStatusSchema,
    duplicate: CheckStatusSchema,
    accessibility: CheckStatusSchema,
    budget: CheckStatusSchema,
    capability: CheckStatusSchema,
    authority: CheckStatusSchema,
    policy: CheckStatusSchema
  }),
  approvalProvenance: z.strictObject({
    approvalRef: EvidenceRefSchema,
    selectionRef: EvidenceRefSchema,
    policyRef: EvidenceRefSchema.nullable()
  }),
  selectedBy: z.enum(["PULSE", "MAKO", "CAMPAIGN_RESOLVER"]),
  createdAt: z.string().datetime(),
  attempt: QueueAttemptSchema.nullable(),
  receiptId: z.string().nullable(),
  migration: z.strictObject({
    sourceSchemaVersion: z.literal(1),
    sourceContentHash: Sha256Schema,
    mappingRef: EvidenceRefSchema
  }).nullable()
}).superRefine((item, context) => {
  if (new Date(item.publishWindow.notAfter).getTime() <= new Date(item.publishWindow.notBefore).getTime()) {
    context.addIssue({ code: "custom", message: "publishWindow.notAfter must be after notBefore", path: ["publishWindow", "notAfter"] });
  }
  if (item.utm.source !== item.channel) {
    context.addIssue({ code: "custom", message: "UTM source must match the channel", path: ["utm", "source"] });
  }
  if (item.migration === null && item.sourcePackage === null) {
    context.addIssue({ code: "custom", message: "A new queue item needs an exact approved source package", path: ["sourcePackage"] });
  }
  if (item.sourceVentureId === "door-money" && item.sourcePackage === null) {
    context.addIssue({ code: "custom", message: "Door Money accepts only its bounded approved package", path: ["sourcePackage"] });
  }
});

export type CapabilityAwareQueueItem = z.infer<typeof CapabilityAwareQueueItemSchema>;
export type RuntimeQueueItem = QueueItem | CapabilityAwareQueueItem;

export function parseRuntimeQueueItem(value: unknown): RuntimeQueueItem {
  const version = typeof value === "object" && value !== null && "schemaVersion" in value
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : null;
  return version === 2 ? CapabilityAwareQueueItemSchema.parse(value) : QueueItemSchema.parse(value);
}

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

export function capabilityAwareQueuePayloadHash(
  item: Omit<CapabilityAwareQueueItem, "content"> & { content: Omit<CapabilityAwareQueueItem["content"], "contentHash"> | CapabilityAwareQueueItem["content"] }
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      schemaVersion: item.schemaVersion,
      id: item.id,
      sourceVentureId: item.sourceVentureId,
      releaseId: item.releaseId,
      campaignId: item.campaignId,
      experimentId: item.experimentId,
      target: item.target,
      action: item.action,
      sourcePackage: item.sourcePackage,
      locale: item.locale,
      variant: item.variant,
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
      approvalProvenance: item.approvalProvenance,
      selectedBy: item.selectedBy,
      migration: item.migration
    }))
    .digest("hex");
}

export function assertQueueItemPublishable(item: RuntimeQueueItem): void {
  const parsed = parseRuntimeQueueItem(item);
  if (!["queued", "publishing"].includes(parsed.status)) {
    throw new Error(`Queue item ${parsed.id} is not queued for publishing`);
  }
  if (Object.values(parsed.checks).some((status) => status !== "pass")) {
    throw new Error(`Queue item ${parsed.id} has incomplete approval checks`);
  }
  const payloadHash = parsed.schemaVersion === 2
    ? capabilityAwareQueuePayloadHash(parsed)
    : queuePayloadHash(parsed);
  if (payloadHash !== parsed.content.contentHash) {
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
  const sourceVenture = parsed.schemaVersion === 2 ? parsed.sourceVentureId : parsed.venture;
  if (sourceVenture === "titty-tuesdays") {
    const pragueWeekday = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Prague",
      weekday: "long"
    }).format(new Date(parsed.publishWindow.notBefore));
    if (pragueWeekday !== "Tuesday") {
      throw new Error("Titty Tuesdays posts must open on Tuesday in Europe/Prague");
    }
  }
}

export function claimQueueItem<T extends RuntimeQueueItem>(
  item: T,
  idempotencyKey: string,
  now: Date
): T {
  const parsed = parseRuntimeQueueItem(item) as T;
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

export function reconcileQueueItem<T extends RuntimeQueueItem>(
  item: T,
  result:
    | { outcome: "published"; remoteId: string }
    | { outcome: "failed"; error: string }
    | { outcome: "ambiguous"; error: string }
): T {
  const parsed = parseRuntimeQueueItem(item) as T;
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
