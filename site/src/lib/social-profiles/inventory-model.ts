import { rawRecord } from "./model";

export interface SocialProfileStrategyRecord {
  id: string;
  profileId: string;
  profileRole: "venture-primary" | "company-umbrella" | "owned-amplifier";
  version: string;
  purpose: string;
  audience: string;
  languages: string[];
  markets: string[];
  pillarCount: number;
  formats: Array<{ id: string; label: string; candidateClass: "original" | "reserve" | "recurring" }>;
  cadence: { minimumPerWeek: number; targetPerWeek: number; maximumPerWeek: number };
  policyRefs: { amplificationPolicyRef: string; launchRunwayRef: string; originalSupportRatioRef: string; sameSourceCooldownRef: string; supportCapRef: string };
  rendererRef: "Design Lab";
  deterministicFirst: true;
  maximumModelCallsPerBuild: number;
  maximumCostUsdPerBuild: number;
  reviewDate: string;
  stopConditions: string[];
  authorityGranted: false;
  queueAuthorized: false;
  publishingAuthorized: false;
}

export interface SocialInventoryCandidateRecord {
  id: string;
  profileId: string;
  strategyId: string;
  candidateType: "original" | "reserve" | "recurring" | "campaign";
  pillarId: string;
  formatId: string;
  platform: "instagram" | "threads";
  locale: "cs" | "en";
  contentRef: string;
  contentBrief: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  sourceKind: string;
  sourceVentureId: string | null;
  campaignRef: string | null;
  asset: { readiness: "not-required" | "ready" | "held" | "unavailable"; assetRefs: string[]; altTextReady: boolean };
  usefulWindow: { earliest: string; latest: string; expiresAt: string };
  estimatedCostUsd: number;
  authorityClass: "deterministic-plan" | "bounded-model-plan" | "campaign-reference";
  classification: "original" | "support";
  state: "eligible" | "held" | "expired" | "superseded";
  reason: string;
  finalCopy: false;
  generatedAt: string;
  queueAuthorized: false;
  publishingAuthorized: false;
}

export interface SocialProfileInventoryRecord {
  id: string;
  profileId: string;
  strategyId: string;
  strategyVersion: string;
  horizonStart: string;
  horizonDays: number;
  coverageDays: number;
  state: "healthy" | "low-runway" | "no-candidate" | "held";
  counts: { original: number; reserve: number; recurring: number; campaign: number; eligible: number; held: number };
  ratioProjection: { original: number; support: number; policyRef: string };
  candidates: SocialInventoryCandidateRecord[];
  generatedAt: string;
  inputHash: string;
  supersededCandidateRefs: string[];
  queueAuthorized: false;
  publishingAuthorized: false;
}

export interface SocialInventoryReceiptRecord {
  id: string;
  profileId: string;
  strategyId: string;
  mode: "weekly" | "refill";
  capacityPlanRef: string;
  status: "built" | "reused" | "low-runway" | "no-candidate" | "held";
  previousCandidateCount: number;
  resultingCandidateCount: number;
  reusedCandidates: number;
  generatedCandidates: number;
  expiredCandidates: number;
  supersededCandidates: number;
  actualCostUsd: number;
  providerCalls: number;
  providerCallsAvoided: number;
  modelUnavailable: boolean;
  incidentRefs: string[];
  inventoryRef: string | null;
  generatedAt: string;
  authorityGranted: false;
  queueAuthorized: false;
  publishingAuthorized: false;
}

export interface SocialInventoryIncidentRecord {
  id: string;
  profileId: string;
  code: "LOW_RUNWAY" | "NO_CANDIDATE" | "BUILD_HELD";
  reason: string;
  detectedAt: string;
  recoveryPerformed: false;
  authorityGranted: false;
}

