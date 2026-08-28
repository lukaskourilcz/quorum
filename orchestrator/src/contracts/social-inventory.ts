import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  EvidenceRefSchema,
  Sha256Schema,
  VentureIdSchema
} from "./common.js";
import { SocialCapabilityRefSchema } from "./social-distribution.js";

const ProfileIdSchema = z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140);
const StrategyIdSchema = z.string().regex(/^social-profile-strategy-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(180);
const PillarIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80);
const FormatIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(80);
const PlatformSchema = z.enum(["instagram", "threads"]);
const LocaleSchema = z.enum(["cs", "en"]);

const StrategyFormatSchema = z.strictObject({
  id: FormatIdSchema,
  label: z.string().trim().min(1).max(120),
  pillarId: PillarIdSchema,
  candidateClass: z.enum(["original", "reserve", "recurring"]),
  platforms: z.array(PlatformSchema).min(1).max(2),
  locales: z.array(LocaleSchema).min(1).max(2),
  evidenceRequirements: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  sourceClasses: z.array(z.enum(["strategy-owned", "profile-owned", "approved-package", "goviral-intelligence", "accepted-campaign"])).min(1).max(5),
  assetRequirement: z.enum(["none", "optional-design-lab", "required-design-lab"]),
  altTextRequired: z.boolean(),
  deterministicBriefTemplate: z.string().trim().min(1).max(500)
});

