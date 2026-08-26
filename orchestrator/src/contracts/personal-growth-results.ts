import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema } from "./common.js";
import { PersonalGrowthLanguageSchema, PersonalGrowthPillarSchema } from "./personal-growth-recommendations.js";

export const PersonalGrowthPlatformSchema = z.enum(["instagram", "threads"]);
export const PersonalGrowthMaturityWindowSchema = z.enum(["24h", "72h", "7d", "28d"]);
export const PersonalGrowthMetricNameSchema = z.enum([
  "followers",
  "net_follower_growth",
  "views",
  "reach",
  "non_follower_reach",
  "profile_views",
  "follows",
  "likes",
  "comments",
  "replies",
  "reposts",
  "quotes",
  "shares",
  "saves",
  "watch_time_ms",
  "average_watch_time_ms",
  "early_exit_count",
  "non_follower_reach_ratio",
  "profile_view_to_follow_rate",
  "saves_per_1000_reach",
  "shares_per_1000_reach",
  "early_exit_rate",
  "replies_per_1000_views",
  "reposts_quotes_per_1000_views"
]);

const MetricValueSchema = z.strictObject({
  name: PersonalGrowthMetricNameSchema,
  value: z.number().finite().nonnegative().nullable(),
  unavailableReason: z.enum([
    "not-returned", "unsupported", "threshold-restricted", "missing-permission", "missing-credential",
    "expired-token", "rate-limited", "provider-error", "invalid-denominator"
  ]).nullable()
}).superRefine((metric, context) => {
  if ((metric.value === null) !== (metric.unavailableReason !== null)) {
    context.addIssue({ code: "custom", path: ["unavailableReason"], message: "A missing metric needs an unavailable reason; a measured metric does not" });
  }
});

export const PersonalGrowthProviderConfigSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-provider-config/1"),
  auditedAt: DateSchema,
  officialSourcesOnly: z.literal(true),
  meta: z.strictObject({
    graphApiVersion: z.literal("v26.0"),
    threadsApiVersion: z.literal("v1.0"),
    instagramApiFamilies: z.array(z.enum(["instagram-login", "facebook-login"])).length(2),
    instagramProfessionalAccountTypes: z.array(z.enum(["business", "creator"])).length(2),
    instagramPermissions: z.strictObject({
      instagramLogin: z.array(z.enum(["instagram_business_basic", "instagram_business_manage_insights"])).length(2),
      facebookLogin: z.array(z.enum(["instagram_basic", "instagram_manage_insights", "pages_read_engagement"])).length(3)
    }),
    threadsPermissions: z.array(z.enum(["threads_basic", "threads_manage_insights"])).length(2),
    threadsSearchPermission: z.literal("threads_keyword_search"),
    docs: z.strictObject({
      versions: HttpsUrlSchema,
      instagramOverview: HttpsUrlSchema,
      instagramInsights: HttpsUrlSchema,
      threadsOverview: HttpsUrlSchema,
      threadsInsights: HttpsUrlSchema,
      threadsKeywordSearch: HttpsUrlSchema
    }),
    retentionPolicy: z.literal("provider-defined-do-not-assume"),
    deprecatedMetricPolicy: z.literal("unavailable-never-zero")
  }),
  buffer: z.strictObject({
    auditedAt: DateSchema,
    docs: HttpsUrlSchema,
    apiStyle: z.literal("graphql"),
    supportedPlatforms: z.array(z.enum(["instagram", "threads"])).length(2),
    adapterEnabled: z.literal(false),
    ownerApprovalRequired: z.literal(true),
    purchaseAuthorized: z.literal(false),
    publishingAuthorized: z.literal(false),
    planAssumption: z.literal("none")
  })
});

export const PersonalGrowthProviderObservationSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-provider-observation/1"),
  observationId: z.string().regex(/^pg-observation-[a-f0-9]{16}$/u),
  idempotencyKey: Sha256Schema,
  platform: PersonalGrowthPlatformSchema,
  scope: z.enum(["account", "post", "keyword-search"]),
  ownerAccountAlias: z.string().regex(/^pg-owner-[a-z0-9-]+$/u).max(80),
  nativePostId: z.string().trim().min(1).max(200).nullable(),
  nativeUrl: HttpsUrlSchema.nullable(),
  observedAt: DateTimeSchema,
  publishedAt: DateTimeSchema.nullable(),
  pragueReportingDate: DateSchema,
  apiVersion: z.string().trim().min(1).max(40),
  maturityWindow: PersonalGrowthMaturityWindowSchema.nullable(),
  metrics: z.array(MetricValueSchema).max(30),
  unavailableReason: z.enum([
    "none", "empty-response", "missing-permission", "missing-credential", "expired-token",
    "rate-limited", "unsupported-account", "provider-disabled", "provider-error"
  ]),
  droppedItemCount: z.number().int().nonnegative(),
  snapshotHash: Sha256Schema,
  credentialMaterialPresent: z.literal(false),
  audienceIdentityPresent: z.literal(false)
}).superRefine((observation, context) => {
  if ((observation.scope === "post") !== (observation.nativePostId !== null && observation.publishedAt !== null)) {
    context.addIssue({ code: "custom", path: ["nativePostId"], message: "Only a post observation requires post identity and publication time" });
  }
  if (observation.metrics.length === 0 && observation.unavailableReason === "none") {
    context.addIssue({ code: "custom", path: ["unavailableReason"], message: "An empty provider response is unavailable, not a measured zero" });
  }
  if (observation.publishedAt !== null && Date.parse(observation.observedAt) < Date.parse(observation.publishedAt)) {
    context.addIssue({ code: "custom", path: ["observedAt"], message: "An observation cannot precede publication" });
  }
  const metricNames = observation.metrics.map(({ name }) => name);
  if (new Set(metricNames).size !== metricNames.length) {
    context.addIssue({ code: "custom", path: ["metrics"], message: "Observation metric names must be unique" });
  }
});

const ManualVentureResultRefSchema = z.strictObject({
  referenceId: z.string().regex(/^pg-manual-ref-[a-f0-9]{16}$/u),
  sourceProject: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80),
  publicItemId: z.string().trim().min(1).max(160),
  publicUrl: HttpsUrlSchema,
  ownerAuthored: z.boolean(),
  personalConnectionRecorded: z.boolean(),
  ownerCommentaryRecorded: z.literal(true),
  policyCompliantAtRecommendation: z.literal(true),
  ownerProvenanceRef: EvidenceRefSchema
}).superRefine((reference, context) => {
  if (reference.sourceProject === "kvorum") {
    context.addIssue({ code: "custom", path: ["sourceProject"], message: "Kvórum cannot enter a Personal Growth result" });
  }
  if (!reference.ownerAuthored && !reference.personalConnectionRecorded) {
    context.addIssue({ code: "custom", path: ["personalConnectionRecorded"], message: "A manual venture result needs authorship or a personal connection" });
  }
});

const ResultCorrectionSchema = z.strictObject({
  correctionId: z.string().regex(/^pg-correction-[a-f0-9]{16}$/u),
  recordedAt: DateTimeSchema,
  reason: z.string().trim().min(1).max(360),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8)
});

