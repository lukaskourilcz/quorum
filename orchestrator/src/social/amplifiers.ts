import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AmplificationPolicySchema,
  AmplifierArchetypeSchema,
  SocialCapabilityRefSchema,
  SocialPlatformSchema,
  type AmplificationPolicy,
  type SocialCapabilityRef
} from "../contracts/social-distribution.js";
import { DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, VentureIdSchema } from "../contracts/common.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { configRoot, stateRoot } from "../paths.js";
import { loadVentureCapabilityMap, resolveVentureCapabilityInMap } from "../ventures/capabilities.js";

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100);
const TextSchema = z.string().trim().min(1).max(500);
const LocaleSchema = z.enum(["cs", "en"]);
const LifecycleSchema = z.enum([
  "idea",
  "proposed",
  "setup-needed",
  "connected",
  "active",
  "paused",
  "retired",
  "rejected"
]);

const ProposalPolicyOverrideSchema = z.strictObject({
  minimumOriginalContentRatio: z.number().finite().min(0).max(1).nullable(),
  maximumVentureSupportRatio: z.number().finite().min(0).max(1).nullable(),
  sameSourceVentureCooldownDays: z.number().int().nonnegative().max(365).nullable(),
  maximumActiveSupportCampaigns: z.number().int().nonnegative().max(20).nullable(),
  minimumStaggerHours: z.number().int().nonnegative().max(168).nullable(),
  reason: TextSchema
});