export const SocialProfileStrategySchema = z.strictObject({
  schemaVersion: z.literal("social-profile-strategy/1"),
  id: StrategyIdSchema,
  profileId: ProfileIdSchema,
  profileRole: z.enum(["venture-primary", "company-umbrella", "owned-amplifier"]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  purpose: z.string().trim().min(1).max(500),
  audience: z.string().trim().min(1).max(500),
  languages: z.array(LocaleSchema).min(1).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(20),
  allowedCapabilities: z.array(SocialCapabilityRefSchema).max(50),
  contentPillars: z.array(z.strictObject({
    id: PillarIdSchema,
    label: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(500),
    allowedSourceClasses: z.array(z.enum(["strategy-owned", "profile-owned", "approved-package", "goviral-intelligence", "accepted-campaign"])).min(1).max(5)
  })).min(1).max(12),
  recurringFormats: z.array(StrategyFormatSchema).min(3).max(30),
  prohibited: z.strictObject({
    topics: z.array(z.string().trim().min(1).max(160)).max(50),
    claims: z.array(z.string().trim().min(1).max(240)).min(1).max(50),
    formats: z.array(z.string().trim().min(1).max(160)).min(1).max(30)
  }),
  cadence: z.strictObject({
    minimumPerWeek: z.number().int().min(0).max(21),
    targetPerWeek: z.number().int().min(0).max(21),
    maximumPerWeek: z.number().int().min(0).max(35),
    preferredWindows: z.array(z.string().trim().min(1).max(80)).max(20),
    prohibitedWindows: z.array(z.string().trim().min(1).max(80)).max(20)
  }),
  policyRefs: z.strictObject({
    amplificationPolicyRef: EvidenceRefSchema,
    launchRunwayRef: EvidenceRefSchema,
    originalSupportRatioRef: EvidenceRefSchema,
    sameSourceCooldownRef: EvidenceRefSchema,
    supportCapRef: EvidenceRefSchema
  }),
  platformCaps: z.strictObject({
    instagram: z.strictObject({ perDay: z.number().int().min(0).max(5), perWeek: z.number().int().min(0).max(21) }),
    threads: z.strictObject({ perDay: z.number().int().min(0).max(10), perWeek: z.number().int().min(0).max(35) })
  }),
  assets: z.strictObject({
    rendererRef: z.literal("Design Lab"),
    allowedKinds: z.array(z.enum(["none", "image", "carousel", "video-brief"])).min(1).max(4),
    altTextRequiredForVisuals: z.literal(true)
  }),
  localeToneGuidance: z.array(z.strictObject({ locale: LocaleSchema, guidance: z.string().trim().min(1).max(500) })).min(1).max(2),
  generationPolicy: z.strictObject({
    deterministicFirst: z.literal(true),
    cacheByContentAndStrategyVersion: z.literal(true),
    modelRole: z.string().trim().min(1).max(160).nullable(),
    maximumModelCallsPerBuild: z.number().int().min(0).max(3),
    maximumCostUsdPerBuild: z.number().min(0).max(1),
    modelFailurePolicy: z.literal("preserve-deterministic-inventory")
  }),
  ownerControls: z.strictObject({
    vetoRefs: z.array(EvidenceRefSchema).max(100),
    correctionRefs: z.array(EvidenceRefSchema).max(100),
    stricterOnlyWithoutNewDecision: z.literal(true)
  }),
  reviewDate: DateSchema,
  stopConditions: z.array(z.string().trim().min(1).max(240)).min(1).max(30),
  authorityGranted: z.literal(false),
  queueAuthorized: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((strategy, context) => {
  if (!(strategy.cadence.minimumPerWeek <= strategy.cadence.targetPerWeek && strategy.cadence.targetPerWeek <= strategy.cadence.maximumPerWeek)) {
    context.addIssue({ code: "custom", message: "Strategy cadence must be minimum <= target <= maximum", path: ["cadence"] });
  }
  const pillarIds = strategy.contentPillars.map(({ id }) => id);
  const formatIds = strategy.recurringFormats.map(({ id }) => id);
  if (new Set(pillarIds).size !== pillarIds.length) context.addIssue({ code: "custom", message: "Content pillar ids must be unique", path: ["contentPillars"] });
  if (new Set(formatIds).size !== formatIds.length) context.addIssue({ code: "custom", message: "Recurring format ids must be unique", path: ["recurringFormats"] });
  for (const [index, format] of strategy.recurringFormats.entries()) {
    const pillar = strategy.contentPillars.find(({ id }) => id === format.pillarId);
    if (!pillar) context.addIssue({ code: "custom", message: "Format references an unknown pillar", path: ["recurringFormats", index, "pillarId"] });
    if (format.sourceClasses.some((source) => !pillar?.allowedSourceClasses.includes(source))) {
      context.addIssue({ code: "custom", message: "Format source exceeds its pillar", path: ["recurringFormats", index, "sourceClasses"] });
    }
    if (format.assetRequirement !== "none" && !format.altTextRequired) {
      context.addIssue({ code: "custom", message: "Every visual format requires alt text", path: ["recurringFormats", index, "altTextRequired"] });
    }
  }
  if (strategy.localeToneGuidance.some(({ locale }) => !strategy.languages.includes(locale))) {
    context.addIssue({ code: "custom", message: "Tone guidance must use a strategy language", path: ["localeToneGuidance"] });
  }
});

export const SocialProfileStrategyRegistrySchema = z.strictObject({
  schemaVersion: z.literal("social-profile-strategy-registry/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  updatedAt: DateTimeSchema,
  ownerDecisionRef: EvidenceRefSchema,
  strategies: z.array(SocialProfileStrategySchema).max(200)
}).superRefine((registry, context) => {
  const ids = registry.strategies.map(({ id }) => id);
  const profiles = registry.strategies.map(({ profileId }) => profileId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Strategy ids must be unique", path: ["strategies"] });
  if (new Set(profiles).size !== profiles.length) context.addIssue({ code: "custom", message: "A profile can have only one effective strategy in the registry", path: ["strategies"] });
});

export const SocialInventoryCandidateSchema = z.strictObject({
  schemaVersion: z.literal("social-inventory-candidate/1"),
  id: z.string().regex(/^social-inventory-candidate-[a-f0-9]{20}$/u),
  profileId: ProfileIdSchema,
  strategyId: StrategyIdSchema,
  strategyVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  candidateType: z.enum(["original", "reserve", "recurring", "campaign"]),
  pillarId: PillarIdSchema,
  formatId: FormatIdSchema,
  platform: PlatformSchema,
  locale: LocaleSchema,
  contentRef: EvidenceRefSchema,
  contentBrief: z.string().trim().min(1).max(1_000),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(50),
  sourceRefs: z.array(EvidenceRefSchema).min(1).max(50),
  sourceKind: z.enum(["strategy-owned", "profile-owned", "approved-package", "goviral-intelligence", "accepted-campaign"]),
  sourceVentureId: VentureIdSchema.nullable(),
  capabilityRef: SocialCapabilityRefSchema.nullable(),
  approvedPackageRef: EvidenceRefSchema.nullable(),
  campaignRef: EvidenceRefSchema.nullable(),
  asset: z.strictObject({
    readiness: z.enum(["not-required", "ready", "held", "unavailable"]),
    assetRefs: z.array(EvidenceRefSchema).max(20),
    altTextReady: z.boolean()
  }),
  usefulWindow: z.strictObject({ earliest: DateTimeSchema, latest: DateTimeSchema, expiresAt: DateTimeSchema }),
  similarityHash: Sha256Schema,
  estimatedCostUsd: z.number().min(0).max(1),
  authorityClass: z.enum(["deterministic-plan", "bounded-model-plan", "campaign-reference"]),
  classification: z.enum(["original", "support"]),
  state: z.enum(["eligible", "held", "expired", "superseded"]),
  reason: z.string().trim().min(1).max(500),
  finalCopy: z.literal(false),
  generatedAt: DateTimeSchema,
  generatorVersion: z.literal("social-inventory-builder/1"),
  inputHash: Sha256Schema,
  supersedesCandidateRef: EvidenceRefSchema.nullable(),
  correctedByRef: EvidenceRefSchema.nullable(),
  queueAuthorized: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((candidate, context) => {
  if (!(Date.parse(candidate.usefulWindow.earliest) < Date.parse(candidate.usefulWindow.latest)
    && Date.parse(candidate.usefulWindow.latest) <= Date.parse(candidate.usefulWindow.expiresAt))) {
    context.addIssue({ code: "custom", message: "Candidate useful window is invalid", path: ["usefulWindow"] });
  }
  if (candidate.sourceKind === "strategy-owned" && (candidate.sourceVentureId !== null || candidate.capabilityRef !== null)) {
    context.addIssue({ code: "custom", message: "Strategy-owned plans do not create venture capability edges", path: ["sourceKind"] });
  }
  if (["approved-package", "goviral-intelligence"].includes(candidate.sourceKind) && (!candidate.sourceVentureId || !candidate.capabilityRef)) {
    context.addIssue({ code: "custom", message: "External input needs its exact source and capability", path: ["capabilityRef"] });
  }
  if (candidate.sourceKind === "approved-package" && candidate.approvedPackageRef === null) {
    context.addIssue({ code: "custom", message: "Approved-package input needs the bounded package reference", path: ["approvedPackageRef"] });
  }
  if (candidate.sourceKind === "accepted-campaign" && (candidate.candidateType !== "campaign" || candidate.campaignRef === null || !candidate.campaignRef.startsWith("state/social/campaigns/"))) {
    context.addIssue({ code: "custom", message: "Campaign inventory can only reference a canonical #410 campaign", path: ["campaignRef"] });
  }
  if (candidate.candidateType === "campaign" && candidate.sourceKind !== "accepted-campaign") {
    context.addIssue({ code: "custom", message: "Campaign candidates must come from accepted #410 campaign state", path: ["candidateType"] });
  }
  if (["personal-growth", "kvorum", "goviral", "contest-radar"].includes(candidate.sourceVentureId ?? "")) {
    context.addIssue({ code: "custom", message: "The source is permanently isolated from core inventory", path: ["sourceVentureId"] });
  }
});

export const SocialProfileInventorySchema = z.strictObject({
  schemaVersion: z.literal("social-profile-inventory/1"),
  id: z.string().regex(/^social-profile-inventory-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(180),
  profileId: ProfileIdSchema,
  strategyId: StrategyIdSchema,
  strategyVersion: z.string().regex(/^\d+\.\d+\.\d+$/u),
  horizonStart: DateSchema,
  horizonDays: z.number().int().min(7).max(10),
  coverageDays: z.number().int().min(0).max(10),
  state: z.enum(["healthy", "low-runway", "no-candidate", "held"]),
  counts: z.strictObject({ original: z.number().int().nonnegative(), reserve: z.number().int().nonnegative(), recurring: z.number().int().nonnegative(), campaign: z.number().int().nonnegative(), eligible: z.number().int().nonnegative(), held: z.number().int().nonnegative() }),
  ratioProjection: z.strictObject({ original: z.number().int().nonnegative(), support: z.number().int().nonnegative(), policyRef: EvidenceRefSchema }),
  candidates: z.array(SocialInventoryCandidateSchema).max(100),
  generatedAt: DateTimeSchema,
  inputHash: Sha256Schema,
  previousInventoryRef: EvidenceRefSchema.nullable(),
  supersededCandidateRefs: z.array(EvidenceRefSchema).max(100),
  queueAuthorized: z.literal(false),
  publishingAuthorized: z.literal(false)
}).superRefine((inventory, context) => {
  const count = (type: "original" | "reserve" | "recurring" | "campaign") => inventory.candidates.filter(({ candidateType }) => candidateType === type).length;
  for (const type of ["original", "reserve", "recurring", "campaign"] as const) {
    if (inventory.counts[type] !== count(type)) context.addIssue({ code: "custom", message: `Inventory ${type} count is inconsistent`, path: ["counts", type] });
  }
  if (inventory.counts.eligible !== inventory.candidates.filter(({ state }) => state === "eligible").length
    || inventory.counts.held !== inventory.candidates.filter(({ state }) => state === "held").length) {
    context.addIssue({ code: "custom", message: "Inventory state counts are inconsistent", path: ["counts"] });
  }
  if (inventory.ratioProjection.original !== inventory.candidates.filter(({ classification }) => classification === "original").length
    || inventory.ratioProjection.support !== inventory.candidates.filter(({ classification }) => classification === "support").length) {
    context.addIssue({ code: "custom", message: "Inventory ratio projection is inconsistent", path: ["ratioProjection"] });
  }
});

export const SocialInventoryBuildReceiptSchema = z.strictObject({
  schemaVersion: z.literal("social-inventory-build-receipt/1"),
  id: z.string().regex(/^social-inventory-build-receipt-[a-f0-9]{20}$/u),
  profileId: ProfileIdSchema,
  strategyId: StrategyIdSchema,
  mode: z.enum(["weekly", "refill"]),
  capacityPlanRef: EvidenceRefSchema,
  status: z.enum(["built", "reused", "low-runway", "no-candidate", "held"]),
  inputHash: Sha256Schema,
  previousCandidateCount: z.number().int().nonnegative(),
  resultingCandidateCount: z.number().int().nonnegative(),
  reusedCandidates: z.number().int().nonnegative(),
  generatedCandidates: z.number().int().nonnegative(),
  expiredCandidates: z.number().int().nonnegative(),
  supersededCandidates: z.number().int().nonnegative(),
  actualCostUsd: z.number().min(0).max(1),
  providerCalls: z.number().int().min(0).max(3),
  providerCallsAvoided: z.number().int().nonnegative(),
  modelUnavailable: z.boolean(),
  incidentRefs: z.array(EvidenceRefSchema).max(100),
  inventoryRef: EvidenceRefSchema.nullable(),
  generatedAt: DateTimeSchema,
  authorityGranted: z.literal(false),
  queueAuthorized: z.literal(false),
  publishingAuthorized: z.literal(false)
});

export type SocialProfileStrategy = z.infer<typeof SocialProfileStrategySchema>;
export type SocialProfileStrategyRegistry = z.infer<typeof SocialProfileStrategyRegistrySchema>;
export type SocialInventoryCandidate = z.infer<typeof SocialInventoryCandidateSchema>;
export type SocialProfileInventory = z.infer<typeof SocialProfileInventorySchema>;
export type SocialInventoryBuildReceipt = z.infer<typeof SocialInventoryBuildReceiptSchema>;
