import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, Sha256Schema } from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80);
const OptionalUrlSchema = z.string().url().max(500).nullable();

const PersonalGrowthLaneSchema = z.enum(["okraj", "bbarak"]);
const PersonalGrowthLaneConfigSchema = z.strictObject({
  lane: PersonalGrowthLaneSchema,
  intervalDays: z.number().int().positive().max(30),
  recurrenceAnchorDate: DateSchema,
  ownerAuthorshipRequired: z.literal(true),
  collaboratorId: SlugSchema,
  publicationId: SlugSchema,
  anchorIds: z.array(SlugSchema).min(1).max(12),
  initialSubjectId: SlugSchema.nullable(),
  targetSlides: z.number().int().min(1).max(20).nullable(),
  format: z.enum(["life-story-carousel", "hip-hop-article"]),
  defaultStatus: z.enum(["planned", "held"]),
  finalUrl: OptionalUrlSchema,
  articleUrl: OptionalUrlSchema,
  collaborationUrl: OptionalUrlSchema
}).superRefine((lane, context) => {
  if (lane.lane === "okraj") {
    if (lane.intervalDays !== 10 || lane.format !== "life-story-carousel" || lane.targetSlides !== 10 || lane.initialSubjectId !== "sandra" || lane.collaboratorId !== "okraj") {
      context.addIssue({ code: "custom", message: "OKRAJ must keep its authorized 10-day, 10-slide Sandra launch shape" });
    }
    if (lane.articleUrl !== null || lane.collaborationUrl !== null) {
      context.addIssue({ code: "custom", message: "OKRAJ uses only its final URL" });
    }
  } else {
    if (lane.intervalDays !== 3 || lane.format !== "hip-hop-article" || lane.targetSlides !== null || lane.initialSubjectId !== null || lane.collaboratorId !== "bbarak" || lane.publicationId !== "bbarak") {
      context.addIssue({ code: "custom", message: "BBARAK must keep its authorized three-day article shape" });
    }
    if (lane.finalUrl !== null) {
      context.addIssue({ code: "custom", message: "BBARAK uses article and optional collaboration URLs" });
    }
  }
});

export const PersonalGrowthPlannerConfigSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-planner-config/1"),
  ventureId: z.literal("personal-growth"),
  timezone: z.literal("Europe/Prague"),
  room: z.strictObject({
    kind: z.literal("pg-desk"),
    label: z.literal("Lukáš personal growth desk"),
    cadence: z.literal("daily@23:00"),
    target: z.literal("next-prague-calendar-date")
  }),
  planningWindowDays: z.literal(30),
  strategicRhythmDays: z.literal(10),
  runBudget: z.strictObject({
    ordinaryMainSyntheses: z.literal(1),
    deterministicValidations: z.literal(1),
    maximumRepairs: z.literal(1),
    approximateUsd: z.literal(0.12),
    hardMaximumUsd: z.literal(0.15),
    dryUsd: z.literal(0)
  }),
  lanes: z.array(PersonalGrowthLaneConfigSchema).length(2)
}).superRefine((config, context) => {
  const ids = config.lanes.map(({ lane }) => lane);
  if (new Set(ids).size !== 2 || !ids.includes("okraj") || !ids.includes("bbarak")) {
    context.addIssue({ code: "custom", message: "Exactly one OKRAJ and one BBARAK lane are required", path: ["lanes"] });
  }
});

export const PersonalGrowthHistoryEventSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-history-event/1"),
  eventId: z.string().regex(/^pg-event-[a-f0-9]{16}$/u),
  lane: PersonalGrowthLaneSchema,
  occurrenceDate: DateSchema,
  action: z.enum(["completed", "skipped", "rescheduled"]),
  recordedAt: DateTimeSchema,
  rescheduledTo: DateSchema.nullable(),
  finalUrl: OptionalUrlSchema,
  articleUrl: OptionalUrlSchema,
  collaborationUrl: OptionalUrlSchema
}).superRefine((event, context) => {
  if ((event.action === "rescheduled") !== (event.rescheduledTo !== null)) {
    context.addIssue({ code: "custom", message: "Only a reschedule carries its replacement date", path: ["rescheduledTo"] });
  }
});

