import {
  SocialInventoryBuildReceiptSchema,
  SocialInventoryCandidateSchema,
  SocialProfileInventorySchema,
  type SocialInventoryBuildReceipt,
  type SocialInventoryCandidate,
  type SocialProfileInventory,
  type SocialProfileStrategy
} from "../contracts/social-inventory.js";
import { SocialCampaignSchema, type SocialCampaign, type SocialProfile } from "../contracts/social-distribution.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../hashing.js";
import type { DueOperation } from "../operations/capacity.js";
import { pragueClockParts } from "../meetings/clock.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";

export const SOCIAL_INVENTORY_BUILDER_VERSION = "social-inventory-builder/1" as const;

export interface SocialInventoryIncidentEvidence {
  schemaVersion: "social-inventory-incident/1";
  id: string;
  profileId: string;
  code: "LOW_RUNWAY" | "NO_CANDIDATE" | "BUILD_HELD";
  reason: string;
  detectedAt: string;
  recoveryPerformed: false;
  authorityGranted: false;
}

export interface SocialInventoryBuildResult {
  inventory: SocialProfileInventory;
  receipt: SocialInventoryBuildReceipt;
  incidents: SocialInventoryIncidentEvidence[];
}

function dateAt(horizonStart: string, day: number, hour: number): Date {
  return new Date(Date.parse(`${horizonStart}T00:00:00.000Z`) + (day * 24 + hour) * 3_600_000);
}

function formatFor(strategy: SocialProfileStrategy, candidateClass: "original" | "reserve" | "recurring") {
  return strategy.recurringFormats.find((format) => format.candidateClass === candidateClass) ?? null;
}

function deterministicCandidate(input: {
  profile: SocialProfile;
  strategy: SocialProfileStrategy;
  candidateClass: "original" | "reserve" | "recurring";
  day: number;
  horizonStart: string;
  generatedAt: Date;
  sourceSignatures: readonly string[];
}): SocialInventoryCandidate | null {
  const format = formatFor(input.strategy, input.candidateClass);
  if (!format) return null;
  const locale = format.locales[input.day % format.locales.length]!;
  const platform = format.platforms[input.day % format.platforms.length]!;
  const earliest = dateAt(input.horizonStart, input.day, 8);
  const latest = dateAt(input.horizonStart, input.day, 20);
  const expiresAt = dateAt(input.horizonStart, input.day + 1, 8);
  const candidateInput = {
    profileId: input.profile.id,
    strategyId: input.strategy.id,
    strategyVersion: input.strategy.version,
    formatId: format.id,
    date: input.horizonStart,
    day: input.day,
    locale,
    platform,
    sourceSignatures: [...input.sourceSignatures].sort()
  };
  const inputHash = sha256(canonicalJson(candidateInput));
  const visual = format.assetRequirement !== "none";
  return SocialInventoryCandidateSchema.parse({
    schemaVersion: "social-inventory-candidate/1",
    id: `social-inventory-candidate-${sha256(`${input.strategy.id}:${inputHash}`).slice(0, 20)}`,
    profileId: input.profile.id,
    strategyId: input.strategy.id,
    strategyVersion: input.strategy.version,
    candidateType: input.candidateClass,
    pillarId: format.pillarId,
    formatId: format.id,
    platform,
    locale,
    contentRef: `config/social-profile-strategies.json#${input.strategy.id}/${format.id}`,
    contentBrief: `${format.deterministicBriefTemplate} Planning date: ${dateAt(input.horizonStart, input.day, 0).toISOString().slice(0, 10)}.`,
    evidenceRefs: ["config/social-profile-strategies.json", "GitHub #418"],
    sourceRefs: ["config/social-profile-strategies.json"],
    sourceKind: "strategy-owned",
    sourceVentureId: null,
    capabilityRef: null,
    approvedPackageRef: null,
    campaignRef: null,
    asset: { readiness: visual ? "held" : "not-required", assetRefs: [], altTextReady: !visual },
    usefulWindow: { earliest: earliest.toISOString(), latest: latest.toISOString(), expiresAt: expiresAt.toISOString() },
    similarityHash: sha256(canonicalJson({ profileId: input.profile.id, formatId: format.id, date: earliest.toISOString().slice(0, 10), locale, platform })),
    estimatedCostUsd: 0,
    authorityClass: "deterministic-plan",
    classification: "original",
    state: visual ? "held" : "eligible",
    reason: visual ? "Design Lab asset and alt text are required before this plan can advance." : "Deterministic original-content plan; final evidence and copy remain downstream gates.",
    finalCopy: false,
    generatedAt: input.generatedAt.toISOString(),
    generatorVersion: SOCIAL_INVENTORY_BUILDER_VERSION,
    inputHash,
    supersedesCandidateRef: null,
    correctedByRef: null,
    queueAuthorized: false,
    publishingAuthorized: false
  });
}

