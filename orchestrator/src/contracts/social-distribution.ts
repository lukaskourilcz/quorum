import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  HttpsUrlSchema,
  Sha256Schema,
  VentureIdSchema
} from "./common.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100);
const BoundedTextSchema = z.string().trim().min(1).max(500);
const LocaleSchema = z.enum(["cs", "en"]);
export const SocialPlatformSchema = z.enum(["instagram", "threads"]);
export const AmplifierArchetypeSchema = z.enum([
  "topic-editorial",
  "language-market",
  "geography-community",
  "format",
  "audience"
]);

export const SocialCapabilityRefSchema = z.strictObject({
  mapVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  source: VentureIdSchema,
  target: z.literal("social-distribution"),
  capability: z.literal("approved-publish-package"),
  dataSchemaVersion: z.literal("approved-publish-package/1"),
  decisionReference: EvidenceRefSchema
});

const ProfileKindSchema = z.enum(["owned-brand", "owner-personal", "simulation"]);
const ProfileRoleSchema = z.enum([
  "venture-primary",
  "company-umbrella",
  "owned-amplifier",
  "owner-personal",
  "simulation"
]);
const ProfileLifecycleSchema = z.enum([
  "idea",
  "proposed",
  "setup-needed",
  "active",
  "paused",
  "retired",
  "rejected",
  "simulation"
]);

const ProfileProvenanceSchema = z.strictObject({
  source: z.enum(["owner", "migration", "fixture"]),
  recordedBy: z.enum(["owner", "system"]),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(12),
  fixtureKey: SlugSchema.nullable()
});

const AmplifierEligibilityRefSchema = z.strictObject({
  verdict: z.enum(["accept", "hold", "reject"]),
  evaluatedAt: DateTimeSchema,
  purposeGateRef: EvidenceRefSchema,
  canonicalPolicyRef: EvidenceRefSchema.nullable()
});