export const AmplifierProposalSchema = z.strictObject({
  schemaVersion: z.literal("social-amplifier-proposal/1"),
  id: z.string().regex(/^amplifier-proposal-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140),
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(120),
  profileKind: z.literal("owned-brand"),
  profileRole: z.literal("owned-amplifier"),
  proposalOrigin: z.literal("owner-proposal"),
  workingName: z.string().trim().min(1).max(180),
  publicNameCandidates: z.array(z.string().trim().min(1).max(180)).min(1).max(8),
  publicHandleCandidates: z.array(z.string().regex(/^@[A-Za-z0-9._]{1,60}$/u)).max(8),
  ownerRef: SlugSchema,
  entityRef: SlugSchema,
  archetype: AmplifierArchetypeSchema,
  purpose: TextSchema,
  audience: TextSchema,
  independentReasonToFollow: TextSchema,
  languages: z.array(LocaleSchema).min(1).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(12),
  supportedTopics: z.array(SlugSchema).min(1).max(24),
  supportedVentures: z.array(VentureIdSchema).max(24),
  capabilityRefs: z.array(SocialCapabilityRefSchema).max(24),
  identity: z.strictObject({
    presentation: z.literal("transparent-owned-brand"),
    fictionalPerson: z.literal(false),
    repostOnly: z.literal(false),
    rawAccountCountGoal: z.literal(false)
  }),
  originalContentPromise: TextSchema,
  repeatableFormats: z.array(z.strictObject({
    id: SlugSchema,
    name: z.string().trim().min(1).max(160),
    description: TextSchema,
    sourcePlan: TextSchema
  })).max(12),
  expectedCadence: z.strictObject({
    postsPerWeek: z.number().int().nonnegative().max(14),
    sourcePlan: TextSchema
  }),
  launchRunway: z.strictObject({
    requiredOriginalPosts: z.number().int().positive().max(30),
    completedOriginalPosts: z.number().int().nonnegative().max(30),
    firstOriginalConcepts: z.array(z.strictObject({
      id: SlugSchema,
      title: z.string().trim().min(1).max(180),
      formatRef: SlugSchema,
      audienceAngle: TextSchema
    })).max(30),
    evidenceRefs: z.array(EvidenceRefSchema).max(24)
  }),
  maximumSupportRatio: z.number().finite().min(0).max(1),
  policyOverride: ProposalPolicyOverrideSchema.nullable(),
  overlapAnalysis: z.strictObject({
    reviewedProfileIds: z.array(z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u)).max(100),
    summary: TextSchema,
    collisionWarnings: z.array(z.string().trim().min(1).max(240)).max(24)
  }),
  platformDirection: z.strictObject({
    platforms: z.array(SocialPlatformSchema).min(1).max(2),
    markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(12),
    verdict: z.enum(["pending", "approved", "rejected"]),
    ownerEvidenceRef: EvidenceRefSchema.nullable()
  }),
  factualBio: z.string().trim().min(1).max(300),
  logoAvatarRef: EvidenceRefSchema,
  canonicalDestination: HttpsUrlSchema,
  lifecycle: LifecycleSchema,
  ownerDecision: z.strictObject({
    verdict: z.enum(["accept", "hold", "reject"]),
    at: DateTimeSchema,
    evidenceRef: EvidenceRefSchema,
    reason: TextSchema
  }).nullable(),
  validationPlan: z.strictObject({
    reviewAfterDays: z.number().int().min(60).max(90),
    evidenceRequirements: z.array(z.enum([
      "original-consistency",
      "independent-audience-reason",
      "qualified-results",
      "support-versus-baseline",
      "policy-incidents",
      "owner-attention",
      "provider-and-model-cost"
    ])).min(7).max(7),
    stopConditions: z.array(z.string().trim().min(1).max(300)).min(1).max(20)
  }),
  history: z.array(z.strictObject({
    revision: z.number().int().positive(),
    at: DateTimeSchema,
    action: z.enum(["created", "edited", "submitted", "accepted", "held", "rejected", "setup-requested", "connected", "activated", "paused", "retired", "corrected"]),
    actor: z.enum(["owner", "system"]),
    evidenceRef: EvidenceRefSchema,
    reason: TextSchema,
    supersedesRevision: z.number().int().positive().nullable()
  })).min(1).max(500),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema
}).superRefine((proposal, context) => {
  const ventureIds = new Set(proposal.supportedVentures);
  const capabilitySources = new Set(proposal.capabilityRefs.map((edge) => edge.source));
  if (ventureIds.size !== proposal.supportedVentures.length || capabilitySources.size !== proposal.capabilityRefs.length) {
    context.addIssue({ code: "custom", message: "Supported ventures and capability references must be unique" });
  }
  if (proposal.capabilityRefs.some((edge) => !ventureIds.has(edge.source))) {
    context.addIssue({ code: "custom", message: "Capability references may name only explicitly supported ventures", path: ["capabilityRefs"] });
  }
  for (const [pathName, values] of [
    ["publicNameCandidates", proposal.publicNameCandidates],
    ["publicHandleCandidates", proposal.publicHandleCandidates],
    ["supportedTopics", proposal.supportedTopics],
    ["languages", proposal.languages],
    ["markets", proposal.markets],
    ["platforms", proposal.platformDirection.platforms],
    ["directionMarkets", proposal.platformDirection.markets]
  ] as const) {
    if (new Set(values).size !== values.length) context.addIssue({ code: "custom", message: "Proposal lists cannot contain duplicates", path: [pathName] });
  }
  if (proposal.launchRunway.completedOriginalPosts > proposal.launchRunway.firstOriginalConcepts.length) {
    context.addIssue({ code: "custom", message: "Completed runway cannot exceed the recorded original concepts", path: ["launchRunway"] });
  }
  if (proposal.launchRunway.completedOriginalPosts > 0 && proposal.launchRunway.evidenceRefs.length === 0) {
    context.addIssue({ code: "custom", message: "Completed runway posts require evidence", path: ["launchRunway", "evidenceRefs"] });
  }
  if (proposal.platformDirection.verdict === "pending" && proposal.platformDirection.ownerEvidenceRef !== null) {
    context.addIssue({ code: "custom", message: "Pending platform direction has no owner decision evidence", path: ["platformDirection"] });
  }
  if (proposal.platformDirection.verdict !== "pending" && proposal.platformDirection.ownerEvidenceRef === null) {
    context.addIssue({ code: "custom", message: "Approved or rejected platform direction requires owner evidence", path: ["platformDirection"] });
  }
  if (proposal.markets.some((market) => !proposal.platformDirection.markets.includes(market))) {
    context.addIssue({ code: "custom", message: "Platform direction must cover every proposal market", path: ["platformDirection", "markets"] });
  }
  if (["setup-needed", "connected", "active"].includes(proposal.lifecycle)
    && (proposal.ownerDecision?.verdict !== "accept" || proposal.platformDirection.verdict !== "approved")) {
    context.addIssue({ code: "custom", message: "Setup, connected and active lifecycle require accepted purpose and owner-approved direction", path: ["lifecycle"] });
  }
  if (proposal.lifecycle === "rejected" && proposal.ownerDecision?.verdict !== "reject") {
    context.addIssue({ code: "custom", message: "Rejected lifecycle requires a recorded owner rejection", path: ["ownerDecision"] });
  }
  const formatIds = new Set(proposal.repeatableFormats.map((format) => format.id));
  if (formatIds.size !== proposal.repeatableFormats.length || proposal.launchRunway.firstOriginalConcepts.some((concept) => !formatIds.has(concept.formatRef))) {
    context.addIssue({ code: "custom", message: "Runway concepts must use unique declared repeatable formats", path: ["repeatableFormats"] });
  }
  if (new Set(proposal.validationPlan.evidenceRequirements).size !== proposal.validationPlan.evidenceRequirements.length) {
    context.addIssue({ code: "custom", message: "The validation plan must contain each required evidence class exactly once", path: ["validationPlan", "evidenceRequirements"] });
  }
  const revisions = proposal.history.map((event) => event.revision);
  if (new Set(revisions).size !== revisions.length || revisions.some((revision, index) => index > 0 && revision <= revisions[index - 1]!)) {
    context.addIssue({ code: "custom", message: "Proposal history revisions must be unique and ascending", path: ["history"] });
  }
});

