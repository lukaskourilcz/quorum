import { createHash } from "node:crypto";
import { z } from "zod";
import { DateSchema, DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema, VentureIdSchema } from "./common.js";
import { AmplifierArchetypeSchema, SocialCapabilityRefSchema, SocialPlatformSchema } from "./social-distribution.js";

export const SocialTargetRoleSchema = z.enum(["primary", "umbrella", "amplifier"]);
export const SocialMaturityWindowSchema = z.enum(["24h", "72h", "7d", "28d"]);
export const SocialResultMetricNameSchema = z.enum([
  "verified_publish", "reach", "views", "impressions", "non_follower_reach", "non_follower_reach_ratio",
  "shares", "reposts", "quotes", "saves", "replies", "comments", "likes", "profile_actions",
  "referral_visits", "qualified_actions", "conversions", "original_ratio", "support_ratio",
  "runway_holds", "cooldown_holds", "campaign_holds", "campaign_failures", "time_to_distribute_seconds"
]);

export const SocialResultUnavailableReasonSchema = z.enum([
  "not-returned", "unsupported-metric", "unsupported-account", "missing-permission", "missing-credential",
  "expired-token", "app-review-expired", "rate-limited", "provider-outage", "provider-error", "malformed-item",
  "no-post", "invalid-denominator", "analytics-unavailable", "manual-only", "outcome-pending",
  "insufficient-amplifier-baseline"
]);

const SocialResultMetricSchema = z.strictObject({
  name: SocialResultMetricNameSchema,
  value: z.number().finite().nonnegative().nullable(),
  unavailableReason: SocialResultUnavailableReasonSchema.nullable()
}).superRefine((metric, context) => {
  if ((metric.value === null) !== (metric.unavailableReason !== null)) {
    context.addIssue({ code: "custom", message: "Missing metrics need an unavailable reason; measured metrics do not", path: ["unavailableReason"] });
  }
});

const SocialPolicyResultStateSchema = z.strictObject({
  amplificationPolicyRef: EvidenceRefSchema.nullable(),
  strategyRef: EvidenceRefSchema,
  originalSupportClassification: z.enum(["original", "support"]),
  originalRatio: z.number().finite().min(0).max(1).nullable(),
  supportRatio: z.number().finite().min(0).max(1).nullable(),
  runwayState: z.enum(["healthy", "low-runway", "no-candidate", "held", "unavailable"]),
  cooldownState: z.enum(["clear", "held", "unavailable"]),
  campaignState: z.enum(["completed", "failed", "held", "in-progress", "not-applicable", "unavailable"])
});

