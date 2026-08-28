import { createHash } from "node:crypto";
import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, Sha256Schema } from "./common.js";

const ProfileIdSchema = z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140);
const StrategyIdSchema = z.string().regex(/^social-profile-strategy-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(180);
const FrozenGateSchema = z.enum(["purpose", "capability", "privacy", "evidence", "original-support-ratio", "runway", "cooldown", "duplicate", "stagger", "authority", "cost", "kill-switch"]);
const ContinuationVerdictSchema = z.enum(["CONTINUE", "NARROW", "PAUSE", "RETIRE", "INSUFFICIENT_DATA"]);

export const SocialLearningEvaluationSchema = z.strictObject({
  schemaVersion: z.literal("social-learning-evaluation/1"),
  id: z.string().regex(/^social-learning-evaluation-[a-f0-9]{20}$/u),
  evaluationHash: Sha256Schema,
  profileId: ProfileIdSchema,
  targetRole: z.enum(["primary", "umbrella", "amplifier"]),
  strategyId: StrategyIdSchema,
  strategyVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  evaluatedWeek: DateSchema,
  evaluatedAt: DateTimeSchema,
  observationRefs: z.array(EvidenceRefSchema).max(2_000),
  operationRefs: z.array(EvidenceRefSchema).max(500),
  experimentRefs: z.array(EvidenceRefSchema).max(2),
  sample: z.strictObject({
    distinctPosts: z.number().int().nonnegative(),
    measured28dPosts: z.number().int().nonnegative(),
    qualifiedOutcomePosts: z.number().int().nonnegative(),
    unavailablePosts: z.number().int().nonnegative(),
    operationDays: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    noPost: z.number().int().nonnegative(),
    heldOrFailed: z.number().int().nonnegative(),
    originalPosts: z.number().int().nonnegative(),
    supportPosts: z.number().int().nonnegative(),
    actualCostUsd: z.number().finite().nonnegative().nullable(),
    ownerAttentionCount: z.number().int().nonnegative()
  }),
  robustMetrics: z.strictObject({
    publishReliability: z.number().finite().min(0).max(1).nullable(),
    qualifiedActionsMedian: z.number().finite().nonnegative().nullable(),
    referralVisitsMedian: z.number().finite().nonnegative().nullable(),
    reachMedian: z.number().finite().nonnegative().nullable(),
    originalRatio: z.number().finite().min(0).max(1).nullable(),
    supportRatio: z.number().finite().min(0).max(1).nullable()
  }),
  outlierObservationRefs: z.array(EvidenceRefSchema).max(100),
  minimumSample: z.number().int().min(2).max(1_000),
  conclusion: z.enum(["INSUFFICIENT_DATA", "STABLE", "PROPOSE_BOUNDED_CHANGE"]),
  signals: z.array(z.string().trim().min(1).max(300)).max(30),
  proposedAdjustmentRef: EvidenceRefSchema.nullable(),
  hardGatesFrozen: z.array(FrozenGateSchema).length(12),
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((evaluation, context) => {
  if (evaluation.id !== `social-learning-evaluation-${evaluation.evaluationHash.slice(0, 20)}` || evaluation.evaluationHash !== socialLearningEvaluationHash(evaluation)) context.addIssue({ code: "custom", message: "Learning evaluation hash and id must match canonical evidence", path: ["evaluationHash"] });
  if ((evaluation.conclusion === "INSUFFICIENT_DATA") !== (evaluation.sample.distinctPosts < evaluation.minimumSample)) context.addIssue({ code: "custom", message: "Minimum sample deterministically controls insufficient-data state", path: ["conclusion"] });
  if ((evaluation.conclusion === "PROPOSE_BOUNDED_CHANGE") !== (evaluation.proposedAdjustmentRef !== null)) context.addIssue({ code: "custom", message: "Only a bounded-change conclusion references an adjustment", path: ["proposedAdjustmentRef"] });
});

export const SocialStrategyAdjustmentSchema = z.strictObject({
  schemaVersion: z.literal("social-strategy-adjustment/1"),
  id: z.string().regex(/^social-strategy-adjustment-[a-f0-9]{20}$/u),
  adjustmentHash: Sha256Schema,
  profileId: ProfileIdSchema,
  strategyId: StrategyIdSchema,
  baseVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  nextVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  status: z.enum(["proposed", "owner-approved", "applied", "vetoed", "corrected"]),
  change: z.strictObject({
    kind: z.enum(["format-priority", "preferred-window", "reserve-mix", "source-usefulness", "goviral-usefulness", "asset-template-preference", "campaign-support-frequency"]),
    targetRef: z.string().trim().min(1).max(180),
    beforeRank: z.number().int().nonnegative(),
    afterRank: z.number().int().nonnegative(),
    delta: z.number().int().min(-1).max(1)
  }),
  evidenceEvaluationRef: EvidenceRefSchema,
  evidenceObservationRefs: z.array(EvidenceRefSchema).min(3).max(100),
  explanation: z.string().trim().min(1).max(500),
  hardGatesFrozen: z.array(FrozenGateSchema).length(12),
  createsSourceOrTarget: z.literal(false),
  createsCapabilityOrScope: z.literal(false),
  ownerDecisionRef: EvidenceRefSchema.nullable(),
  appliedStrategyRef: EvidenceRefSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((adjustment, context) => {
  if (adjustment.change.afterRank - adjustment.change.beforeRank !== adjustment.change.delta || adjustment.change.delta === 0) context.addIssue({ code: "custom", message: "A bounded adjustment moves exactly one rank", path: ["change"] });
  if (adjustment.nextVersion === adjustment.baseVersion) context.addIssue({ code: "custom", message: "An adjustment must create a new strategy version", path: ["nextVersion"] });
  if (["owner-approved", "applied", "vetoed", "corrected"].includes(adjustment.status) !== (adjustment.ownerDecisionRef !== null)) context.addIssue({ code: "custom", message: "Every owner disposition records exact evidence", path: ["ownerDecisionRef"] });
  if ((adjustment.status === "applied") !== (adjustment.appliedStrategyRef !== null)) context.addIssue({ code: "custom", message: "Only an applied adjustment references its immutable strategy version", path: ["appliedStrategyRef"] });
  if (adjustment.id !== `social-strategy-adjustment-${adjustment.adjustmentHash.slice(0, 20)}` || adjustment.adjustmentHash !== socialStrategyAdjustmentHash(adjustment)) context.addIssue({ code: "custom", message: "Adjustment hash and id must match canonical evidence", path: ["adjustmentHash"] });
});

export const SocialContinuationProposalSchema = z.strictObject({
  schemaVersion: z.literal("social-continuation-proposal/1"),
  id: z.string().regex(/^social-continuation-proposal-[a-f0-9]{20}$/u),
  proposalHash: Sha256Schema,
  profileId: ProfileIdSchema,
  targetRole: z.enum(["primary", "umbrella", "amplifier"]),
  reviewDate: DateSchema,
  validationDays: z.number().int().min(28).max(90),
  evaluatedAt: DateTimeSchema,
  verdict: ContinuationVerdictSchema,
  evidence: z.strictObject({
    learningEvaluationRef: EvidenceRefSchema,
    independentAudienceReason: z.enum(["recorded", "missing", "not-applicable"]),
    originalConsistency: z.enum(["sufficient", "insufficient", "unavailable"]),
    ratioPolicy: z.enum(["pass", "incident", "unavailable"]),
    publishReliability: z.number().finite().min(0).max(1).nullable(),
    qualifiedOutcomeSample: z.number().int().nonnegative(),
    supportBaselineComparable: z.boolean(),
    policyIncidents: z.number().int().nonnegative(),
    actualCostUsd: z.number().finite().nonnegative().nullable(),
    ownerAttentionCount: z.number().int().nonnegative(),
    separateProfileJustified: z.enum(["yes", "no", "unavailable"])
  }),
  reasons: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
  queueAction: z.enum(["none", "request-pause"]),
  ownerDecisionRequired: z.literal(true),
  externalAccountAction: z.literal("none"),
  accountDeleted: z.literal(false),
  accountRetiredAutomatically: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((proposal, context) => {
  if (proposal.id !== `social-continuation-proposal-${proposal.proposalHash.slice(0, 20)}` || proposal.proposalHash !== socialContinuationProposalHash(proposal)) context.addIssue({ code: "custom", message: "Continuation proposal hash and id must match canonical evidence", path: ["proposalHash"] });
  if ((proposal.verdict === "PAUSE") !== (proposal.queueAction === "request-pause")) context.addIssue({ code: "custom", message: "Only PAUSE may request a bounded queue pause", path: ["queueAction"] });
});

export const SocialLearningCheckpointSchema = z.strictObject({
  schemaVersion: z.literal("social-learning-checkpoint/1"),
  profileId: ProfileIdSchema,
  evaluatedWeek: DateSchema,
  currentEvaluationRef: EvidenceRefSchema,
  evaluationRefs: z.array(EvidenceRefSchema).min(1).max(100),
  adjustmentEventRefs: z.array(EvidenceRefSchema).max(100),
  continuationRefs: z.array(EvidenceRefSchema).min(1).max(100),
  strategyVersionRefs: z.array(EvidenceRefSchema).min(1).max(100),
  correctionCount: z.number().int().nonnegative(),
  generatedAt: DateTimeSchema,
  checkpointHash: Sha256Schema,
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((checkpoint, context) => {
  if (!checkpoint.evaluationRefs.includes(checkpoint.currentEvaluationRef)) context.addIssue({ code: "custom", message: "Current evaluation must preserve an immutable evaluation reference", path: ["currentEvaluationRef"] });
  if (checkpoint.correctionCount !== checkpoint.evaluationRefs.length - 1) context.addIssue({ code: "custom", message: "Correction count derives from preserved evaluation versions", path: ["correctionCount"] });
  if (checkpoint.checkpointHash !== socialLearningCheckpointHash(checkpoint)) context.addIssue({ code: "custom", message: "Learning checkpoint hash must match canonical evidence", path: ["checkpointHash"] });
});

export type SocialLearningEvaluation = z.infer<typeof SocialLearningEvaluationSchema>;
export type SocialStrategyAdjustment = z.infer<typeof SocialStrategyAdjustmentSchema>;
export type SocialContinuationProposal = z.infer<typeof SocialContinuationProposalSchema>;
export type SocialLearningCheckpoint = z.infer<typeof SocialLearningCheckpointSchema>;
export const SOCIAL_LEARNING_FROZEN_GATES = ["purpose", "capability", "privacy", "evidence", "original-support-ratio", "runway", "cooldown", "duplicate", "stagger", "authority", "cost", "kill-switch"] as const;

function canonical(value: unknown, excluded: ReadonlySet<string>): unknown { if (Array.isArray(value)) return value.map((entry) => canonical(entry, excluded)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !excluded.has(key)).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, canonical(entry, excluded)])); return value; }
const digest = (value: unknown, excluded: string[]) => createHash("sha256").update(JSON.stringify(canonical(value, new Set(excluded)))).digest("hex");
export const socialLearningEvaluationHash = (value: unknown): string => digest(value, ["id", "evaluationHash"]);
export const socialStrategyAdjustmentHash = (value: unknown): string => digest(value, ["id", "adjustmentHash", "status", "ownerDecisionRef", "appliedStrategyRef", "updatedAt"]);
export const socialContinuationProposalHash = (value: unknown): string => digest(value, ["id", "proposalHash"]);
export const socialLearningCheckpointHash = (value: unknown): string => digest(value, ["checkpointHash"]);
