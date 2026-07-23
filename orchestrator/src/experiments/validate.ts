import { z } from "zod";
import { StageSchema } from "../types.js";

export const ExperimentStatusSchema = z.enum([
  "backlog",
  "active",
  "review",
  "completed",
  "stopped"
]);

export const ExperimentSchema = z.object({
  id: z.string().min(1).max(120),
  fixture: z.boolean().default(false),
  status: ExperimentStatusSchema,
  stage: StageSchema,
  segment: z.string().min(1).max(300),
  hypothesis: z.string().min(1).max(800),
  offer: z.string().min(1).max(500),
  channel: z.string().min(1).max(200),
  primaryMetric: z.string().min(1).max(120),
  baseline: z.number().finite().nullable(),
  target: z.number().finite().nullable(),
  startedAtCycle: z.number().int().nonnegative().nullable(),
  reviewCycle: z.number().int().positive(),
  maxCostUsd: z.number().nonnegative(),
  maxLossUsd: z.number().nonnegative(),
  stopCondition: z.string().min(1).max(500),
  evidenceRefs: z.array(z.string().min(1)),
  decision: z.enum(["continue", "change", "stop", "pivot"]).nullable(),
  result: z.number().finite().nullable()
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export function assertActivatableExperiment(value: unknown): Experiment {
  const experiment = ExperimentSchema.parse(value);
  if (experiment.fixture) {
    throw new Error("Fixture experiments cannot be activated");
  }
  if (experiment.baseline === null || experiment.target === null) {
    throw new Error("Activation requires immutable baseline and target values");
  }
  if (experiment.evidenceRefs.length === 0) {
    throw new Error("Activation requires eligible evidence references");
  }
  if (experiment.maxCostUsd <= 0) {
    throw new Error("Activation requires a positive bounded cost");
  }
  return experiment;
}

const IMMUTABLE_AFTER_START = [
  "hypothesis",
  "segment",
  "offer",
  "channel",
  "primaryMetric",
  "baseline",
  "target",
  "startedAtCycle",
  "reviewCycle",
  "maxCostUsd",
  "maxLossUsd",
  "stopCondition"
] as const satisfies readonly (keyof Experiment)[];

export function assertExperimentUpdate(
  previous: Experiment,
  next: Experiment
): Experiment {
  const before = ExperimentSchema.parse(previous);
  const after = ExperimentSchema.parse(next);
  if (before.id !== after.id) {
    throw new Error("Experiment id is immutable");
  }
  if (before.startedAtCycle !== null) {
    for (const key of IMMUTABLE_AFTER_START) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        throw new Error(`Started experiment field is immutable: ${key}`);
      }
    }
  }
  return after;
}
