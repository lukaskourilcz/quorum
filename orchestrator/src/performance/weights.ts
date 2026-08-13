import { z } from "zod";
import { DateTimeSchema, VentureIdSchema } from "../contracts/common.js";

export const PERFORMANCE_MINIMUM_SAMPLES = 3;
export const PERFORMANCE_WEIGHT_FLOOR = 0.75;
export const PERFORMANCE_WEIGHT_CEILING = 1.25;
export const PERFORMANCE_MAX_WEEKLY_DELTA = 0.1;

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const IsoWeekSchema = z.string().regex(/^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/);
const WeightSchema = z.number().finite().min(PERFORMANCE_WEIGHT_FLOOR).max(PERFORMANCE_WEIGHT_CEILING);
const AxisSchema = z.enum(["topic", "format"]);

const WeightCellSchema = z.strictObject({
  weight: WeightSchema,
  sampleSize: z.number().int().nonnegative(),
  updatedAt: DateTimeSchema.nullable(),
  proposalId: SlugSchema.nullable()
}).superRefine((cell, context) => {
  const untouched = cell.weight === 1 && cell.sampleSize === 0 && cell.updatedAt === null && cell.proposalId === null;
  const adjusted = cell.sampleSize >= PERFORMANCE_MINIMUM_SAMPLES && cell.updatedAt !== null && cell.proposalId !== null;
  if (!untouched && !adjusted) {
    context.addIssue({ code: "custom", message: "A weight is either neutral or backed by a floor-clearing proposal" });
  }
});

const AppliedChangeSchema = z.strictObject({
  axis: AxisSchema,
  key: SlugSchema,
  before: WeightSchema,
  after: WeightSchema,
  sampleSize: z.number().int().min(PERFORMANCE_MINIMUM_SAMPLES),
  resultIds: z.array(SlugSchema).min(PERFORMANCE_MINIMUM_SAMPLES).max(200),
  reason: z.string().trim().min(1).max(800)
}).superRefine((change, context) => {
  if (new Set(change.resultIds).size !== change.resultIds.length) {
    context.addIssue({ code: "custom", message: "Proposal result citations must be unique", path: ["resultIds"] });
  }
  if (change.sampleSize !== change.resultIds.length) {
    context.addIssue({ code: "custom", message: "Proposal sample size must equal its cited results", path: ["sampleSize"] });
  }
  if (change.before === change.after || Math.abs(change.after - change.before) > PERFORMANCE_MAX_WEEKLY_DELTA + 1e-9) {
    context.addIssue({ code: "custom", message: "A weekly change must be nonzero and remain inside the delta bound", path: ["after"] });
  }
});

const AppliedProposalSchema = z.strictObject({
  id: SlugSchema,
  week: IsoWeekSchema,
  proposedAt: DateTimeSchema,
  appliedAt: DateTimeSchema,
  changes: z.array(AppliedChangeSchema).min(1).max(40)
});

export const PerformanceWeightProposalSchema = z.strictObject({
  schemaVersion: z.literal("performance-weight-proposal/1"),
  id: SlugSchema,
  ventureId: VentureIdSchema,
  week: IsoWeekSchema,
  proposedAt: DateTimeSchema,
  changes: z.array(z.strictObject({
    axis: AxisSchema,
    key: SlugSchema,
    weight: WeightSchema,
    resultIds: z.array(SlugSchema).min(1).max(200),
    reason: z.string().trim().min(1).max(800)
  })).min(1).max(40)
});

