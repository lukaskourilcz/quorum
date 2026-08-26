import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, Sha256Schema, VentureIdSchema } from "./common.js";
import { OperationHealthStateSchema } from "./venture-operations.js";

const RefListSchema = z.array(EvidenceRefSchema).max(32);

export const RecoveryActionSchema = z.enum([
  "replay-idempotent-job",
  "reconcile-ambiguous",
  "reuse-last-valid",
  "deterministic-fallback",
  "reduce-optional-work",
  "rebuild-derived-view",
  "isolate-malformed-item",
  "release-stale-lock",
  "postpone-next-window",
  "pause-scope",
  "resume-transient"
]);

export const VentureRecoveryPolicySchema = z.strictObject({
  schemaVersion: z.literal("venture-recovery-policy/1"),
  nodeId: VentureIdSchema,
  phase: z.string().trim().min(1).max(100),
  policyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  reviewDate: DateSchema,
  triggerStates: z.array(OperationHealthStateSchema).min(1),
  permittedActions: z.array(RecoveryActionSchema),
  maximumAttempts: z.number().int().nonnegative().max(20),
  cooldownMinutes: z.number().int().nonnegative().max(43_200),
  reconciliationRequired: z.boolean(),
  requiredEvidenceRefs: RefListSchema,
  dependencyHealthRefs: RefListSchema,
  maximumIncrementalCostUsd: z.number().nonnegative(),
  ownerAttentionThreshold: z.number().int().positive().max(20),
  pauseScope: z.enum(["item", "connection", "phase", "venture"]),
  automaticResume: z.strictObject({
    allowed: z.boolean(),
    requiresTransientConditionCleared: z.literal(true),
    requiresCurrentAuthority: z.literal(true)
  }),
  killSwitchKeys: z.array(z.string().regex(/^[A-Z0-9_]+$/).max(120)).min(1).max(8),
  prohibitedActions: z.array(z.enum([
    "account",
    "oauth-or-secret",
    "scope-expansion",
    "budget-increase",
    "content-approval",
    "capability-change",
    "outreach",
    "contest-entry",
    "monetization",
    "deployment"
  ])).min(10),
  escalationPolicyRef: EvidenceRefSchema
}).superRefine((policy, context) => {
  if (policy.maximumIncrementalCostUsd !== 0) {
    context.addIssue({ code: "custom", path: ["maximumIncrementalCostUsd"], message: "Shared recovery policies are $0 unless a separate owner decision exists" });
  }
  if (policy.permittedActions.includes("resume-transient") && !policy.automaticResume.allowed) {
    context.addIssue({ code: "custom", path: ["automaticResume"], message: "Transient resume must be explicitly enabled" });
  }
});

export const VentureRecoveryPolicyRegistrySchema = z.strictObject({
  schemaVersion: z.literal("venture-recovery-policy-registry/1"),
  registryVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: DateSchema,
  policies: z.array(VentureRecoveryPolicySchema).min(1)
}).superRefine((registry, context) => {
  const keys = registry.policies.map((policy) => `${policy.nodeId}:${policy.phase}`);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: "custom", path: ["policies"], message: "Recovery policy scope must be unique" });
  }
});

export const VentureRecoveryAttemptSchema = z.strictObject({
  schemaVersion: z.literal("venture-recovery-attempt/1"),
  attemptId: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(180),
  idempotencyKey: z.string().trim().min(1).max(200),
  nodeId: VentureIdSchema,
  phase: z.string().trim().min(1).max(100),
  jobId: z.string().trim().min(1).max(160),
  itemRef: EvidenceRefSchema.nullable(),
  conditionKey: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(200),
  triggerHealthRef: EvidenceRefSchema,
  triggerSloRef: EvidenceRefSchema,
  evidenceRefs: RefListSchema,
  policyRef: EvidenceRefSchema,
  policyVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  action: RecoveryActionSchema,
  mode: z.enum(["live", "dry", "fixture", "validation"]),
  beforeStateHash: Sha256Schema,
  expectedSafeOutcome: z.string().trim().min(1).max(400),
  startedAt: DateTimeSchema,
  endedAt: DateTimeSchema,
  durationMs: z.number().int().nonnegative(),
  costReservationUsd: z.number().nonnegative(),
  actualCostUsd: z.number().nonnegative(),
  result: z.enum(["recovered", "unchanged", "held", "failed", "ambiguous", "paused", "owner-required"]),
  afterStateRef: EvidenceRefSchema.nullable(),
  receiptRefs: RefListSchema,
  error: z.string().trim().min(1).max(500).nullable(),
  nextEligibleAt: DateTimeSchema.nullable(),
  ownerAttentionRef: EvidenceRefSchema.nullable(),
  supersedesAttemptRef: EvidenceRefSchema.nullable()
}).superRefine((attempt, context) => {
  if (Date.parse(attempt.endedAt) < Date.parse(attempt.startedAt)) {
    context.addIssue({ code: "custom", path: ["endedAt"], message: "Recovery cannot end before it starts" });
  }
  if (attempt.costReservationUsd !== 0 || attempt.actualCostUsd !== 0) {
    context.addIssue({ code: "custom", path: ["actualCostUsd"], message: "Shared automatic recovery is $0" });
  }
});

export const OperationsIncidentSnapshotSchema = z.strictObject({
  schemaVersion: z.literal("operations-incident-snapshot/1"),
  generatedAt: DateTimeSchema,
  activeIncidentRefs: RefListSchema,
  recentAttemptRefs: RefListSchema,
  pausedScopes: z.array(z.string().trim().min(1).max(240)).max(100),
  nextRetryAt: DateTimeSchema.nullable(),
  exactOwnerActions: z.array(z.string().trim().min(1).max(400)).max(100),
  affectedNodeIds: z.array(VentureIdSchema).max(100),
  unaffectedNodeIds: z.array(VentureIdSchema).max(100),
  policyVersions: z.array(z.string().regex(/^\d+\.\d+\.\d+$/)).max(20),
  killSwitchActive: z.boolean(),
  statistics: z.strictObject({
    consideredAttempts: z.number().int().nonnegative(),
    recovered: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    ambiguous: z.number().int().nonnegative(),
    ownerRequired: z.number().int().nonnegative(),
    meanRecoveryMinutes: z.number().nonnegative().nullable(),
    costUsd: z.number().nonnegative()
  }),
  snapshotHash: Sha256Schema
});

export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;
export type VentureRecoveryPolicy = z.infer<typeof VentureRecoveryPolicySchema>;
export type VentureRecoveryPolicyRegistry = z.infer<typeof VentureRecoveryPolicyRegistrySchema>;
export type VentureRecoveryAttempt = z.infer<typeof VentureRecoveryAttemptSchema>;
export type OperationsIncidentSnapshot = z.infer<typeof OperationsIncidentSnapshotSchema>;
