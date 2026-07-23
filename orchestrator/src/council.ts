import { z } from "zod";
import {
  CouncilAgentSchema,
  EvidenceRefSchema,
  StageSchema,
  TaskTypeSchema
} from "./types.js";

const MetricDeltaSchema = z.object({
  metric: z.string().min(1),
  from: z.number().finite().nullable(),
  to: z.number().finite().nullable(),
  byCycle: z.number().int().positive()
});

const SpendSchema = z.object({
  action: z.enum(["buy", "cancel"]),
  item: z.string().min(1),
  provider: z.string().min(1),
  usd: z.number().positive(),
  recurrence: z.enum(["once", "monthly"]),
  kpi: z.string().min(1),
  experimentId: z.string().min(1),
  baseline: z.number().finite(),
  expectedDelta: z.number().finite(),
  maxLossUsd: z.number().nonnegative(),
  review: z.string().regex(/^cycle \d+$/),
  stopCondition: z.string().min(1).max(160)
});

const SourceTaskSchema = z.object({
  action: z.enum(["add", "remove"]),
  kind: z.enum(["rss", "hn", "api", "authenticated_reddit"]),
  url: z.string().url(),
  why: z.string().min(1).max(160)
});

const ChannelTaskSchema = z.object({
  action: z.enum(["propose", "disable"]),
  channelId: z.string().regex(/^[a-z0-9-]+$/),
  audience: z.string().min(1),
  objective: z.string().min(1),
  nativeFormats: z.array(z.string().min(1)).min(1).max(3),
  evidenceRefs: z.array(EvidenceRefSchema).min(1),
  pilotCadence: z.string().min(1),
  successMetric: z.string().min(1),
  reviewCycle: z.number().int().positive(),
  stopCondition: z.string().min(1),
  initialMode: z.enum(["disabled", "draft"])
});

const OrgChangeSchema = z.object({
  changeId: z.string().min(1),
  targetAgent: z.string().min(1),
  tier: z.enum(["A", "B", "C"]),
  kind: z.enum([
    "description",
    "responsibility",
    "routing_tag",
    "prompt",
    "skill",
    "model",
    "status",
    "new_role"
  ]),
  diagnosis: z.string().min(1),
  evidenceRefs: z.array(EvidenceRefSchema).min(2),
  current: z.string(),
  proposed: z.string(),
  expectedMetricDelta: z.object({
    metric: z.string().min(1),
    from: z.number().finite(),
    to: z.number().finite()
  }),
  evaluationWindowCycles: z.number().int().positive(),
  tests: z.array(z.string().min(1)).min(1),
  rollbackRef: z.string().min(1),
  risk: z.enum(["low", "medium", "high"])
});

export const ProposalTaskSchema = z
  .object({
    title: z.string().min(1).max(160),
    type: TaskTypeSchema,
    effort: z.enum(["S", "M", "L"]),
    experimentId: z.string().nullable(),
    spend: SpendSchema.optional(),
    source: SourceTaskSchema.optional(),
    channel: ChannelTaskSchema.optional(),
    orgChange: OrgChangeSchema.optional()
  })
  .superRefine((task, context) => {
    const required: Record<string, keyof typeof task> = {
      spend: "spend",
      source: "source",
      channel: "channel",
      org_change: "orgChange"
    };
    const field = required[task.type];
    if (field && task[field] === undefined) {
      context.addIssue({
        code: "custom",
        message: `${task.type} task requires ${field}`
      });
    }
  });

export const ProposalSchema = z.object({
  agent: CouncilAgentSchema,
  proposal: z.string().min(1).max(420),
  why: z.string().min(1).max(300),
  stage: StageSchema,
  kpi: z.string().nullable(),
  evidenceRefs: z.array(EvidenceRefSchema),
  hypothesis: z.string().min(1).max(260),
  expectedMetricDelta: MetricDeltaSchema,
  confidence: z.number().min(0).max(1),
  reviewCycle: z.number().int().positive(),
  stopCondition: z.string().min(1).max(180),
  estimatedCostUsd: z.number().min(0),
  tasks: z.array(ProposalTaskSchema).max(2),
  risk: z.string().max(180)
});
export type Proposal = z.infer<typeof ProposalSchema>;

export const CandidateIdSchema = z.union([
  z.enum(["P1", "P2", "P3", "P4"]),
  z.literal("NO_ACTION")
]);
export type CandidateId = z.infer<typeof CandidateIdSchema>;

export const VoteSchema = z
  .object({
    agent: CouncilAgentSchema,
    ranking: z.array(CandidateIdSchema).length(5),
    veto: z
      .object({
        target: z.enum(["P1", "P2", "P3", "P4"]),
        rule: z.string().min(1),
        reason: z.string().min(1).max(180)
      })
      .nullable(),
    note: z.string().max(220)
  })
  .superRefine((vote, context) => {
    if (new Set(vote.ranking).size !== 5) {
      context.addIssue({
        code: "custom",
        message: "Ranking must contain every candidate exactly once"
      });
    }
    if (vote.agent !== "AUDIT" && vote.veto !== null) {
      context.addIssue({
        code: "custom",
        message: "Only AUDIT may veto"
      });
    }
  });
export type Vote = z.infer<typeof VoteSchema>;

export function validateProposalEvidence(
  proposal: Proposal,
  evidenceIds: ReadonlySet<string>
): string[] {
  return proposal.evidenceRefs.filter((id) => !evidenceIds.has(id));
}