export const PersonalGrowthResultSchema = z.strictObject({
  schemaVersion: z.literal("personal-growth-result/1"),
  resultId: z.string().regex(/^pg-result-[a-f0-9]{16}$/u),
  platform: PersonalGrowthPlatformSchema,
  nativePostId: z.string().trim().min(1).max(200),
  url: HttpsUrlSchema,
  publishedAt: DateTimeSchema,
  format: z.enum(["text", "photo", "photo-dump", "carousel", "reel", "story", "publication-distribution"]),
  language: PersonalGrowthLanguageSchema,
  personalPillar: PersonalGrowthPillarSchema,
  contentOrigin: z.enum([
    "owner-private", "owner-authored-publication", "goviral-assisted", "owner-manual-venture-reference", "owner-current-life"
  ]),
  collaborator: z.string().trim().min(1).max(120).nullable(),
  publicationRelation: z.enum(["okraj", "bbarak"]).nullable(),
  reelSeries: z.enum(["rapovej-moment", "behind-the-page", "life-between-projects", "trend-met-memory", "english-rapovej-denik"]).nullable(),
  goviralSignalId: z.string().regex(/^pg-gv-[a-f0-9]{16}$/u).nullable(),
  manualVentureReference: ManualVentureResultRefSchema.nullable(),
  experimentId: z.string().trim().min(1).max(120).nullable(),
  classification: z.enum(["personal-or-personally-authored", "owner-manual-venture-led"]),
  provenance: z.strictObject({
    entryMode: z.enum(["manual", "api", "manual-and-api"]),
    ownerEvidenceRefs: z.array(EvidenceRefSchema).min(1).max(12),
    automaticPortfolioLookup: z.literal(false),
    socialDistributionCampaignRef: z.null(),
    monetizationRef: z.null()
  }),
  observations: z.array(PersonalGrowthProviderObservationSchema).max(100),
  ownerRating: z.number().int().min(1).max(5).nullable(),
  ownerNote: z.string().trim().min(1).max(1000).nullable(),
  corrections: z.array(ResultCorrectionSchema).max(100),
  updatedAt: DateTimeSchema
}).superRefine((result, context) => {
  const manual = result.contentOrigin === "owner-manual-venture-reference";
  if (manual !== (result.manualVentureReference !== null) || manual !== (result.classification === "owner-manual-venture-led")) {
    context.addIssue({ code: "custom", path: ["manualVentureReference"], message: "Manual venture origin, reference and classification must agree" });
  }
  if ((result.contentOrigin === "goviral-assisted") !== (result.goviralSignalId !== null)) {
    context.addIssue({ code: "custom", path: ["goviralSignalId"], message: "Only GoVIRAL-assisted content carries its signal id" });
  }
  if ((result.format === "reel") !== (result.reelSeries !== null)) {
    context.addIssue({ code: "custom", path: ["reelSeries"], message: "Only a Reel result carries a Reel series" });
  }
  const observationKeys = result.observations.map(({ idempotencyKey }) => idempotencyKey);
  if (new Set(observationKeys).size !== observationKeys.length) {
    context.addIssue({ code: "custom", path: ["observations"], message: "Result observations must be idempotent" });
  }
  if (result.observations.some((observation) => observation.scope !== "post"
      || observation.platform !== result.platform || observation.nativePostId !== result.nativePostId)) {
    context.addIssue({ code: "custom", path: ["observations"], message: "Every observation must belong to this Personal Growth post" });
  }
  if ((result.provenance.entryMode === "manual") !== (result.observations.length === 0)) {
    context.addIssue({ code: "custom", path: ["provenance", "entryMode"], message: "API provenance requires an observation and manual-only provenance has none" });
  }
  const serialized = JSON.stringify(result.provenance.ownerEvidenceRefs).toLowerCase();
  if (/(?:kvorum|portfolio-item|social-distribution|campaign-|door-money|booksofhistory|tehdejsi|dneskai|mma-files|fightaiq|contest-radar|monetization)/u.test(serialized)) {
    context.addIssue({ code: "custom", path: ["provenance"], message: "Personal Growth provenance cannot carry portfolio, campaign or monetization references" });
  }
});

export type PersonalGrowthProviderConfig = z.infer<typeof PersonalGrowthProviderConfigSchema>;
export type PersonalGrowthProviderObservation = z.infer<typeof PersonalGrowthProviderObservationSchema>;
export type PersonalGrowthResult = z.infer<typeof PersonalGrowthResultSchema>;
export type PersonalGrowthMetricName = z.infer<typeof PersonalGrowthMetricNameSchema>;
