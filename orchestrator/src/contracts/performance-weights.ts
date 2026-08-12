import { z } from "zod";
import { DateTimeSchema, VentureIdSchema } from "./common.js";
import { RecommendationFormatSchema } from "./venture-recommendation.js";

export const PERFORMANCE_PRIOR_MIN = 0.5;
export const PERFORMANCE_PRIOR_MAX = 1.5;

export const PerformanceHookStyleSchema = z.enum([
  "narrative-led",
  "quote-led",
  "lesson-led",
  "tension-led",
  "humor-led"
]);

const PriorSchema = z.number().finite().min(PERFORMANCE_PRIOR_MIN).max(PERFORMANCE_PRIOR_MAX);
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const ThemeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const ResultIdSchema = z.string().regex(/^owner-result-[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);

export const NeutralFormatPriorsSchema = z.strictObject({
  carousel: PriorSchema,
  "single-image": PriorSchema,
  thread: PriorSchema,
  caption: PriorSchema,
  "short-video-script": PriorSchema
});

export const NeutralHookStylePriorsSchema = z.strictObject({
  "narrative-led": PriorSchema,
  "quote-led": PriorSchema,
  "lesson-led": PriorSchema,
  "tension-led": PriorSchema,
  "humor-led": PriorSchema
});

function boundedRecord<Key extends z.ZodType<string>>(key: Key) {
  return z.record(key, PriorSchema).superRefine((record, context) => {
    if (Object.keys(record).length > 100) {
      context.addIssue({ code: "custom", message: "A prior dimension may contain at most 100 entries" });
    }
  });
}

export const PerformanceWeightChangesSchema = z.strictObject({
  formatPriors: z.partialRecord(RecommendationFormatSchema, PriorSchema),
  themePriors: boundedRecord(ThemeSchema),
  hookStylePriors: z.partialRecord(PerformanceHookStyleSchema, PriorSchema)
}).superRefine((changes, context) => {
  if (Object.values(changes).every((dimension) => Object.keys(dimension).length === 0)) {
    context.addIssue({ code: "custom", message: "A weight proposal must change at least one prior" });
  }
});

export const PerformanceWeightProposalSchema = z.strictObject({
  rationale: z.string().trim().min(1).max(1_000),
  evidenceResultIds: z.array(ResultIdSchema).min(1).max(20),
  changes: PerformanceWeightChangesSchema
}).superRefine((proposal, context) => {
  if (new Set(proposal.evidenceResultIds).size !== proposal.evidenceResultIds.length) {
    context.addIssue({ code: "custom", path: ["evidenceResultIds"], message: "Result citations must be unique" });
  }
});

export const PerformanceWeightRevisionSchema = PerformanceWeightProposalSchema.safeExtend({
  revision: z.number().int().positive(),
  sourceCycleId: SlugSchema,
  updatedAt: DateTimeSchema
});

function sameRecord(left: Record<string, number>, right: Record<string, number>): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && left[key] === right[key]);
}

export const PerformanceWeightsSchema = z.strictObject({
  schemaVersion: z.literal("performance-weights/1"),
  ventureId: VentureIdSchema,
  floor: z.literal(PERFORMANCE_PRIOR_MIN),
  ceiling: z.literal(PERFORMANCE_PRIOR_MAX),
  formatPriors: NeutralFormatPriorsSchema,
  themePriors: boundedRecord(ThemeSchema),
  hookStylePriors: NeutralHookStylePriorsSchema,
  revisions: z.array(PerformanceWeightRevisionSchema).max(100),
  generatedAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((weights, context) => {
  const formatPriors: Record<string, number> = {
    carousel: 1, "single-image": 1, thread: 1, caption: 1, "short-video-script": 1
  };
  const themePriors: Record<string, number> = {};
  const hookStylePriors: Record<string, number> = {
    "narrative-led": 1, "quote-led": 1, "lesson-led": 1, "tension-led": 1, "humor-led": 1
  };
  const cycleIds = new Set<string>();
  weights.revisions.forEach((revision, index) => {
    if (revision.revision !== index + 1) {
      context.addIssue({ code: "custom", path: ["revisions", index, "revision"], message: "Revisions must be consecutive" });
    }
    if (cycleIds.has(revision.sourceCycleId)) {
      context.addIssue({ code: "custom", path: ["revisions", index, "sourceCycleId"], message: "A growth cycle may adjust weights once" });
    }
    cycleIds.add(revision.sourceCycleId);
    if (index > 0 && Date.parse(revision.updatedAt) < Date.parse(weights.revisions[index - 1]!.updatedAt)) {
      context.addIssue({ code: "custom", path: ["revisions", index, "updatedAt"], message: "Revisions cannot move backward in time" });
    }
    Object.assign(formatPriors, revision.changes.formatPriors);
    Object.assign(themePriors, revision.changes.themePriors);
    Object.assign(hookStylePriors, revision.changes.hookStylePriors);
  });
  if (!sameRecord(formatPriors, weights.formatPriors) || !sameRecord(themePriors, weights.themePriors) ||
      !sameRecord(hookStylePriors, weights.hookStylePriors)) {
    context.addIssue({ code: "custom", path: ["revisions"], message: "Current priors must exactly replay from recorded proposals" });
  }
  if (Date.parse(weights.updatedAt) < Date.parse(weights.generatedAt) ||
      (weights.revisions.length > 0 && weights.updatedAt !== weights.revisions.at(-1)!.updatedAt)) {
    context.addIssue({ code: "custom", path: ["updatedAt"], message: "Weight timestamps must match their recorded history" });
  }
});

export type PerformanceHookStyle = z.infer<typeof PerformanceHookStyleSchema>;
export type PerformanceWeightChanges = z.infer<typeof PerformanceWeightChangesSchema>;
export type PerformanceWeightProposal = z.infer<typeof PerformanceWeightProposalSchema>;
export type PerformanceWeights = z.infer<typeof PerformanceWeightsSchema>;
