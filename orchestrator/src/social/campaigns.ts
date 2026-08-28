import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema, HttpsUrlSchema, Sha256Schema, VentureIdSchema } from "../contracts/common.js";
import {
  AmplificationPolicySchema,
  SocialCampaignEventSchema,
  SocialCampaignSchema,
  SocialConnectionSchema,
  SocialProfileSchema,
  type SocialCampaign,
  type SocialCampaignEvent,
  type SocialCapabilityRef,
  type SocialConnection,
  type SocialProfile
} from "../contracts/social-distribution.js";
import { VentureCapabilityMapSchema, type VentureCapabilityMap } from "../contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";
import {
  AmplifierProposalSchema,
  resolveAmplifierEligibility,
  type AmplifierProposal,
  type AmplifierSupportContext
} from "./amplifiers.js";

const CAMPAIGN_VERSION = "1.0.0" as const;
const SELECTOR_VERSION = "1.0.0" as const;
const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(100);
const LocaleSchema = z.enum(["cs", "en"]);
const ObjectiveSchema = z.enum(["qualified-visit", "trust", "release-awareness", "community-value"]);
const CommentaryTypeSchema = z.enum([
  "primary-pack", "company-angle", "profile-native-commentary", "evidence-summary", "localization", "format-adaptation", "attributed-link"
]);

const PreparedCampaignItemSchema = z.strictObject({
  channel: z.enum(["instagram", "threads"]),
  locale: LocaleSchema,
  text: z.string().trim().min(1).max(2_200),
  commentaryType: CommentaryTypeSchema,
  destination: HttpsUrlSchema,
  factualClaimRefs: z.array(EvidenceRefSchema).min(1).max(24),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(24),
  rendererRef: EvidenceRefSchema,
  assets: z.array(z.strictObject({
    ref: EvidenceRefSchema,
    hash: Sha256Schema,
    altText: z.string().trim().min(1).max(1_000)
  })).max(10)
}).superRefine((item, context) => {
  if (item.channel === "instagram" && item.assets.length === 0) {
    context.addIssue({ code: "custom", message: "Instagram campaign items require an approved accessible asset", path: ["assets"] });
  }
});

const FitSignalSchema = z.strictObject({
  value: z.number().finite().min(0).max(100).nullable(),
  reason: z.string().trim().min(1).max(500),
  evidenceRef: EvidenceRefSchema.nullable()
});

const CandidateFitSchema = z.strictObject({
  audience: FitSignalSchema,
  topic: FitSignalSchema,
  languageMarket: FitSignalSchema,
  format: FitSignalSchema,
  freshness: FitSignalSchema,
  capacity: FitSignalSchema,
  priorOutcome: FitSignalSchema,
  collision: z.boolean(),
  distinctAngle: z.boolean()
});

const SupportContextSchema = z.strictObject({
  sourceVentureId: VentureIdSchema,
  rollingOriginalPosts: z.number().int().nonnegative(),
  rollingSupportPosts: z.number().int().nonnegative(),
  activeSupportCampaigns: z.number().int().nonnegative(),
  daysSinceSameSourceVenture: z.number().int().nonnegative().nullable(),
  duplicateCaption: z.boolean(),
  duplicateAsset: z.boolean(),
  staggerHours: z.number().int().nonnegative().nullable(),
  hasAudienceSpecificAngle: z.boolean()
});

const VerifiedReleaseSchema = z.strictObject({
  sourceType: z.enum(["verified-venture-release", "draft", "failed-delivery", "fixture", "public-page-scrape", "contest-opportunity"]),
  verificationStatus: z.enum(["verified", "unverified", "failed"]),
  verificationRef: EvidenceRefSchema,
  verifiedAt: DateTimeSchema,
  releaseId: SlugSchema,
  sourceVentureId: VentureIdSchema,
  contentIds: z.array(SlugSchema).min(1).max(24),
  sourcePackage: z.strictObject({
    schemaVersion: z.literal("approved-publish-package/1"),
    artifactRef: EvidenceRefSchema,
    packageHash: Sha256Schema
  }),
  objective: ObjectiveSchema,
  audience: z.string().trim().min(1).max(500),
  topics: z.array(SlugSchema).min(1).max(24),
  languages: z.array(LocaleSchema).min(1).max(2),
  markets: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1).max(12),
  primaryItems: z.array(PreparedCampaignItemSchema.safeExtend({ commentaryType: z.literal("primary-pack") })).min(1).max(4)
});

const UmbrellaCandidateSchema = z.strictObject({
  profile: SocialProfileSchema,
  connection: SocialConnectionSchema.nullable(),
  genuineCompanyAngle: z.boolean(),
  angleEvidenceRef: EvidenceRefSchema,
  fit: CandidateFitSchema,
  items: z.array(PreparedCampaignItemSchema.safeExtend({ commentaryType: z.literal("company-angle") })).min(1).max(4)
});

const AmplifierCandidateSchema = z.strictObject({
  profile: SocialProfileSchema,
  connection: SocialConnectionSchema.nullable(),
  proposal: AmplifierProposalSchema,
  supportContext: SupportContextSchema,
  fit: CandidateFitSchema,
  items: z.array(PreparedCampaignItemSchema).min(1).max(4)
});

