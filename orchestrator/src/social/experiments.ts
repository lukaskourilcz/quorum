import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SocialBoostProposalSchema,
  SocialDistributionBaselineSchema,
  SocialDistributionExperimentRegisterSchema,
  SocialDistributionExperimentSchema,
  SocialMetricObservationSchema,
  type SocialBoostProposal,
  type SocialDistributionBaseline,
  type SocialDistributionExperiment,
  type SocialDistributionExperimentRegister,
  type SocialResultMetricName
} from "../contracts/social-results.js";
import { configRoot } from "../paths.js";

const DAY_MS = 86_400_000;
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const SocialResultsPolicySchema = z.strictObject({
  schemaVersion: z.literal("social-results-policy/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  baselineDays: z.literal(28),
  maximumActiveExperiments: z.literal(2),
  boostProposal: z.strictObject({
    thresholdVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
    primaryMetric: z.literal("qualified_actions"),
    minimumObservedValue: z.number().finite().nonnegative(),
    minimumSample: z.number().int().min(2).max(100),
    ownerDecisionRequired: z.literal(true),
    adApiEnabled: z.literal(false),
    purchaseAuthorized: z.literal(false),
    automaticSpendAuthorized: z.literal(false)
  }),
  hardGatesFrozen: z.array(z.enum([
    "purpose", "capability", "original-support-ratio", "runway", "cooldown", "duplicate", "stagger", "privacy", "authority", "kill-switch"
  ])).length(10),
  ownerDecisionRef: z.string().trim().min(1).max(160)
});

export type SocialResultsPolicy = z.infer<typeof SocialResultsPolicySchema>;

export async function loadSocialResultsPolicy(filePath = path.join(configRoot, "social-results-policy.json")): Promise<SocialResultsPolicy> {
  return SocialResultsPolicySchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}

function dateAfter(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function buildSocialDistributionBaseline(input: {
  startsOn: string;
  evaluatedAt: Date;
  observations: readonly unknown[];
  attributions: readonly unknown[];
}): SocialDistributionBaseline {
  const parsed = input.observations.map((value) => SocialMetricObservationSchema.safeParse(value));
  const accepted = parsed.flatMap((value) => value.success ? [value.data] : []);
  const attributionRefs = input.attributions.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const id = (value as Record<string, unknown>).id;
    return typeof id === "string" && /^social-attribution-event-/u.test(id) ? [`state/social/results/attribution/${id}.json`] : [];
  });
  const elapsedDays = Math.max(0, Math.floor((input.evaluatedAt.getTime() - Date.parse(`${input.startsOn}T00:00:00.000Z`)) / DAY_MS));
  return SocialDistributionBaselineSchema.parse({
    schemaVersion: "social-distribution-baseline/1",
    id: `social-distribution-baseline-${input.startsOn}`,
    startsOn: input.startsOn,
    endsOn: dateAfter(input.startsOn, 28),
    evaluatedAt: input.evaluatedAt.toISOString(),
    elapsedDays,
    status: elapsedDays >= 28 ? "complete" : "collecting",
    observationRefs: accepted.map(({ id }) => `state/social/results/observations/${id}.json`),
    attributionRefs,
    acceptedObservationCount: accepted.length,
    droppedObservationCount: parsed.filter(({ success }) => !success).length,
    metricsAvailable: accepted.some(({ metrics }) => metrics.some(({ value }) => value !== null)),
    ownerDecisionRequired: true,
    authorityGranted: false
  });
}

const IMMUTABLE_EXPERIMENT_FIELDS = [
  "hypothesis", "changedVariable", "control", "variant", "primaryMetric", "guardrail", "scopeProfileIds",
  "startsOn", "endsOn", "minimumSample", "stopCondition", "baselineRef", "hardGatesFrozen", "privacyFrozen",
  "manipulationExcluded", "maxCostUsd", "publishingAuthorized"
] as const satisfies readonly (keyof SocialDistributionExperiment)[];