const text = (value: unknown, max = 1_000): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const nullableText = (value: unknown, max = 1_000): value is string | null => value === null || text(value, max);
const integer = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const strings = (value: unknown, max = 100): string[] | null => Array.isArray(value) && value.length <= max && value.every((entry) => text(entry, 500)) ? value as string[] : null;
const oneOf = <T extends readonly string[]>(value: unknown, choices: T): value is T[number] => typeof value === "string" && choices.includes(value as T[number]);

export function parseSocialProfileStrategy(value: unknown): SocialProfileStrategyRecord | null {
  const item = rawRecord(value); const cadence = rawRecord(item?.cadence); const policy = rawRecord(item?.policyRefs); const assets = rawRecord(item?.assets); const generation = rawRecord(item?.generationPolicy);
  const formats = Array.isArray(item?.recurringFormats) ? item.recurringFormats.slice(0, 30).flatMap((raw) => {
    const format = rawRecord(raw); return format && text(format.id, 80) && text(format.label, 120) && oneOf(format.candidateClass, ["original", "reserve", "recurring"] as const) ? [{ id: format.id, label: format.label, candidateClass: format.candidateClass }] : [];
  }) : [];
  const languages = strings(item?.languages, 2); const markets = strings(item?.markets, 20); const stops = strings(item?.stopConditions, 30);
  if (item?.schemaVersion !== "social-profile-strategy/1" || !text(item.id, 180) || !text(item.profileId, 140)
    || !oneOf(item.profileRole, ["venture-primary", "company-umbrella", "owned-amplifier"] as const) || !text(item.version, 30)
    || !text(item.purpose, 500) || !text(item.audience, 500) || !languages || !markets || !Array.isArray(item.contentPillars) || item.contentPillars.length < 1
    || formats.length < 3 || !cadence || !integer(cadence.minimumPerWeek) || !integer(cadence.targetPerWeek) || !integer(cadence.maximumPerWeek)
    || !policy || !text(policy.amplificationPolicyRef, 160) || !text(policy.launchRunwayRef, 160) || !text(policy.originalSupportRatioRef, 160)
    || !text(policy.sameSourceCooldownRef, 160) || !text(policy.supportCapRef, 160) || !assets || assets.rendererRef !== "Design Lab"
    || !generation || generation.deterministicFirst !== true || !integer(generation.maximumModelCallsPerBuild) || typeof generation.maximumCostUsdPerBuild !== "number"
    || !text(item.reviewDate, 20) || !stops || item.authorityGranted !== false || item.queueAuthorized !== false || item.publishingAuthorized !== false) return null;
  return {
    id: item.id, profileId: item.profileId, profileRole: item.profileRole, version: item.version, purpose: item.purpose, audience: item.audience,
    languages, markets, pillarCount: item.contentPillars.length, formats, cadence: { minimumPerWeek: cadence.minimumPerWeek as number, targetPerWeek: cadence.targetPerWeek as number, maximumPerWeek: cadence.maximumPerWeek as number },
    policyRefs: { amplificationPolicyRef: policy.amplificationPolicyRef, launchRunwayRef: policy.launchRunwayRef, originalSupportRatioRef: policy.originalSupportRatioRef, sameSourceCooldownRef: policy.sameSourceCooldownRef, supportCapRef: policy.supportCapRef },
    rendererRef: "Design Lab", deterministicFirst: true, maximumModelCallsPerBuild: generation.maximumModelCallsPerBuild as number,
    maximumCostUsdPerBuild: generation.maximumCostUsdPerBuild as number, reviewDate: item.reviewDate, stopConditions: stops,
    authorityGranted: false, queueAuthorized: false, publishingAuthorized: false
  };
}