export const SocialProfileSchema = z.strictObject({
  schemaVersion: z.literal("social-profile/1"),
  id: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  displayLabel: z.string().trim().min(1).max(180),
  kind: ProfileKindSchema,
  role: ProfileRoleSchema,
  ownerRef: SlugSchema,
  ventureRef: VentureIdSchema.nullable(),
  brandRef: SlugSchema.nullable(),
  purpose: BoundedTextSchema,
  audience: BoundedTextSchema,
  languages: z.array(LocaleSchema).min(1).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(12),
  supportedTopics: z.array(SlugSchema).max(24),
  supportedVentures: z.array(VentureIdSchema).max(24),
  capabilityRefs: z.array(SocialCapabilityRefSchema).max(24),
  amplifierArchetype: AmplifierArchetypeSchema.nullable(),
  amplifierEligibility: AmplifierEligibilityRefSchema.nullable(),
  originalContentPromise: z.string().trim().min(1).max(500).nullable(),
  recurringFormatRefs: z.array(SlugSchema).max(12),
  avatar: z.strictObject({
    kind: z.enum(["asset", "descriptor", "identicon", "none"]),
    descriptor: z.string().trim().min(1).max(240).nullable(),
    reference: z.string().trim().min(1).max(300).nullable()
  }),
  lifecycle: ProfileLifecycleSchema,
  liveEligible: z.boolean(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  provenance: ProfileProvenanceSchema,
  notes: z.string().trim().max(500)
}).superRefine((profile, context) => {
  const ownedRoles = new Set(["venture-primary", "company-umbrella", "owned-amplifier"]);
  if (ownedRoles.has(profile.role) && profile.kind !== "owned-brand") {
    context.addIssue({ code: "custom", message: "Primary, umbrella and amplifier roles must be transparent owned brands", path: ["kind"] });
  }
  if ((profile.kind === "owner-personal") !== (profile.role === "owner-personal")) {
    context.addIssue({ code: "custom", message: "Owner-personal kind and role must match", path: ["role"] });
  }
  if (profile.kind === "owner-personal" && profile.liveEligible) {
    context.addIssue({ code: "custom", message: "Owner-personal profiles are non-live by default", path: ["liveEligible"] });
  }
  if (profile.role === "venture-primary" && profile.ventureRef === null) {
    context.addIssue({ code: "custom", message: "A venture-primary profile needs its owning venture", path: ["ventureRef"] });
  }
  if (profile.role === "company-umbrella" && profile.ventureRef !== null) {
    context.addIssue({ code: "custom", message: "The company umbrella cannot masquerade as a venture primary", path: ["ventureRef"] });
  }
  if (profile.role === "owned-amplifier") {
    if (profile.amplifierArchetype === null || profile.originalContentPromise === null || profile.recurringFormatRefs.length < 2) {
      context.addIssue({ code: "custom", message: "An amplifier needs a durable archetype, original-content promise and two recurring formats" });
    }
    if (profile.supportedVentures.length > 0 && profile.capabilityRefs.length !== profile.supportedVentures.length) {
      context.addIssue({ code: "custom", message: "Every amplifier venture relationship needs one exact capability reference", path: ["capabilityRefs"] });
    }
    if (["setup-needed", "active"].includes(profile.lifecycle) || profile.liveEligible) {
      if (profile.amplifierEligibility?.verdict !== "accept" || profile.amplifierEligibility.canonicalPolicyRef === null) {
        context.addIssue({ code: "custom", message: "Amplifier setup/live eligibility requires #415 accept and canonical policy evidence", path: ["amplifierEligibility"] });
      }
    }
  } else if (profile.amplifierArchetype !== null || profile.amplifierEligibility !== null) {
    context.addIssue({ code: "custom", message: "Only owned amplifiers carry amplifier policy fields" });
  }
  if (["retired", "rejected"].includes(profile.lifecycle) && profile.liveEligible) {
    context.addIssue({ code: "custom", message: "Retired or rejected profiles cannot be live eligible", path: ["liveEligible"] });
  }
  if (profile.kind === "simulation") {
    if (profile.role !== "simulation" || profile.lifecycle !== "simulation" || profile.liveEligible || profile.provenance.source !== "fixture" || profile.provenance.fixtureKey === null) {
      context.addIssue({ code: "custom", message: "A simulation is immutable fixture evidence and structurally non-live" });
    }
    if (profile.createdAt !== profile.updatedAt || profile.ventureRef !== null || profile.capabilityRefs.length > 0) {
      context.addIssue({ code: "custom", message: "A simulation cannot acquire venture/capability state or mutable history" });
    }
  } else if (profile.role === "simulation" || profile.lifecycle === "simulation" || profile.provenance.source === "fixture" || profile.provenance.fixtureKey !== null) {
    context.addIssue({ code: "custom", message: "Fixture markers cannot enter a real profile" });
  }
});

export const ApprovedSocialScopeSchema = z.enum([
  "threads_basic",
  "threads_content_publish",
  "threads_manage_insights",
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights"
]);

const ConnectionUnavailableReasonSchema = z.enum([
  "not-configured",
  "missing-credential",
  "missing-native-id",
  "missing-scope",
  "human-activation-required",
  "token-expired",
  "app-review-required",
  "provider-unavailable",
  "platform-unavailable",
  "held-by-authority",
  "paused"
]);

export const SocialConnectionSchema = z.strictObject({
  schemaVersion: z.literal("social-connection/1"),
  id: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  platform: SocialPlatformSchema,
  publicHandle: z.string().regex(/^@[A-Za-z0-9._]{1,60}$/u).nullable(),
  nativeAccountId: z.string().regex(/^[A-Za-z0-9._:-]{1,120}$/u).nullable(),
  connector: z.strictObject({
    id: SlugSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/u),
    providerId: SlugSchema,
    apiVersion: z.string().trim().min(1).max(40),
    loginMode: z.enum(["threads-oauth", "instagram-facebook-login", "instagram-login", "provider-oauth"])
  }),
  credentialRef: z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/u).nullable(),
  nativeAccountIdRef: z.string().regex(/^[A-Z][A-Z0-9_]{2,119}$/u).nullable(),
  approvedScopes: z.array(ApprovedSocialScopeSchema).max(12),
  supportedCapabilities: z.array(z.enum(["publish-original", "own-insights"])).min(1).max(2),
  mode: z.enum(["draft", "held", "autopublish"]),
  health: z.strictObject({
    status: z.enum(["healthy", "unavailable", "expired", "reauthorisation-required", "unverified", "paused"]),
    unavailableReason: ConnectionUnavailableReasonSchema.nullable()
  }),
  tokenExpiresAt: DateTimeSchema.nullable(),
  appReviewExpiresAt: DateTimeSchema.nullable(),
  enabledByHumanAt: DateTimeSchema.nullable(),
  cadence: z.strictObject({
    maxOrganicPostsPerDay: z.number().int().positive().max(100),
    minHoursBetweenPosts: z.number().int().nonnegative().max(168),
    timezone: z.literal("Europe/Prague")
  }),
  lastVerified: z.strictObject({ at: DateTimeSchema, evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8) }).nullable()
}).superRefine((connection, context) => {
  const joinedScopes = connection.approvedScopes.join(" ");
  if (connection.platform === "threads") {
    if (connection.connector.loginMode !== "threads-oauth" || /instagram|pages_/u.test(joinedScopes)) {
      context.addIssue({ code: "custom", message: "A Threads connection accepts only its explicit OAuth path and scopes" });
    }
  } else {
    if (connection.connector.loginMode === "threads-oauth" || /threads_/u.test(joinedScopes)) {
      context.addIssue({ code: "custom", message: "An Instagram connection cannot carry Threads authority" });
    }
    if (connection.connector.loginMode === "instagram-login" && connection.approvedScopes.some((scope) => !scope.startsWith("instagram_business_"))) {
      context.addIssue({ code: "custom", message: "Instagram Login requires the current instagram_business_* scopes", path: ["approvedScopes"] });
    }
    if (connection.connector.loginMode === "instagram-facebook-login" && connection.approvedScopes.some((scope) => scope.startsWith("instagram_business_"))) {
      context.addIssue({ code: "custom", message: "Facebook Login and Instagram Login scope namespaces cannot be mixed", path: ["approvedScopes"] });
    }
  }
  if (connection.health.status === "healthy" && connection.health.unavailableReason !== null) {
    context.addIssue({ code: "custom", message: "A healthy connection has no unavailable reason", path: ["health"] });
  }
  if (connection.health.status !== "healthy" && connection.health.unavailableReason === null) {
    context.addIssue({ code: "custom", message: "An unhealthy connection must expose a typed reason", path: ["health"] });
  }
  if (connection.mode === "autopublish" && (
    connection.enabledByHumanAt === null
    || connection.credentialRef === null
    || (connection.nativeAccountId === null && connection.nativeAccountIdRef === null)
    || connection.health.status !== "healthy"
  )) {
    context.addIssue({ code: "custom", message: "Autopublish shape requires human activation, credential/id references and healthy verification; other gates still apply" });
  }
});