export function assertSocialExperimentRegisterUpdate(input: {
  previous: SocialDistributionExperimentRegister;
  next: SocialDistributionExperimentRegister;
  baselines: readonly unknown[];
}): SocialDistributionExperimentRegister {
  const previous = SocialDistributionExperimentRegisterSchema.parse(input.previous);
  const next = SocialDistributionExperimentRegisterSchema.parse(input.next);
  const completeBaselineRefs = new Set(input.baselines.flatMap((value) => {
    const parsed = SocialDistributionBaselineSchema.safeParse(value);
    return parsed.success && parsed.data.status === "complete" ? [`state/social/results/baselines/${parsed.data.id}.json`] : [];
  }));
  const priorById = new Map(previous.experiments.map((experiment) => [experiment.id, experiment]));
  for (const experiment of next.experiments) {
    if (["active", "review", "completed", "stopped"].includes(experiment.status) && !completeBaselineRefs.has(experiment.baselineRef)) {
      throw new Error(`Experiment ${experiment.id} cannot start before its exact 28-day baseline is complete`);
    }
    const prior = priorById.get(experiment.id);
    if (!prior || !["active", "review"].includes(prior.status)) continue;
    for (const field of IMMUTABLE_EXPERIMENT_FIELDS) {
      if (JSON.stringify(prior[field]) !== JSON.stringify(experiment[field])) throw new Error(`Started Social Distribution experiment field is immutable: ${field}`);
    }
    if (!experiment.evidenceObservationRefs.slice(0, prior.evidenceObservationRefs.length).every((ref, index) => ref === prior.evidenceObservationRefs[index])) {
      throw new Error("Social Distribution experiment evidence is append-only");
    }
  }
  return next;
}

export function evaluateSocialDistributionExperiment(input: {
  experiment: unknown;
  observations: readonly unknown[];
  proposedVerdict: Exclude<SocialDistributionExperiment["verdict"], "INSUFFICIENT_DATA">;
}): SocialDistributionExperiment {
  const experiment = SocialDistributionExperimentSchema.parse(input.experiment);
  const refs = input.observations.flatMap((value) => {
    const parsed = SocialMetricObservationSchema.safeParse(value);
    if (!parsed.success || !experiment.scopeProfileIds.includes(parsed.data.profileId)) return [];
    const measured = parsed.data.metrics.some(({ name, value: metric }) => name === experiment.primaryMetric && metric !== null);
    return measured ? [`state/social/results/observations/${parsed.data.id}.json`] : [];
  });
  const unique = [...new Set(refs)].sort();
  return SocialDistributionExperimentSchema.parse({
    ...experiment,
    evidenceObservationRefs: unique,
    verdict: unique.length < experiment.minimumSample ? "INSUFFICIENT_DATA" : input.proposedVerdict
  });
}

export function createHeldBoostProposal(input: {
  policy: SocialResultsPolicy;
  baseline: unknown;
  contentRef: string;
  destinationRef: string;
  metric: SocialResultMetricName;
  observedValue: number;
  observationRefs: readonly string[];
  contentChecksPassed: boolean;
  destinationChecksPassed: boolean;
  budgetAuthorityRef: string;
  proposedAt: Date;
}): SocialBoostProposal {
  const policy = SocialResultsPolicySchema.parse(input.policy);
  const baseline = SocialDistributionBaselineSchema.parse(input.baseline);
  if (baseline.status !== "complete") throw new Error("A paid-boost proposal requires a complete 28-day organic baseline");
  if (input.metric !== policy.boostProposal.primaryMetric || input.observedValue < policy.boostProposal.minimumObservedValue || input.observationRefs.length < policy.boostProposal.minimumSample) {
    throw new Error("Organic evidence does not meet the versioned held-proposal threshold");
  }
  if (!input.contentChecksPassed || !input.destinationChecksPassed) throw new Error("Content and destination checks must pass before an owner proposal");
  const idHash = sha256({ contentRef: input.contentRef, destinationRef: input.destinationRef, baselineRef: baseline.id, thresholdVersion: policy.boostProposal.thresholdVersion });
  return SocialBoostProposalSchema.parse({
    schemaVersion: "social-boost-proposal/1",
    id: `social-boost-proposal-${idHash.slice(0, 20)}`,
    status: "held-owner-proposal",
    contentRef: input.contentRef,
    destinationRef: input.destinationRef,
    thresholdVersion: policy.boostProposal.thresholdVersion,
    baselineRef: `state/social/results/baselines/${baseline.id}.json`,
    organicObservationRefs: input.observationRefs,
    primaryMetric: input.metric,
    observedValue: input.observedValue,
    thresholdValue: policy.boostProposal.minimumObservedValue,
    sampleSize: policy.boostProposal.minimumSample,
    contentChecksPassed: true,
    destinationChecksPassed: true,
    budgetAuthorityRef: input.budgetAuthorityRef,
    proposedAt: input.proposedAt.toISOString(),
    ownerDecisionRequired: true,
    adApiCalled: false,
    purchaseAuthorized: false,
    spendAuthorized: false,
    publishingAuthorized: false
  });
}