export const VerifiedReleaseCampaignInputSchema = z.strictObject({
  schemaVersion: z.literal("verified-release-campaign-input/1"),
  campaignVersion: z.literal(CAMPAIGN_VERSION),
  release: VerifiedReleaseSchema,
  openingAt: DateTimeSchema,
  sourcePrimaryProfile: SocialProfileSchema,
  sourceConnections: z.array(SocialConnectionSchema).max(2),
  umbrella: UmbrellaCandidateSchema.nullable(),
  amplifiers: z.array(AmplifierCandidateSchema).max(100),
  capabilityMap: VentureCapabilityMapSchema,
  amplificationPolicy: AmplificationPolicySchema,
  existingCampaigns: z.array(SocialCampaignSchema).max(2_000),
  posture: z.strictObject({
    globalKillSwitch: z.enum(["engaged", "released"]),
    repositoryPause: z.boolean(),
    pausedProfileIds: z.array(z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u)).max(200),
    pausedConnectionIds: z.array(z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u)).max(400)
  })
});

export type PreparedCampaignItem = z.infer<typeof PreparedCampaignItemSchema>;
export type VerifiedReleaseCampaignInput = z.infer<typeof VerifiedReleaseCampaignInputSchema>;

const GenerationReasonSchema = z.enum([
  "created", "duplicate-release", "unverified-release", "failed-delivery", "fixture-or-scrape", "contest-source-excluded",
  "permanently-ineligible-source", "source-profile-mismatch", "missing-stale-held-or-denied-capability", "door-money-private-boundary",
  "global-kill-switch", "repository-pause"
]);

export const SocialCampaignGenerationDecisionSchema = z.strictObject({
  schemaVersion: z.literal("social-campaign-generation-decision/1"),
  id: z.string().regex(/^social-campaign-decision-[a-f0-9]{20}$/u),
  releaseId: SlugSchema,
  sourceVentureId: VentureIdSchema,
  idempotencyKey: Sha256Schema,
  decision: z.enum(["created", "duplicate", "skip", "held"]),
  reasons: z.array(GenerationReasonSchema).min(1).max(12),
  campaignId: z.string().regex(/^social-campaign-[a-z0-9]+(?:-[a-z0-9]+)*$/u).max(140).nullable(),
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(24),
  decidedAt: DateTimeSchema,
  authorityGranted: z.literal(false),
  publishingAuthorized: z.literal(false)
});

export type SocialCampaignGenerationDecision = z.infer<typeof SocialCampaignGenerationDecisionSchema>;
export type CampaignGenerationResult = { decision: SocialCampaignGenerationDecision; campaign: SocialCampaign | null };

type Target = SocialCampaign["targets"][number];
type Item = SocialCampaign["channelItems"][number];
type HardGate = Target["selection"]["hardGates"][number];
type ScoreComponent = Target["selection"]["score"]["components"][number];

function campaignIdentity(input: Pick<VerifiedReleaseCampaignInput, "campaignVersion" | "release" | "capabilityMap" | "amplificationPolicy">): {
  idempotencyKey: string;
  capabilitySetHash: string;
  policyHash: string;
} {
  const capabilitySetHash = sha256(canonicalJson({
    mapVersion: input.capabilityMap.mapVersion,
    edge: input.capabilityMap.edges.find((edge) => edge.source === input.release.sourceVentureId && edge.target === "social-distribution" && edge.capability === "approved-publish-package") ?? null
  }));
  const policyHash = sha256(canonicalJson(input.amplificationPolicy));
  const contentHash = sha256(canonicalJson(input.release.primaryItems));
  return {
    capabilitySetHash,
    policyHash,
    idempotencyKey: sha256(canonicalJson({
      releaseId: input.release.releaseId,
      packageHash: input.release.sourcePackage.packageHash,
      contentHash,
      campaignVersion: input.campaignVersion,
      capabilitySetHash,
      policyHash
    }))
  };
}

function decision(input: {
  release: VerifiedReleaseCampaignInput["release"];
  idempotencyKey: string;
  decision: SocialCampaignGenerationDecision["decision"];
  reasons: SocialCampaignGenerationDecision["reasons"];
  campaignId: string | null;
  at: string;
}): SocialCampaignGenerationDecision {
  return SocialCampaignGenerationDecisionSchema.parse({
    schemaVersion: "social-campaign-generation-decision/1",
    id: `social-campaign-decision-${sha256(`${input.release.sourceVentureId}:${input.release.releaseId}:${input.idempotencyKey}`).slice(0, 20)}`,
    releaseId: input.release.releaseId,
    sourceVentureId: input.release.sourceVentureId,
    idempotencyKey: input.idempotencyKey,
    decision: input.decision,
    reasons: input.reasons,
    campaignId: input.campaignId,
    evidenceRefs: [...new Set([input.release.verificationRef, input.release.sourcePackage.artifactRef])],
    decidedAt: input.at,
    authorityGranted: false,
    publishingAuthorized: false
  });
}

function capabilityReference(map: VentureCapabilityMap, source: string): SocialCapabilityRef | null {
  const resolution = resolveVentureCapabilityInMap(map, {
    source,
    target: "social-distribution",
    capability: "approved-publish-package",
    schemaVersion: "approved-publish-package/1"
  });
  return resolution.decision === "allowed" && resolution.edge
    ? {
        mapVersion: map.mapVersion,
        source,
        target: "social-distribution",
        capability: "approved-publish-package",
        dataSchemaVersion: "approved-publish-package/1",
        decisionReference: resolution.edge.governingReference
      }
    : null;
}

function linkedConnection(profile: SocialProfile, connection: SocialConnection | null, channel: "instagram" | "threads"): SocialConnection | null {
  return connection?.profileId === profile.id && connection.platform === channel ? connection : null;
}