export const AmplifierPortfolioSchema = z.strictObject({
  schemaVersion: z.literal("social-amplifier-portfolio/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  ownerRef: SlugSchema,
  updatedAt: DateTimeSchema,
  ownerDecisionRef: EvidenceRefSchema,
  proposals: z.array(AmplifierProposalSchema).max(100),
  history: z.array(z.strictObject({
    revision: z.number().int().positive(),
    at: DateTimeSchema,
    action: z.enum(["created", "corrected", "superseded"]),
    ownerDecisionRef: EvidenceRefSchema,
    reason: TextSchema
  })).min(1).max(100)
}).superRefine((portfolio, context) => {
  const ids = portfolio.proposals.flatMap((proposal) => [proposal.id, proposal.profileId]);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Proposal and profile ids must be globally unique", path: ["proposals"] });
  const revisions = portfolio.history.map((event) => event.revision);
  if (new Set(revisions).size !== revisions.length || revisions.some((revision, index) => index > 0 && revision <= revisions[index - 1]!)) {
    context.addIssue({ code: "custom", message: "Portfolio history revisions must be unique and ascending", path: ["history"] });
  }
});

export type AmplifierProposal = z.infer<typeof AmplifierProposalSchema>;
export type AmplifierPortfolio = z.infer<typeof AmplifierPortfolioSchema>;

export type AmplifierGateVerdict = "accept" | "hold" | "reject";

export interface AmplifierGateReason {
  code: string;
  component: "identity" | "purpose" | "formats" | "cadence" | "capability" | "naming" | "direction" | "owner" | "validation";
  disposition: "hold" | "reject";
  message: string;
}

export interface AmplifierPurposeGate {
  verdict: AmplifierGateVerdict;
  reasons: AmplifierGateReason[];
  proposal: AmplifierProposal | null;
  allowedEdges: SocialCapabilityRef[];
  authorityGranted: false;
  publishingAuthorized: false;
}

function rawRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/^@/u, "");
}

