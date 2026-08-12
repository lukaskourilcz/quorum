import { z } from "zod";
import {
  ContractAgentIdSchema,
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  MeetingRefSchema,
  openObject
} from "./common.js";
import {
  KvorumPackageGateEvaluationSchema,
  TribunPackageSchema
} from "./kvorum-desk.js";

export const KvorumDeskMeetingPayloadSchema = z.strictObject({
  monitorRef: z.string()
    .regex(/^state\/ventures\/kvorum\/monitor\/\d{4}-\d{2}-\d{2}\.json$/u)
    .nullable(),
  runStatus: z.enum(["packages", "quiet", "model-failed", "failed"]),
  reason: z.string().trim().min(1).max(1_000).nullable(),
  providerCallMade: z.boolean(),
  packages: z.array(TribunPackageSchema).max(2),
  droppedPackages: z.number().int().min(0).max(2),
  gateEvaluations: z.array(KvorumPackageGateEvaluationSchema).max(2)
}).superRefine((payload, context) => {
  const failed = payload.gateEvaluations.filter((evaluation) => !evaluation.passed).length;
  const passedClusters = payload.gateEvaluations
    .filter((evaluation) => evaluation.passed)
    .map((evaluation) => evaluation.clusterId)
    .sort();
  const packageClusters = payload.packages.map((candidate) => candidate.clusterId).sort();
  if (payload.droppedPackages !== failed) {
    context.addIssue({ code: "custom", message: "droppedPackages must equal failed gate evaluations", path: ["droppedPackages"] });
  }
  if (payload.packages.length + payload.droppedPackages !== payload.gateEvaluations.length && payload.gateEvaluations.length > 0) {
    context.addIssue({ code: "custom", message: "Gate evaluations must account for every accepted and dropped package", path: ["gateEvaluations"] });
  }
  if (new Set(payload.gateEvaluations.map((evaluation) => evaluation.candidateIndex)).size !== payload.gateEvaluations.length) {
    context.addIssue({ code: "custom", message: "Candidate gate indexes must be unique", path: ["gateEvaluations"] });
  }
  if (JSON.stringify(passedClusters) !== JSON.stringify(packageClusters)) {
    context.addIssue({ code: "custom", message: "Passed gate evaluations must identify the retained packages", path: ["gateEvaluations"] });
  }
  if ((payload.runStatus === "model-failed" || payload.runStatus === "failed") && payload.gateEvaluations.length > 0) {
    context.addIssue({ code: "custom", message: "A failed desk run cannot claim completed package gates", path: ["gateEvaluations"] });
  }
  if (payload.runStatus === "packages") {
    if (payload.packages.length === 0) {
      context.addIssue({ code: "custom", message: "A productive desk record requires a package", path: ["packages"] });
    }
    if (payload.reason !== null) {
      context.addIssue({ code: "custom", message: "A productive desk record cannot carry a failure reason", path: ["reason"] });
    }
    if (payload.monitorRef === null) {
      context.addIssue({ code: "custom", message: "A productive desk record requires its retained monitor digest", path: ["monitorRef"] });
    }
    return;
  }
  if (payload.packages.length > 0) {
    context.addIssue({ code: "custom", message: "A non-productive desk record cannot carry packages", path: ["packages"] });
  }
  if (payload.reason === null) {
    context.addIssue({ code: "custom", message: "Every non-productive desk record requires a reason", path: ["reason"] });
  }
  if (payload.runStatus === "quiet" && payload.monitorRef === null) {
    context.addIssue({ code: "custom", message: "A quiet desk record requires its retained monitor digest", path: ["monitorRef"] });
  }
});

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
  phase: z.enum(["founding", "am", "pm", "morning", "afternoon", "night", "cu-edition", "cu-product", "tt-marketing", "gv-brief", "ms-daily", "incubator-scan", "incubator-synthesis", "mma-intake", "mma-analysis", "mag-editorial", "mag-desk", "kv-desk", "studio"]),
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
  editorialSlateRef: MeetingRefSchema.optional(),
  agendaRef: MeetingRefSchema.optional(),
  sharperData: openObject({
    outcome: z.enum(["proposal", "nothing-new"]),
    summary: z.string().trim().min(1).max(280),
    ideaRef: z.string().trim().min(1).max(160).optional(),
    evidenceRefs: z.array(EvidenceRefSchema)
  }).optional(),
  kvorumDesk: KvorumDeskMeetingPayloadSchema.optional(),
  generatedAt: DateTimeSchema
};