function providerGate(connection: SocialConnection | null, paused: ReadonlySet<string>): HardGate {
  if (!connection) return { gate: "provider-connection", status: "hold", reason: "No exact profile/platform connection is configured.", evidenceRef: "config/social-publisher-registry.json" };
  if (paused.has(connection.id) || connection.health.status === "paused") return { gate: "provider-connection", status: "hold", reason: "The exact profile/platform connection is paused.", evidenceRef: connection.id };
  if (connection.health.status !== "healthy" || connection.mode !== "autopublish") return { gate: "provider-connection", status: "hold", reason: `The exact connection is ${connection.health.status} in ${connection.mode} mode.`, evidenceRef: connection.id };
  return { gate: "provider-connection", status: "pass", reason: "The exact connection reports healthy current provider state.", evidenceRef: connection.id };
}

function fitGate(gate: HardGate["gate"], signal: z.infer<typeof FitSignalSchema>, minimum = 50): HardGate {
  const pass = signal.value !== null && signal.evidenceRef !== null && signal.value >= minimum;
  return { gate, status: pass ? "pass" : "hold", reason: signal.reason, evidenceRef: signal.evidenceRef };
}

const scoreWeights: Array<[ScoreComponent["component"], keyof z.infer<typeof CandidateFitSchema>, number]> = [
  ["audience-fit", "audience", 0.24],
  ["topic-fit", "topic", 0.20],
  ["language-market", "languageMarket", 0.16],
  ["format-fit", "format", 0.12],
  ["freshness", "freshness", 0.12],
  ["capacity", "capacity", 0.10],
  ["prior-outcome", "priorOutcome", 0.06]
];

function score(fit: z.infer<typeof CandidateFitSchema>, eligible: boolean): Target["selection"]["score"] {
  const components = scoreWeights.map(([component, field, weight]): ScoreComponent => {
    const signal = fit[field] as z.infer<typeof FitSignalSchema>;
    return { component, value: signal.evidenceRef === null ? null : signal.value, weight, reason: signal.reason, evidenceRef: signal.evidenceRef };
  });
  const total = eligible
    ? Math.round(components.reduce((sum, component) => sum + (component.value ?? 0) * component.weight, 0) * 100) / 100
    : null;
  return { total, components };
}

function normalizedWords(value: string): Set<string> {
  return new Set(value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean));
}

function similarity(left: string, right: string): number {
  const a = normalizedWords(left); const b = normalizedWords(right);
  if (a.size === 0 || b.size === 0) return 0;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / (a.size + b.size - intersection);
}

function uniqueItemId(targetId: string, prepared: PreparedCampaignItem): string {
  return `item-${targetId.slice(0, 48)}-${sha256(canonicalJson(prepared)).slice(0, 16)}`;
}

function windowAt(openingAt: string, offsetHours: number): { notBefore: string; notAfter: string } {
  const start = new Date(Date.parse(openingAt) + offsetHours * 3_600_000);
  return { notBefore: start.toISOString(), notAfter: new Date(start.getTime() + 2 * 3_600_000).toISOString() };
}

function buildItem(input: {
  campaignKey: string;
  target: Target;
  profile: SocialProfile;
  connection: SocialConnection | null;
  prepared: PreparedCampaignItem;
  objective: SocialCampaign["objective"];
  audience: string;
  window: { notBefore: string; notAfter: string };
  policyHash: string;
  held: boolean;
}): Item {
  const copy = {
    text: input.prepared.text,
    commentaryType: input.prepared.commentaryType,
    destination: input.prepared.destination,
    factualClaimRefs: input.prepared.factualClaimRefs,
    evidenceRefs: input.prepared.evidenceRefs,
    rendererRef: input.prepared.rendererRef,
    assets: input.prepared.assets
  };
  const id = uniqueItemId(input.target.id, input.prepared);
  const targetHash = sha256(canonicalJson(input.target));
  const contentHash = sha256(canonicalJson(copy));
  const windowHash = sha256(canonicalJson(input.window));
  const bindingHash = sha256(canonicalJson({ targetHash, contentHash, windowHash, policyHash: input.policyHash }));
  const connection = linkedConnection(input.profile, input.connection, input.prepared.channel);
  return {
    id,
    targetId: input.target.id,
    channel: input.prepared.channel,
    locale: input.prepared.locale,
    connectionRef: connection?.id ?? null,
    providerRef: connection?.connector.providerId ?? null,
    objective: input.objective,
    audience: input.audience,
    copy,
    contentHash,
    assetHashes: copy.assets.map((asset) => asset.hash),
    targetHash,
    windowHash,
    policyHash: input.policyHash,
    window: input.window,
    utm: { source: input.prepared.channel, medium: "organic_social", campaign: `campaign-${input.campaignKey.slice(0, 20)}`, content: id },
    approval: { status: "needs-owner-review", bindingHash, approvalRef: null, approvedAt: null, approvedBy: null },
    status: input.held ? "held" : "draft"
  };
}