export function evaluateAmplifierPurpose(
  proposalValue: unknown,
  capabilityMap: VentureCapabilityMap,
  conflicts: { existingNames?: readonly string[]; existingHandles?: readonly string[] } = {}
): AmplifierPurposeGate {
  const reasons: AmplifierGateReason[] = [];
  const raw = rawRecord(proposalValue);
  if (raw?.proposalOrigin === "simulation" || raw?.proposalOrigin === "contact") {
    reasons.push({ code: "conversion-forbidden", component: "identity", disposition: "reject", message: "Simulation and contact records cannot become owned amplifiers." });
  }
  if (raw?.profileKind !== undefined && raw.profileKind !== "owned-brand") {
    reasons.push({ code: "transparent-brand-required", component: "identity", disposition: "reject", message: "An amplifier must remain a transparent owned brand." });
  }
  const identity = rawRecord(raw?.identity);
  if (identity?.fictionalPerson === true || identity?.repostOnly === true || identity?.rawAccountCountGoal === true) {
    reasons.push({ code: "forbidden-purpose", component: "identity", disposition: "reject", message: "Fake-person, repost-only and raw account-count purposes are forbidden." });
  }

  const parsed = AmplifierProposalSchema.safeParse(proposalValue);
  if (!parsed.success) {
    reasons.push({ code: "invalid-proposal", component: "purpose", disposition: "reject", message: "The proposal does not satisfy social-amplifier-proposal/1." });
    return { verdict: "reject", reasons, proposal: null, allowedEdges: [], authorityGranted: false, publishingAuthorized: false };
  }
  const proposal = parsed.data;

  if (proposal.repeatableFormats.length < 2) {
    reasons.push({ code: "two-formats-required", component: "formats", disposition: "hold", message: "At least two repeatable original formats are required." });
  }
  if (proposal.expectedCadence.postsPerWeek < 1 || proposal.launchRunway.firstOriginalConcepts.length < proposal.launchRunway.requiredOriginalPosts) {
    reasons.push({ code: "source-plan-incomplete", component: "cadence", disposition: "hold", message: "Cadence and a complete original launch-runway source plan are required." });
  }

  const allowedEdges: SocialCapabilityRef[] = [];
  for (const venture of proposal.supportedVentures) {
    const reference = proposal.capabilityRefs.find((edge) => edge.source === venture);
    if (!reference) {
      reasons.push({ code: "capability-reference-missing", component: "capability", disposition: "reject", message: `No exact #424 capability reference exists for ${venture}.` });
      continue;
    }
    const resolution = resolveVentureCapabilityInMap(capabilityMap, {
      source: venture,
      target: "social-distribution",
      capability: "approved-publish-package",
      schemaVersion: "approved-publish-package/1"
    });
    if (resolution.decision !== "allowed" || resolution.edge === null) {
      reasons.push({ code: "capability-denied", component: "capability", disposition: "reject", message: `The exact #424 edge for ${venture} is missing, held or denied.` });
      continue;
    }
    if (reference.mapVersion !== capabilityMap.mapVersion
      || reference.decisionReference !== resolution.edge.governingReference
      || reference.dataSchemaVersion !== resolution.edge.dataSchemaVersion) {
      reasons.push({ code: "capability-reference-stale", component: "capability", disposition: "reject", message: `The capability reference for ${venture} is stale or mismatched.` });
      continue;
    }
    allowedEdges.push(reference);
  }
  if (proposal.supportedVentures.length !== proposal.capabilityRefs.length) {
    reasons.push({ code: "capability-set-not-exact", component: "capability", disposition: "reject", message: "Supported ventures and exact capability references must match one-for-one." });
  }

  const reserved = new Set([
    ...(conflicts.existingNames ?? []),
    ...(conflicts.existingHandles ?? [])
  ].map(normalizedName));
  const proposedNames = [proposal.workingName, ...proposal.publicNameCandidates, ...proposal.publicHandleCandidates].map(normalizedName);
  if (proposedNames.some((candidate) => reserved.has(candidate))) {
    reasons.push({ code: "name-conflict", component: "naming", disposition: "hold", message: "A candidate name or handle conflicts with an existing identity." });
  }

  if (proposal.platformDirection.verdict === "rejected") {
    reasons.push({ code: "direction-rejected", component: "direction", disposition: "reject", message: "The owner rejected the proposed platform or market direction." });
  } else if (proposal.platformDirection.verdict !== "approved") {
    reasons.push({ code: "direction-not-approved", component: "direction", disposition: "hold", message: "Platform and market direction still needs owner approval." });
  }

  if (proposal.ownerDecision?.verdict === "reject") {
    reasons.push({ code: "owner-rejected", component: "owner", disposition: "reject", message: "The owner rejected the proposal." });
  } else if (proposal.ownerDecision?.verdict !== "accept") {
    reasons.push({ code: "owner-decision-required", component: "owner", disposition: "hold", message: "An affirmative owner decision is required." });
  }

  const verdict: AmplifierGateVerdict = reasons.some((reason) => reason.disposition === "reject")
    ? "reject"
    : reasons.length > 0 ? "hold" : "accept";
  return { verdict, reasons, proposal, allowedEdges, authorityGranted: false, publishingAuthorized: false };
}

