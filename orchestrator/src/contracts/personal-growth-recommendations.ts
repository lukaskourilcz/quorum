import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema, VentureIdSchema } from "./common.js";
import { PersonalGrowthLeakAuditSchema } from "./personal-growth.js";

export const PersonalGrowthLanguageSchema = z.enum(["cs", "en"]);
export const PersonalGrowthPillarSchema = z.enum([
  "life-lifestyle",
  "writing-publishing",
  "hip-hop",
  "rapovej-denik",
  "travel-places-lived",
  "prague",
  "software-products",
  "boardlessai-behind-scenes",
  "fitness-discipline-muay-thai",
  "books-reading",
  "clothing-personal-style"
]);

export const PersonalGrowthSourceLaneSchema = z.enum([
  "owner-idea",
  "current-life-note",
  "private-journal-style",
  "owner-publication-metadata",
  "hip-hop-note",
  "building-note",
  "goviral-intelligence"
]);

const PolicyRevisionSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  effectiveFrom: DateSchema,
  personalFeedMinimum: z.number().finite().min(0).max(1),
  ventureLedMaximum: z.number().finite().min(0).max(1),
  ventureStoriesPerSevenDaysMaximum: z.number().int().min(0).max(365),
  sameVentureCooldownDays: z.number().int().min(0).max(365),
  looseningDecisionRef: EvidenceRefSchema.nullable()
}).superRefine((revision, context) => {
  if (Number((revision.personalFeedMinimum + revision.ventureLedMaximum).toFixed(8)) !== 1) {
    context.addIssue({ code: "custom", message: "Personal and venture-led feed shares must total one" });
  }
  if (revision.revision === 0 && revision.looseningDecisionRef !== null) {
    context.addIssue({ code: "custom", path: ["looseningDecisionRef"], message: "The founding policy has no loosening decision" });
  }
});

export const PersonalGrowthContentPolicySchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-content-policy/1"),
  ventureId: z.literal("personal-growth"),
  currentRevision: z.number().int().nonnegative(),
  revisions: z.array(PolicyRevisionSchema).min(1).max(100),
  ownerManualReferenceRequired: z.literal(true),
  ownerCommentaryRequired: z.literal(true),
  automaticVentureDiscovery: z.literal(false),
  automaticVentureNomination: z.literal(false),
  automaticReshare: z.literal(false),
  ventureOnlyFeedPublishing: z.literal(false),
  kvorumEligible: z.literal(false),
  mmaFilesDefaultEligible: z.literal(false)
}).superRefine((policy, context) => {
  const revisions = policy.revisions.map(({ revision }) => revision);
  if (new Set(revisions).size !== revisions.length || revisions.at(-1) !== policy.currentRevision) {
    context.addIssue({ code: "custom", path: ["revisions"], message: "Policy revisions must be unique and end at currentRevision" });
  }
  const founding = policy.revisions[0];
  if (!founding || founding.revision !== 0 || founding.personalFeedMinimum !== 0.85 || founding.ventureLedMaximum !== 0.15
      || founding.ventureStoriesPerSevenDaysMaximum !== 2 || founding.sameVentureCooldownDays !== 10) {
    context.addIssue({ code: "custom", path: ["revisions", 0], message: "The founding 85/15 policy and reshare caps must be preserved" });
  }
  policy.revisions.slice(1).forEach((revision, index) => {
    const prior = policy.revisions[index]!;
    if (revision.revision !== prior.revision + 1 || revision.effectiveFrom < prior.effectiveFrom) {
      context.addIssue({ code: "custom", path: ["revisions", index + 1], message: "Policy revisions must be sequential and chronological" });
    }
    const looser = revision.personalFeedMinimum < prior.personalFeedMinimum
      || revision.ventureLedMaximum > prior.ventureLedMaximum
      || revision.ventureStoriesPerSevenDaysMaximum > prior.ventureStoriesPerSevenDaysMaximum
      || revision.sameVentureCooldownDays < prior.sameVentureCooldownDays;
    if (looser && revision.looseningDecisionRef === null) {
      context.addIssue({ code: "custom", path: ["revisions", index + 1, "looseningDecisionRef"], message: "A looser policy revision requires an owner decision" });
    }
  });
});

const PillarConfigSchema = z.strictObject({
  pillar: PersonalGrowthPillarSchema,
  status: z.enum(["enabled", "paused"]),
  weight: z.number().finite().min(0).max(1),
  vetoes: z.array(z.string().trim().min(1).max(120)).max(20)
});

export const PersonalGrowthContentConfigSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-content-config/1"),
  ventureId: z.literal("personal-growth"),
  defaultLanguage: z.literal("cs"),
  englishProfileAvailable: z.boolean(),
  baseline: z.strictObject({
    startsOn: DateSchema,
    days: z.literal(28)
  }),
  threads: z.strictObject({
    characterLimit: z.number().int().min(1).max(10_000),
    maximumTopicTags: z.literal(1),
    recentSimilarityMaximum: z.number().finite().min(0).max(1),
    maximumAlternatives: z.literal(2),
    maximumConversationOpportunities: z.literal(3)
  }),
  policy: PersonalGrowthContentPolicySchema,
  pillars: z.array(PillarConfigSchema).min(1).max(20),
  reelFormats: z.array(z.enum([
    "rapovej-moment",
    "behind-the-page",
    "life-between-projects",
    "trend-met-memory",
    "english-rapovej-denik"
  ])).length(5)
}).superRefine((config, context) => {
  const pillars = config.pillars.map(({ pillar }) => pillar);
  if (new Set(pillars).size !== pillars.length) {
    context.addIssue({ code: "custom", path: ["pillars"], message: "Pillars must be unique" });
  }
});

export const PersonalGrowthThreadsCandidateSchema = z.strictObject({
  candidateId: z.string().regex(/^pg-thread-candidate-[a-f0-9]{16}$/u),
  text: z.string().trim().min(1).max(10_000),
  language: PersonalGrowthLanguageSchema,
  topicTag: z.string().trim().regex(/^#[\p{L}\p{N}_]+$/u).max(80).nullable(),
  sourceLane: PersonalGrowthSourceLaneSchema,
  personalPillar: PersonalGrowthPillarSchema,
  provenanceRefs: z.array(EvidenceRefSchema).min(1).max(12),
  selectionReason: z.string().trim().min(1).max(360),
  conversationPurpose: z.string().trim().min(1).max(240),
  goviralSignalId: z.string().regex(/^pg-gv-[a-f0-9]{16}$/u).nullable(),
  goviralExpiresAt: DateTimeSchema.nullable(),
  assertedPersonalMemory: z.boolean(),
  ownerMemoryEvidenceRefs: z.array(EvidenceRefSchema).max(8),
  qualityFlags: z.strictObject({
    engagementBait: z.boolean(),
    manufacturedOutrage: z.boolean(),
    fakeVulnerability: z.boolean(),
    unsupportedCertainty: z.boolean()
  }),
  activeExperimentId: z.string().trim().min(1).max(120).nullable(),
  generatedVersion: z.string().trim().min(1).max(80),
  profileVersion: z.string().trim().min(1).max(120),
  ownerVetoed: z.boolean()
}).superRefine((candidate, context) => {
  if ((candidate.sourceLane === "goviral-intelligence") !== (candidate.goviralSignalId !== null)) {
    context.addIssue({ code: "custom", path: ["goviralSignalId"], message: "Only a GoVIRAL lane may carry a GoVIRAL signal" });
  }
  if ((candidate.goviralSignalId !== null) !== (candidate.goviralExpiresAt !== null)) {
    context.addIssue({ code: "custom", path: ["goviralExpiresAt"], message: "A GoVIRAL signal requires its expiry" });
  }
});

export const PersonalGrowthThreadsSuggestionSchema = z.strictObject({
  suggestionId: z.string().regex(/^pg-thread-[a-f0-9]{16}$/u),
  text: z.string().trim().min(1).max(10_000),
  language: PersonalGrowthLanguageSchema,
  characterCount: z.number().int().positive(),
  topicTag: z.string().trim().regex(/^#[\p{L}\p{N}_]+$/u).max(80).nullable(),
  sourceLane: PersonalGrowthSourceLaneSchema,
  personalPillar: PersonalGrowthPillarSchema,
  provenanceRefs: z.array(EvidenceRefSchema).min(1).max(12),
  selectionReason: z.string().trim().min(1).max(360),
  conversationPurpose: z.string().trim().min(1).max(240),
  goviralSignalId: z.string().regex(/^pg-gv-[a-f0-9]{16}$/u).nullable(),
  recentSimilarity: z.number().finite().min(0).max(1),
  similarityVerdict: z.literal("pass"),
  activeExperimentId: z.string().trim().min(1).max(120).nullable(),
  generatedVersion: z.string().trim().min(1).max(80),
  profileVersion: z.string().trim().min(1).max(120),
  leakAudit: PersonalGrowthLeakAuditSchema
}).superRefine((suggestion, context) => {
  if (suggestion.characterCount !== [...suggestion.text].length) {
    context.addIssue({ code: "custom", path: ["characterCount"], message: "Character count must match Unicode code points" });
  }
});

export const PersonalGrowthConversationOpportunitySchema = z.strictObject({
  opportunityId: z.string().regex(/^pg-conversation-[a-f0-9]{16}$/u),
  provider: z.enum(["official-threads-search", "accepted-goviral"]),
  publicUrl: HttpsUrlSchema,
  observedAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8),
  purpose: z.string().trim().min(1).max(240),
  manualReplyOnly: z.literal(true)
});

export const PersonalGrowthThreadsPacketSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-threads-recommendation/1"),
  recommendationDate: DateSchema,
  generatedAt: DateTimeSchema,
  inputHash: Sha256Schema,
  decision: z.enum(["RECOMMEND", "NO_POST", "HELD"]),
  noPostReason: z.enum(["no-useful-candidate", "english-profile-unavailable", "authority-held", "all-candidates-rejected"]).nullable(),
  primary: PersonalGrowthThreadsSuggestionSchema.nullable(),
  alternatives: z.array(PersonalGrowthThreadsSuggestionSchema).max(2),
  conversationStatus: z.enum(["available", "unavailable"]),
  conversationOpportunities: z.array(PersonalGrowthConversationOpportunitySchema).max(3),
  publishingAuthorized: z.literal(false),
  repliesAuthorized: z.literal(false),
  rejectedCounts: z.record(z.string(), z.number().int().nonnegative())
}).superRefine((packet, context) => {
  if ((packet.decision === "RECOMMEND") !== (packet.primary !== null)) {
    context.addIssue({ code: "custom", path: ["primary"], message: "Only RECOMMEND carries a primary suggestion" });
  }
  if ((packet.decision === "RECOMMEND") === (packet.noPostReason !== null)) {
    context.addIssue({ code: "custom", path: ["noPostReason"], message: "A non-recommendation requires one reason" });
  }
  if ((packet.conversationStatus === "available") !== (packet.conversationOpportunities.length > 0)) {
    context.addIssue({ code: "custom", path: ["conversationOpportunities"], message: "Conversation availability must match the bounded list" });
  }
});