function primaryTarget(profile: SocialProfile, capability: SocialCapabilityRef, paused: boolean): Target {
  const hardGates: HardGate[] = [
    { gate: "real-owned-profile", status: profile.kind === "owned-brand" && profile.role === "venture-primary" ? "pass" : "reject", reason: "The source target must be its own transparent Venture Profile.", evidenceRef: profile.provenance.evidenceRefs[0] ?? null },
    { gate: "exact-capability", status: "pass", reason: "The verified package passed the exact current #424 edge.", evidenceRef: capability.decisionReference },
    { gate: "profile-authority", status: paused || ["paused", "retired", "rejected", "simulation"].includes(profile.lifecycle) ? "hold" : "pass", reason: paused ? "The primary profile is paused." : "Campaign drafting remains inside current profile authority; queue gates still apply.", evidenceRef: "GitHub #410" }
  ];
  const eligible = hardGates.every((gate) => gate.status === "pass");
  return {
    id: `primary-${profile.id.replace(/^social-profile-/u, "")}`,
    role: "primary",
    profileId: profile.id,
    ventureRef: profile.ventureRef,
    capabilityRef: null,
    amplifierEligibilityRef: null,
    fit: eligible ? "eligible" : "held",
    reasons: eligible ? ["fit"] : ["paused"],
    selection: {
      hardGates,
      score: { total: eligible ? 100 : null, components: [{ component: "audience-fit", value: eligible ? 100 : null, weight: 1, reason: "The source Venture Profile is the canonical primary audience owner.", evidenceRef: profile.provenance.evidenceRefs[0] ?? null }] }
    }
  };
}

function supportBaseGates(input: {
  profile: SocialProfile;
  expectedRole: "company-umbrella" | "owned-amplifier";
  expectedProfileId?: string;
  capability: SocialCapabilityRef | null;
  connection: SocialConnection | null;
  fit: z.infer<typeof CandidateFitSchema>;
  pausedProfiles: ReadonlySet<string>;
  pausedConnections: ReadonlySet<string>;
}): HardGate[] {
  const profilePaused = input.pausedProfiles.has(input.profile.id) || ["paused", "retired", "rejected", "simulation"].includes(input.profile.lifecycle);
  const validOwnedRole = input.profile.kind === "owned-brand" && input.profile.role === input.expectedRole && (input.expectedRole !== "owned-amplifier" || input.profile.ventureRef === null) && (input.expectedProfileId === undefined || input.profile.id === input.expectedProfileId);
  return [
    { gate: "real-owned-profile", status: validOwnedRole ? "pass" : "reject", reason: `Only a transparent real ${input.expectedRole} profile with its own exact identity may be selected.`, evidenceRef: input.profile.provenance.evidenceRefs[0] ?? null },
    { gate: "exact-capability", status: input.capability ? "pass" : "reject", reason: input.capability ? "The current exact #424 package edge is allowed." : "The exact #424 package edge is missing, stale, held or denied.", evidenceRef: input.capability?.decisionReference ?? "GitHub #424" },
    fitGate("audience-fit", input.fit.audience),
    fitGate("topic-fit", input.fit.topic),
    fitGate("language-fit", input.fit.languageMarket),
    fitGate("market-fit", input.fit.languageMarket),
    fitGate("format-fit", input.fit.format),
    fitGate("freshness", input.fit.freshness, 30),
    { gate: "no-collision", status: input.fit.collision ? "hold" : "pass", reason: input.fit.collision ? "An active campaign collision exists." : "No active campaign collision was reported.", evidenceRef: input.fit.capacity.evidenceRef },
    { gate: "distinct-angle", status: input.fit.distinctAngle ? "pass" : "hold", reason: input.fit.distinctAngle ? "A materially distinct profile-native angle is recorded." : "No materially distinct profile-native angle is recorded.", evidenceRef: input.fit.audience.evidenceRef },
    { gate: "profile-authority", status: profilePaused ? "hold" : "pass", reason: profilePaused ? "The target profile is paused or closed." : "The target profile is not paused; later approval and queue gates still apply.", evidenceRef: "GitHub #410" },
    providerGate(input.connection, input.pausedConnections)
  ];
}

function targetReasons(gates: readonly HardGate[]): Target["reasons"] {
  const reasons = new Set<Target["reasons"][number]>();
  for (const gate of gates.filter((candidate) => candidate.status !== "pass")) {
    if (gate.gate === "exact-capability") reasons.add("capability");
    else if (gate.gate === "original-runway") reasons.add("runway");
    else if (gate.gate === "content-ratio") reasons.add("ratio");
    else if (gate.gate === "same-source-cooldown") reasons.add("cooldown");
    else if (gate.gate === "no-collision") reasons.add("collision");
    else if (gate.gate === "no-duplicate") reasons.add("duplicate");
    else if (gate.gate === "provider-connection") reasons.add("provider");
    else if (gate.gate === "language-fit") reasons.add("language");
    else if (gate.gate === "market-fit") reasons.add("market");
    else if (gate.gate === "topic-fit") reasons.add("topic");
    else if (gate.gate === "format-fit") reasons.add("format");
    else if (gate.gate === "freshness") reasons.add("freshness");
    else if (gate.gate === "support-capacity") reasons.add("capacity");
    else if (gate.gate === "profile-authority") reasons.add("paused");
    else reasons.add("fit");
  }
  return reasons.size > 0 ? [...reasons] : ["fit"];
}

function copyCollision(items: readonly PreparedCampaignItem[], existingCopy: readonly string[], threshold: number): boolean {
  return items.some((item) => existingCopy.some((copy) => similarity(item.text, copy) >= threshold));
}