export interface EffectiveAmplifierPolicy {
  valid: boolean;
  reasons: string[];
  version: string | null;
  ownerDecisionRef: string | null;
  minimumOriginalContentRatio: number | null;
  maximumVentureSupportRatio: number | null;
  rollingWindowPosts: number | null;
  originalContentRunwayPosts: number | null;
  sameSourceVentureCooldownDays: number | null;
  maximumActiveSupportCampaigns: number | null;
  duplicateCaptionThreshold: number | null;
  duplicateAssetRejected: boolean;
  audienceSpecificAngleRequired: boolean;
  staggerRequired: boolean;
  minimumStaggerHours: number | null;
}

function baseEffectivePolicy(policy: AmplificationPolicy): EffectiveAmplifierPolicy {
  return {
    valid: true,
    reasons: [],
    version: policy.version,
    ownerDecisionRef: policy.ownerDecisionRef,
    ...policy.values
  };
}

function applyStrictOverride(
  result: EffectiveAmplifierPolicy,
  override: z.infer<typeof ProposalPolicyOverrideSchema> | null,
  label: string
): void {
  if (!override) return;
  const loosens = (
    (override.minimumOriginalContentRatio !== null && override.minimumOriginalContentRatio < result.minimumOriginalContentRatio!)
    || (override.maximumVentureSupportRatio !== null && override.maximumVentureSupportRatio > result.maximumVentureSupportRatio!)
    || (override.sameSourceVentureCooldownDays !== null && override.sameSourceVentureCooldownDays < result.sameSourceVentureCooldownDays!)
    || (override.maximumActiveSupportCampaigns !== null && override.maximumActiveSupportCampaigns > result.maximumActiveSupportCampaigns!)
    || (override.minimumStaggerHours !== null && override.minimumStaggerHours < result.minimumStaggerHours!)
  );
  if (loosens) {
    result.valid = false;
    result.reasons.push(`${label}-override-loosens-effective-policy`);
    return;
  }
  if (override.minimumOriginalContentRatio !== null) result.minimumOriginalContentRatio = Math.max(result.minimumOriginalContentRatio!, override.minimumOriginalContentRatio);
  if (override.maximumVentureSupportRatio !== null) result.maximumVentureSupportRatio = Math.min(result.maximumVentureSupportRatio!, override.maximumVentureSupportRatio);
  if (override.sameSourceVentureCooldownDays !== null) result.sameSourceVentureCooldownDays = Math.max(result.sameSourceVentureCooldownDays!, override.sameSourceVentureCooldownDays);
  if (override.maximumActiveSupportCampaigns !== null) result.maximumActiveSupportCampaigns = Math.min(result.maximumActiveSupportCampaigns!, override.maximumActiveSupportCampaigns);
  if (override.minimumStaggerHours !== null) result.minimumStaggerHours = Math.max(result.minimumStaggerHours!, override.minimumStaggerHours);
}