export const PerformanceWeightsSchema = z.strictObject({
  schemaVersion: z.literal("performance-weights/1"),
  ventureId: VentureIdSchema,
  revision: z.number().int().nonnegative(),
  updatedAt: DateTimeSchema,
  policy: z.strictObject({
    minimumSamples: z.literal(PERFORMANCE_MINIMUM_SAMPLES),
    weightFloor: z.literal(PERFORMANCE_WEIGHT_FLOOR),
    weightCeiling: z.literal(PERFORMANCE_WEIGHT_CEILING),
    maxWeeklyDelta: z.literal(PERFORMANCE_MAX_WEEKLY_DELTA)
  }),
  topics: z.record(SlugSchema, WeightCellSchema),
  formats: z.record(SlugSchema, WeightCellSchema),
  proposals: z.array(AppliedProposalSchema).max(260)
}).superRefine((state, context) => {
  const proposalIds = new Set<string>();
  const weeks = new Set<string>();
  for (const [proposalIndex, proposal] of state.proposals.entries()) {
    if (proposalIds.has(proposal.id)) {
      context.addIssue({ code: "custom", message: "Proposal ids must be unique", path: ["proposals", proposalIndex, "id"] });
    }
    if (weeks.has(proposal.week)) {
      context.addIssue({ code: "custom", message: "Only one performance proposal may apply per week", path: ["proposals", proposalIndex, "week"] });
    }
    proposalIds.add(proposal.id);
    weeks.add(proposal.week);
    const targets = new Set<string>();
    for (const [changeIndex, change] of proposal.changes.entries()) {
      const target = `${change.axis}:${change.key}`;
      if (targets.has(target)) {
        context.addIssue({ code: "custom", message: "A proposal may change each weight once", path: ["proposals", proposalIndex, "changes", changeIndex] });
      }
      targets.add(target);
      const weights = change.axis === "topic" ? state.topics : state.formats;
      if (!weights[change.key]) {
        context.addIssue({ code: "custom", message: "Proposal change must resolve to a weight", path: ["proposals", proposalIndex, "changes", changeIndex, "key"] });
      }
    }
  }
  for (const [axis, weights] of [["topic", state.topics], ["format", state.formats]] as const) {
    for (const [key, cell] of Object.entries(weights)) {
      if (!cell.proposalId) continue;
      const proposal = state.proposals.find((entry) => entry.id === cell.proposalId);
      const change = proposal?.changes.find((entry) => entry.axis === axis && entry.key === key);
      if (!proposal || !change || change.after !== cell.weight || proposal.appliedAt !== cell.updatedAt) {
        context.addIssue({ code: "custom", message: "Adjusted weights must name their latest recorded proposal", path: [axis === "topic" ? "topics" : "formats", key] });
      }
    }
  }
});

export type PerformanceWeights = z.infer<typeof PerformanceWeightsSchema>;
export type PerformanceWeightProposal = z.infer<typeof PerformanceWeightProposalSchema>;
export type PerformanceAxis = z.infer<typeof AxisSchema>;