export function createVerifiedReleaseCampaign(value: unknown): CampaignGenerationResult {
  const input = VerifiedReleaseCampaignInputSchema.parse(value);
  const identity = campaignIdentity(input);
  const at = input.openingAt;
  const release = input.release;
  const skipped = (reason: SocialCampaignGenerationDecision["reasons"][number]): CampaignGenerationResult => ({
    decision: decision({ release, idempotencyKey: identity.idempotencyKey, decision: "skip", reasons: [reason], campaignId: null, at }),
    campaign: null
  });
  if (release.sourceType === "contest-opportunity") return skipped("contest-source-excluded");
  if (["fixture", "public-page-scrape", "draft"].includes(release.sourceType)) return skipped("fixture-or-scrape");
  if (release.sourceType === "failed-delivery" || release.verificationStatus === "failed") return skipped("failed-delivery");
  if (release.sourceType !== "verified-venture-release" || release.verificationStatus !== "verified") return skipped("unverified-release");
  if (["personal-growth", "kvorum", "goviral"].includes(release.sourceVentureId)) return skipped("permanently-ineligible-source");
  if (release.sourceVentureId === "contest-radar") return skipped("contest-source-excluded");
  if (input.sourcePrimaryProfile.kind !== "owned-brand" || input.sourcePrimaryProfile.role !== "venture-primary" || input.sourcePrimaryProfile.ventureRef !== release.sourceVentureId) return skipped("source-profile-mismatch");
  if (release.sourceVentureId === "door-money" && (!release.sourcePackage.artifactRef.startsWith("state/ventures/door-money/") || !release.verificationRef.toLocaleLowerCase("en-US").includes("owner"))) return skipped("door-money-private-boundary");
  const sourceCapability = capabilityReference(input.capabilityMap, release.sourceVentureId);
  if (!sourceCapability) return skipped("missing-stale-held-or-denied-capability");
  const duplicate = input.existingCampaigns.find((campaign) => campaign.idempotencyKey === identity.idempotencyKey);
  if (duplicate) return {
    decision: decision({ release, idempotencyKey: identity.idempotencyKey, decision: "duplicate", reasons: ["duplicate-release"], campaignId: duplicate.id, at }),
    campaign: duplicate
  };

  const pausedProfiles = new Set(input.posture.pausedProfileIds);
  const pausedConnections = new Set(input.posture.pausedConnectionIds);
  const primary = primaryTarget(input.sourcePrimaryProfile, sourceCapability, pausedProfiles.has(input.sourcePrimaryProfile.id));
  const existingCopy = input.existingCampaigns.flatMap((campaign) => campaign.channelItems.map((item) => item.copy.text));
  const primaryCopy = release.primaryItems.map((item) => item.text);
  const duplicateThreshold = input.amplificationPolicy.values.duplicateCaptionThreshold;

  const amplifierTargets = input.amplifiers.map((candidate) => {
    const capability = capabilityReference(input.capabilityMap, release.sourceVentureId);
    const exactReference = candidate.profile.capabilityRefs.find((reference) => reference.source === release.sourceVentureId);
    const exact = capability && exactReference && canonicalJson(capability) === canonicalJson(exactReference) ? capability : null;
    const eligibility = resolveAmplifierEligibility({
      proposal: candidate.proposal,
      policy: input.amplificationPolicy,
      capabilityMap: input.capabilityMap,
      platform: candidate.items[0]!.channel,
      supportContext: candidate.supportContext as AmplifierSupportContext
    });
    const gates = supportBaseGates({ profile: candidate.profile, expectedRole: "owned-amplifier", expectedProfileId: candidate.proposal.profileId, capability: exact, connection: candidate.connection, fit: candidate.fit, pausedProfiles, pausedConnections });
    gates.push(
      { gate: "distinct-purpose", status: eligibility.purposeGate.verdict === "accept" ? "pass" : eligibility.purposeGate.verdict, reason: eligibility.purposeGate.reasons[0]?.message ?? "The #415 distinct-purpose gate passed.", evidenceRef: eligibility.purposeEvidenceRef },
      { gate: "original-runway", status: eligibility.launchRunway.held ? "hold" : "pass", reason: eligibility.launchRunway.held ? "The required original-content runway is incomplete." : "The required original-content runway is complete.", evidenceRef: candidate.proposal.launchRunway.evidenceRefs[0] ?? eligibility.policyEvidenceRef },
      { gate: "content-ratio", status: eligibility.supportEligibility.reasons.includes("venture-support-ratio-exceeded") ? "hold" : "pass", reason: eligibility.supportEligibility.reasons.includes("venture-support-ratio-exceeded") ? "The projected venture-support ratio exceeds policy." : "The projected support ratio remains inside policy.", evidenceRef: eligibility.policyEvidenceRef },
      { gate: "same-source-cooldown", status: eligibility.supportEligibility.reasons.includes("same-source-cooldown-active") ? "hold" : "pass", reason: eligibility.supportEligibility.reasons.includes("same-source-cooldown-active") ? "The same-source cooldown is active." : "The same-source cooldown is clear.", evidenceRef: eligibility.policyEvidenceRef },
      { gate: "support-capacity", status: eligibility.supportEligibility.reasons.includes("active-support-campaign-cap-reached") ? "hold" : "pass", reason: eligibility.supportEligibility.reasons.includes("active-support-campaign-cap-reached") ? "The active support-campaign cap is reached." : "Support capacity is available.", evidenceRef: eligibility.policyEvidenceRef },
      { gate: "no-duplicate", status: candidate.supportContext.duplicateCaption || candidate.supportContext.duplicateAsset || copyCollision(candidate.items, [...existingCopy, ...primaryCopy], duplicateThreshold) ? "hold" : "pass", reason: "Caption and asset duplication are checked against the release and active campaigns.", evidenceRef: eligibility.policyEvidenceRef }
    );
    const eligible = gates.every((gate) => gate.status === "pass") && eligibility.supportEligibility.eligible;
    const target: Target = {
      id: `amplifier-${candidate.profile.id.replace(/^social-profile-/u, "")}`,
      role: "amplifier",
      profileId: candidate.profile.id,
      ventureRef: null,
      capabilityRef: exact,
      amplifierEligibilityRef: eligibility.purposeEvidenceRef,
      fit: eligible ? "eligible" : gates.some((gate) => gate.status === "reject") ? "rejected" : "held",
      reasons: targetReasons(gates),
      selection: { hardGates: gates, score: score(candidate.fit, eligible) }
    };
    return { candidate, target };
  }).sort((left, right) => (right.target.selection.score.total ?? -1) - (left.target.selection.score.total ?? -1) || left.target.id.localeCompare(right.target.id));

  const selectedAmplifiers = amplifierTargets.filter(({ target }) => target.fit === "eligible").slice(0, 2);
  const overflowAmplifiers = amplifierTargets.filter(({ target }) => target.fit === "eligible").slice(2).map(({ candidate, target }) => ({
    candidate,
    target: {
      ...target,
      fit: "held" as const,
      reasons: [...new Set([...target.reasons, "capacity" as const])],
      selection: {
        ...target.selection,
        hardGates: [...target.selection.hardGates, { gate: "support-capacity" as const, status: "hold" as const, reason: "The campaign selects at most two amplification profiles.", evidenceRef: "GitHub #410" }],
        score: { ...target.selection.score, total: null }
      }
    }
  }));
  const selectedIds = new Set(selectedAmplifiers.map(({ target }) => target.id));
  const finalAmplifiers = amplifierTargets.filter(({ target }) => !selectedIds.has(target.id) && !overflowAmplifiers.some((item) => item.target.id === target.id)).concat(selectedAmplifiers).concat(overflowAmplifiers).sort((left, right) => left.target.id.localeCompare(right.target.id));

  let umbrellaTarget: { candidate: z.infer<typeof UmbrellaCandidateSchema>; target: Target } | null = null;
  if (input.umbrella) {
    const candidate = input.umbrella;
    const capability = capabilityReference(input.capabilityMap, release.sourceVentureId);
    const exactReference = candidate.profile.capabilityRefs.find((reference) => reference.source === release.sourceVentureId);
    const exact = capability && exactReference && canonicalJson(capability) === canonicalJson(exactReference) ? capability : null;
    const gates = supportBaseGates({ profile: candidate.profile, expectedRole: "company-umbrella", capability: exact, connection: candidate.connection, fit: candidate.fit, pausedProfiles, pausedConnections });
    gates.push(
      { gate: "distinct-purpose", status: candidate.profile.role === "company-umbrella" ? "pass" : "reject", reason: "Only the transparent BoardlessAI umbrella profile can receive this optional role.", evidenceRef: candidate.profile.provenance.evidenceRefs[0] ?? null },
      { gate: "company-angle", status: candidate.genuineCompanyAngle ? "pass" : "hold", reason: candidate.genuineCompanyAngle ? "A genuine company/building-in-public angle is recorded." : "No genuine company angle exists.", evidenceRef: candidate.angleEvidenceRef },
      { gate: "no-duplicate", status: copyCollision(candidate.items, [...existingCopy, ...primaryCopy, ...selectedAmplifiers.flatMap(({ candidate: amplifier }) => amplifier.items.map((item) => item.text))], duplicateThreshold) ? "hold" : "pass", reason: "Umbrella copy is checked against primary, amplifier and active-campaign copy.", evidenceRef: candidate.angleEvidenceRef }
    );
    const eligible = gates.every((gate) => gate.status === "pass");
    umbrellaTarget = { candidate, target: {
      id: `umbrella-${candidate.profile.id.replace(/^social-profile-/u, "")}`,
      role: "umbrella",
      profileId: candidate.profile.id,
      ventureRef: null,
      capabilityRef: exact,
      amplifierEligibilityRef: null,
      fit: eligible ? "eligible" : gates.some((gate) => gate.status === "reject") ? "rejected" : "held",
      reasons: targetReasons(gates),
      selection: { hardGates: gates, score: score(candidate.fit, eligible) }
    } };
  }

  const targets = [primary, ...finalAmplifiers.map(({ target }) => target), ...(umbrellaTarget ? [umbrellaTarget.target] : [])];
  const globalHolds: SocialCampaign["holdReasons"] = [];
  if (input.posture.globalKillSwitch === "engaged") globalHolds.push("paused");
  if (input.posture.repositoryPause) globalHolds.push("authority");
  if (primary.fit !== "eligible") globalHolds.push("paused");
  const held = globalHolds.length > 0;
  const items: Item[] = release.primaryItems.map((prepared) => buildItem({
    campaignKey: identity.idempotencyKey, target: primary, profile: input.sourcePrimaryProfile,
    connection: input.sourceConnections.find((connection) => connection.platform === prepared.channel) ?? null,
    prepared, objective: release.objective, audience: release.audience, window: windowAt(input.openingAt, 0), policyHash: identity.policyHash, held
  }));
  if (umbrellaTarget?.target.fit === "eligible") for (const prepared of umbrellaTarget.candidate.items) items.push(buildItem({
    campaignKey: identity.idempotencyKey, target: umbrellaTarget.target, profile: umbrellaTarget.candidate.profile, connection: umbrellaTarget.candidate.connection,
    prepared, objective: release.objective, audience: umbrellaTarget.candidate.profile.audience, window: windowAt(input.openingAt, 6), policyHash: identity.policyHash, held
  }));
  for (const [index, selected] of selectedAmplifiers.entries()) for (const prepared of selected.candidate.items) items.push(buildItem({
    campaignKey: identity.idempotencyKey, target: selected.target, profile: selected.candidate.profile, connection: selected.candidate.connection,
    prepared, objective: release.objective, audience: selected.candidate.profile.audience, window: windowAt(input.openingAt, index === 0 ? 24 : 48), policyHash: identity.policyHash, held
  }));
  const eligibleSupport = targets.filter((target) => target.role !== "primary" && target.fit === "eligible");
  const campaignId = `social-campaign-${release.releaseId}-${identity.idempotencyKey.slice(0, 16)}`;
  const providerConnections = [
    ...input.sourceConnections,
    ...selectedAmplifiers.flatMap(({ candidate }) => candidate.connection ? [candidate.connection] : []),
    ...(umbrellaTarget?.target.fit === "eligible" && umbrellaTarget.candidate.connection ? [umbrellaTarget.candidate.connection] : [])
  ];
  const providerAvailability: SocialCampaign["providerAvailability"] = providerConnections.length === 0 ? "not-configured" : providerConnections.some((connection) => connection.health.status === "healthy") ? "available" : "held";
  const campaign = SocialCampaignSchema.parse({
    schemaVersion: "social-campaign/1",
    campaignVersion: CAMPAIGN_VERSION,
    id: campaignId,
    idempotencyKey: identity.idempotencyKey,
    releaseId: release.releaseId,
    releaseVerification: { sourceType: "verified-venture-release", status: "verified", verifiedAt: release.verifiedAt, evidenceRef: release.verificationRef },
    contentIds: release.contentIds,
    inputHash: identity.idempotencyKey,
    sourceVentureId: release.sourceVentureId,
    sourcePrimaryProfileId: input.sourcePrimaryProfile.id,
    sourceCapabilityRef: sourceCapability,
    sourcePackage: release.sourcePackage,
    objective: release.objective,
    audience: release.audience,
    effectiveDecision: { capabilityMapVersion: input.capabilityMap.mapVersion, capabilitySetHash: identity.capabilitySetHash, policyVersion: input.amplificationPolicy.version, policyHash: identity.policyHash, selectorVersion: SELECTOR_VERSION },
    schedulePolicy: { timezone: "Europe/Prague", primaryOffsetHours: 0, umbrellaOffsetHours: 6, amplifierOffsetHours: [24, 48] },
    targets,
    contactAssignments: [],
    channelItems: items,
    selectionOutcome: held ? "held" : eligibleSupport.length > 0 ? "selected" : "primary-only",
    status: held ? "held" : "needs-owner-review",
    holdReasons: [...new Set(globalHolds)],
    providerAvailability,
    measurementAvailability: "unavailable",
    history: [{ eventId: `campaign-created-${identity.idempotencyKey.slice(0, 16)}`, at, action: "created", actor: "system", reason: held ? "A verified release was selected, but an authoritative stop control holds every item." : "A verified release created one immutable owner-review campaign draft.", supersedesEventId: null }],
    createdAt: at,
    updatedAt: at
  });
  return {
    decision: decision({ release, idempotencyKey: identity.idempotencyKey, decision: held ? "held" : "created", reasons: held ? [input.posture.globalKillSwitch === "engaged" ? "global-kill-switch" : "repository-pause"] : ["created"], campaignId, at }),
    campaign
  };
}