export const SocialMetricObservationSchema = z.strictObject({
  schemaVersion: z.literal("social-metric-observation/1"),
  id: z.string().regex(/^social-metric-observation-[a-f0-9]{20}$/u),
  idempotencyHash: Sha256Schema,
  snapshotHash: Sha256Schema,
  correctionOfRef: EvidenceRefSchema.nullable(),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  targetRole: SocialTargetRoleSchema,
  connectionId: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160),
  platform: SocialPlatformSchema,
  nativePostId: z.string().trim().min(1).max(240),
  publicUrl: HttpsUrlSchema,
  campaignRef: EvidenceRefSchema.nullable(),
  campaignItemId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100).nullable(),
  releaseId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100).nullable(),
  sourceVentureId: VentureIdSchema.nullable(),
  capabilityRef: SocialCapabilityRefSchema.nullable(),
  publishedAt: DateTimeSchema,
  observedAt: DateTimeSchema,
  maturityWindow: SocialMaturityWindowSchema,
  provider: z.strictObject({
    source: z.enum(["official-meta", "destination-analytics", "owner-manual"]),
    providerId: z.enum(["direct-meta", "first-party-destination", "owner-manual"]),
    implementationVersion: z.string().trim().min(1).max(80),
    apiVersion: z.string().trim().min(1).max(80).nullable(),
    bindingRef: EvidenceRefSchema.nullable(),
    evidenceRef: EvidenceRefSchema
  }),
  format: z.enum(["text", "image", "carousel", "reel", "video"]),
  locale: z.enum(["cs", "en"]),
  amplifier: z.strictObject({
    archetype: AmplifierArchetypeSchema,
    policyRef: EvidenceRefSchema,
    strategyRef: EvidenceRefSchema
  }).nullable(),
  policyState: SocialPolicyResultStateSchema,
  metrics: z.array(SocialResultMetricSchema).max(40),
  attributionRefs: z.array(EvidenceRefSchema).max(100),
  unavailableReason: SocialResultUnavailableReasonSchema.nullable(),
  sourceProvenanceRefs: z.array(EvidenceRefSchema).min(1).max(30),
  actualCostUsd: z.number().finite().min(0).max(1_000).nullable(),
  droppedMetricCount: z.number().int().nonnegative(),
  audienceIdentityExcluded: z.literal(true),
  privateMessageExcluded: z.literal(true),
  rawProviderPayloadExcluded: z.literal(true),
  authorityGranted: z.literal(false)
}).superRefine((observation, context) => {
  if (Date.parse(observation.observedAt) < Date.parse(observation.publishedAt)) {
    context.addIssue({ code: "custom", message: "An observation cannot precede publication", path: ["observedAt"] });
  }
  const names = observation.metrics.map(({ name }) => name);
  if (new Set(names).size !== names.length) context.addIssue({ code: "custom", message: "Metric names must be unique", path: ["metrics"] });
  if (observation.metrics.length === 0 && observation.unavailableReason === null) {
    context.addIssue({ code: "custom", message: "An empty observation is unavailable, not a measured zero", path: ["unavailableReason"] });
  }
  if (observation.metrics.length > 0 && observation.unavailableReason !== null) {
    context.addIssue({ code: "custom", message: "Observation-level unavailability is only for an empty result", path: ["unavailableReason"] });
  }
  if ((observation.targetRole === "amplifier") !== (observation.amplifier !== null)) {
    context.addIssue({ code: "custom", message: "Only an Amplification Profile carries amplifier policy evidence", path: ["amplifier"] });
  }
  if (observation.targetRole === "primary" && observation.capabilityRef !== null) {
    context.addIssue({ code: "custom", message: "A primary result does not masquerade as cross-target capability", path: ["capabilityRef"] });
  }
  if (observation.targetRole !== "primary" && observation.capabilityRef === null) {
    context.addIssue({ code: "custom", message: "Umbrella and amplifier results need the exact current capability edge", path: ["capabilityRef"] });
  }
  if (observation.targetRole === "umbrella" && observation.policyState.originalSupportClassification !== "support") {
    context.addIssue({ code: "custom", message: "Umbrella distribution is classified as venture support", path: ["policyState", "originalSupportClassification"] });
  }
  const campaignFields = [observation.campaignRef, observation.campaignItemId, observation.releaseId, observation.sourceVentureId];
  if (campaignFields.some((value) => value !== null) && campaignFields.some((value) => value === null)) {
    context.addIssue({ code: "custom", message: "Campaign attribution fields are all present or all absent", path: ["campaignRef"] });
  }
  if (observation.policyState.originalSupportClassification === "support" && observation.campaignRef === null) {
    context.addIssue({ code: "custom", message: "Venture-support results require their immutable campaign reference", path: ["campaignRef"] });
  }
  if (observation.provider.source === "official-meta" && (observation.provider.providerId !== "direct-meta" || !observation.provider.bindingRef)) {
    context.addIssue({ code: "custom", message: "Official Meta insights require the exact Direct Meta binding", path: ["provider"] });
  }
  if (observation.snapshotHash !== socialMetricSnapshotHash(observation)) {
    context.addIssue({ code: "custom", message: "Observation snapshot hash does not match its bounded evidence", path: ["snapshotHash"] });
  }
});