export function resolveEffectiveAmplifierPolicy(
  policyValue: unknown,
  proposalValue: unknown,
  platform: z.infer<typeof SocialPlatformSchema>
): EffectiveAmplifierPolicy {
  const policy = AmplificationPolicySchema.safeParse(policyValue);
  const proposal = AmplifierProposalSchema.safeParse(proposalValue);
  if (!policy.success || !proposal.success) {
    return {
      valid: false,
      reasons: ["invalid-policy-or-proposal"],
      version: null,
      ownerDecisionRef: null,
      minimumOriginalContentRatio: null,
      maximumVentureSupportRatio: null,
      rollingWindowPosts: null,
      originalContentRunwayPosts: null,
      sameSourceVentureCooldownDays: null,
      maximumActiveSupportCampaigns: null,
      duplicateCaptionThreshold: null,
      duplicateAssetRejected: false,
      audienceSpecificAngleRequired: false,
      staggerRequired: false,
      minimumStaggerHours: null
    };
  }
  const result = baseEffectivePolicy(policy.data);
  const platformOverride = policy.data.platformOverrides.find((override) => override.platform === platform) ?? null;
  const profileOverride = policy.data.profileOverrides.find((override) => override.profileId === proposal.data.profileId) ?? null;
  applyStrictOverride(result, platformOverride, "platform");
  applyStrictOverride(result, profileOverride, "profile");
  applyStrictOverride(result, proposal.data.policyOverride, "proposal");
  if (proposal.data.maximumSupportRatio > result.maximumVentureSupportRatio!) {
    result.valid = false;
    result.reasons.push("proposal-support-ratio-loosens-effective-policy");
  } else {
    result.maximumVentureSupportRatio = Math.min(result.maximumVentureSupportRatio!, proposal.data.maximumSupportRatio);
    result.minimumOriginalContentRatio = Math.max(result.minimumOriginalContentRatio!, 1 - proposal.data.maximumSupportRatio);
  }
  return result;
}

export interface AmplifierSupportContext {
  sourceVentureId: string;
  rollingOriginalPosts: number;
  rollingSupportPosts: number;
  activeSupportCampaigns: number;
  daysSinceSameSourceVenture: number | null;
  duplicateCaption: boolean;
  duplicateAsset: boolean;
  staggerHours: number | null;
  hasAudienceSpecificAngle: boolean;
}

export interface AmplifierEligibility {
  proposalId: string | null;
  profileId: string | null;
  lifecycle: z.infer<typeof LifecycleSchema> | null;
  purposeGate: AmplifierPurposeGate;
  allowedEdges: SocialCapabilityRef[];
  launchRunway: { required: number | null; completed: number | null; held: boolean };
  effectivePolicy: EffectiveAmplifierPolicy;
  setupEligibility: { eligible: boolean; reasons: string[] };
  supportEligibility: { eligible: boolean; reasons: string[] };
  overlapWarnings: string[];
  policyVersion: string | null;
  policyEvidenceRef: string | null;
  purposeEvidenceRef: string | null;
  authorityGranted: false;
  publishingAuthorized: false;
}

