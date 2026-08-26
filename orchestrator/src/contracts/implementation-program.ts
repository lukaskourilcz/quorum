import { z } from "zod";

const IdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const IsoDateSchema = z.string().date();
const IsoDateTimeSchema = z.string().datetime();
const HttpsUrlSchema = z.string().url().refine((value) => value.startsWith("https://"), "HTTPS URL required");
const RelativePathSchema = z.string().min(1).max(300).refine(
  (value) => !value.startsWith("/") && !value.split(/[\\/]/u).includes(".."),
  "repository-relative path required"
);

export const ImplementationProbeKindSchema = z.enum([
  "path-exists",
  "json-parses",
  "contract-export-exists",
  "test-path-exists",
  "release-receipt-parses",
  "owner-task"
]);

export const ImplementationProbeSchema = z.object({
  id: IdSchema,
  kind: ImplementationProbeKindSchema,
  path: RelativePathSchema,
  expectedSchemaVersion: z.string().min(1).max(100).nullable().default(null),
  ownerTaskKey: z.string().min(1).max(200).nullable().default(null),
  description: z.string().min(1).max(300)
}).strict().superRefine((probe, context) => {
  if (probe.kind === "owner-task" && !probe.ownerTaskKey) {
    context.addIssue({ code: "custom", path: ["ownerTaskKey"], message: "owner-task probes require ownerTaskKey" });
  }
  if (probe.kind !== "owner-task" && probe.ownerTaskKey) {
    context.addIssue({ code: "custom", path: ["ownerTaskKey"], message: "ownerTaskKey is only valid for owner-task probes" });
  }
});

export const ImplementationWorkItemSchema = z.object({
  schemaVersion: z.literal("implementation-work-item/1"),
  id: IdSchema,
  primaryProgramId: IdSchema,
  programRefs: z.array(IdSchema).min(1).max(4),
  phaseId: IdSchema,
  issue: z.object({
    number: z.number().int().positive(),
    url: HttpsUrlSchema,
    title: z.string().min(1).max(240),
    summary: z.string().min(1).max(500)
  }).strict(),
  dependencyIds: z.array(IdSchema).max(20),
  posture: z.enum(["mandatory", "optional", "held-optional"]),
  safeParallelGroup: IdSchema.nullable(),
  protectedFileGroups: z.array(IdSchema).max(20),
  expectedDeliverables: z.array(z.enum([
    "decision",
    "contract",
    "configuration",
    "runtime",
    "admin",
    "test",
    "documentation",
    "release"
  ])).min(1),
  probes: z.array(ImplementationProbeSchema).max(30),
  ownerOnlySetupClasses: z.array(z.enum([
    "account",
    "handle",
    "oauth",
    "credential",
    "source-approval",
    "routine-scope",
    "content-approval"
  ])).max(12),
  completionPolicy: z.object({
    requiresIssueClosed: z.boolean(),
    requiresMergedPullRequest: z.boolean(),
    requiredProbeIds: z.array(IdSchema).max(30)
  }).strict(),
  weight: z.number().positive().nullable(),
  finalGate: z.boolean(),
  sharedWorkItemRef: IdSchema.nullable(),
  supersededBy: IdSchema.nullable()
}).strict().superRefine((item, context) => {
  if (!item.programRefs.includes(item.primaryProgramId)) {
    context.addIssue({ code: "custom", path: ["programRefs"], message: "programRefs must include primaryProgramId" });
  }
  const probeIds = new Set(item.probes.map((probe) => probe.id));
  for (const probeId of item.completionPolicy.requiredProbeIds) {
    if (!probeIds.has(probeId)) {
      context.addIssue({ code: "custom", path: ["completionPolicy", "requiredProbeIds"], message: `unknown required probe ${probeId}` });
    }
  }
  if (item.sharedWorkItemRef && item.programRefs.length < 2) {
    context.addIssue({ code: "custom", path: ["programRefs"], message: "shared work items require at least two program refs" });
  }
});

export const ImplementationProgramSchema = z.object({
  schemaVersion: z.literal("implementation-program/1"),
  id: IdSchema,
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(600),
  parentIssue: z.object({
    number: z.number().int().positive(),
    url: HttpsUrlSchema
  }).strict(),
  owner: z.string().min(1).max(120),
  visibility: z.enum(["public", "owner-only", "internal"]),
  repository: z.object({
    owner: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    name: z.string().regex(/^[A-Za-z0-9_.-]+$/),
    baseBranch: z.string().regex(/^[A-Za-z0-9._/-]+$/)
  }).strict(),
  phases: z.array(z.object({
    id: IdSchema,
    name: z.string().min(1).max(120),
    workItemIds: z.array(IdSchema).min(1)
  }).strict()).min(1),
  prerequisiteIssueNumbers: z.array(z.number().int().positive()).max(30),
  safeParallelGroups: z.array(z.object({ id: IdSchema, workItemIds: z.array(IdSchema).min(1) }).strict()).max(30),
  protectedFileCollisionGroups: z.array(z.object({ id: IdSchema, paths: z.array(RelativePathSchema).min(1) }).strict()).max(30),
  acceptanceProbeIds: z.array(IdSchema).max(50),
  ownerActionProbeIds: z.array(IdSchema).max(30),
  finalReleaseItemId: IdSchema,
  archived: z.boolean(),
  supersededBy: IdSchema.nullable(),
  manifestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: IsoDateSchema
}).strict();