export const SocialAttributionEventSchema = z.strictObject({
  schemaVersion: z.literal("social-attribution-event/1"),
  id: z.string().regex(/^social-attribution-event-[a-f0-9]{20}$/u),
  idempotencyHash: Sha256Schema,
  source: z.enum(["first-party-destination", "owner-manual"]),
  eventType: z.enum(["referral-visit", "qualified-action", "conversion"]),
  eventCount: z.number().int().positive(),
  occurredAt: DateTimeSchema,
  observedAt: DateTimeSchema,
  destination: HttpsUrlSchema,
  utm: z.strictObject({
    source: z.enum(["instagram", "threads"]).nullable(),
    medium: z.literal("organic_social").nullable(),
    campaign: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100).nullable(),
    content: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100).nullable()
  }),
  attribution: z.strictObject({
    state: z.enum(["attributed", "unattributed", "invalid"]),
    campaignRef: EvidenceRefSchema.nullable(),
    campaignItemId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100).nullable(),
    profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140).nullable(),
    targetRole: SocialTargetRoleSchema.nullable()
  }),
  deduplicationKey: Sha256Schema,
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(20),
  identityExcluded: z.literal(true),
  fingerprintingExcluded: z.literal(true),
  consentInferred: z.literal(false),
  sharingInferred: z.literal(false),
  relationshipKitRef: z.null(),
  contestRef: z.null(),
  authorityGranted: z.literal(false)
}).superRefine((event, context) => {
  const utmValues = Object.values(event.utm);
  if (utmValues.some((value) => value !== null) && utmValues.some((value) => value === null)) {
    context.addIssue({ code: "custom", message: "Partial UTM tuples are invalid and cannot be attributed", path: ["utm"] });
  }
  const attributionValues = Object.values(event.attribution).slice(1);
  if ((event.attribution.state === "attributed") !== attributionValues.every((value) => value !== null)) {
    context.addIssue({ code: "custom", message: "Only exact campaign matches carry attributed fields", path: ["attribution"] });
  }
  if (event.attribution.state !== "attributed" && attributionValues.some((value) => value !== null)) {
    context.addIssue({ code: "custom", message: "Unattributed or invalid events cannot infer a target", path: ["attribution"] });
  }
});

export const SocialDistributionBaselineSchema = z.strictObject({
  schemaVersion: z.literal("social-distribution-baseline/1"),
  id: z.string().regex(/^social-distribution-baseline-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  startsOn: DateSchema,
  endsOn: DateSchema,
  evaluatedAt: DateTimeSchema,
  elapsedDays: z.number().int().min(0).max(10_000),
  status: z.enum(["collecting", "complete"]),
  observationRefs: z.array(EvidenceRefSchema).max(10_000),
  attributionRefs: z.array(EvidenceRefSchema).max(10_000),
  acceptedObservationCount: z.number().int().nonnegative(),
  droppedObservationCount: z.number().int().nonnegative(),
  metricsAvailable: z.boolean(),
  ownerDecisionRequired: z.literal(true),
  authorityGranted: z.literal(false)
}).superRefine((baseline, context) => {
  const span = Math.round((Date.parse(`${baseline.endsOn}T00:00:00.000Z`) - Date.parse(`${baseline.startsOn}T00:00:00.000Z`)) / 86_400_000);
  if (span !== 28) context.addIssue({ code: "custom", message: "The organic baseline must span exactly 28 days", path: ["endsOn"] });
  if ((baseline.status === "complete") !== (baseline.elapsedDays >= 28)) context.addIssue({ code: "custom", message: "A baseline is complete only after day 28", path: ["status"] });
});

export const SocialDistributionExperimentSchema = z.strictObject({
  schemaVersion: z.literal("social-distribution-experiment/1"),
  id: z.string().regex(/^social-distribution-experiment-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160),
  status: z.enum(["backlog", "proposed", "active", "review", "completed", "stopped"]),
  hypothesis: z.string().trim().min(1).max(500),
  changedVariable: z.enum(["umbrella-inclusion", "amplifier-inclusion", "umbrella-delay", "amplifier-count", "format", "timing"]),
  control: z.string().trim().min(1).max(300),
  variant: z.string().trim().min(1).max(300),
  primaryMetric: SocialResultMetricNameSchema,
  guardrail: z.string().trim().min(1).max(500),
  scopeProfileIds: z.array(z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u)).min(1).max(20),
  startsOn: DateSchema,
  endsOn: DateSchema,
  minimumSample: z.number().int().min(2).max(1_000),
  stopCondition: z.string().trim().min(1).max(500),
  baselineRef: EvidenceRefSchema,
  evidenceObservationRefs: z.array(EvidenceRefSchema).max(2_000),
  verdict: z.enum(["KEEP", "ITERATE", "STOP", "INSUFFICIENT_DATA"]),
  hardGatesFrozen: z.literal(true),
  privacyFrozen: z.literal(true),
  manipulationExcluded: z.literal(true),
  maxCostUsd: z.number().finite().min(0).max(1_000),
  publishingAuthorized: z.literal(false),
  updatedAt: DateTimeSchema
}).superRefine((experiment, context) => {
  if (Date.parse(`${experiment.endsOn}T00:00:00.000Z`) <= Date.parse(`${experiment.startsOn}T00:00:00.000Z`)) {
    context.addIssue({ code: "custom", message: "Experiment end must follow its start", path: ["endsOn"] });
  }
  const serialized = `${experiment.hypothesis} ${experiment.control} ${experiment.variant} ${experiment.stopCondition}`.toLowerCase();
  if (/(?:fake account|fake comment|repost ring|identical bulk|weaken|disable (?:privacy|kill)|bypass)/u.test(serialized)) {
    context.addIssue({ code: "custom", message: "Manipulation and weakened hard gates are not testable variables" });
  }
});