export function resolveAmplifierEligibility(input: {
  proposal: unknown;
  policy: unknown;
  capabilityMap: VentureCapabilityMap;
  platform: z.infer<typeof SocialPlatformSchema>;
  conflicts?: { existingNames?: readonly string[]; existingHandles?: readonly string[] };
  supportContext?: AmplifierSupportContext;
}): AmplifierEligibility {
  const purposeGate = evaluateAmplifierPurpose(input.proposal, input.capabilityMap, input.conflicts);
  const effectivePolicy = resolveEffectiveAmplifierPolicy(input.policy, input.proposal, input.platform);
  const proposal = purposeGate.proposal;
  const required = effectivePolicy.originalContentRunwayPosts;
  const completed = proposal?.launchRunway.completedOriginalPosts ?? null;
  const runwayHeld = required === null || completed === null || completed < required;

  const setupReasons: string[] = [];
  if (purposeGate.verdict !== "accept") setupReasons.push(`purpose-gate-${purposeGate.verdict}`);
  if (!effectivePolicy.valid) setupReasons.push(...effectivePolicy.reasons);
  if (!proposal || !["proposed", "setup-needed"].includes(proposal.lifecycle)) setupReasons.push("proposal-lifecycle-not-setup-eligible");

  const supportReasons: string[] = [];
  if (purposeGate.verdict !== "accept") supportReasons.push(`purpose-gate-${purposeGate.verdict}`);
  if (!effectivePolicy.valid) supportReasons.push(...effectivePolicy.reasons);
  if (!proposal || proposal.lifecycle !== "active") supportReasons.push("profile-not-active");
  if (runwayHeld) supportReasons.push("original-launch-runway-incomplete");
  const support = input.supportContext;
  if (!support) {
    supportReasons.push("support-context-missing");
  } else if (proposal) {
    if (!purposeGate.allowedEdges.some((edge) => edge.source === support.sourceVentureId)) supportReasons.push("irrelevant-or-denied-source-venture");
    const projectedTotal = support.rollingOriginalPosts + support.rollingSupportPosts + 1;
    const projectedSupportRatio = (support.rollingSupportPosts + 1) / projectedTotal;
    if (projectedSupportRatio > effectivePolicy.maximumVentureSupportRatio!) supportReasons.push("venture-support-ratio-exceeded");
    if (support.activeSupportCampaigns >= effectivePolicy.maximumActiveSupportCampaigns!) supportReasons.push("active-support-campaign-cap-reached");
    if (support.daysSinceSameSourceVenture !== null && support.daysSinceSameSourceVenture < effectivePolicy.sameSourceVentureCooldownDays!) supportReasons.push("same-source-cooldown-active");
    if (support.duplicateCaption) supportReasons.push("duplicate-caption-rejected");
    if (effectivePolicy.duplicateAssetRejected && support.duplicateAsset) supportReasons.push("duplicate-asset-rejected");
    if (effectivePolicy.staggerRequired && (support.staggerHours === null || support.staggerHours < effectivePolicy.minimumStaggerHours!)) supportReasons.push("minimum-stagger-not-met");
    if (effectivePolicy.audienceSpecificAngleRequired && !support.hasAudienceSpecificAngle) supportReasons.push("audience-specific-angle-required");
  }

  return {
    proposalId: proposal?.id ?? null,
    profileId: proposal?.profileId ?? null,
    lifecycle: proposal?.lifecycle ?? null,
    purposeGate,
    allowedEdges: purposeGate.allowedEdges,
    launchRunway: { required, completed, held: runwayHeld },
    effectivePolicy,
    setupEligibility: { eligible: setupReasons.length === 0, reasons: [...new Set(setupReasons)] },
    supportEligibility: { eligible: supportReasons.length === 0, reasons: [...new Set(supportReasons)] },
    overlapWarnings: proposal?.overlapAnalysis.collisionWarnings ?? [],
    policyVersion: effectivePolicy.version,
    policyEvidenceRef: effectivePolicy.ownerDecisionRef,
    purposeEvidenceRef: proposal?.ownerDecision?.evidenceRef ?? null,
    authorityGranted: false,
    publishingAuthorized: false
  };
}

export interface AmplifierSetupPacket {
  schemaVersion: "amplifier-setup-packet/1";
  proposalId: string;
  profileId: string;
  purpose: string;
  audience: string;
  nameCandidates: string[];
  handleCandidates: string[];
  factualBio: string;
  logoAvatarRef: string;
  canonicalDestination: string;
  pillars: string[];
  firstTenOriginalConcepts: Array<{ title: string; formatRef: string; audienceAngle: string }>;
  cadence: { postsPerWeek: number; launchRunwayPosts: number };
  platformSetups: Array<{
    platform: "instagram" | "threads";
    accountType: "professional-owned-brand";
    loginMode: "instagram-login" | "threads-oauth";
    requiredScopes: string[];
    credentialReferenceName: string;
  }>;
  activationChecklist: string[];
  validationReviewAfterDays: number;
  stopConditions: string[];
  authorityGranted: false;
  publishingAuthorized: false;
}