const DistributionContactTypeSchema = z.enum([
  "ambassador",
  "creator",
  "publisher",
  "newsletter",
  "community",
  "club",
  "media",
  "podcast",
  "other"
]);

export const DistributionContactSchema = z.strictObject({
  schemaVersion: z.literal("distribution-contact/1"),
  id: z.string().regex(/^distribution-contact-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  label: z.string().trim().min(1).max(160),
  type: DistributionContactTypeSchema,
  topics: z.array(SlugSchema).max(24),
  ventures: z.array(VentureIdSchema).max(24),
  platforms: z.array(SocialPlatformSchema).max(2),
  languages: z.array(LocaleSchema).min(1).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(12),
  publicContactRefs: z.array(z.strictObject({
    kind: z.enum(["public-url", "public-email", "public-handle"]),
    value: z.string().trim().min(1).max(300),
    ownerEnteredAt: DateTimeSchema
  })).min(1).max(4),
  relationshipStatus: z.enum(["unknown", "opted-in", "paused", "declined", "revoked"]),
  consentEvidenceRef: EvidenceRefSchema.nullable(),
  preferredFormats: z.array(z.enum(["link", "image", "carousel", "video", "text"])).max(5),
  preferredCadence: z.string().trim().min(1).max(160).nullable(),
  lastContactedAt: DateTimeSchema.nullable(),
  lastSharedAt: DateTimeSchema.nullable(),
  lastDeclinedAt: DateTimeSchema.nullable(),
  doNotContact: z.boolean(),
  notes: z.string().trim().max(500),
  provenance: z.strictObject({ source: z.literal("owner-entered-public-record"), evidenceRefs: z.array(EvidenceRefSchema).min(1).max(8) })
}).superRefine((contact, context) => {
  if (contact.relationshipStatus === "opted-in" && contact.consentEvidenceRef === null) {
    context.addIssue({ code: "custom", message: "An opted-in relationship needs consent evidence", path: ["consentEvidenceRef"] });
  }
  if (["declined", "revoked"].includes(contact.relationshipStatus) && (!contact.doNotContact || contact.lastDeclinedAt === null)) {
    context.addIssue({ code: "custom", message: "Declined/revoked contacts remain do-not-contact with dated evidence" });
  }
});

const CampaignTargetSchema = z.strictObject({
  id: SlugSchema,
  role: z.enum(["primary", "umbrella", "amplifier"]),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  ventureRef: VentureIdSchema.nullable(),
  capabilityRef: SocialCapabilityRefSchema.nullable(),
  amplifierEligibilityRef: EvidenceRefSchema.nullable(),
  fit: z.enum(["eligible", "held", "rejected"]),
  reasons: z.array(z.enum(["fit", "ratio", "runway", "cooldown", "collision", "duplicate", "capability", "authority", "paused"])).min(1).max(9)
}).superRefine((target, context) => {
  if (target.role === "primary" && (target.capabilityRef !== null || target.amplifierEligibilityRef !== null)) {
    context.addIssue({ code: "custom", message: "A source venture's own primary target does not masquerade as a cross-target" });
  }
  if (target.role === "umbrella" && target.capabilityRef === null) {
    context.addIssue({ code: "custom", message: "An umbrella target needs an exact current capability edge", path: ["capabilityRef"] });
  }
  if (target.role === "amplifier" && (target.capabilityRef === null || target.amplifierEligibilityRef === null)) {
    context.addIssue({ code: "custom", message: "An amplifier target needs exact capability and #415 eligibility evidence" });
  }
});

const CampaignChannelItemSchema = z.strictObject({
  id: SlugSchema,
  targetId: SlugSchema,
  channel: SocialPlatformSchema,
  locale: LocaleSchema,
  contentHash: Sha256Schema,
  assetHashes: z.array(Sha256Schema).max(10),
  window: z.strictObject({ notBefore: DateTimeSchema, notAfter: DateTimeSchema }),
  utm: z.strictObject({
    source: SocialPlatformSchema,
    medium: z.literal("organic_social"),
    campaign: SlugSchema,
    content: SlugSchema
  }),
  approvalRef: EvidenceRefSchema,
  status: z.enum(["draft", "approved", "held", "queued", "publishing", "published", "failed", "needs-reconciliation", "expired", "cancelled"])
}).superRefine((item, context) => {
  if (item.utm.source !== item.channel) context.addIssue({ code: "custom", message: "UTM source must match the channel", path: ["utm", "source"] });
  if (Date.parse(item.window.notAfter) <= Date.parse(item.window.notBefore)) context.addIssue({ code: "custom", message: "Campaign item window must end after it starts", path: ["window"] });
});

const CampaignHistorySchema = z.strictObject({
  eventId: SlugSchema,
  at: DateTimeSchema,
  action: z.enum(["created", "approved", "held", "overridden", "corrected", "queued", "completed", "cancelled"]),
  actor: z.enum(["owner", "system"]),
  reason: BoundedTextSchema,
  supersedesEventId: SlugSchema.nullable()
});

export const SocialCampaignSchema = z.strictObject({
  schemaVersion: z.literal("social-campaign/1"),
  id: z.string().regex(/^social-campaign-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  releaseId: SlugSchema,
  contentIds: z.array(SlugSchema).min(1).max(24),
  inputHash: Sha256Schema,
  sourceVentureId: VentureIdSchema,
  sourcePrimaryProfileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  sourceCapabilityRef: SocialCapabilityRefSchema,
  sourcePackage: z.strictObject({ schemaVersion: z.literal("approved-publish-package/1"), artifactRef: EvidenceRefSchema, packageHash: Sha256Schema }),
  objective: z.enum(["qualified-visit", "trust", "release-awareness", "community-value"]),
  audience: BoundedTextSchema,
  targets: z.array(CampaignTargetSchema).min(1).max(24),
  contactAssignments: z.array(z.string().regex(/^distribution-contact-[a-z0-9]+(?:-[a-z0-9]+)*$/u)).max(24),
  channelItems: z.array(CampaignChannelItemSchema).min(1).max(80),
  status: z.enum(["draft", "approved", "held", "queued", "in-progress", "completed", "cancelled", "expired"]),
  holdReasons: z.array(z.enum(["fit", "ratio", "runway", "cooldown", "collision", "duplicate", "capability", "authority", "provider", "measurement", "paused"])).max(11),
  providerAvailability: z.enum(["available", "unavailable", "held", "not-configured"]),
  measurementAvailability: z.enum(["available", "unavailable", "held", "manual-only"]),
  history: z.array(CampaignHistorySchema).min(1).max(500),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((campaign, context) => {
  if (["personal-growth", "kvorum", "goviral"].includes(campaign.sourceVentureId)) {
    context.addIssue({ code: "custom", message: "Personal Growth, Kvórum and GoVIRAL cannot source Social Distribution campaigns", path: ["sourceVentureId"] });
  }
  if (campaign.sourceCapabilityRef.source !== campaign.sourceVentureId) {
    context.addIssue({ code: "custom", message: "The package capability must belong to the campaign source venture", path: ["sourceCapabilityRef"] });
  }
  const targetIds = new Set(campaign.targets.map((target) => target.id));
  if (targetIds.size !== campaign.targets.length || campaign.channelItems.some((item) => !targetIds.has(item.targetId))) {
    context.addIssue({ code: "custom", message: "Campaign items must resolve one unique declared target", path: ["targets"] });
  }
  if (!campaign.targets.some((target) => target.role === "primary" && target.profileId === campaign.sourcePrimaryProfileId && target.ventureRef === campaign.sourceVentureId)) {
    context.addIssue({ code: "custom", message: "Every campaign needs its source venture's own primary target", path: ["targets"] });
  }
  for (const [index, target] of campaign.targets.entries()) {
    if (target.capabilityRef !== null && target.capabilityRef.source !== campaign.sourceVentureId) {
      context.addIssue({ code: "custom", message: "Cross-target capability source must match the release owner", path: ["targets", index, "capabilityRef"] });
    }
    if ((campaign.sourceVentureId === "booksofhistory" && target.ventureRef === "tehdejsi-svet")
      || (campaign.sourceVentureId === "tehdejsi-svet" && target.ventureRef === "booksofhistory")) {
      context.addIssue({ code: "custom", message: "The history ventures cannot target one another", path: ["targets", index] });
    }
  }
  const itemIds = campaign.channelItems.map((item) => item.id);
  const utmContent = campaign.channelItems.map((item) => item.utm.content);
  if (new Set(itemIds).size !== itemIds.length || new Set(utmContent).size !== utmContent.length) {
    context.addIssue({ code: "custom", message: "Campaign items and UTM attribution must be unique", path: ["channelItems"] });
  }
  if ((campaign.status === "held") !== (campaign.holdReasons.length > 0)) {
    context.addIssue({ code: "custom", message: "Held campaigns name reasons; non-held campaigns do not", path: ["holdReasons"] });
  }
});

export const SocialShareKitSchema = z.strictObject({
  schemaVersion: z.literal("social-share-kit/1"),
  id: z.string().regex(/^social-share-kit-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  campaignId: z.string().regex(/^social-campaign-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  contactId: z.string().regex(/^distribution-contact-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  sourceVentureId: VentureIdSchema,
  sourcePackageHash: Sha256Schema,
  channel: SocialPlatformSchema,
  locale: LocaleSchema,
  factualSummary: z.string().trim().min(1).max(800),
  relevanceReason: BoundedTextSchema,
  talkingPoints: z.array(z.string().trim().min(1).max(300)).max(6),
  assets: z.array(z.strictObject({ ref: EvidenceRefSchema, hash: Sha256Schema, altText: z.string().trim().min(1).max(1_000) })).max(10),
  link: HttpsUrlSchema,
  disclosure: z.string().trim().min(1).max(300),
  attribution: z.string().trim().min(1).max(300),
  utm: z.strictObject({ source: SlugSchema, medium: z.literal("manual_share"), campaign: SlugSchema, content: SlugSchema }),
  expiresAt: DateTimeSchema,
  status: z.enum(["draft", "approved", "expired", "delivered", "declined"]),
  deliveryMode: z.enum(["copy", "download", "manual-send"]),
  deliveryEvidenceRef: EvidenceRefSchema.nullable()
}).superRefine((kit, context) => {
  if ((kit.status === "delivered") !== (kit.deliveryEvidenceRef !== null)) {
    context.addIssue({ code: "custom", message: "Only recorded delivery evidence can mark a manual share kit delivered", path: ["deliveryEvidenceRef"] });
  }
});

export const SocialProfileEventSchema = z.strictObject({
  schemaVersion: z.literal("social-profile-event/1"),
  eventId: z.string().regex(/^social-profile-event-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(160),
  at: DateTimeSchema,
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  connectionId: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u).nullable(),
  action: z.enum(["proposed", "setup-requested", "connected", "activated", "paused", "reauthorisation-requested", "disconnected", "retired", "rejected", "corrected"]),
  actor: z.enum(["owner", "system"]),
  provenanceRef: EvidenceRefSchema,
  reason: BoundedTextSchema,
  supersededEventRef: EvidenceRefSchema.nullable()
}).superRefine((event, context) => {
  if ((event.action === "corrected") !== (event.supersededEventRef !== null)) {
    context.addIssue({ code: "custom", message: "A correction names the superseded event; other lifecycle events append independently", path: ["supersededEventRef"] });
  }
});

const AmplificationPolicyValuesSchema = z.strictObject({
  minimumOriginalContentRatio: z.number().finite().min(0).max(1),
  maximumVentureSupportRatio: z.number().finite().min(0).max(1),
  rollingWindowPosts: z.number().int().positive().max(365),
  originalContentRunwayPosts: z.number().int().positive().max(100),
  sameSourceVentureCooldownDays: z.number().int().nonnegative().max(365),
  maximumActiveSupportCampaigns: z.number().int().nonnegative().max(20),
  duplicateCaptionThreshold: z.number().finite().min(0).max(1),
  duplicateAssetRejected: z.boolean(),
  audienceSpecificAngleRequired: z.boolean(),
  staggerRequired: z.boolean(),
  minimumStaggerHours: z.number().int().nonnegative().max(168)
});

const AmplificationPolicyOverrideSchema = z.strictObject({
  minimumOriginalContentRatio: z.number().finite().min(0).max(1).nullable(),
  maximumVentureSupportRatio: z.number().finite().min(0).max(1).nullable(),
  sameSourceVentureCooldownDays: z.number().int().nonnegative().max(365).nullable(),
  maximumActiveSupportCampaigns: z.number().int().nonnegative().max(20).nullable(),
  minimumStaggerHours: z.number().int().nonnegative().max(168).nullable(),
  reason: BoundedTextSchema
});

const PolicyHistorySchema = z.strictObject({
  revision: z.number().int().positive(),
  effectiveAt: DateTimeSchema,
  ownerDecisionRef: EvidenceRefSchema,
  action: z.enum(["created", "tightened", "corrected", "superseded"]),
  reason: BoundedTextSchema,
  supersedesRevision: z.number().int().positive().nullable()
});

export const AmplificationPolicySchema = z.strictObject({
  schemaVersion: z.literal("amplification-policy/1"),
  id: z.literal("amplification-policy-central"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  effectiveDate: DateSchema,
  values: AmplificationPolicyValuesSchema,
  profileOverrides: z.array(AmplificationPolicyOverrideSchema.extend({
    profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  })).max(100),
  platformOverrides: z.array(AmplificationPolicyOverrideSchema.extend({
    platform: SocialPlatformSchema
  })).max(2),
  ownerDecisionRef: EvidenceRefSchema,
  history: z.array(PolicyHistorySchema).min(1).max(100)
}).superRefine((policy, context) => {
  if (Math.abs(policy.values.minimumOriginalContentRatio + policy.values.maximumVentureSupportRatio - 1) > Number.EPSILON * 4) {
    context.addIssue({ code: "custom", message: "Central original/support ratios must resolve one whole feed window", path: ["values"] });
  }
  const profileIds = policy.profileOverrides.map((override) => override.profileId);
  if (new Set(profileIds).size !== profileIds.length) context.addIssue({ code: "custom", message: "Each profile has at most one effective override", path: ["profileOverrides"] });
  const platformIds = policy.platformOverrides.map((override) => override.platform);
  if (new Set(platformIds).size !== platformIds.length) context.addIssue({ code: "custom", message: "Each platform has at most one effective override", path: ["platformOverrides"] });
  for (const [collection, overrides] of [
    ["profileOverrides", policy.profileOverrides],
    ["platformOverrides", policy.platformOverrides]
  ] as const) {
    for (const [index, override] of overrides.entries()) {
      if (override.minimumOriginalContentRatio !== null && override.minimumOriginalContentRatio < policy.values.minimumOriginalContentRatio) {
        context.addIssue({ code: "custom", message: "An override may only require more original content", path: [collection, index] });
      }
      if (override.maximumVentureSupportRatio !== null && override.maximumVentureSupportRatio > policy.values.maximumVentureSupportRatio) {
        context.addIssue({ code: "custom", message: "An override may only reduce venture support", path: [collection, index] });
      }
      if (override.sameSourceVentureCooldownDays !== null && override.sameSourceVentureCooldownDays < policy.values.sameSourceVentureCooldownDays) {
        context.addIssue({ code: "custom", message: "An override may only lengthen cooldown", path: [collection, index] });
      }
      if (override.maximumActiveSupportCampaigns !== null && override.maximumActiveSupportCampaigns > policy.values.maximumActiveSupportCampaigns) {
        context.addIssue({ code: "custom", message: "An override may only lower the active campaign cap", path: [collection, index] });
      }
      if (override.minimumStaggerHours !== null && override.minimumStaggerHours < policy.values.minimumStaggerHours) {
        context.addIssue({ code: "custom", message: "An override may only lengthen the minimum stagger", path: [collection, index] });
      }
    }
  }
  const revisions = policy.history.map((event) => event.revision);
  if (new Set(revisions).size !== revisions.length || revisions.some((revision, index) => index > 0 && revision <= revisions[index - 1]!)) {
    context.addIssue({ code: "custom", message: "Policy history revisions must be unique and ascending", path: ["history"] });
  }
});

export type SocialProfile = z.infer<typeof SocialProfileSchema>;
export type SocialCapabilityRef = z.infer<typeof SocialCapabilityRefSchema>;
export type SocialConnection = z.infer<typeof SocialConnectionSchema>;
export type DistributionContact = z.infer<typeof DistributionContactSchema>;
export type SocialCampaign = z.infer<typeof SocialCampaignSchema>;
export type SocialShareKit = z.infer<typeof SocialShareKitSchema>;
export type SocialProfileEvent = z.infer<typeof SocialProfileEventSchema>;
export type AmplificationPolicy = z.infer<typeof AmplificationPolicySchema>;

export function parseSocialDistributionRecords<T>(
  values: readonly unknown[],
  schema: z.ZodType<T>
): { accepted: T[]; dropped: Array<{ index: number; issues: string[] }> } {
  const accepted: T[] = [];
  const dropped: Array<{ index: number; issues: string[] }> = [];
  for (const [index, value] of values.entries()) {
    const parsed = schema.safeParse(value);
    if (parsed.success) accepted.push(parsed.data);
    else dropped.push({ index, issues: parsed.error.issues.slice(0, 8).map((issue) => issue.message.slice(0, 200)) });
  }
  return { accepted, dropped };
}

export function resolveSocialProfileConnection(
  profileValue: unknown,
  connectionValue: unknown
): { decision: "eligible" | "held" | "denied"; authorityGranted: false; publishingAuthorized: false; reason: string } {
  const profile = SocialProfileSchema.safeParse(profileValue);
  const connection = SocialConnectionSchema.safeParse(connectionValue);
  if (!profile.success || !connection.success) return { decision: "denied", authorityGranted: false, publishingAuthorized: false, reason: "malformed-profile-or-connection" };
  if (connection.data.profileId !== profile.data.id) return { decision: "denied", authorityGranted: false, publishingAuthorized: false, reason: "profile-connection-mismatch" };
  if (profile.data.kind === "simulation" || profile.data.role === "simulation") return { decision: "denied", authorityGranted: false, publishingAuthorized: false, reason: "simulation-fixture" };
  if (profile.data.kind === "owner-personal" || !profile.data.liveEligible) return { decision: "held", authorityGranted: false, publishingAuthorized: false, reason: "profile-not-live-eligible" };
  if (connection.data.mode !== "autopublish" || connection.data.health.status !== "healthy") return { decision: "held", authorityGranted: false, publishingAuthorized: false, reason: "connection-not-live" };
  return { decision: "eligible", authorityGranted: false, publishingAuthorized: false, reason: "independent-runtime-gates-required" };
}
