import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, Sha256Schema, VentureIdSchema } from "./common.js";

const RefListSchema = z.array(EvidenceRefSchema).max(32);
const ResourceKeySchema = z.string().regex(/^[a-z0-9]+(?:[.:/_-][a-z0-9]+)*$/).max(240);

export const OperationsCapacityDecisionSchema = z.enum([
  "run",
  "reuse",
  "skipped",
  "deferred",
  "held",
  "not-due"
]);

export const OperationsCapacityPlanJobSchema = z.strictObject({
  jobId: z.string().trim().min(1).max(160),
  nodeId: VentureIdSchema,
  phase: z.string().trim().min(1).max(100),
  classification: z.enum(["mandatory", "optional", "held"]),
  dueAt: DateTimeSchema,
  expectedCostUsd: z.number().nonnegative(),
  nodeBudgetHeadroomUsd: z.number().nonnegative(),
  providerIds: z.array(ResourceKeySchema).max(12),
  writerPaths: z.array(ResourceKeySchema).max(12),
  inputHash: Sha256Schema,
  configHash: Sha256Schema,
  modelVersion: z.string().trim().min(1).max(120).nullable(),
  dependencyHealthRefs: RefListSchema,
  decision: OperationsCapacityDecisionSchema,
  reason: z.string().trim().min(1).max(500),
  acceptedArtifactRef: EvidenceRefSchema.nullable(),
  nextEligibleAt: DateTimeSchema.nullable()
});

export const OperationsCapacityPlanSchema = z.strictObject({
  schemaVersion: z.literal("operations-capacity-plan/1"),
  period: DateSchema,
  timezone: z.literal("Europe/Prague"),
  generatedAt: DateTimeSchema,
  budget: z.strictObject({
    maximumUsd: z.number().nonnegative(),
    spentUsd: z.number().nonnegative(),
    reservedUsd: z.number().nonnegative(),
    headroomUsd: z.number().nonnegative()
  }),
  deployment: z.strictObject({
    guardActive: z.boolean(),
    releaseReady: z.boolean(),
    evidenceRef: EvidenceRefSchema,
    scheduled: z.literal(false)
  }),
  jobs: z.array(OperationsCapacityPlanJobSchema),
  selectedExecutionOrder: z.array(z.string().trim().min(1).max(160)),
  activeLeaseRefs: RefListSchema,
  collisionGroups: z.array(z.strictObject({
    resourceKey: ResourceKeySchema,
    jobIds: z.array(z.string().trim().min(1).max(160)).min(2).max(20)
  })).max(100),
  providerHeadroom: z.record(ResourceKeySchema, z.number().int().nonnegative()),
  counts: z.strictObject({
    due: z.number().int().nonnegative(),
    running: z.number().int().nonnegative(),
    reused: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    held: z.number().int().nonnegative(),
    deferred: z.number().int().nonnegative()
  }),
  planHash: Sha256Schema
}).superRefine((plan, context) => {
  const ids = plan.jobs.map((job) => job.jobId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["jobs"], message: "Capacity job ids must be unique" });
  }
  const runnable = new Set(plan.jobs.filter((job) => job.decision === "run").map((job) => job.jobId));
  if (plan.selectedExecutionOrder.some((id) => !runnable.has(id))) {
    context.addIssue({ code: "custom", path: ["selectedExecutionOrder"], message: "Execution order may contain only runnable jobs" });
  }
});

export const OperationsEfficiencyObservationSchema = z.strictObject({
  schemaVersion: z.literal("operations-efficiency-observation/1"),
  observationId: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(160),
  nodeId: VentureIdSchema,
  phase: z.string().trim().min(1).max(100),
  jobId: z.string().trim().min(1).max(160),
  inputHash: Sha256Schema,
  configHash: Sha256Schema,
  modelVersion: z.string().trim().min(1).max(120).nullable(),
  cacheResult: z.enum(["hit", "miss", "not-eligible", "unavailable"]),
  artifactsReused: z.number().int().nonnegative(),
  providerCallsAvoided: z.number().int().nonnegative(),
  providerCallsMade: z.number().int().nonnegative(),
  modelCallsAvoided: z.number().int().nonnegative(),
  modelCallsMade: z.number().int().nonnegative(),
  duplicateRunPrevented: z.boolean(),
  bytesProcessed: z.number().int().nonnegative().nullable(),
  recordsProcessed: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative(),
  actualCostUsd: z.number().nonnegative(),
  validityRef: EvidenceRefSchema,
  noOptimizationReason: z.string().trim().min(1).max(400).nullable(),
  source: z.enum(["planner", "runner", "cache", "reconciliation"]),
  observedAt: DateTimeSchema
});

export const SharedResourceLeaseSchema = z.strictObject({
  schemaVersion: z.literal("shared-resource-lease/1"),
  leaseId: z.string().regex(/^[a-z0-9]+(?:[.:_-][a-z0-9]+)*$/).max(180),
  resourceType: z.enum(["writer-path", "provider-capacity", "apify-quota", "renderer", "schedule-slot", "deployment-gate"]),
  resourceKey: ResourceKeySchema,
  holderNodeId: VentureIdSchema,
  holderJobId: z.string().trim().min(1).max(160),
  idempotencyKey: z.string().trim().min(1).max(200),
  acquiredAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  state: z.enum(["active", "expired", "released"]),
  authorityGranted: z.literal(false),
  contentAccessGranted: z.literal(false),
  spendAuthorized: z.literal(false),
  supersedesLeaseRef: EvidenceRefSchema.nullable()
}).superRefine((lease, context) => {
  if (Date.parse(lease.expiresAt) <= Date.parse(lease.acquiredAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "A lease must expire after acquisition" });
  }
});

export const OperationsCapacitySnapshotSchema = z.strictObject({
  schemaVersion: z.literal("operations-capacity-snapshot/1"),
  generatedAt: DateTimeSchema,
  planRef: EvidenceRefSchema,
  due: z.number().int().nonnegative(),
  running: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
  deferred: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative(),
  actualCostUsd: z.number().nonnegative().nullable(),
  artifactsReused: z.number().int().nonnegative(),
  duplicateRunsPrevented: z.number().int().nonnegative(),
  providerCallsAvoided: z.number().int().nonnegative(),
  collisionCount: z.number().int().nonnegative(),
  activeLeaseRefs: RefListSchema,
  nextUnblockedJobId: z.string().trim().min(1).max(160).nullable(),
  freshness: z.enum(["fresh", "stale", "unavailable"]),
  snapshotHash: Sha256Schema
});

export type OperationsCapacityPlan = z.infer<typeof OperationsCapacityPlanSchema>;
export type OperationsCapacityPlanJob = z.infer<typeof OperationsCapacityPlanJobSchema>;
export type OperationsEfficiencyObservation = z.infer<typeof OperationsEfficiencyObservationSchema>;
export type SharedResourceLease = z.infer<typeof SharedResourceLeaseSchema>;
export type OperationsCapacitySnapshot = z.infer<typeof OperationsCapacitySnapshotSchema>;
