import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema } from "./common.js";
import { PersonalGrowthPillarSchema } from "./personal-growth-recommendations.js";
import { PersonalGrowthMetricNameSchema, PersonalGrowthPlatformSchema } from "./personal-growth-results.js";

const BaselineMetricSchema = z.strictObject({
  metric: PersonalGrowthMetricNameSchema,
  median: z.number().finite().nonnegative().nullable(),
  sampleSize: z.number().int().nonnegative(),
  unavailableCount: z.number().int().nonnegative()
}).superRefine((metric, context) => {
  if ((metric.median === null) !== (metric.sampleSize === 0)) {
    context.addIssue({ code: "custom", path: ["median"], message: "A baseline median needs a non-empty sample" });
  }
});

const BaselineSegmentSchema = z.strictObject({
  platform: PersonalGrowthPlatformSchema,
  format: z.string().trim().min(1).max(80),
  pillar: PersonalGrowthPillarSchema,
  originClass: z.enum(["ordinary-personal", "goviral-assisted", "owner-manual-venture-reference"]),
  resultCount: z.number().int().nonnegative(),
  metrics: z.array(BaselineMetricSchema).max(30)
});

export const PersonalGrowthBaselineSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-baseline/1"),
  ventureId: z.literal("personal-growth"),
  startsOn: DateSchema,
  endsOn: DateSchema,
  evaluatedAt: DateTimeSchema,
  elapsedDays: z.number().int().min(0).max(28),
  status: z.enum(["collecting", "proposal-due"]),
  acceptedResultCount: z.number().int().nonnegative(),
  droppedResultCount: z.number().int().nonnegative(),
  segments: z.array(BaselineSegmentSchema).max(500),
  targetProposal: z.strictObject({
    required: z.boolean(),
    ownerDecisionRequired: z.literal(true),
    activatedTargets: z.literal(0),
    evidenceRefs: z.array(EvidenceRefSchema).max(20)
  })
});

export const PersonalGrowthExperimentSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-experiment/1"),
  id: z.string().regex(/^pg-exp-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  status: z.enum(["backlog", "active", "review", "completed", "stopped"]),
  hypothesis: z.string().trim().min(1).max(800),
  changedVariable: z.enum([
    "trial-reel", "language", "photo-format", "goviral-opening", "threads-topic-tag", "timing-window", "manual-venture-reference"
  ]),
  platform: PersonalGrowthPlatformSchema,
  format: z.string().trim().min(1).max(80),
  primaryMetric: PersonalGrowthMetricNameSchema,
  secondaryGuardrail: z.string().trim().min(1).max(240),
  startDate: DateSchema,
  minimumSample: z.number().int().min(2).max(1000),
  evaluationWindowDays: z.number().int().min(1).max(90),
  stopCondition: z.string().trim().min(1).max(500),
  evidenceResultIds: z.array(z.string().regex(/^pg-result-[a-f0-9]{16}$/u)).max(1000),
  verdict: z.enum(["KEEP", "ITERATE", "STOP", "INSUFFICIENT_DATA"]),
  maxCostUsd: z.literal(0),
  publishingAuthorized: z.literal(false)
});

export const PersonalGrowthExperimentRegisterSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-experiment-register/1"),
  ventureId: z.literal("personal-growth"),
  experiments: z.array(PersonalGrowthExperimentSchema).max(100),
  updatedAt: DateTimeSchema
}).superRefine((register, context) => {
  const live = register.experiments.filter(({ status }) => status === "active" || status === "review");
  if (live.length > 2) {
    context.addIssue({ code: "custom", path: ["experiments"], message: "At most two Personal Growth experiments may be live" });
  }
  const ids = register.experiments.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", path: ["experiments"], message: "Experiment ids must be unique" });
  }
});

export const PersonalGrowthFeedbackSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-feedback/1"),
  evaluatedAt: DateTimeSchema,
  sourceResultIds: z.array(z.string().regex(/^pg-result-[a-f0-9]{16}$/u)).min(1).max(1000),
  pillarWeights: z.array(z.strictObject({
    pillar: PersonalGrowthPillarSchema,
    prior: z.number().finite().min(0).max(1),
    proposed: z.number().finite().min(0).max(1),
    sampleSize: z.number().int().nonnegative()
  })).max(20),
  formatPriors: z.record(z.string(), z.number().finite().min(0).max(1)),
  goviralUtility: z.number().finite().min(0).max(1).nullable(),
  reelSeriesUtility: z.record(z.string(), z.number().finite().min(0).max(1)),
  manualVentureReferenceUseful: z.boolean().nullable(),
  mutatesEvidence: z.literal(false),
  weakensPolicy: z.literal(false),
  externalDestinations: z.tuple([])
});

export type PersonalGrowthBaseline = z.infer<typeof PersonalGrowthBaselineSchema>;
export type PersonalGrowthExperiment = z.infer<typeof PersonalGrowthExperimentSchema>;
export type PersonalGrowthExperimentRegister = z.infer<typeof PersonalGrowthExperimentRegisterSchema>;
