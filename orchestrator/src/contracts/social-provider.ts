import { createHash } from "node:crypto";
import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  HttpsUrlSchema,
  Sha256Schema
} from "./common.js";

const ProviderIdSchema = z.enum(["direct-meta", "buffer", "metricool", "n8n", "make", "ayrshare"]);
const ProviderCapabilitySchema = z.enum([
  "publish-original",
  "status-read",
  "reconcile-delivery",
  "own-insights",
  "webhook-normalize",
  "notify-incident"
]);
const SocialPlatformSchema = z.enum(["instagram", "threads"]);
const EnvironmentReferenceSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,100}$/u);

export const SocialProviderSchema = z.strictObject({
  schemaVersion: z.literal("social-provider/1"),
  id: ProviderIdSchema,
  name: z.string().trim().min(1).max(100),
  role: z.enum(["direct-official", "managed-scheduler", "notification-webhook"]),
  supportedPlatforms: z.array(SocialPlatformSchema).max(2),
  capabilities: z.array(ProviderCapabilitySchema).max(8),
  implementationVersion: z.string().trim().min(1).max(80),
  apiVersion: z.string().trim().min(1).max(80).nullable(),
  credentialRequirements: z.array(z.strictObject({
    environmentRef: EnvironmentReferenceSchema,
    requiredFor: z.string().trim().min(1).max(160)
  })).max(12),
  limits: z.strictObject({
    accountOrBrandLimit: z.string().trim().min(1).max(240),
    requestOrPostLimit: z.string().trim().min(1).max(240),
    evidenceRef: EvidenceRefSchema
  }),
  idempotency: z.strictObject({
    providerKeySupported: z.boolean(),
    remoteLookup: z.enum(["provider-key", "remote-id-only", "status-only", "none"]),
    ambiguousResultPolicy: z.literal("hold-and-reconcile-before-resend")
  }),
  evidenceCapabilities: z.strictObject({
    deliveryStatus: z.boolean(),
    webhooks: z.boolean(),
    metrics: z.boolean()
  }),
  sourceOfTruthRisk: z.strictObject({
    retention: z.string().trim().min(1).max(300),
    canonicalTruth: z.literal("boardlessai-queue-campaign-receipts")
  }),
  cost: z.strictObject({
    plan: z.string().trim().min(1).max(120),
    monthlyCostPosture: z.string().trim().min(1).max(160),
    purchaseAuthorized: z.literal(false),
    exitPath: z.string().trim().min(1).max(300)
  }),
  lastVerifiedDate: DateSchema,
  verdict: z.enum(["enabled", "held", "disabled", "rejected"]),
  healthPolicy: z.strictObject({
    reverifyBy: DateSchema,
    staleAfterDays: z.number().int().min(1).max(365),
    failurePolicy: z.literal("pause-binding-no-automatic-failover")
  }),
  decisionRef: EvidenceRefSchema,
  strategyAuthority: z.literal(false),
  contentGenerationAuthority: z.literal(false)
}).superRefine((provider, context) => {
  if (provider.role === "notification-webhook" && provider.capabilities.includes("publish-original")) {
    context.addIssue({ code: "custom", message: "Notification providers cannot publish", path: ["capabilities"] });
  }
  if (provider.id === "direct-meta" && (provider.role !== "direct-official" || provider.verdict !== "enabled")) {
    context.addIssue({ code: "custom", message: "Direct Meta is the enabled official core implementation", path: ["verdict"] });
  }
});

const BindingMigrationSchema = z.strictObject({
  state: z.enum(["none", "preparing", "reconciling", "ready", "completed", "rollback-required"]),
  inFlightItemRefs: z.array(EvidenceRefSchema).max(100),
  reconciliationRefs: z.array(EvidenceRefSchema).max(100),
  rollbackRef: EvidenceRefSchema.nullable()
});