export const ImplementationManifestRegistrySchema = z.object({
  schemaVersion: z.literal("implementation-manifest-registry/1"),
  manifestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  effectiveDate: IsoDateSchema,
  programs: z.array(ImplementationProgramSchema).min(1),
  workItems: z.array(ImplementationWorkItemSchema).min(1)
}).strict().superRefine((registry, context) => {
  const programIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const program of registry.programs) {
    if (programIds.has(program.id)) context.addIssue({ code: "custom", path: ["programs"], message: `duplicate program ${program.id}` });
    programIds.add(program.id);
  }
  for (const item of registry.workItems) {
    if (itemIds.has(item.id)) context.addIssue({ code: "custom", path: ["workItems"], message: `duplicate work item ${item.id}` });
    itemIds.add(item.id);
  }
  for (const program of registry.programs) {
    const declared = program.phases.flatMap((phase) => phase.workItemIds);
    if (new Set(declared).size !== declared.length) {
      context.addIssue({ code: "custom", path: ["programs", program.id, "phases"], message: "a work item may appear in only one phase per program" });
    }
    if (!declared.includes(program.finalReleaseItemId)) {
      context.addIssue({ code: "custom", path: ["programs", program.id, "finalReleaseItemId"], message: "final release item must appear in a phase" });
    }
    for (const itemId of declared) {
      const item = registry.workItems.find((candidate) => candidate.id === itemId);
      if (!item || !item.programRefs.includes(program.id)) {
        context.addIssue({ code: "custom", path: ["programs", program.id, "phases"], message: `invalid program item ${itemId}` });
      }
    }
  }
  for (const item of registry.workItems) {
    for (const programId of item.programRefs) {
      if (!programIds.has(programId)) context.addIssue({ code: "custom", path: ["workItems", item.id, "programRefs"], message: `unknown program ${programId}` });
    }
    for (const dependencyId of item.dependencyIds) {
      if (!itemIds.has(dependencyId)) context.addIssue({ code: "custom", path: ["workItems", item.id, "dependencyIds"], message: `unknown dependency ${dependencyId}` });
    }
  }
});

export const ImplementationItemStateSchema = z.enum([
  "not-started",
  "ready",
  "in-progress",
  "implemented-awaiting-verification",
  "owner-action",
  "blocked",
  "complete",
  "held-optional",
  "stale",
  "inconsistent",
  "superseded"
]);

export const ImplementationProbeResultSchema = z.object({
  probeId: IdSchema,
  status: z.enum(["pass", "fail", "unavailable"]),
  evidenceRef: z.string().min(1).max(500).nullable(),
  detail: z.string().min(1).max(500)
}).strict();

export const ImplementationGitHubEvidenceSchema = z.object({
  issue: z.object({
    number: z.number().int().positive(),
    url: HttpsUrlSchema,
    state: z.enum(["open", "closed"]),
    title: z.string().min(1).max(240),
    updatedAt: IsoDateTimeSchema,
    checklist: z.object({ completed: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict()
  }).strict().nullable(),
  pullRequests: z.array(z.object({
    number: z.number().int().positive(),
    url: HttpsUrlSchema,
    state: z.enum(["open", "closed"]),
    merged: z.boolean(),
    headSha: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
    mergeCommitSha: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
    checksPassed: z.boolean().nullable(),
    updatedAt: IsoDateTimeSchema
  }).strict()).max(20),
  baseBranchContainsMerge: z.boolean().nullable(),
  fetchedAt: IsoDateTimeSchema,
  stale: z.boolean(),
  errors: z.array(z.string().min(1).max(300)).max(20)
}).strict();

export const ImplementationProgressItemSchema = z.object({
  itemId: IdSchema,
  programRefs: z.array(IdSchema).min(1).max(4),
  issueNumber: z.number().int().positive(),
  issueUrl: HttpsUrlSchema,
  title: z.string().min(1).max(240),
  summary: z.string().min(1).max(500),
  phaseId: IdSchema,
  posture: z.enum(["mandatory", "optional", "held-optional"]),
  dependencyIds: z.array(IdSchema).max(30),
  safeParallelGroup: IdSchema.nullable(),
  protectedFileGroups: z.array(IdSchema).max(20),
  expectedDeliverables: z.array(z.enum([
    "decision", "contract", "configuration", "runtime", "admin", "test", "documentation", "release"
  ])).min(1),
  ownerOnlySetupClasses: z.array(z.enum([
    "account", "handle", "oauth", "credential", "source-approval", "routine-scope", "content-approval"
  ])).max(12),
  weight: z.number().positive().nullable(),
  finalGate: z.boolean(),
  sharedWorkItemRef: IdSchema.nullable(),
  supersededBy: IdSchema.nullable(),
  state: ImplementationItemStateSchema,
  explanation: z.string().min(1).max(800),
  github: ImplementationGitHubEvidenceSchema,
  probes: z.array(ImplementationProbeResultSchema).max(30),
  blockerItemIds: z.array(IdSchema).max(30),
  ownerActions: z.array(z.string().min(1).max(300)).max(20),
  discrepancies: z.array(z.string().min(1).max(500)).max(20),
  recommendedAction: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1).max(500)).max(60)
}).strict();