export function parseSocialInventoryCandidate(value: unknown): SocialInventoryCandidateRecord | null {
  const item = rawRecord(value); const asset = rawRecord(item?.asset); const window = rawRecord(item?.usefulWindow);
  const evidence = strings(item?.evidenceRefs, 50); const sources = strings(item?.sourceRefs, 50); const assetRefs = strings(asset?.assetRefs, 20);
  if (item?.schemaVersion !== "social-inventory-candidate/1" || !text(item.id, 100) || !text(item.profileId, 140) || !text(item.strategyId, 180)
    || !oneOf(item.candidateType, ["original", "reserve", "recurring", "campaign"] as const) || !text(item.pillarId, 80) || !text(item.formatId, 80)
    || !oneOf(item.platform, ["instagram", "threads"] as const) || !oneOf(item.locale, ["cs", "en"] as const) || !text(item.contentRef, 160)
    || !text(item.contentBrief, 1_000) || !evidence || !sources || !text(item.sourceKind, 60) || !nullableText(item.sourceVentureId, 80) || !nullableText(item.campaignRef, 160)
    || !asset || !oneOf(asset.readiness, ["not-required", "ready", "held", "unavailable"] as const) || !assetRefs || typeof asset.altTextReady !== "boolean"
    || !window || !text(window.earliest, 60) || !text(window.latest, 60) || !text(window.expiresAt, 60) || typeof item.estimatedCostUsd !== "number"
    || !oneOf(item.authorityClass, ["deterministic-plan", "bounded-model-plan", "campaign-reference"] as const) || !oneOf(item.classification, ["original", "support"] as const)
    || !oneOf(item.state, ["eligible", "held", "expired", "superseded"] as const) || !text(item.reason, 500) || item.finalCopy !== false || !text(item.generatedAt, 60)
    || item.queueAuthorized !== false || item.publishingAuthorized !== false) return null;
  if (item.sourceKind === "accepted-campaign" && (item.candidateType !== "campaign" || !String(item.campaignRef).startsWith("state/social/campaigns/"))) return null;
  return {
    id: item.id, profileId: item.profileId, strategyId: item.strategyId, candidateType: item.candidateType, pillarId: item.pillarId, formatId: item.formatId,
    platform: item.platform, locale: item.locale, contentRef: item.contentRef, contentBrief: item.contentBrief, evidenceRefs: evidence, sourceRefs: sources,
    sourceKind: item.sourceKind, sourceVentureId: item.sourceVentureId as string | null, campaignRef: item.campaignRef as string | null,
    asset: { readiness: asset.readiness, assetRefs, altTextReady: asset.altTextReady }, usefulWindow: { earliest: window.earliest, latest: window.latest, expiresAt: window.expiresAt },
    estimatedCostUsd: item.estimatedCostUsd, authorityClass: item.authorityClass, classification: item.classification, state: item.state, reason: item.reason,
    finalCopy: false, generatedAt: item.generatedAt, queueAuthorized: false, publishingAuthorized: false
  };
}

export function parseSocialProfileInventory(value: unknown): SocialProfileInventoryRecord | null {
  const item = rawRecord(value); const counts = rawRecord(item?.counts); const ratio = rawRecord(item?.ratioProjection);
  const parsedCandidates = Array.isArray(item?.candidates) ? item.candidates.slice(0, 100).map(parseSocialInventoryCandidate) : [];
  const candidates = parsedCandidates.filter((candidate): candidate is SocialInventoryCandidateRecord => candidate !== null); const superseded = strings(item?.supersededCandidateRefs, 100);
  if (item?.schemaVersion !== "social-profile-inventory/1" || !text(item.id, 180) || !text(item.profileId, 140) || !text(item.strategyId, 180)
    || !text(item.strategyVersion, 30) || !text(item.horizonStart, 20) || !integer(item.horizonDays) || !integer(item.coverageDays)
    || !oneOf(item.state, ["healthy", "low-runway", "no-candidate", "held"] as const) || !counts || !ratio || !superseded
    || parsedCandidates.some((candidate) => candidate === null) || !["original", "reserve", "recurring", "campaign", "eligible", "held"].every((key) => integer(counts[key]))
    || !integer(ratio.original) || !integer(ratio.support) || !text(ratio.policyRef, 160) || !text(item.generatedAt, 60) || !text(item.inputHash, 64)
    || item.queueAuthorized !== false || item.publishingAuthorized !== false) return null;
  const actual = { original: candidates.filter(({ candidateType }) => candidateType === "original").length, reserve: candidates.filter(({ candidateType }) => candidateType === "reserve").length, recurring: candidates.filter(({ candidateType }) => candidateType === "recurring").length, campaign: candidates.filter(({ candidateType }) => candidateType === "campaign").length, eligible: candidates.filter(({ state }) => state === "eligible").length, held: candidates.filter(({ state }) => state === "held").length };
  if (Object.entries(actual).some(([key, count]) => counts[key] !== count)) return null;
  return {
    id: item.id, profileId: item.profileId, strategyId: item.strategyId, strategyVersion: item.strategyVersion, horizonStart: item.horizonStart,
    horizonDays: item.horizonDays as number, coverageDays: item.coverageDays as number, state: item.state, counts: actual,
    ratioProjection: { original: ratio.original as number, support: ratio.support as number, policyRef: ratio.policyRef }, candidates,
    generatedAt: item.generatedAt, inputHash: item.inputHash, supersededCandidateRefs: superseded, queueAuthorized: false, publishingAuthorized: false
  };
}

