import { z } from "zod";
import { ContractAgentIdSchema, DateTimeSchema, VentureIdSchema } from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100);
const WeightSchema = z.number().min(0).max(10);
const ProposalIdSchema = z.string().regex(/^weights-[a-f0-9]{20}$/);
const ResultIdSchema = z.string().regex(/^result-[a-f0-9]{20}$/);

export const PerformanceWeightsSchema = z.strictObject({
  schemaVersion: z.literal("performance-weights/1"),
  ventureId: VentureIdSchema,
  floor: z.number().min(0).max(1),
  ceiling: z.number().min(1).max(10),
  lanes: z.record(SlugSchema, z.record(SlugSchema, z.record(SlugSchema, WeightSchema))),
  appliedProposalIds: z.array(ProposalIdSchema).max(500),
  updatedAt: DateTimeSchema
}).superRefine((weights, context) => {
  if (weights.floor > weights.ceiling) {
    context.addIssue({ code: "custom", message: "The performance floor cannot exceed its ceiling", path: ["floor"] });
  }
  if (new Set(weights.appliedProposalIds).size !== weights.appliedProposalIds.length) {
    context.addIssue({ code: "custom", message: "Applied proposal ids must be unique", path: ["appliedProposalIds"] });
  }
  for (const [lane, dimensions] of Object.entries(weights.lanes)) {
    for (const [dimension, entries] of Object.entries(dimensions)) {
      for (const [key, value] of Object.entries(entries)) {
        if (value < weights.floor || value > weights.ceiling) {
          context.addIssue({ code: "custom", message: "Every performance weight must stay inside the recorded floor and ceiling", path: ["lanes", lane, dimension, key] });
        }
      }
    }
  }
});

export const PerformanceWeightProposalSchema = z.strictObject({
  schemaVersion: z.literal("performance-weight-proposal/1"),
  proposalId: ProposalIdSchema,
  ventureId: VentureIdSchema,
  recordedBy: ContractAgentIdSchema,
  createdAt: DateTimeSchema,
  appliedAt: DateTimeSchema,
  adjustments: z.array(z.strictObject({
    lane: SlugSchema,
    dimension: SlugSchema,
    key: SlugSchema,
    from: WeightSchema,
    to: WeightSchema,
    resultIds: z.array(ResultIdSchema).min(1).max(20),
    rationale: z.string().trim().min(8).max(500)
  })).min(1).max(50)
}).superRefine((proposal, context) => {
  if (Date.parse(proposal.createdAt) > Date.parse(proposal.appliedAt)) {
    context.addIssue({ code: "custom", message: "A proposal cannot be applied before it was created", path: ["appliedAt"] });
  }
  const targets = proposal.adjustments.map(({ lane, dimension, key }) => `${lane}\0${dimension}\0${key}`);
  if (new Set(targets).size !== targets.length) {
    context.addIssue({ code: "custom", message: "A proposal may adjust each lane dimension key once", path: ["adjustments"] });
  }
  proposal.adjustments.forEach((adjustment, index) => {
    if (adjustment.from === adjustment.to) {
      context.addIssue({ code: "custom", message: "A recorded adjustment must change its weight", path: ["adjustments", index, "to"] });
    }
    if (new Set(adjustment.resultIds).size !== adjustment.resultIds.length) {
      context.addIssue({ code: "custom", message: "An adjustment's result citations must be unique", path: ["adjustments", index, "resultIds"] });
    }
  });
});

export type PerformanceWeights = z.infer<typeof PerformanceWeightsSchema>;
export type PerformanceWeightProposal = z.infer<typeof PerformanceWeightProposalSchema>;