export const ImplementationProgramProgressSchema = z.object({
  programId: IdSchema,
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(600),
  parentIssueNumber: z.number().int().positive(),
  parentIssueUrl: HttpsUrlSchema,
  visibility: z.enum(["public", "owner-only", "internal"]),
  manifestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  phases: z.array(z.object({
    id: IdSchema,
    name: z.string().min(1).max(120),
    workItemIds: z.array(IdSchema).min(1)
  }).strict()).min(1),
  prerequisiteIssueNumbers: z.array(z.number().int().positive()).max(30),
  finalReleaseItemId: IdSchema,
  mandatoryCompleted: z.number().int().nonnegative(),
  mandatoryTotal: z.number().int().nonnegative(),
  weightedProgressPercent: z.number().min(0).max(100).nullable(),
  stateCounts: z.record(ImplementationItemStateSchema, z.number().int().nonnegative()),
  currentItemId: IdSchema.nullable(),
  nextUnblockedItemIds: z.array(IdSchema).max(30),
  parallelSafeItemIds: z.array(IdSchema).max(30),
  ownerWaitingItemIds: z.array(IdSchema).max(30),
  finalGateReady: z.boolean(),
  finalGateComplete: z.boolean()
}).strict();

export const ImplementationProgressSchema = z.object({
  schemaVersion: z.literal("implementation-progress/1"),
  snapshotId: z.string().regex(/^programs-[a-f0-9]{16}$/),
  manifestVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  generatedAt: IsoDateTimeSchema,
  sourceFreshness: z.enum(["fresh", "partial", "stale", "unavailable"]),
  github: z.object({
    cacheStatus: z.enum(["fresh", "revalidated", "stale", "unavailable"]),
    rateRemaining: z.number().int().nonnegative().nullable(),
    rateResetAt: IsoDateTimeSchema.nullable(),
    failedItems: z.number().int().nonnegative()
  }).strict(),
  programs: z.array(ImplementationProgramProgressSchema).min(1),
  items: z.array(ImplementationProgressItemSchema).min(1),
  sharedItemIds: z.array(IdSchema),
  currentItemId: IdSchema.nullable(),
  nextUnblockedItemIds: z.array(IdSchema).max(50),
  parallelSafeItemIds: z.array(IdSchema).max(50),
  ownerWaitingItemIds: z.array(IdSchema).max(50),
  malformedProbeCount: z.number().int().nonnegative(),
  boundedErrors: z.array(z.string().min(1).max(500)).max(100),
  lastSuccessfulSyncAt: IsoDateTimeSchema.nullable(),
  snapshotHash: z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).strict();

export const ImplementationProgressEventSchema = z.object({
  schemaVersion: z.literal("implementation-progress-event/1"),
  eventId: z.string().regex(/^program-event-[a-f0-9]{20}$/),
  occurredAt: IsoDateTimeSchema,
  programId: IdSchema,
  itemId: IdSchema,
  transition: z.enum([
    "ready",
    "work-started",
    "pr-opened",
    "pr-merged",
    "pr-closed",
    "evidence-valid",
    "evidence-invalid",
    "item-completed",
    "blocker-added",
    "blocker-cleared",
    "owner-action-added",
    "owner-action-cleared",
    "optional-held",
    "manifest-superseded",
    "correction"
  ]),
  fromState: ImplementationItemStateSchema.nullable(),
  toState: ImplementationItemStateSchema,
  evidenceRefs: z.array(z.string().min(1).max(500)).max(30),
  snapshotHash: z.string().regex(/^sha256:[a-f0-9]{64}$/)
}).strict();

export type ImplementationProbe = z.infer<typeof ImplementationProbeSchema>;
export type ImplementationProbeResult = z.infer<typeof ImplementationProbeResultSchema>;
export type ImplementationWorkItem = z.infer<typeof ImplementationWorkItemSchema>;
export type ImplementationProgram = z.infer<typeof ImplementationProgramSchema>;
export type ImplementationManifestRegistry = z.infer<typeof ImplementationManifestRegistrySchema>;
export type ImplementationGitHubEvidence = z.infer<typeof ImplementationGitHubEvidenceSchema>;
export type ImplementationProgressItem = z.infer<typeof ImplementationProgressItemSchema>;
export type ImplementationProgramProgress = z.infer<typeof ImplementationProgramProgressSchema>;
export type ImplementationProgress = z.infer<typeof ImplementationProgressSchema>;
export type ImplementationProgressEvent = z.infer<typeof ImplementationProgressEventSchema>;
