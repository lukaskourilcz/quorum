import { z } from "zod";
import {
  FoundingAgentSchema,
  PhaseSchema,
  ShiftPhaseSchema
} from "../types.js";

export const StandupParticipantSchema = z.object({
  agent: FoundingAgentSchema,
  reason: z.string().min(1),
  participated: z.boolean()
});

export const StandupSchema = z.object({
  schemaVersion: z.literal(1),
  cycleId: z.string().min(1),
  date: z.string().date(),
  phase: PhaseSchema,
  episode: z
    .object({
      id: z.string().min(1),
      shift: ShiftPhaseSchema,
      title: z.string().min(1),
      hours: z.string().min(1),
      nextShift: ShiftPhaseSchema,
      handoff: z.string().min(1)
    })
    .nullable()
    .optional(),
  fixture: z.boolean(),
  status: z.enum([
    "INSUFFICIENT_EVIDENCE",
    "NO_ACTION",
    "PLAN",
    "PAUSED",
    "FAILED"
  ]),
  stage: z.enum([
    "DISCOVERY",
    "VALIDATION",
    "AUDIENCE",
    "MONETIZATION",
    "OPTIMIZATION"
  ]),
  operatingBrief: z.string().min(1),
  participantReasons: z.array(StandupParticipantSchema),
  ledger: z.object({
    estimatedCycleUsd: z.number().nonnegative(),
    actualCycleUsd: z.number().nonnegative().nullable(),
    monthAllInUsd: z.number().nonnegative(),
    monthCapUsd: z.number().positive()
  }),
  decision: z.object({
    outcome: z.string().min(1),
    summary: z.string().min(1),
    evidenceRefs: z.array(z.string())
  }),
  proposals: z.array(
    z.object({
      agent: FoundingAgentSchema,
      summary: z.string().min(1),
      evidenceRefs: z.array(z.string())
    })
  ),
  voteMatrix: z.array(
    z.object({
      voter: FoundingAgentSchema,
      firstChoice: z.string().min(1),
      veto: z.boolean()
    })
  ),
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      owner: FoundingAgentSchema,
      summary: z.string().min(1),
      status: z.enum(["planned", "done", "blocked", "skipped"])
    })
  ),
  growthPlan: z.string().min(1),
  eveningOutcome: z.string().nullable(),
  generatedAt: z.string().datetime()
});
export type Standup = z.infer<typeof StandupSchema>;