export const PersonalGrowthManualVentureReferenceSchema = z.strictObject({
  schemaVersion: z.literal("owner-manual-reference/1"),
  referenceId: z.string().regex(/^pg-manual-ref-[a-f0-9]{16}$/u),
  sourceProject: VentureIdSchema,
  publicItemId: z.string().trim().min(1).max(160),
  publicUrl: HttpsUrlSchema,
  ownerAuthored: z.boolean(),
  personalConnection: z.string().trim().min(1).max(360).nullable(),
  ownerCommentaryNote: z.string().trim().min(1).max(600),
  publicationVerifiedByOwner: z.literal(true),
  ownerManuallySupplied: z.literal(true),
  personalItemsInRollingWindow: z.number().int().nonnegative(),
  ventureItemsInRollingWindow: z.number().int().nonnegative(),
  requestedAction: z.enum(["WATCH", "RESHARE_WITH_PERSONAL_NOTE", "SKIP"]),
  recordedAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
  ownerProvenanceRef: EvidenceRefSchema
}).superRefine((reference, context) => {
  if (reference.sourceProject === "kvorum") {
    context.addIssue({ code: "custom", path: ["sourceProject"], message: "Kvórum is never eligible for Personal Growth" });
  }
  if (reference.sourceProject === "mma-files" && !reference.ownerAuthored && reference.personalConnection === null) {
    context.addIssue({ code: "custom", path: ["personalConnection"], message: "MMA Files needs owner authorship or a genuine personal connection" });
  }
  if (Date.parse(reference.expiresAt) <= Date.parse(reference.recordedAt)) {
    context.addIssue({ code: "custom", path: ["expiresAt"], message: "A manual reference must expire after it is recorded" });
  }
});