export const SocialDistributionExperimentRegisterSchema = z.strictObject({
  schemaVersion: z.literal("social-distribution-experiment-register/1"),
  experiments: z.array(SocialDistributionExperimentSchema).max(100),
  updatedAt: DateTimeSchema,
  authorityGranted: z.literal(false)
}).superRefine((register, context) => {
  const ids = register.experiments.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Experiment ids must be unique", path: ["experiments"] });
  if (register.experiments.filter(({ status }) => status === "active" || status === "review").length > 2) {
    context.addIssue({ code: "custom", message: "At most two Social Distribution experiments may be active or under review", path: ["experiments"] });
  }
});

export const SocialBoostProposalSchema = z.strictObject({
  schemaVersion: z.literal("social-boost-proposal/1"),
  id: z.string().regex(/^social-boost-proposal-[a-f0-9]{20}$/u),
  status: z.literal("held-owner-proposal"),
  contentRef: EvidenceRefSchema,
  destinationRef: EvidenceRefSchema,
  thresholdVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  baselineRef: EvidenceRefSchema,
  organicObservationRefs: z.array(EvidenceRefSchema).min(2).max(100),
  primaryMetric: SocialResultMetricNameSchema,
  observedValue: z.number().finite().nonnegative(),
  thresholdValue: z.number().finite().nonnegative(),
  sampleSize: z.number().int().min(2).max(10_000),
  contentChecksPassed: z.literal(true),
  destinationChecksPassed: z.literal(true),
  budgetAuthorityRef: EvidenceRefSchema,
  proposedAt: DateTimeSchema,
  ownerDecisionRequired: z.literal(true),
  adApiCalled: z.literal(false),
  purchaseAuthorized: z.literal(false),
  spendAuthorized: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((proposal, context) => {
  if (proposal.observedValue < proposal.thresholdValue || proposal.organicObservationRefs.length < proposal.sampleSize) {
    context.addIssue({ code: "custom", message: "A held boost proposal needs sufficient organic threshold evidence", path: ["organicObservationRefs"] });
  }
});

export type SocialMetricObservation = z.infer<typeof SocialMetricObservationSchema>;
export type SocialAttributionEvent = z.infer<typeof SocialAttributionEventSchema>;
export type SocialDistributionBaseline = z.infer<typeof SocialDistributionBaselineSchema>;
export type SocialDistributionExperiment = z.infer<typeof SocialDistributionExperimentSchema>;
export type SocialDistributionExperimentRegister = z.infer<typeof SocialDistributionExperimentRegisterSchema>;
export type SocialBoostProposal = z.infer<typeof SocialBoostProposalSchema>;
export type SocialResultMetricName = z.infer<typeof SocialResultMetricNameSchema>;
export type SocialResultUnavailableReason = z.infer<typeof SocialResultUnavailableReasonSchema>;

export function socialMetricSnapshotHash(observation: Omit<SocialMetricObservation, "snapshotHash"> | SocialMetricObservation): string {
  const { snapshotHash: _snapshotHash, ...bounded } = observation as SocialMetricObservation;
  return createHash("sha256").update(JSON.stringify(bounded)).digest("hex");
}