export interface CampaignProjection {
  campaign: SocialCampaign;
  appliedEventIds: string[];
  rejectedEventIds: string[];
}

export interface CampaignInventoryCandidate {
  schemaVersion: "social-campaign-inventory-candidate/1";
  campaignId: string;
  releaseId: string;
  sourceVentureId: string;
  targetId: string;
  targetRole: "primary" | "umbrella" | "amplifier";
  profileId: string;
  channel: "instagram" | "threads";
  locale: "cs" | "en";
  objective: SocialCampaign["objective"];
  audience: string;
  copy: Item["copy"];
  contentHash: string;
  targetHash: string;
  windowHash: string;
  policyHash: string;
  approvalBindingHash: string;
  approvalRef: string;
  window: Item["window"];
  selectionReasons: Target["reasons"];
  capabilityRef: SocialCapabilityRef | null;
  amplifierEligibilityRef: string | null;
  dailySelectionMustRecheck: readonly ["original-content-ratio", "cooldown", "cadence", "provider", "routine-scope", "kill-switch"];
  authorityGranted: false;
  publishingAuthorized: false;
}

export function campaignTargetApprovalHash(items: readonly Pick<Item, "approval">[]): string {
  return sha256(canonicalJson(items.map((item) => item.approval.bindingHash).sort()));
}

