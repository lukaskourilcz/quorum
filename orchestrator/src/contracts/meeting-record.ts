import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  MeetingRefSchema,
  openObject
} from "./common.js";

const TranscriptModeSchema = z.enum([
  "gavel",
  "statement",
  "response",
  "reads-ledger",
  "raises-concern",
  "veto",
  "vote",
  "close"
]);

const RoomTurnSchema = openObject({
  agent: ContractAgentIdSchema,
  mode: TranscriptModeSchema,
  addressedTo: ContractAgentIdSchema.optional(),
  sentAt: DateTimeSchema.optional(),
  text: z.string().trim().min(1).max(800),
  evidenceRefs: z.array(EvidenceRefSchema).optional()
});

function RoomTranscriptSchema(maxTurns: 24 | 36) {
  return openObject({
    openedAt: DateTimeSchema,
    closedAt: DateTimeSchema,
    gavel: ContractAgentIdSchema,
    setting: z.string().trim().min(1).max(800),
    turns: z.array(RoomTurnSchema).min(1).max(maxTurns)
  });
}

const CommonFields = {
  schemaVersion: z.literal("meeting-record/2"),
  cycleId: z.string().trim().min(1),
  date: DateSchema,
  phase: z.enum(["founding", "am", "pm", "morning", "afternoon", "night", "cu-edition", "cu-product", "tt-marketing", "incubator-scan", "incubator-synthesis", "mma-intake", "mma-analysis"]),
  episode: openObject({
    id: z.string().trim().min(1),
    shift: z.enum(["morning", "afternoon", "night"]),
    title: z.string().trim().min(1),
    hours: z.string().trim().min(1),
    nextShift: z.enum(["morning", "afternoon", "night"]),
    handoff: z.string().trim().min(1)
  }).nullable().optional(),
  fixture: z.boolean(),
  status: z.enum([
    "INSUFFICIENT_EVIDENCE",
    "NO_ACTION",
    "PLAN",
    "PAUSED",
    "FAILED",
    "HELD",
    "NO_EDITION",
    "NEEDS_RECONCILIATION"
  ]),
  stage: z.enum(["DISCOVERY", "VALIDATION", "AUDIENCE", "MONETIZATION", "OPTIMIZATION"]),
  operatingBrief: z.string().trim().min(1),
  participantReasons: z.array(openObject({
    agent: ContractAgentIdSchema,
    reason: z.string().trim().min(1),
    participated: z.boolean()
  })),
  ledger: openObject({
    estimatedCycleUsd: z.number().finite().nonnegative(),
    actualCycleUsd: z.number().finite().nonnegative().nullable(),
    monthAllInUsd: z.number().finite().nonnegative(),
    monthCapUsd: z.number().finite().positive()
  }),
  decision: openObject({
    outcome: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    evidenceRefs: z.array(EvidenceRefSchema)
  }),
  proposals: z.array(openObject({
    agent: ContractAgentIdSchema,
    summary: z.string().trim().min(1),
    evidenceRefs: z.array(EvidenceRefSchema)
  })),
  voteMatrix: z.array(openObject({
    voter: ContractAgentIdSchema,
    firstChoice: z.string().trim().min(1),
    veto: z.boolean()
  })),
  tasks: z.array(openObject({
    id: z.string().trim().min(1),
    owner: ContractAgentIdSchema,
    summary: z.string().trim().min(1),
    status: z.enum(["planned", "done", "blocked", "skipped"])
  })),
  growthPlan: z.string().trim().min(1),
  eveningOutcome: z.string().nullable(),
  caughtUpIdeaRef: z.string().trim().min(1).optional(),
  ideaVerdicts: z.array(openObject({
    ideaId: z.string().trim().min(1),
    verdict: z.enum(["accept", "veto", "defer", "supersede"]),
    reason: z.string().trim().min(1).max(280)
  })).optional(),
  editionRef: MeetingRefSchema.optional(),
  sharperData: openObject({
    outcome: z.enum(["proposal", "nothing-new"]),
    summary: z.string().trim().min(1).max(280),
    ideaRef: z.string().trim().min(1).max(160).optional(),
    evidenceRefs: z.array(EvidenceRefSchema)
  }).optional(),
  generatedAt: DateTimeSchema
};

const VentureMeetingSchema = openObject({
  ...CommonFields,
  kind: z.literal("venture"),
  roomTranscript: RoomTranscriptSchema(24)
});

const NamedVentureMeetingSchema = openObject({
  ...CommonFields,
  kind: z.enum(["cu-edition", "cu-product", "tt-marketing", "incubator-scan", "incubator-synthesis", "mma-intake", "mma-analysis"]),
  roomTranscript: RoomTranscriptSchema(36)
});

export const MeetingRecordSchema = z.union([VentureMeetingSchema, NamedVentureMeetingSchema]).superRefine((record, context) => {
  const turnCount = record.roomTranscript.turns.length;
  if (record.kind === "incubator-scan" && turnCount > 12) {
    context.addIssue({ code: "custom", message: "Incubator scan is capped at 12 turns", path: ["roomTranscript", "turns"] });
  }
  if (record.kind === "incubator-synthesis" && turnCount > 18) {
    context.addIssue({ code: "custom", message: "Incubator synthesis is capped at 18 turns", path: ["roomTranscript", "turns"] });
  }
  if ((record.kind === "mma-intake" || record.kind === "mma-analysis") && turnCount > 16) {
    context.addIssue({ code: "custom", message: "MMA rooms are capped at 16 turns", path: ["roomTranscript", "turns"] });
  }
  if ((record.kind === "mma-intake" || record.kind === "mma-analysis") && !record.sharperData) {
    context.addIssue({ code: "custom", message: "MMA rooms must close with a sharper-data outcome", path: ["sharperData"] });
  }
});

export type MeetingRecord = z.infer<typeof MeetingRecordSchema>;