export const ProviderConnectionBindingSchema = z.strictObject({
  schemaVersion: z.literal("provider-connection-binding/1"),
  id: z.string().regex(/^social-provider-binding-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(180),
  connectionId: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160),
  providerId: ProviderIdSchema,
  providerImplementationVersion: z.string().trim().min(1).max(80),
  providerApiVersion: z.string().trim().min(1).max(80).nullable(),
  mode: z.enum(["draft", "held", "active", "migrating", "paused", "retired"]),
  capabilities: z.array(ProviderCapabilitySchema).max(8),
  credentialRefs: z.array(EnvironmentReferenceSchema).max(12),
  ownerActivationRef: EvidenceRefSchema.nullable(),
  authorityRef: EvidenceRefSchema.nullable(),
  planLimitEvidenceRef: EvidenceRefSchema,
  createdAt: DateTimeSchema,
  effectiveAt: DateTimeSchema.nullable(),
  endedAt: DateTimeSchema.nullable(),
  previousBindingRef: EvidenceRefSchema.nullable(),
  supersedingBindingRef: EvidenceRefSchema.nullable(),
  migration: BindingMigrationSchema,
  health: z.strictObject({
    state: z.enum(["healthy", "held", "degraded", "stale", "failing", "paused", "setup-needed", "unavailable"]),
    unavailableReason: z.enum([
      "owner-activation-required",
      "credential-missing",
      "scope-missing",
      "token-expired",
      "app-review-expired",
      "rate-limited",
      "plan-limit",
      "provider-outage",
      "migration-reconciliation-required",
      "reverification-required",
      "none"
    ]),
    lastVerifiedAt: DateTimeSchema.nullable()
  }),
  bindingHash: Sha256Schema,
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((binding, context) => {
  if (binding.bindingHash !== providerBindingHash(binding)) {
    context.addIssue({ code: "custom", message: "Provider binding hash does not match its immutable fields", path: ["bindingHash"] });
  }
  if (binding.mode === "active" && (!binding.ownerActivationRef || !binding.authorityRef || !binding.effectiveAt)) {
    context.addIssue({ code: "custom", message: "An active binding needs explicit owner activation and authority evidence", path: ["mode"] });
  }
  if (binding.mode !== "active" && binding.publishingAuthorized) {
    context.addIssue({ code: "custom", message: "A non-active binding cannot authorize publishing", path: ["publishingAuthorized"] });
  }
  if (binding.migration.inFlightItemRefs.length > 0 && !["reconciling", "rollback-required"].includes(binding.migration.state)) {
    context.addIssue({ code: "custom", message: "In-flight work must remain in reconciliation", path: ["migration", "state"] });
  }
});

export const ProviderDeliveryReceiptSchema = z.strictObject({
  schemaVersion: z.literal("provider-delivery-receipt/1"),
  id: z.string().regex(/^provider-delivery-receipt-[a-f0-9]{16}$/u),
  providerId: ProviderIdSchema,
  bindingId: z.string().regex(/^social-provider-binding-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  connectionId: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  itemRef: EvidenceRefSchema,
  canonicalReceiptRef: EvidenceRefSchema,
  idempotencyHash: Sha256Schema,
  contentHash: Sha256Schema,
  windowHash: Sha256Schema,
  state: z.enum(["attempted", "accepted", "published", "failed", "ambiguous", "reconciled"]),
  remoteId: z.string().trim().min(1).max(240).nullable(),
  publicUrl: HttpsUrlSchema.nullable(),
  requestedAt: DateTimeSchema,
  respondedAt: DateTimeSchema.nullable(),
  acceptedAt: DateTimeSchema.nullable(),
  publishedAt: DateTimeSchema.nullable(),
  status: z.string().trim().min(1).max(500),
  error: z.string().trim().min(1).max(500).nullable(),
  providerImplementationVersion: z.string().trim().min(1).max(80),
  providerApiVersion: z.string().trim().min(1).max(80).nullable(),
  actualCostUsd: z.number().min(0).max(100).nullable(),
  usageRef: EvidenceRefSchema.nullable(),
  retryOfReceiptRef: EvidenceRefSchema.nullable(),
  reconciliationRef: EvidenceRefSchema.nullable(),
  correctedReceiptRef: EvidenceRefSchema.nullable(),
  supersedingReceiptRef: EvidenceRefSchema.nullable(),
  rawPayloadExcluded: z.literal(true),
  authorityGranted: z.literal(false)
}).superRefine((receipt, context) => {
  if (["published", "reconciled"].includes(receipt.state) && (!receipt.remoteId || !receipt.publicUrl || !receipt.publishedAt)) {
    context.addIssue({ code: "custom", message: "A published provider receipt needs verified remote evidence", path: ["state"] });
  }
  if (receipt.state === "ambiguous" && receipt.reconciliationRef !== null) {
    context.addIssue({ code: "custom", message: "An ambiguous receipt cannot claim completed reconciliation", path: ["reconciliationRef"] });
  }
});

const ProviderLimitHealthSchema = z.enum(["not-applicable", "unknown", "healthy", "expiring", "expired", "limited", "unavailable"]);

export const ProviderHealthSchema = z.strictObject({
  schemaVersion: z.literal("provider-health/1"),
  id: z.string().regex(/^provider-health-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(180),
  providerId: ProviderIdSchema,
  bindingId: z.string().regex(/^social-provider-binding-[a-z0-9]+(?:-[a-z0-9]+)*$/u).nullable(),
  connectionId: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).nullable(),
  state: z.enum(["healthy", "held", "degraded", "stale", "failing", "paused", "setup-needed", "unavailable"]),
  lastSuccessfulOperationAt: DateTimeSchema.nullable(),
  lastAttemptedOperationAt: DateTimeSchema.nullable(),
  lastReconciledOperationAt: DateTimeSchema.nullable(),
  tokenStatus: ProviderLimitHealthSchema,
  appReviewStatus: ProviderLimitHealthSchema,
  planLimitStatus: ProviderLimitHealthSchema,
  rateLimitStatus: ProviderLimitHealthSchema,
  webhookFreshness: ProviderLimitHealthSchema,
  incidentRefs: z.array(EvidenceRefSchema).max(100),
  ownerAttentionRefs: z.array(EvidenceRefSchema).max(100),
  nextSafeAction: z.string().trim().min(1).max(300),
  reverifyBy: DateSchema,
  generatedAt: DateTimeSchema,
  snapshotHash: Sha256Schema,
  authorityGranted: z.literal(false)
}).superRefine((health, context) => {
  if (health.snapshotHash !== providerHealthHash(health)) {
    context.addIssue({ code: "custom", message: "Provider health hash does not match its snapshot", path: ["snapshotHash"] });
  }
});

export type SocialProvider = z.infer<typeof SocialProviderSchema>;
export type ProviderConnectionBinding = z.infer<typeof ProviderConnectionBindingSchema>;
export type ProviderDeliveryReceipt = z.infer<typeof ProviderDeliveryReceiptSchema>;
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;
export type ProviderCapability = z.infer<typeof ProviderCapabilitySchema>;

export function providerBindingHash(binding: Omit<ProviderConnectionBinding, "bindingHash"> | ProviderConnectionBinding): string {
  const { bindingHash: _bindingHash, ...immutable } = binding as ProviderConnectionBinding;
  return createHash("sha256").update(JSON.stringify(immutable)).digest("hex");
}

export function providerHealthHash(health: Omit<ProviderHealth, "snapshotHash"> | ProviderHealth): string {
  const { snapshotHash: _snapshotHash, ...snapshot } = health as ProviderHealth;
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