const officialPlatformSetup = {
  instagram: {
    loginMode: "instagram-login" as const,
    requiredScopes: ["instagram_business_basic", "instagram_business_content_publish"]
  },
  threads: {
    loginMode: "threads-oauth" as const,
    requiredScopes: ["threads_basic", "threads_content_publish"]
  }
};

export function generateAmplifierSetupPacket(
  eligibility: AmplifierEligibility
): { status: "ready"; packet: AmplifierSetupPacket } | { status: "held"; reasons: string[] } {
  const proposal = eligibility.purposeGate.proposal;
  if (!proposal || !eligibility.setupEligibility.eligible) {
    return { status: "held", reasons: eligibility.setupEligibility.reasons.length > 0 ? eligibility.setupEligibility.reasons : ["proposal-unavailable"] };
  }
  if (proposal.launchRunway.firstOriginalConcepts.length < 10) {
    return { status: "held", reasons: ["ten-original-concepts-required"] };
  }
  const environmentPrefix = proposal.id.replace(/^amplifier-proposal-/u, "").replace(/-/gu, "_").toUpperCase();
  return {
    status: "ready",
    packet: {
      schemaVersion: "amplifier-setup-packet/1",
      proposalId: proposal.id,
      profileId: proposal.profileId,
      purpose: proposal.purpose,
      audience: proposal.audience,
      nameCandidates: proposal.publicNameCandidates,
      handleCandidates: proposal.publicHandleCandidates,
      factualBio: proposal.factualBio,
      logoAvatarRef: proposal.logoAvatarRef,
      canonicalDestination: proposal.canonicalDestination,
      pillars: proposal.supportedTopics,
      firstTenOriginalConcepts: proposal.launchRunway.firstOriginalConcepts.slice(0, 10).map((concept) => ({
        title: concept.title,
        formatRef: concept.formatRef,
        audienceAngle: concept.audienceAngle
      })),
      cadence: {
        postsPerWeek: proposal.expectedCadence.postsPerWeek,
        launchRunwayPosts: eligibility.launchRunway.required!
      },
      platformSetups: proposal.platformDirection.platforms.map((platform) => ({
        platform,
        accountType: "professional-owned-brand" as const,
        ...officialPlatformSetup[platform],
        credentialReferenceName: `SOCIAL_${environmentPrefix}_${platform.toUpperCase()}_CREDENTIAL_REF`
      })),
      activationChecklist: [
        "Owner selects the public name and handle.",
        "Owner creates the transparent brand account in the official platform UI.",
        "Owner completes the official OAuth flow with only the listed scopes.",
        "Server-side credential and native-account references are recorded without secret values.",
        "Connection, profile, global kill switch and publish gates are independently verified.",
        "Owner explicitly activates publishing after verification; this packet cannot activate it."
      ],
      validationReviewAfterDays: proposal.validationPlan.reviewAfterDays,
      stopConditions: proposal.validationPlan.stopConditions,
      authorityGranted: false,
      publishingAuthorized: false
    }
  };
}

export async function loadAmplifierPortfolio(root: string = stateRoot): Promise<AmplifierPortfolio> {
  const source = await readFile(path.join(root, "social/amplifiers/portfolio.json"), "utf8");
  return AmplifierPortfolioSchema.parse(JSON.parse(source) as unknown);
}

export async function loadAmplificationPolicy(root: string = configRoot): Promise<AmplificationPolicy> {
  const source = await readFile(path.join(root, "social-amplification-policy.json"), "utf8");
  return AmplificationPolicySchema.parse(JSON.parse(source) as unknown);
}

export async function loadCanonicalAmplifierState(options: { stateRoot?: string; configRoot?: string } = {}): Promise<{
  portfolio: AmplifierPortfolio;
  policy: AmplificationPolicy;
  capabilityMap: VentureCapabilityMap;
}> {
  const [portfolio, policy, capabilityMap] = await Promise.all([
    loadAmplifierPortfolio(options.stateRoot),
    loadAmplificationPolicy(options.configRoot),
    loadVentureCapabilityMap(options.configRoot ?? configRoot)
  ]);
  return { portfolio, policy, capabilityMap };
}
