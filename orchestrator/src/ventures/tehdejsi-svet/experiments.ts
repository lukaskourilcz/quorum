import { z } from "zod";
import { ExperimentSchema, assertExperimentUpdate } from "../../experiments/validate.js";
import { atomicWriteJson, readJson } from "../../state.js";

export const TEHDEJSI_EXPERIMENTS_PATH = "ventures/tehdejsi-svet/experiments.json";

const ExperimentKindSchema = z.enum([
  "hook-frame",
  "perspective",
  "cta-class",
  "slide-count",
  "language-order"
]);

export const TehdejsiExperimentSchema = ExperimentSchema.extend({
  ventureId: z.literal("tehdejsi-svet"),
  ladderStep: z.number().int().min(1).max(5),
  kind: ExperimentKindSchema,
  assignment: z.literal("alternating"),
  variants: z.array(z.strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    description: z.string().trim().min(8).max(300)
  })).min(2).max(3)
}).strict().superRefine((experiment, context) => {
  if (experiment.maxCostUsd !== 0 || experiment.maxLossUsd !== 0) {
    context.addIssue({ code: "custom", path: ["maxCostUsd"], message: "The organic experiment ladder has no spend or loss authority" });
  }
  if (new Set(experiment.variants.map(({ id }) => id)).size !== experiment.variants.length) {
    context.addIssue({ code: "custom", path: ["variants"], message: "Experiment variant ids must be unique" });
  }
});

const LADDER = ["hook-frame", "perspective", "cta-class", "slide-count", "language-order"] as const;

export const TehdejsiExperimentRegisterSchema = z.strictObject({
  schemaVersion: z.literal("tehdejsi-experiment-register/1"),
  ventureId: z.literal("tehdejsi-svet"),
  experiments: z.array(TehdejsiExperimentSchema).length(5),
  updatedAt: z.string().datetime({ offset: true })
}).superRefine((register, context) => {
  const live = register.experiments.filter(({ status }) => status === "active" || status === "review");
  if (live.length > 1) {
    context.addIssue({ code: "custom", path: ["experiments"], message: "Only one Tehdejsi svet experiment may be live" });
  }
  register.experiments.forEach((experiment, index) => {
    if (experiment.ladderStep !== index + 1 || experiment.kind !== LADDER[index]) {
      context.addIssue({ code: "custom", path: ["experiments", index], message: "Experiment records must preserve the strategy ladder" });
    }
    if ((experiment.status === "active" || experiment.status === "review")
        && register.experiments.slice(0, index).some(({ status }) => status !== "completed" && status !== "stopped")) {
      context.addIssue({ code: "custom", path: ["experiments", index, "status"], message: "A later experiment waits for every earlier ladder step" });
    }
  });
});

export type TehdejsiExperiment = z.infer<typeof TehdejsiExperimentSchema>;
export type TehdejsiExperimentRegister = z.infer<typeof TehdejsiExperimentRegisterSchema>;

export async function readTehdejsiExperimentRegister(root: string): Promise<TehdejsiExperimentRegister> {
  return TehdejsiExperimentRegisterSchema.parse(await readJson<unknown>(root, TEHDEJSI_EXPERIMENTS_PATH, null));
}

/** Keeps the sibling hypothesis fields immutable after start and the strategy ladder serial. */
export function assertTehdejsiExperimentRegisterUpdate(
  previous: TehdejsiExperimentRegister,
  next: TehdejsiExperimentRegister
): TehdejsiExperimentRegister {
  const before = TehdejsiExperimentRegisterSchema.parse(previous);
  const after = TehdejsiExperimentRegisterSchema.parse(next);
  const byId = new Map(before.experiments.map((experiment) => [experiment.id, experiment]));
  for (const experiment of after.experiments) {
    const prior = byId.get(experiment.id);
    if (!prior || prior.ladderStep !== experiment.ladderStep || prior.kind !== experiment.kind
        || prior.assignment !== experiment.assignment || JSON.stringify(prior.variants) !== JSON.stringify(experiment.variants)) {
      throw new Error(`Experiment ladder identity changed at step ${experiment.ladderStep}`);
    }
    assertExperimentUpdate(prior, experiment);
    if ((experiment.status === "active" || experiment.status === "review")
        && prior.status !== "active" && prior.status !== "review"
        && (experiment.baseline === null || experiment.target === null
          || experiment.startedAtCycle === null || experiment.evidenceRefs.length === 0)) {
      throw new Error(`Experiment ${experiment.id} needs a recorded baseline, target, start cycle and evidence before activation`);
    }
  }
  return after;
}

export async function writeTehdejsiExperimentRegister(input: {
  root: string;
  previous: TehdejsiExperimentRegister;
  next: TehdejsiExperimentRegister;
}): Promise<void> {
  await atomicWriteJson(input.root, TEHDEJSI_EXPERIMENTS_PATH, assertTehdejsiExperimentRegisterUpdate(input.previous, input.next));
}

export function activeTehdejsiExperiment(register: TehdejsiExperimentRegister): TehdejsiExperiment | null {
  const parsed = TehdejsiExperimentRegisterSchema.parse(register);
  return parsed.experiments.find(({ status }) => status === "active" || status === "review") ?? null;
}

export function alternatingTehdejsiVariant(experiment: TehdejsiExperiment, featureOrdinal: number): string {
  if (!Number.isSafeInteger(featureOrdinal) || featureOrdinal < 0) throw new Error("Feature ordinal must be a nonnegative integer");
  return experiment.variants[featureOrdinal % experiment.variants.length]!.id;
}