function campaignCandidate(input: {
  campaign: SocialCampaign;
  profile: SocialProfile;
  strategy: SocialProfileStrategy;
  now: Date;
}): SocialInventoryCandidate | null {
  if (!["approved", "partially-approved"].includes(input.campaign.status)) return null;
  const target = input.campaign.targets.find(({ profileId, fit }) => profileId === input.profile.id && fit === "eligible");
  if (!target) return null;
  if (target.role !== "primary" && target.capabilityRef === null) return null;
  if ((input.campaign.sourceVentureId === "booksofhistory" && input.profile.ventureRef === "tehdejsi-svet")
    || (input.campaign.sourceVentureId === "tehdejsi-svet" && input.profile.ventureRef === "booksofhistory")) return null;
  const items = input.campaign.channelItems.filter(({ targetId, approval, status }) => targetId === target.id && approval.status === "approved" && status === "approved");
  if (items.length === 0) return null;
  const earliest = items.map(({ window }) => window.notBefore).sort()[0]!;
  const latest = items.map(({ window }) => window.notAfter).sort().at(-1)!;
  if (Date.parse(latest) <= input.now.getTime()) return null;
  const first = items[0]!;
  const inputHash = sha256(canonicalJson({ campaignId: input.campaign.id, inputHash: input.campaign.inputHash, profileId: input.profile.id, targetId: target.id }));
  const assets = items.flatMap(({ copy }) => copy.assets);
  return SocialInventoryCandidateSchema.parse({
    schemaVersion: "social-inventory-candidate/1",
    id: `social-inventory-candidate-${sha256(`${input.campaign.id}:${target.id}:${inputHash}`).slice(0, 20)}`,
    profileId: input.profile.id,
    strategyId: input.strategy.id,
    strategyVersion: input.strategy.version,
    candidateType: "campaign",
    pillarId: input.strategy.contentPillars[0]!.id,
    formatId: first.copy.commentaryType,
    platform: first.channel,
    locale: first.locale,
    contentRef: `state/social/campaigns/${input.campaign.id}.json`,
    contentBrief: `Reference accepted #410 campaign ${input.campaign.id}; inventory does not recalculate targeting, copy, assets or timing.`,
    evidenceRefs: [input.campaign.releaseVerification.evidenceRef, `state/social/campaigns/${input.campaign.id}.json`],
    sourceRefs: [input.campaign.sourcePackage.artifactRef],
    sourceKind: "accepted-campaign",
    sourceVentureId: input.campaign.sourceVentureId,
    capabilityRef: target.capabilityRef,
    approvedPackageRef: input.campaign.sourcePackage.artifactRef,
    campaignRef: `state/social/campaigns/${input.campaign.id}.json`,
    asset: { readiness: assets.length === 0 ? "not-required" : assets.every(({ altText }) => altText.length > 0) ? "ready" : "held", assetRefs: assets.map(({ ref }) => ref), altTextReady: assets.length === 0 || assets.every(({ altText }) => altText.length > 0) },
    usefulWindow: { earliest, latest, expiresAt: latest },
    similarityHash: sha256(canonicalJson({ campaignId: input.campaign.id, targetId: target.id, contentHashes: items.map(({ contentHash }) => contentHash).sort() })),
    estimatedCostUsd: 0,
    authorityClass: "campaign-reference",
    classification: target.role === "primary" ? "original" : "support",
    state: "eligible",
    reason: "Accepted #410 campaign reference; its immutable approvals remain authoritative.",
    finalCopy: false,
    generatedAt: input.now.toISOString(),
    generatorVersion: SOCIAL_INVENTORY_BUILDER_VERSION,
    inputHash,
    supersedesCandidateRef: null,
    correctedByRef: null,
    queueAuthorized: false,
    publishingAuthorized: false
  });
}