export interface PerformanceResultEvidence {
  resultId: string;
  topics: readonly string[];
  formats: readonly string[];
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** ISO week is part of proposal identity, so two desk runs cannot invent two weekly updates. */
export function performanceIsoWeek(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error("Performance proposal requires a valid date.");
  const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function proposalProjection(
  proposal: PerformanceWeights["proposals"][number],
  ventureId: string
): PerformanceWeightProposal {
  return {
    schemaVersion: "performance-weight-proposal/1",
    id: proposal.id,
    ventureId,
    week: proposal.week,
    proposedAt: proposal.proposedAt,
    changes: proposal.changes.map((change) => ({
      axis: change.axis,
      key: change.key,
      weight: change.after,
      resultIds: change.resultIds,
      reason: change.reason
    }))
  };
}

export function applyPerformanceWeightProposal(input: {
  state: unknown;
  proposal: unknown;
  evidence: readonly PerformanceResultEvidence[];
  now: Date;
}): { state: PerformanceWeights; idempotent: boolean } {
  const state = PerformanceWeightsSchema.parse(input.state);
  const parsedProposal = PerformanceWeightProposalSchema.parse(input.proposal);
  const proposal: PerformanceWeightProposal = {
    ...parsedProposal,
    changes: parsedProposal.changes.map((change) => ({
      ...change,
      resultIds: [...change.resultIds].sort()
    }))
  };
  if (proposal.ventureId !== state.ventureId) throw new Error("Performance proposal venture does not match its state.");
  if (performanceIsoWeek(new Date(proposal.proposedAt)) !== proposal.week) {
    throw new Error("Performance proposal week must match proposedAt.");
  }
  if (Number.isNaN(input.now.getTime()) || input.now.getTime() < Date.parse(proposal.proposedAt)) {
    throw new Error("Performance proposal cannot apply before it is proposed.");
  }
  const prior = state.proposals.find((entry) => entry.id === proposal.id);
  if (prior) {
    const projected = proposalProjection(prior, state.ventureId);
    if (JSON.stringify(projected) !== JSON.stringify(proposal)) {
      throw new Error("A different performance proposal already uses that id.");
    }
    return { state, idempotent: true };
  }
  if (state.proposals.some((entry) => entry.week === proposal.week)) {
    throw new Error("A performance proposal has already been applied for that week.");
  }

  const evidence = new Map(input.evidence.map((entry) => [entry.resultId, entry]));
  if (evidence.size !== input.evidence.length) throw new Error("Performance evidence ids must be unique.");
  const next = structuredClone(state);
  const targets = new Set<string>();
  const appliedChanges: PerformanceWeights["proposals"][number]["changes"] = [];
  for (const change of proposal.changes) {
    const target = `${change.axis}:${change.key}`;
    if (targets.has(target)) throw new Error("A performance proposal may change each weight only once.");
    targets.add(target);
    const weights = change.axis === "topic" ? next.topics : next.formats;
    const current = weights[change.key];
    if (!current) throw new Error(`Performance proposal cannot resolve ${target}.`);
    const resultIds = [...new Set(change.resultIds)].sort();
    if (resultIds.length !== change.resultIds.length) throw new Error(`Performance proposal ${target} repeats a result citation.`);
    if (resultIds.length < next.policy.minimumSamples) {
      throw new Error(`Performance proposal ${target} needs at least ${next.policy.minimumSamples} cited results.`);
    }
    const previouslyUsed = new Set(next.proposals.flatMap((entry) => entry.changes
      .filter((priorChange) => priorChange.axis === change.axis && priorChange.key === change.key)
      .flatMap((priorChange) => priorChange.resultIds)));
    for (const resultId of resultIds) {
      if (previouslyUsed.has(resultId)) throw new Error(`Performance proposal ${target} reuses result ${resultId}.`);
      const result = evidence.get(resultId);
      if (!result) throw new Error(`Performance proposal cannot resolve result ${resultId}.`);
      const relevant = change.axis === "topic" ? result.topics : result.formats;
      if (!relevant.includes(change.key)) {
        throw new Error(`Performance result ${resultId} does not support ${target}.`);
      }
    }
    if (Math.abs(change.weight - current.weight) > next.policy.maxWeeklyDelta + 1e-9) {
      throw new Error(`Performance proposal ${target} exceeds the weekly delta bound.`);
    }
    if (change.weight === current.weight) throw new Error(`Performance proposal ${target} does not change its weight.`);
    const after = round6(change.weight);
    const appliedAt = input.now.toISOString();
    weights[change.key] = {
      weight: after,
      sampleSize: current.sampleSize + resultIds.length,
      updatedAt: appliedAt,
      proposalId: proposal.id
    };
    appliedChanges.push({
      axis: change.axis,
      key: change.key,
      before: current.weight,
      after,
      sampleSize: resultIds.length,
      resultIds,
      reason: change.reason
    });
  }
  next.revision += 1;
  next.updatedAt = input.now.toISOString();
  next.proposals.push({
    id: proposal.id,
    week: proposal.week,
    proposedAt: proposal.proposedAt,
    appliedAt: input.now.toISOString(),
    changes: appliedChanges
  });
  return { state: PerformanceWeightsSchema.parse(next), idempotent: false };
}