function replaceItem(item: Item, event: SocialCampaignEvent): Item {
  const replacement = event.replacement!;
  const copy = {
    ...item.copy,
    text: replacement.text ?? item.copy.text,
    destination: replacement.destination ?? item.copy.destination,
    assets: replacement.altText === null ? item.copy.assets : item.copy.assets.map((asset, index) => index === 0 ? { ...asset, altText: replacement.altText! } : asset)
  };
  const window = replacement.notBefore && replacement.notAfter ? { notBefore: replacement.notBefore, notAfter: replacement.notAfter } : item.window;
  const contentHash = sha256(canonicalJson(copy));
  const windowHash = sha256(canonicalJson(window));
  const bindingHash = sha256(canonicalJson({ targetHash: item.targetHash, contentHash, windowHash, policyHash: item.policyHash }));
  if (bindingHash !== replacement.bindingHash) throw new Error(`Campaign event ${event.eventId} replacement binding hash is invalid`);
  return {
    ...item,
    copy,
    contentHash,
    window,
    windowHash,
    approval: { status: "invalidated", bindingHash, approvalRef: null, approvedAt: null, approvedBy: null },
    status: item.status === "held" ? "held" : "draft"
  };
}

/** Reduce append-only owner events without mutating the campaign's original selection evidence. */
export function projectSocialCampaign(campaignValue: unknown, eventValues: readonly unknown[]): CampaignProjection {
  const base = SocialCampaignSchema.parse(campaignValue);
  let campaign = structuredClone(base);
  const events = eventValues.map((value) => SocialCampaignEventSchema.safeParse(value)).filter((result): result is { success: true; data: SocialCampaignEvent } => result.success).map((result) => result.data).filter((event) => event.campaignId === base.id).sort((left, right) => left.at.localeCompare(right.at) || left.eventId.localeCompare(right.eventId));
  const appliedEventIds: string[] = []; const rejectedEventIds: string[] = [];
  for (const event of events) {
    try {
      if (event.action === "hold" || event.action === "cancel") {
        campaign = { ...campaign, status: event.action === "hold" ? "held" : "cancelled", holdReasons: event.action === "hold" ? [...new Set([...campaign.holdReasons, "authority" as const])] : [], updatedAt: event.at };
      } else if (event.action === "approve-target" || event.action === "reject-target") {
        const targetItems = campaign.channelItems.filter((item) => item.targetId === event.targetId);
        if (targetItems.length === 0 || campaignTargetApprovalHash(targetItems) !== event.expectedBindingHash) throw new Error("stale target binding");
        campaign = {
          ...campaign,
          channelItems: campaign.channelItems.map((item) => item.targetId !== event.targetId ? item : event.action === "approve-target"
            ? { ...item, approval: { status: "approved" as const, bindingHash: item.approval.bindingHash, approvalRef: `event:${event.eventId}`, approvedAt: event.at, approvedBy: "owner" as const }, status: "approved" as const }
            : { ...item, approval: { status: "rejected" as const, bindingHash: item.approval.bindingHash, approvalRef: null, approvedAt: null, approvedBy: null }, status: "cancelled" as const }),
          updatedAt: event.at
        };
      } else {
        const item = campaign.channelItems.find((candidate) => candidate.id === event.itemId);
        if (!item || item.approval.bindingHash !== event.expectedBindingHash) throw new Error("stale item binding");
        campaign = { ...campaign, channelItems: campaign.channelItems.map((candidate) => candidate.id === item.id ? replaceItem(candidate, event) : candidate), updatedAt: event.at };
      }
      const reviewable = campaign.channelItems.filter((item) => !["cancelled", "held"].includes(item.status));
      const approved = reviewable.filter((item) => item.status === "approved").length;
      if (!["held", "cancelled"].includes(campaign.status)) campaign = { ...campaign, status: reviewable.length === 0 ? "cancelled" : approved === 0 ? "needs-owner-review" : approved === reviewable.length ? "approved" : "partially-approved" };
      campaign = SocialCampaignSchema.parse(campaign);
      appliedEventIds.push(event.eventId);
    } catch { rejectedEventIds.push(event.eventId); }
  }
  return { campaign, appliedEventIds, rejectedEventIds };
}