const VentureMeetingSchema = openObject({
  ...CommonFields,
  kind: z.literal("venture"),
  roomTranscript: RoomTranscriptSchema(24)
});

const NamedVentureMeetingSchema = openObject({
  ...CommonFields,
  kind: z.enum(["cu-edition", "cu-product", "tt-marketing", "gv-brief", "ms-daily", "incubator-scan", "incubator-synthesis", "mma-intake", "mma-analysis", "mag-editorial", "mag-desk", "kv-desk", "studio"]),
  roomTranscript: RoomTranscriptSchema(36)
});

const QuantifiedProbabilityPattern = /(?:\b(?:probability|chance|edge|win(?:ning)?(?: chance| probability)?)\b[^.\n]{0,48}(?:\d+(?:\.\d+)?\s*%|\b0(?:\.\d+)?\b|\b1(?:\.0+)?\b)|\b\d+(?:\.\d+)?\s*%[^.\n]{0,48}\b(?:probability|chance|edge|win(?:ning)?)\b)/i;
const ModelRunEvidencePattern = /(?:^|[/:])model-runs?(?:[/:]|$)/i;

function freehandProbabilityPaths(value: unknown, path: Array<string | number> = [], inheritedModelRef = false): Array<Array<string | number>> {
  if (typeof value === "string") return QuantifiedProbabilityPattern.test(value) && !inheritedModelRef ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => freehandProbabilityPaths(entry, [...path, index], inheritedModelRef));
  if (typeof value !== "object" || value === null) return [];
  const objectValue = value as Record<string, unknown>;
  const localRefs = Array.isArray(objectValue.evidenceRefs) ? objectValue.evidenceRefs : [];
  const hasModelRef = inheritedModelRef || localRefs.some((ref) => typeof ref === "string" && ModelRunEvidencePattern.test(ref));
  return Object.entries(objectValue).flatMap(([key, entry]) => key === "evidenceRefs" ? [] : freehandProbabilityPaths(entry, [...path, key], hasModelRef));
}

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
  if (record.kind === "mma-intake" || record.kind === "mma-analysis") {
    for (const path of freehandProbabilityPaths(record)) {
      context.addIssue({ code: "custom", message: "Fight probabilities require a ModelRun evidence reference", path });
    }
  }
  if (record.kind === "mag-editorial" && turnCount > 14) {
    context.addIssue({ code: "custom", message: "Editorial room is bounded to 14 turns", path: ["transcript"] });
  }
  if (record.kind === "mag-desk" && turnCount > 12) {
    context.addIssue({ code: "custom", message: "Desk review is bounded to 12 turns", path: ["transcript"] });
  }
  if (record.kind === "kv-desk") {
    if (!record.kvorumDesk) {
      context.addIssue({ code: "custom", message: "Kvórum desk records require their typed outcome payload", path: ["kvorumDesk"] });
      return;
    }
    const expectedStatus = record.kvorumDesk.runStatus === "packages"
      ? "PLAN"
      : record.kvorumDesk.runStatus === "quiet"
        ? "NO_ACTION"
        : "FAILED";
    if (record.status !== expectedStatus) {
      context.addIssue({ code: "custom", message: `Kvórum ${record.kvorumDesk.runStatus} records require status ${expectedStatus}`, path: ["status"] });
    }
    if (record.decision.outcome !== expectedStatus) {
      context.addIssue({ code: "custom", message: `Kvórum ${record.kvorumDesk.runStatus} records require decision ${expectedStatus}`, path: ["decision", "outcome"] });
    }
    if (record.fixture && record.kvorumDesk.providerCallMade) {
      context.addIssue({ code: "custom", message: "A fixture record cannot claim a provider call", path: ["kvorumDesk", "providerCallMade"] });
    }
    if (record.kvorumDesk.monitorRef && !record.kvorumDesk.monitorRef.includes(`/${record.date}.json`)) {
      context.addIssue({ code: "custom", message: "The Kvórum monitor digest must match the meeting date", path: ["kvorumDesk", "monitorRef"] });
    }
  } else if (record.kvorumDesk) {
    context.addIssue({ code: "custom", message: "Only kv-desk records may carry a Kvórum desk payload", path: ["kvorumDesk"] });
  }
});

export type MeetingRecord = z.infer<typeof MeetingRecordSchema>;