function inventoryState(candidates: readonly SocialInventoryCandidate[], coverageDays: number): SocialProfileInventory["state"] {
  const eligible = candidates.filter(({ state }) => state === "eligible").length;
  const original = candidates.filter(({ state, classification, candidateType }) => state === "eligible" && classification === "original" && candidateType !== "campaign").length;
  if (eligible === 0) return "no-candidate";
  return original >= 5 && coverageDays >= 7 ? "healthy" : "low-runway";
}

function incident(profileId: string, code: SocialInventoryIncidentEvidence["code"], reason: string, now: Date): SocialInventoryIncidentEvidence {
  return {
    schemaVersion: "social-inventory-incident/1",
    id: `social-inventory-incident-${sha256(`${profileId}:${code}:${now.toISOString()}`).slice(0, 20)}`,
    profileId,
    code,
    reason,
    detectedAt: now.toISOString(),
    recoveryPerformed: false,
    authorityGranted: false
  };
}

export function createSocialInventoryDueOperation(input: {
  profileId: string;
  now: Date;
  inputHash: string;
  configHash: string;
  lowRunway: boolean;
}): DueOperation {
  const date = pragueClockParts(input.now).date;
  return {
    jobId: `social-inventory-${input.profileId}-${date}`,
    nodeId: "social-distribution",
    phase: input.lowRunway ? "inventory-refill" : "inventory-weekly",
    classification: "mandatory",
    dueAt: input.now.toISOString(),
    nextEligibleAt: null,
    fixedOrder: 70,
    expectedCostUsd: 0,
    nodeBudgetHeadroomUsd: 0,
    providerIds: [],
    writerPaths: [`state/social/inventory/${input.profileId}`],
    inputHash: input.inputHash,
    configHash: input.configHash,
    modelVersion: null,
    dependencyHealthRefs: ["state/operations/health/social-distribution.json"],
    domainDecision: "work",
    externalAction: "none"
  };
}