export function parseSocialInventoryReceipt(value: unknown): SocialInventoryReceiptRecord | null {
  const item = rawRecord(value); const incidentRefs = strings(item?.incidentRefs, 100);
  if (item?.schemaVersion !== "social-inventory-build-receipt/1" || !text(item.id, 100) || !text(item.profileId, 140) || !text(item.strategyId, 180)
    || !oneOf(item.mode, ["weekly", "refill"] as const) || !text(item.capacityPlanRef, 160) || !oneOf(item.status, ["built", "reused", "low-runway", "no-candidate", "held"] as const)
    || !["previousCandidateCount", "resultingCandidateCount", "reusedCandidates", "generatedCandidates", "expiredCandidates", "supersededCandidates", "providerCalls", "providerCallsAvoided"].every((key) => integer(item[key]))
    || typeof item.actualCostUsd !== "number" || typeof item.modelUnavailable !== "boolean" || !incidentRefs || !nullableText(item.inventoryRef, 160) || !text(item.generatedAt, 60)
    || item.authorityGranted !== false || item.queueAuthorized !== false || item.publishingAuthorized !== false) return null;
  return {
    id: item.id, profileId: item.profileId, strategyId: item.strategyId, mode: item.mode, capacityPlanRef: item.capacityPlanRef, status: item.status,
    previousCandidateCount: item.previousCandidateCount as number, resultingCandidateCount: item.resultingCandidateCount as number,
    reusedCandidates: item.reusedCandidates as number, generatedCandidates: item.generatedCandidates as number, expiredCandidates: item.expiredCandidates as number,
    supersededCandidates: item.supersededCandidates as number, actualCostUsd: item.actualCostUsd, providerCalls: item.providerCalls as number,
    providerCallsAvoided: item.providerCallsAvoided as number, modelUnavailable: item.modelUnavailable, incidentRefs, inventoryRef: item.inventoryRef as string | null,
    generatedAt: item.generatedAt, authorityGranted: false, queueAuthorized: false, publishingAuthorized: false
  };
}

export function parseSocialInventoryIncident(value: unknown): SocialInventoryIncidentRecord | null {
  const item = rawRecord(value);
  if (item?.schemaVersion !== "social-inventory-incident/1" || !text(item.id, 100) || !text(item.profileId, 140)
    || !oneOf(item.code, ["LOW_RUNWAY", "NO_CANDIDATE", "BUILD_HELD"] as const) || !text(item.reason, 500) || !text(item.detectedAt, 60)
    || item.recoveryPerformed !== false || item.authorityGranted !== false) return null;
  return { id: item.id, profileId: item.profileId, code: item.code, reason: item.reason, detectedAt: item.detectedAt, recoveryPerformed: false, authorityGranted: false };
}
