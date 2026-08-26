import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, Sha256Schema, VentureIdSchema } from "./common.js";

export const OperationHealthStateSchema = z.enum([
  "healthy",
  "quiet",
  "held",
  "degraded",
  "stale",
  "failing",
  "paused",
  "setup-needed",
  "unavailable"
]);

export const OperationOutcomeSchema = z.enum([
  "success",
  "quiet",
  "no-work",
  "held",
  "partial",
  "failed",
  "replayed",
  "cancelled"
]);

const NullableDateTimeSchema = DateTimeSchema.nullable();
const BoundedRefListSchema = z.array(EvidenceRefSchema).max(32);

export const VentureRunReceiptSchema = z.strictObject({
  schemaVersion: z.literal("venture-run-receipt/1"),
  receiptId: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(160),
  nodeId: VentureIdSchema,
  phase: z.string().trim().min(1).max(100),
  jobId: z.string().trim().min(1).max(160),
  trigger: z.enum(["schedule", "manual"]),
  idempotencyKey: z.string().trim().min(1).max(200),
  startedAt: DateTimeSchema,
  endedAt: DateTimeSchema,
  durationMs: z.number().int().nonnegative(),
  mode: z.enum(["dry", "live", "fixture", "recovery", "validation"]),
  outcome: OperationOutcomeSchema,
  domainReceiptRefs: BoundedRefListSchema,
  inputHash: Sha256Schema,
  outputHash: Sha256Schema.nullable(),
  providerCallRefs: BoundedRefListSchema,
  costRefs: BoundedRefListSchema,
  cacheReuse: z.strictObject({
    cacheHits: z.number().int().nonnegative(),
    cacheMisses: z.number().int().nonnegative(),
    artifactsReused: z.number().int().nonnegative(),
    duplicateRunsPrevented: z.number().int().nonnegative()
  }),
  changes: z.strictObject({
    changed: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    malformed: z.number().int().nonnegative()
  }),
  errors: z.array(z.string().trim().min(1).max(500)).max(12),
  ownerAttentionRefs: BoundedRefListSchema,
  recoveryEligibility: z.enum(["eligible", "owner-only", "not-eligible", "unknown"]),
  nextSafeAction: z.string().trim().min(1).max(400).nullable(),
  recordedAt: DateTimeSchema,
  supersedesReceiptRef: EvidenceRefSchema.nullable()
}).superRefine((receipt, context) => {
  if (Date.parse(receipt.endedAt) < Date.parse(receipt.startedAt)) {
    context.addIssue({ code: "custom", path: ["endedAt"], message: "A run cannot end before it starts" });
  }
  if ((receipt.mode === "dry" || receipt.mode === "fixture") && receipt.recoveryEligibility === "eligible") {
    context.addIssue({ code: "custom", path: ["recoveryEligibility"], message: "Dry and fixture evidence cannot authorize live recovery" });
  }
});

export const VentureSloSchema = z.strictObject({
  schemaVersion: z.literal("venture-slo/1"),
  nodeId: VentureIdSchema,
  policyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  lifecycleStage: z.enum(["operating", "exploration", "planned", "paused", "setup-needed"]),
  cadence: z.strictObject({
    kind: z.enum(["continuous", "daily", "weekly", "manual", "held"]),
    timezone: z.literal("Europe/Prague"),
    windows: z.array(z.string().trim().min(1).max(80)).max(14)
  }),
  maximumLatenessMinutes: z.number().int().nonnegative().nullable(),
  maximumStalenessMinutes: z.number().int().positive().nullable(),
  satisfyingOutcomes: z.array(OperationOutcomeSchema).min(1),
  rollingWindowRuns: z.number().int().positive().max(100),
  rollingValidRunTarget: z.number().min(0).max(1),
  consecutiveFailureThreshold: z.number().int().positive().max(20),
  ownerInterventionTargetPerWindow: z.number().int().nonnegative().max(100),
  recoveryTargetMinutes: z.number().int().positive().nullable(),
  requiredEvidenceRefs: BoundedRefListSchema,
  dependencyNodeIds: z.array(VentureIdSchema).max(12),
  costGuardrails: z.strictObject({
    maximumRunUsd: z.number().nonnegative().nullable(),
    duplicateProviderCallsAllowed: z.literal(false)
  }),
  exclusions: z.array(z.enum(["fixture", "dry", "disabled", "owner-held"])).min(1),
  escalationPolicyRef: EvidenceRefSchema,
  reviewDate: DateSchema
}).superRefine((slo, context) => {
  if (new Set(slo.satisfyingOutcomes).size !== slo.satisfyingOutcomes.length) {
    context.addIssue({ code: "custom", path: ["satisfyingOutcomes"], message: "Satisfying outcomes must be unique" });
  }
  if (slo.lifecycleStage === "operating" && slo.cadence.kind === "held") {
    context.addIssue({ code: "custom", path: ["cadence", "kind"], message: "An operating node needs a real or manual cadence" });
  }
});