export const PersonalGrowthPlannedOccurrenceSchema = z.strictObject({
  occurrenceId: z.string().regex(/^pg-(?:okraj|bbarak)-\d{4}-\d{2}-\d{2}$/u),
  lane: PersonalGrowthLaneSchema,
  originalDate: DateSchema,
  scheduledDate: DateSchema,
  status: z.enum(["due", "upcoming", "overdue", "completed", "skipped", "rescheduled"]),
  source: z.enum(["recurrence", "reschedule"]),
  finalUrl: OptionalUrlSchema,
  articleUrl: OptionalUrlSchema,
  collaborationUrl: OptionalUrlSchema
});

export const PersonalGrowthRollingPlanSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-rolling-plan/1"),
  targetPragueDate: DateSchema,
  rangeStart: DateSchema,
  rangeEnd: DateSchema,
  strategicCycleStart: DateSchema,
  inputHash: Sha256Schema,
  occurrences: z.array(PersonalGrowthPlannedOccurrenceSchema).max(40),
  warnings: z.array(z.enum(["collision", "overdue", "overpromotion"])),
  history: z.array(PersonalGrowthHistoryEventSchema).max(500)
});

const AvailabilitySchema = z.enum(["available", "unavailable", "held", "not-needed"]);

export const PersonalGrowthDailyBriefSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-daily-brief/1"),
  targetPragueDate: DateSchema,
  generatedAt: DateTimeSchema,
  room: z.strictObject({
    kind: z.literal("pg-desk"),
    result: z.enum(["planned", "quiet", "not-needed", "held", "failed", "unavailable"])
  }),
  inputHash: Sha256Schema,
  authority: z.strictObject({
    publishingAuthorized: z.literal(false),
    ownerWritesAllContent: z.literal(true)
  }),
  budget: z.strictObject({
    dry: z.boolean(),
    mainSyntheses: z.number().int().min(0).max(1),
    deterministicValidations: z.literal(1),
    repairs: z.number().int().min(0).max(1),
    estimatedUsd: z.number().finite().min(0).max(0.15),
    hardMaximumUsd: z.literal(0.15)
  }),
  timelines: z.array(PersonalGrowthPlannedOccurrenceSchema).max(12),
  deadlines: z.array(DateSchema).max(12),
  primaryAction: z.strictObject({
    occurrenceId: z.string().regex(/^pg-(?:okraj|bbarak)-\d{4}-\d{2}-\d{2}$/u).nullable(),
    decision: z.enum(["ACTION", "NO_ACTION"]),
    noActionReason: z.enum(["none-due", "held", "unavailable"]).nullable()
  }),
  platformPlaceholders: z.strictObject({
    threads: z.enum(["NO_POST", "owner-only-draft-placeholder"]),
    instagram: z.enum(["NO_POST", "owner-only-draft-placeholder"]),
    reel: z.enum(["NO_POST", "owner-only-draft-placeholder"]),
    noPostReason: z.enum(["publishing-not-authorized", "none-due", "owner-only"])
  }),
  optionalInputs: z.strictObject({
    goviral: AvailabilitySchema,
    ownerManualReference: AvailabilitySchema
  }),
  contentMix: z.strictObject({
    okrajDue: z.number().int().nonnegative(),
    bbarakDue: z.number().int().nonnegative(),
    collision: z.boolean(),
    overpromotion: z.boolean()
  }),
  experiment: z.strictObject({ id: z.null(), status: z.literal("placeholder") }),
  kpi: z.strictObject({ id: z.null(), status: z.literal("placeholder") }),
  warnings: z.array(z.enum(["collision", "overdue", "overpromotion", "optional-input-unavailable"])),
  unavailable: z.array(z.enum(["goviral", "owner-manual-reference", "english-journal"])),
  ownerOnlyActions: z.array(z.enum(["write", "edit", "approve", "publish", "record-outcome"])),
  correction: z.strictObject({ revision: z.number().int().nonnegative(), correctedAt: DateTimeSchema.nullable() })
}).superRefine((brief, context) => {
  if (brief.budget.dry && (brief.budget.mainSyntheses !== 0 || brief.budget.repairs !== 0 || brief.budget.estimatedUsd !== 0)) {
    context.addIssue({ code: "custom", message: "A dry Personal Growth brief must cost exactly zero", path: ["budget"] });
  }
  if ((brief.primaryAction.decision === "NO_ACTION") !== (brief.primaryAction.occurrenceId === null)) {
    context.addIssue({ code: "custom", message: "NO_ACTION must not identify an occurrence", path: ["primaryAction"] });
  }
  if ((brief.primaryAction.decision === "NO_ACTION") !== (brief.primaryAction.noActionReason !== null)) {
    context.addIssue({ code: "custom", message: "Only NO_ACTION requires a reason", path: ["primaryAction", "noActionReason"] });
  }
});