export function buildSocialProfileInventory(input: {
  profile: SocialProfile;
  strategy: SocialProfileStrategy;
  campaigns: readonly unknown[];
  currentInventory?: unknown;
  now: Date;
  mode: "weekly" | "refill";
  capacityDecision: "run" | "reuse" | "held" | "deferred" | "skipped" | "not-due";
  capacityPlanRef: string;
  sourceSignatures?: readonly string[];
  modelAvailable?: boolean;
}): SocialInventoryBuildResult {
  const horizonStart = pragueClockParts(input.now).date;
  const campaigns = input.campaigns.flatMap((value) => {
    const parsed = SocialCampaignSchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
  const buildInputHash = sha256(canonicalJson({
    profileId: input.profile.id,
    strategyId: input.strategy.id,
    strategyVersion: input.strategy.version,
    horizonStart,
    sourceSignatures: [...(input.sourceSignatures ?? [])].sort(),
    campaignInputs: campaigns.map(({ id, inputHash, updatedAt }) => ({ id, inputHash, updatedAt })).sort((left, right) => left.id.localeCompare(right.id))
  }));
  const current = SocialProfileInventorySchema.safeParse(input.currentInventory);
  const previous = current.success ? current.data : null;
  const held = !["run", "reuse"].includes(input.capacityDecision);
  const inventoryRef = `state/social/inventory/${input.profile.id}/current.json`;
  if (held || (input.capacityDecision === "reuse" && previous?.inputHash !== buildInputHash)) {
    const inventory = SocialProfileInventorySchema.parse({
      schemaVersion: "social-profile-inventory/1", id: `social-profile-inventory-${input.profile.id.replace(/^social-profile-/u, "")}`,
      profileId: input.profile.id, strategyId: input.strategy.id, strategyVersion: input.strategy.version, horizonStart, horizonDays: 7,
      coverageDays: previous?.coverageDays ?? 0, state: "held", counts: previous?.counts ?? { original: 0, reserve: 0, recurring: 0, campaign: 0, eligible: 0, held: 0 },
      ratioProjection: previous?.ratioProjection ?? { original: 0, support: 0, policyRef: input.strategy.policyRefs.originalSupportRatioRef }, candidates: previous?.candidates ?? [],
      generatedAt: input.now.toISOString(), inputHash: buildInputHash, previousInventoryRef: previous ? inventoryRef : null, supersededCandidateRefs: [], queueAuthorized: false, publishingAuthorized: false
    });
    const evidence = incident(input.profile.id, "BUILD_HELD", `Capacity decision ${input.capacityDecision} did not authorize the deterministic builder.`, input.now);
    return { inventory, incidents: [evidence], receipt: receiptFor(input, buildInputHash, previous, inventory, "held", 0, 0, [evidence], null) };
  }
  if (previous?.inputHash === buildInputHash && previous.candidates.every(({ usefulWindow }) => Date.parse(usefulWindow.expiresAt) > input.now.getTime())) {
    return { inventory: previous, incidents: [], receipt: receiptFor(input, buildInputHash, previous, previous, "reused", previous.candidates.length, 0, [], inventoryRef) };
  }

  const sourceSignatures = input.sourceSignatures ?? [];
  const desired = [
    ...Array.from({ length: 7 }, (_, day) => deterministicCandidate({ profile: input.profile, strategy: input.strategy, candidateClass: "original", day, horizonStart, generatedAt: input.now, sourceSignatures })),
    ...[1, 4].map((day) => deterministicCandidate({ profile: input.profile, strategy: input.strategy, candidateClass: "reserve", day, horizonStart, generatedAt: input.now, sourceSignatures })),
    deterministicCandidate({ profile: input.profile, strategy: input.strategy, candidateClass: "recurring", day: 3, horizonStart, generatedAt: input.now, sourceSignatures }),
    ...campaigns.map((campaign) => campaignCandidate({ campaign, profile: input.profile, strategy: input.strategy, now: input.now }))
  ].filter((candidate): candidate is SocialInventoryCandidate => candidate !== null);
  const previousById = new Map((previous?.candidates ?? []).map((candidate) => [candidate.id, candidate]));
  let reused = 0;
  const candidates = desired.map((candidate) => {
    const existing = previousById.get(candidate.id);
    if (existing && existing.inputHash === candidate.inputHash && Date.parse(existing.usefulWindow.expiresAt) > input.now.getTime()) { reused += 1; return existing; }
    return candidate;
  });
  const supersededCandidateRefs = (previous?.candidates ?? []).filter((candidate) => !candidates.some(({ id }) => id === candidate.id)).map(({ id }) => `state/social/inventory-candidates/${id}.json`);
  const eligibleOriginalDays = new Set(candidates.filter(({ state, classification, candidateType }) => state === "eligible" && classification === "original" && candidateType !== "campaign").map(({ usefulWindow }) => usefulWindow.earliest.slice(0, 10)));
  const counts = {
    original: candidates.filter(({ candidateType }) => candidateType === "original").length,
    reserve: candidates.filter(({ candidateType }) => candidateType === "reserve").length,
    recurring: candidates.filter(({ candidateType }) => candidateType === "recurring").length,
    campaign: candidates.filter(({ candidateType }) => candidateType === "campaign").length,
    eligible: candidates.filter(({ state }) => state === "eligible").length,
    held: candidates.filter(({ state }) => state === "held").length
  };
  const state = inventoryState(candidates, eligibleOriginalDays.size);
  const inventory = SocialProfileInventorySchema.parse({
    schemaVersion: "social-profile-inventory/1", id: `social-profile-inventory-${input.profile.id.replace(/^social-profile-/u, "")}`,
    profileId: input.profile.id, strategyId: input.strategy.id, strategyVersion: input.strategy.version, horizonStart, horizonDays: 7,
    coverageDays: eligibleOriginalDays.size, state, counts,
    ratioProjection: { original: candidates.filter(({ classification }) => classification === "original").length, support: candidates.filter(({ classification }) => classification === "support").length, policyRef: input.strategy.policyRefs.originalSupportRatioRef },
    candidates, generatedAt: input.now.toISOString(), inputHash: buildInputHash, previousInventoryRef: previous ? inventoryRef : null,
    supersededCandidateRefs, queueAuthorized: false, publishingAuthorized: false
  });
  const incidents = state === "healthy" ? [] : [incident(input.profile.id, state === "no-candidate" ? "NO_CANDIDATE" : "LOW_RUNWAY", state === "no-candidate" ? "No eligible original candidate exists; no post is forced." : "The eligible original runway is below seven coverage days; no post is forced.", input.now)];
  const status = state === "healthy" ? "built" : state;
  return { inventory, incidents, receipt: receiptFor(input, buildInputHash, previous, inventory, status, reused, candidates.length - reused, incidents, inventoryRef) };
}

function receiptFor(
  input: Pick<Parameters<typeof buildSocialProfileInventory>[0], "profile" | "strategy" | "mode" | "capacityPlanRef" | "now" | "modelAvailable">,
  inputHash: string,
  previous: SocialProfileInventory | null,
  inventory: SocialProfileInventory,
  status: SocialInventoryBuildReceipt["status"],
  reusedCandidates: number,
  generatedCandidates: number,
  incidents: readonly SocialInventoryIncidentEvidence[],
  inventoryRef: string | null
): SocialInventoryBuildReceipt {
  return SocialInventoryBuildReceiptSchema.parse({
    schemaVersion: "social-inventory-build-receipt/1",
    id: `social-inventory-build-receipt-${sha256(`${input.profile.id}:${inputHash}:${status}`).slice(0, 20)}`,
    profileId: input.profile.id, strategyId: input.strategy.id, mode: input.mode, capacityPlanRef: input.capacityPlanRef, status, inputHash,
    previousCandidateCount: previous?.candidates.length ?? 0, resultingCandidateCount: inventory.candidates.length, reusedCandidates, generatedCandidates,
    expiredCandidates: previous?.candidates.filter(({ usefulWindow }) => Date.parse(usefulWindow.expiresAt) <= input.now.getTime()).length ?? 0,
    supersededCandidates: inventory.supersededCandidateRefs.length, actualCostUsd: 0, providerCalls: 0,
    providerCallsAvoided: status === "reused" ? 1 : 0, modelUnavailable: input.modelAvailable === false,
    incidentRefs: incidents.map(({ id }) => `state/social/inventory-incidents/${id}.json`), inventoryRef, generatedAt: input.now.toISOString(),
    authorityGranted: false, queueAuthorized: false, publishingAuthorized: false
  });
}

export function importCapabilityInventoryCandidate(input: {
  profile: SocialProfile;
  strategy: SocialProfileStrategy;
  capabilityMap: VentureCapabilityMap;
  sourceKind: "approved-package" | "goviral-intelligence";
  sourceVentureId: string;
  sourceRef: string;
  evidenceRefs: string[];
  contentBrief: string;
  finalCopy?: boolean;
  cta?: string | null;
  now: Date;
}): { decision: "eligible" | "denied"; reasons: string[]; candidate: SocialInventoryCandidate | null; queueAuthorized: false; publishingAuthorized: false } {
  const deny = (reason: string) => ({ decision: "denied" as const, reasons: [reason], candidate: null, queueAuthorized: false as const, publishingAuthorized: false as const });
  if (input.sourceRef.includes("*") || input.sourceVentureId === "portfolio") return deny("wildcard-or-portfolio-source-forbidden");
  if (["personal-growth", "kvorum", "contest-radar"].includes(input.sourceVentureId)) return deny("permanently-isolated-inventory-source");
  if (input.sourceKind === "goviral-intelligence" && (input.sourceVentureId !== "goviral" || input.finalCopy || input.cta)) return deny("goviral-final-copy-or-cta-forbidden");
  if ((input.sourceVentureId === "booksofhistory" && input.profile.ventureRef === "tehdejsi-svet")
    || (input.sourceVentureId === "tehdejsi-svet" && input.profile.ventureRef === "booksofhistory")) return deny("history-venture-isolation");
  if (input.sourceKind === "approved-package" && input.sourceVentureId === "door-money" && !input.sourceRef.startsWith("state/ventures/door-money/packages/")) return deny("door-money-approved-package-required");
  const capability = input.sourceKind === "approved-package" ? "approved-publish-package" : "intelligence-read";
  const reference = input.strategy.allowedCapabilities.find((candidate) => candidate.source === input.sourceVentureId && candidate.capability === capability);
  if (!reference) return deny("strategy-capability-missing");
  const resolved = resolveVentureCapabilityInMap(input.capabilityMap, { source: reference.source, target: "social-distribution", capability: reference.capability, schemaVersion: reference.dataSchemaVersion });
  if (resolved.decision !== "allowed" || !resolved.edge || resolved.edge.governingReference !== reference.decisionReference || reference.mapVersion !== input.capabilityMap.mapVersion) return deny("capability-held-denied-or-stale");
  const format = formatFor(input.strategy, "original");
  if (!format) return deny("original-format-missing");
  const candidateInput = sha256(canonicalJson({ profileId: input.profile.id, strategyVersion: input.strategy.version, sourceKind: input.sourceKind, sourceRef: input.sourceRef, evidenceRefs: input.evidenceRefs }));
  const candidate = SocialInventoryCandidateSchema.parse({
    schemaVersion: "social-inventory-candidate/1", id: `social-inventory-candidate-${sha256(`${input.profile.id}:${candidateInput}`).slice(0, 20)}`,
    profileId: input.profile.id, strategyId: input.strategy.id, strategyVersion: input.strategy.version, candidateType: "original",
    pillarId: format.pillarId, formatId: format.id, platform: format.platforms[0], locale: format.locales[0], contentRef: input.sourceRef,
    contentBrief: input.contentBrief, evidenceRefs: input.evidenceRefs, sourceRefs: [input.sourceRef], sourceKind: input.sourceKind,
    sourceVentureId: input.sourceVentureId, capabilityRef: reference, approvedPackageRef: input.sourceKind === "approved-package" ? input.sourceRef : null, campaignRef: null,
    asset: { readiness: "not-required", assetRefs: [], altTextReady: true },
    usefulWindow: { earliest: input.now.toISOString(), latest: new Date(input.now.getTime() + 7 * 86_400_000).toISOString(), expiresAt: new Date(input.now.getTime() + 8 * 86_400_000).toISOString() },
    similarityHash: sha256(canonicalJson({ sourceRef: input.sourceRef, formatId: format.id })), estimatedCostUsd: 0,
    authorityClass: "deterministic-plan", classification: "original", state: "eligible",
    reason: input.sourceKind === "goviral-intelligence" ? "Accepted GoVIRAL intelligence informs a plan only; final copy and CTA remain forbidden." : "Exact bounded package capability accepted for inventory planning.",
    finalCopy: false, generatedAt: input.now.toISOString(), generatorVersion: SOCIAL_INVENTORY_BUILDER_VERSION, inputHash: candidateInput,
    supersedesCandidateRef: null, correctedByRef: null, queueAuthorized: false, publishingAuthorized: false
  });
  return { decision: "eligible", reasons: ["exact-capability-source-accepted"], candidate, queueAuthorized: false, publishingAuthorized: false };
}