export const VentureSloRegistrySchema = z.strictObject({
  schemaVersion: z.literal("venture-slo-registry/1"),
  registryVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  policies: z.array(VentureSloSchema).min(1)
}).superRefine((registry, context) => {
  const ids = registry.policies.map((policy) => policy.nodeId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["policies"], message: "Each operational node needs exactly one SLO" });
  }
});

export const VentureOperationHealthSchema = z.strictObject({
  schemaVersion: z.literal("venture-operation-health/1"),
  nodeId: VentureIdSchema,
  displayName: z.string().trim().min(1).max(120),
  policyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  generatedAt: DateTimeSchema,
  observedAt: DateTimeSchema,
  lifecycleStage: z.enum(["operating", "exploration", "planned", "paused", "setup-needed"]),
  state: OperationHealthStateSchema,
  reason: z.string().trim().min(1).max(500),
  lastAttemptedAt: NullableDateTimeSchema,
  lastValidAt: NullableDateTimeSchema,
  lastSuccessfulAt: NullableDateTimeSchema,
  lastNonEmptyAt: NullableDateTimeSchema,
  lastExternallyVerifiedAt: NullableDateTimeSchema,
  nextExpectedAt: NullableDateTimeSchema,
  dueWindow: z.string().trim().min(1).max(120).nullable(),
  latenessMinutes: z.number().int().nonnegative().nullable(),
  rollingOutcomes: z.strictObject({
    considered: z.number().int().nonnegative(),
    satisfying: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    quiet: z.number().int().nonnegative(),
    held: z.number().int().nonnegative(),
    consecutiveFailures: z.number().int().nonnegative()
  }),
  dependencyHealthRefs: BoundedRefListSchema,
  queue: z.strictObject({
    state: z.enum(["clear", "pending", "backlogged", "reconciling", "unavailable", "not-applicable"]),
    pending: z.number().int().nonnegative().nullable()
  }),
  autonomyEligible: z.boolean(),
  holds: z.strictObject({
    budget: z.array(z.string().trim().min(1).max(240)).max(8),
    provider: z.array(z.string().trim().min(1).max(240)).max(8),
    source: z.array(z.string().trim().min(1).max(240)).max(8),
    credential: z.array(z.string().trim().min(1).max(240)).max(8),
    owner: z.array(z.string().trim().min(1).max(240)).max(8)
  }),
  freshness: z.strictObject({
    state: z.enum(["fresh", "stale", "unavailable"]),
    ageMinutes: z.number().int().nonnegative().nullable(),
    lastKnownGoodRef: EvidenceRefSchema.nullable()
  }),
  unavailableReasons: z.array(z.string().trim().min(1).max(300)).max(12),
  ownerAttentionRefs: BoundedRefListSchema,
  latestRunReceiptRefs: BoundedRefListSchema,
  snapshotHash: Sha256Schema
});

export const OperationsSnapshotNodeSchema = z.strictObject({
  nodeId: VentureIdSchema,
  displayName: z.string().trim().min(1).max(120),
  lifecycleStage: VentureOperationHealthSchema.shape.lifecycleStage,
  health: OperationHealthStateSchema,
  reason: z.string().trim().min(1).max(500),
  lastValidAt: NullableDateTimeSchema,
  nextExpectedAt: NullableDateTimeSchema,
  sloSatisfied: z.boolean().nullable(),
  failureCount: z.number().int().nonnegative(),
  recoveryRefs: BoundedRefListSchema,
  ownerAttentionRefs: BoundedRefListSchema,
  costUsd: z.number().nonnegative().nullable(),
  artifactsReused: z.number().int().nonnegative(),
  staleRecords: z.number().int().nonnegative(),
  malformedRecords: z.number().int().nonnegative(),
  evidenceRefs: BoundedRefListSchema
});

export const OperationsSnapshotSchema = z.strictObject({
  schemaVersion: z.literal("operations-snapshot/1"),
  generatedAt: DateTimeSchema,
  nodes: z.array(OperationsSnapshotNodeSchema).min(1),
  malformedAdapterCount: z.number().int().nonnegative(),
  unavailableAdapterCount: z.number().int().nonnegative(),
  snapshotHash: Sha256Schema
});

export type VentureRunReceipt = z.infer<typeof VentureRunReceiptSchema>;
export type VentureSlo = z.infer<typeof VentureSloSchema>;
export type VentureSloRegistry = z.infer<typeof VentureSloRegistrySchema>;
export type VentureOperationHealth = z.infer<typeof VentureOperationHealthSchema>;
export type OperationsSnapshot = z.infer<typeof OperationsSnapshotSchema>;