const PersonalTopicSchema = z.enum([
  "owner-writing",
  "building-in-public",
  "ai-tools",
  "solo-founder",
  "hip-hop-culture",
  "life-stories"
]);

export const PersonalGrowthGoViralOpportunitySchema = z.strictObject({
  opportunityId: z.string().regex(/^pg-gv-[a-f0-9]{16}$/u),
  topic: PersonalTopicSchema,
  disposition: z.enum(["use", "watch", "ignore"]),
  evidenceStatus: z.enum(["verified", "corroborated"]),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8),
  sourceRefs: z.array(EvidenceRefSchema).min(1).max(8),
  velocity: z.number().finite().min(-100).max(100).nullable(),
  relevance: z.number().finite().min(0).max(1),
  pillar: z.enum(["craft", "career", "culture", "business", "personal"]),
  expiresAt: DateTimeSchema,
  format: z.enum(["threads", "instagram-carousel", "reel", "article"]),
  fit: z.enum(["strong", "possible", "weak"]),
  risk: z.enum(["low", "medium", "high"]),
  overload: z.enum(["clear", "collision", "skip"]),
  status: z.enum(["available", "accepted", "expired", "rejected"]),
  outcome: z.enum(["unused", "used", "rejected", "ignored", "posted"])
});

export const PersonalGrowthGoViralPacketSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-goviral-packet/1"),
  packetId: z.string().regex(/^pg-goviral-\d{4}-\d{2}-\d{2}$/u),
  weekOf: DateSchema,
  generatedAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  inputHash: Sha256Schema,
  goviralBriefId: z.string().trim().min(1).max(120),
  goviralBriefHash: Sha256Schema,
  sourceRegistryRef: z.literal("config/goviral-sources.json"),
  profileRef: z.literal("state/ventures/goviral/profile.md"),
  sourceHealth: z.enum(["healthy", "degraded", "unavailable"]),
  quota: z.enum(["available", "constrained", "exhausted", "unknown"]),
  retrieval: z.strictObject({
    threadsKeywordMode: z.enum(["official-future-seam", "bounded-public-actor", "unavailable"]),
    accountCredentialsUsed: z.literal(false),
    apifyUpgradeRequired: z.literal(false)
  }),
  reusedWeeklyBrief: z.literal(true),
  providerRerun: z.literal(false),
  incrementalCostUsd: z.literal(0),
  opportunities: z.array(PersonalGrowthGoViralOpportunitySchema).max(3),
  agenda: z.strictObject({
    weekKey: z.string().regex(/^\d{4}-W\d{2}$/u),
    status: z.enum(["created", "reused", "not-needed", "unavailable"]),
    agendaRef: EvidenceRefSchema.nullable()
  })
}).superRefine((packet, context) => {
  if (Date.parse(packet.expiresAt) <= Date.parse(packet.generatedAt)) {
    context.addIssue({ code: "custom", message: "Personal intelligence must expire after generation", path: ["expiresAt"] });
  }
  const ids = packet.opportunities.map(({ opportunityId }) => opportunityId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Opportunity ids must be unique", path: ["opportunities"] });
  }
});

export const PersonalGrowthGoViralFeedbackSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-goviral-feedback/1"),
  packetId: z.string().regex(/^pg-goviral-\d{4}-\d{2}-\d{2}$/u),
  opportunityId: z.string().regex(/^pg-gv-[a-f0-9]{16}$/u),
  outcome: z.enum(["used", "rejected", "ignored", "posted"]),
  recordedAt: DateTimeSchema,
  sourcePacketHash: Sha256Schema
});

export const PersonalGrowthJournalMetadataSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-journal-metadata/1"),
  language: z.enum(["cs", "en"]),
  sourceHash: Sha256Schema,
  titleHash: Sha256Schema,
  versionId: z.string().regex(/^pg-journal-(?:cs|en)-[a-f0-9]{16}$/u),
  status: z.enum(["current", "superseded"]),
  generatedAt: DateTimeSchema,
  chunkCount: z.number().int().positive(),
  retrievalAvailable: z.boolean(),
  style: z.strictObject({
    sampledSentences: z.number().int().positive(),
    meanWordsPerSentence: z.number().finite().positive(),
    medianWordsPerSentence: z.number().finite().positive(),
    fragmentRatio: z.number().finite().min(0).max(1),
    oneSentenceParagraphRatio: z.number().finite().min(0).max(1),
    punctuationDensity: z.number().finite().min(0).max(1)
  }),
  cost: z.strictObject({
    actualUsd: z.number().finite().nonnegative().max(20),
    monthlyCapUsd: z.literal(20),
    degradation: z.enum(["healthy", "reduced", "low", "critical", "exhausted"])
  })
});

export const PersonalGrowthLeakAuditSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-leak-audit/1"),
  status: z.enum(["pass", "blocked"]),
  exactLongNgram: z.boolean(),
  similarity: z.number().finite().min(0).max(1),
  quoteCharacters: z.number().int().nonnegative(),
  serializedPrivateField: z.boolean(),
  safeToPersistPublicly: z.boolean()
}).superRefine((audit, context) => {
  if ((audit.status === "pass") !== audit.safeToPersistPublicly) {
    context.addIssue({ code: "custom", message: "Leak-audit status must match its persistence verdict", path: ["status"] });
  }
  if (audit.safeToPersistPublicly && (audit.exactLongNgram || audit.serializedPrivateField)) {
    context.addIssue({ code: "custom", message: "A leak finding cannot be marked safe", path: ["safeToPersistPublicly"] });
  }
});

export type PersonalGrowthPlannerConfig = z.infer<typeof PersonalGrowthPlannerConfigSchema>;
export type PersonalGrowthHistoryEvent = z.infer<typeof PersonalGrowthHistoryEventSchema>;
export type PersonalGrowthRollingPlan = z.infer<typeof PersonalGrowthRollingPlanSchema>;
export type PersonalGrowthDailyBrief = z.infer<typeof PersonalGrowthDailyBriefSchema>;
export type PersonalGrowthGoViralPacket = z.infer<typeof PersonalGrowthGoViralPacketSchema>;
export type PersonalGrowthGoViralOpportunity = z.infer<typeof PersonalGrowthGoViralOpportunitySchema>;
export type PersonalGrowthJournalMetadata = z.infer<typeof PersonalGrowthJournalMetadataSchema>;
export type PersonalGrowthLeakAudit = z.infer<typeof PersonalGrowthLeakAuditSchema>;