/**
 * Optional #418 handoff. It transports the original target decision; it neither schedules nor
 * reruns selection, and it explicitly keeps every daily ratio/cooldown/authority gate pending.
 */
export function campaignInventoryCandidates(campaignValue: unknown): CampaignInventoryCandidate[] {
  const campaign = SocialCampaignSchema.parse(campaignValue);
  return campaign.channelItems.flatMap((item): CampaignInventoryCandidate[] => {
    if (item.status !== "approved" || item.approval.status !== "approved" || item.approval.approvalRef === null) return [];
    const target = campaign.targets.find((candidate) => candidate.id === item.targetId);
    if (!target || target.fit !== "eligible") return [];
    return [{
      schemaVersion: "social-campaign-inventory-candidate/1",
      campaignId: campaign.id,
      releaseId: campaign.releaseId,
      sourceVentureId: campaign.sourceVentureId,
      targetId: target.id,
      targetRole: target.role,
      profileId: target.profileId,
      channel: item.channel,
      locale: item.locale,
      objective: item.objective,
      audience: item.audience,
      copy: item.copy,
      contentHash: item.contentHash,
      targetHash: item.targetHash,
      windowHash: item.windowHash,
      policyHash: item.policyHash,
      approvalBindingHash: item.approval.bindingHash,
      approvalRef: item.approval.approvalRef,
      window: item.window,
      selectionReasons: target.reasons,
      capabilityRef: target.capabilityRef,
      amplifierEligibilityRef: target.amplifierEligibilityRef,
      dailySelectionMustRecheck: ["original-content-ratio", "cooldown", "cadence", "provider", "routine-scope", "kill-switch"],
      authorityGranted: false,
      publishingAuthorized: false
    }];
  });
}

export async function storeVerifiedReleaseCampaign(root: string, value: unknown): Promise<CampaignGenerationResult & { changed: boolean }> {
  const generated = createVerifiedReleaseCampaign(value);
  const directory = path.join(root, "social/campaigns");
  await mkdir(directory, { recursive: true });
  const decisionPath = path.join(directory, `${generated.decision.id}.decision.json`);
  const campaignPath = generated.campaign ? path.join(directory, `${generated.campaign.id}.json`) : null;
  let changed = false;
  for (const [target, record] of [[decisionPath, generated.decision], ...(campaignPath && generated.campaign ? [[campaignPath, generated.campaign] as const] : [])] as const) {
    try {
      await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      changed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = JSON.parse(await readFile(target, "utf8")) as unknown;
      if (canonicalJson(existing) !== canonicalJson(record)) throw new Error(`Campaign evidence conflict at ${target}`);
    }
  }
  return { ...generated, changed };
}