export const PersonalGrowthReelSuggestionSchema = z.strictObject({
  suggestionId: z.string().regex(/^pg-reel-[a-f0-9]{16}$/u),
  series: z.enum(["rapovej-moment", "behind-the-page", "life-between-projects", "trend-met-memory", "english-rapovej-denik"]),
  concept: z.string().trim().min(1).max(600),
  purpose: z.string().trim().min(1).max(240),
  durationBandSeconds: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  assetChecklist: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
  shotChecklist: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
  language: PersonalGrowthLanguageSchema,
  subtitleLanguages: z.array(PersonalGrowthLanguageSchema).max(2),
  collaborator: z.string().trim().min(1).max(120).nullable(),
  trendExpiresAt: DateTimeSchema.nullable(),
  ownerMemoryEvidenceRefs: z.array(EvidenceRefSchema).max(8),
  considerTrialReel: z.boolean(),
  experimentId: z.string().trim().min(1).max(120).nullable()
}).superRefine((suggestion, context) => {
  if (suggestion.durationBandSeconds[1] < suggestion.durationBandSeconds[0]) {
    context.addIssue({ code: "custom", path: ["durationBandSeconds"], message: "Reel duration bounds are reversed" });
  }
  if (suggestion.series === "trend-met-memory" && (suggestion.trendExpiresAt === null || suggestion.ownerMemoryEvidenceRefs.length === 0)) {
    context.addIssue({ code: "custom", path: ["ownerMemoryEvidenceRefs"], message: "A trend-met-memory Reel requires a live trend and owner evidence" });
  }
});

export const PersonalGrowthInstagramRecommendationSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-instagram-recommendation/1"),
  recommendationDate: DateSchema,
  generatedAt: DateTimeSchema,
  actionType: z.enum([
    "personal-photo", "photo-dump", "okraj-distribution", "bbarak-distribution", "reel",
    "story-sequence", "owner-manual-venture-reshare", "owner-entered-behind-scenes", "no-post"
  ]),
  format: z.enum(["feed-photo", "feed-carousel", "reel", "story", "distribution-checklist", "none"]),
  pillar: PersonalGrowthPillarSchema.nullable(),
  goal: z.string().trim().min(1).max(240).nullable(),
  dueWindow: z.string().trim().min(1).max(120).nullable(),
  ownerSourceRefs: z.array(EvidenceRefSchema).max(12),
  collaborator: z.string().trim().min(1).max(120).nullable(),
  assetChecklist: z.array(z.string().trim().min(1).max(160)).max(12),
  distributionChecklist: z.array(z.string().trim().min(1).max(160)).max(12),
  storiesSupport: z.array(z.string().trim().min(1).max(160)).max(8),
  projectedPersonalRatio: z.number().finite().min(0).max(1).nullable(),
  goviralSignalId: z.string().regex(/^pg-gv-[a-f0-9]{16}$/u).nullable(),
  activeExperimentId: z.string().trim().min(1).max(120).nullable(),
  reason: z.string().trim().min(1).max(360),
  noPostReason: z.enum(["no-useful-candidate", "policy-blocked", "english-profile-unavailable", "authority-held"]).nullable(),
  reel: PersonalGrowthReelSuggestionSchema.nullable(),
  manualVentureReferenceId: z.string().regex(/^pg-manual-ref-[a-f0-9]{16}$/u).nullable(),
  ownerWritesArtifact: z.literal(true),
  publishingAuthorized: z.literal(false)
}).superRefine((recommendation, context) => {
  const noPost = recommendation.actionType === "no-post";
  if (noPost !== (recommendation.noPostReason !== null)) {
    context.addIssue({ code: "custom", path: ["noPostReason"], message: "Only no-post requires a reason" });
  }
  if ((recommendation.actionType === "reel") !== (recommendation.reel !== null)) {
    context.addIssue({ code: "custom", path: ["reel"], message: "Only a Reel action carries a Reel plan" });
  }
  if ((recommendation.actionType === "owner-manual-venture-reshare") !== (recommendation.manualVentureReferenceId !== null)) {
    context.addIssue({ code: "custom", path: ["manualVentureReferenceId"], message: "Only a manual venture reshare carries its bounded reference" });
  }
});

export type PersonalGrowthContentConfig = z.infer<typeof PersonalGrowthContentConfigSchema>;
export type PersonalGrowthContentPolicy = z.infer<typeof PersonalGrowthContentPolicySchema>;
export type PersonalGrowthThreadsCandidate = z.infer<typeof PersonalGrowthThreadsCandidateSchema>;
export type PersonalGrowthThreadsPacket = z.infer<typeof PersonalGrowthThreadsPacketSchema>;
export type PersonalGrowthConversationOpportunity = z.infer<typeof PersonalGrowthConversationOpportunitySchema>;
export type PersonalGrowthManualVentureReference = z.infer<typeof PersonalGrowthManualVentureReferenceSchema>;
export type PersonalGrowthReelSuggestion = z.infer<typeof PersonalGrowthReelSuggestionSchema>;
export type PersonalGrowthInstagramRecommendation = z.infer<typeof PersonalGrowthInstagramRecommendationSchema>;
