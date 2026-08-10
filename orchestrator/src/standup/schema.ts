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

const RoomTurnSchema = z.object({
  agent: FoundingAgentSchema,
  mode: z.enum([
    "gavel",
    "statement",
    "response",
    "reads-ledger",
    "raises-concern",
    "veto",
    "vote",
    "close"
  ]),
  addressedTo: FoundingAgentSchema.optional(),
  sentAt: z.string().datetime().optional(),
  text: z.string().min(1).max(800),
  evidenceRefs: z.array(z.string().min(1).max(120)).optional()
});

const RoomTranscriptSchema = z.object({
  openedAt: z.string().datetime(),
  closedAt: z.string().datetime(),
  gavel: FoundingAgentSchema,
  setting: z.string().min(1).max(800),
  turns: z.array(RoomTurnSchema).min(1).max(24)
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
  operatingSignals: z.object({
    snapshotRef: z.string().min(1),
    growth: z.array(z.object({
      venture: z.string().min(1),
      objective: z.string().min(1),
      signals: z.array(z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        value: z.number().nonnegative(),
        unit: z.enum(["count", "ratio"]),
        detail: z.string().min(1)
      }))
    })),
    quality: z.object({
      killedSlotReasons: z.record(z.string(), z.number().int().nonnegative()),
      vetoRate: z.number().min(0).max(1),
      firstPassRate: z.number().min(0).max(1),
      retryRate: z.number().min(0).max(1),
      sourceAgreementRate: z.number().min(0).max(1),
      verifierPassRate: z.number().min(0).max(1)
    })
  }).optional(),
  /**
   * The one question a seat asked to add to the priority queue this meeting, and what became of
   * it. Present only when a seat actually proposed something — a meeting where nobody proposed
   * records nothing rather than a daily line saying so. A refused proposal is recorded as
   * faithfully as an accepted one; a board that only publishes its wins is not a record.
   */
  priorityProposal: z.object({
    proposedBy: FoundingAgentSchema,
    venture: z.string().min(1).max(80),
    question: z.string().min(1).max(280),
    decisionAtStake: z.string().min(1).max(280),
    outcome: z.enum(["accepted", "refused"]),
    reason: z.string().min(1).max(280),
    priorityItemId: z.string().min(1).nullable()
  }).optional(),
  /**
   * The daily operations review: what the board said about each venture, and what it asked for.
   *
   * Present on a morning that ran the review, absent everywhere else. `NO_ACTION` with no fix
   * tasks is the correct shape for a green day — an empty `fixTasks` is a result, not a gap.
   */
  operationsReview: z.object({
    reviewDate: z.string().date(),
    perVentureVerdicts: z.array(z.object({
      ventureId: z.string().min(1).max(80),
      verdict: z.enum(["on-track", "needs-attention", "stalled"]),
      evidence: z.string().min(1).max(240)
    })).max(12),
    fixTasks: z.array(z.object({
      proposedBy: FoundingAgentSchema,
      title: z.string().min(1).max(160),
      scope: z.string().min(1).max(200),
      expectedProof: z.string().min(1).max(240)
    })).max(3),
    growthIdeas: z.array(z.object({
      proposedBy: FoundingAgentSchema,
      ventureId: z.string().min(1).max(80),
      title: z.string().min(1).max(80),
      summary: z.string().min(1).max(280),
      /** The ledger entry the idea landed as, or why it did not. */
      outcome: z.enum(["recorded", "duplicate", "refused"]),
      ideaId: z.string().min(1).nullable(),
      reason: z.string().min(1).max(280)
    })).max(2),
    meetings: z.object({
      scheduled: z.number().int().nonnegative(),
      held: z.number().int().nonnegative(),
      skipped: z.array(z.object({
        phase: z.string().min(1).max(80),
        reason: z.string().min(1).max(280)
      })).max(40),
      /** Slots that neither met nor wrote a skip record. A silent absence is itself a finding. */
      unaccounted: z.array(z.string().min(1).max(80)).max(40)
    }),
    /** The dated decision file the fix tasks were written to, when there were any. */
    decisionFileRef: z.string().min(1).max(160).nullable()
  }).optional(),
  /**
   * Seats that could not be read on either attempt, and optional fields a seated position lost.
   *
   * A council that lost two of four voices leaves no trace in a console line nobody reads, and
   * explaining what did not happen is this board's job. Absent on a meeting that lost nothing,
   * so a clean day records nothing rather than an empty ceremony.
   */
  droppedSeats: z.array(z.object({
    agent: FoundingAgentSchema,
    reason: z.string().min(1).max(280)
  })).max(4).optional(),
  droppedRequests: z.array(z.object({
    agent: FoundingAgentSchema,
    field: z.enum(["meetingRequest", "priorityProposal", "operations"]),
    reason: z.string().min(1).max(280)
  })).max(24).optional(),
  starvationReview: z.array(z.object({
    ventureId: z.string().min(1),
    outcome: z.enum(["commissioned", "why-not"]),
    reason: z.string().min(1).max(280),
    priorityItemId: z.string().min(1).nullable()
  })).optional(),
  quarterlyKpis: z.object({
    snapshotRef: z.literal("state/kpis/latest.json"),
    quarterId: z.string().regex(/^\d{4}-Q[1-4]$/),
    onTrack: z.number().int().nonnegative(),
    atRisk: z.number().int().nonnegative(),
    offTrack: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    criticalMisses: z.array(z.string().min(1).max(120))
  }).optional(),
  eveningOutcome: z.string().nullable(),
  caughtUpIdeaRef: z.string().min(1).optional(),
  /**
   * Which venture's ledger the morning's idea went into.
   *
   * The field beside it is still called `caughtUpIdeaRef` because that is what every reader on the
   * public site already looks for, but the ideation rotates now and the idea is as likely to be
   * FightAIQ's as Caught Up's. The Caught Up product room reads this before picking the idea up,
   * so it never adopts one raised for another venture.
   */
  morningIdeaNamespace: z.string().min(1).max(80).optional(),
  roomTranscript: RoomTranscriptSchema,
  generatedAt: z.string().datetime()
});
export type Standup = z.infer<typeof StandupSchema>;
