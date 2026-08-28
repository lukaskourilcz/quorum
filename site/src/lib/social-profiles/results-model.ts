import { rawRecord } from "./model";

export type SocialResultRole = "primary" | "umbrella" | "amplifier";
export type SocialResultMetricName = "verified_publish" | "reach" | "views" | "impressions" | "non_follower_reach" | "non_follower_reach_ratio" | "shares" | "reposts" | "quotes" | "saves" | "replies" | "comments" | "likes" | "profile_actions" | "referral_visits" | "qualified_actions" | "conversions" | "original_ratio" | "support_ratio" | "runway_holds" | "cooldown_holds" | "campaign_holds" | "campaign_failures" | "time_to_distribute_seconds";

export interface SocialResultObservationRecord {
  id: string;
  profileId: string;
  targetRole: SocialResultRole;
  connectionId: string;
  platform: "instagram" | "threads";
  nativePostId: string;
  publicUrl: string;
  campaignRef: string | null;
  campaignItemId: string | null;
  releaseId: string | null;
  sourceVentureId: string | null;
  capabilityRef: { mapVersion: string; decisionReference: string } | null;
  publishedAt: string;
  observedAt: string;
  maturityWindow: "24h" | "72h" | "7d" | "28d";
  provider: { source: "official-meta" | "destination-analytics" | "owner-manual"; providerId: string; implementationVersion: string; apiVersion: string | null; bindingRef: string | null; evidenceRef: string };
  format: "text" | "image" | "carousel" | "reel" | "video";
  locale: "cs" | "en";
  amplifier: { archetype: string; policyRef: string; strategyRef: string } | null;
  policyState: { classification: "original" | "support"; originalRatio: number | null; supportRatio: number | null; runwayState: string; cooldownState: string; campaignState: string; strategyRef: string };
  metrics: Array<{ name: SocialResultMetricName; value: number | null; unavailableReason: string | null }>;
  unavailableReason: string | null;
  actualCostUsd: number | null;
  droppedMetricCount: number;
}

export interface SocialAttributionEventRecord {
  id: string;
  eventType: "referral-visit" | "qualified-action" | "conversion";
  eventCount: number;
  occurredAt: string;
  attribution: { state: "attributed" | "unattributed" | "invalid"; campaignRef: string | null; campaignItemId: string | null; profileId: string | null; targetRole: SocialResultRole | null };
}

export interface SocialBaselineRecord { id: string; startsOn: string; endsOn: string; status: "collecting" | "complete"; elapsedDays: number; acceptedObservationCount: number; droppedObservationCount: number; metricsAvailable: boolean }
export interface SocialExperimentRecord { id: string; status: string; hypothesis: string; changedVariable: string; primaryMetric: SocialResultMetricName; minimumSample: number; evidenceCount: number; verdict: "KEEP" | "ITERATE" | "STOP" | "INSUFFICIENT_DATA"; startsOn: string; endsOn: string }
export interface SocialBoostProposalRecord { id: string; status: "held-owner-proposal"; primaryMetric: SocialResultMetricName; observedValue: number; thresholdValue: number; sampleSize: number; proposedAt: string }

const text = (value: unknown, max = 1_000): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const nullableText = (value: unknown, max = 1_000): value is string | null => value === null || text(value, max);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const integer = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0;
const oneOf = <T extends readonly string[]>(value: unknown, choices: T): value is T[number] => typeof value === "string" && choices.includes(value as T[number]);
const metricNames = ["verified_publish", "reach", "views", "impressions", "non_follower_reach", "non_follower_reach_ratio", "shares", "reposts", "quotes", "saves", "replies", "comments", "likes", "profile_actions", "referral_visits", "qualified_actions", "conversions", "original_ratio", "support_ratio", "runway_holds", "cooldown_holds", "campaign_holds", "campaign_failures", "time_to_distribute_seconds"] as const;

export function parseSocialResultObservation(value: unknown): SocialResultObservationRecord | null {
  const item = rawRecord(value); const provider = rawRecord(item?.provider); const policy = rawRecord(item?.policyState); const capability = rawRecord(item?.capabilityRef); const amplifier = rawRecord(item?.amplifier);
  if (!item || Object.keys(item).some((key) => ["audienceIds", "visitorId", "visitorHash", "fingerprint", "privateMessage", "messageBody", "commentBody"].includes(key))) return null;
  const metrics = Array.isArray(item.metrics) ? item.metrics.slice(0, 40).flatMap((raw) => { const metric = rawRecord(raw); return metric && oneOf(metric.name, metricNames) && (metric.value === null || number(metric.value)) && nullableText(metric.unavailableReason, 100) && ((metric.value === null) === (metric.unavailableReason !== null)) ? [{ name: metric.name, value: metric.value as number | null, unavailableReason: metric.unavailableReason as string | null }] : []; }) : [];
  if (item.schemaVersion !== "social-metric-observation/1" || !text(item.id, 100) || !text(item.profileId, 140) || !oneOf(item.targetRole, ["primary", "umbrella", "amplifier"] as const)
    || !text(item.connectionId, 160) || !oneOf(item.platform, ["instagram", "threads"] as const) || !text(item.nativePostId, 240) || !text(item.publicUrl, 2_000)
    || !nullableText(item.campaignRef, 160) || !nullableText(item.campaignItemId, 100) || !nullableText(item.releaseId, 100) || !nullableText(item.sourceVentureId, 80)
    || (capability && (!text(capability.mapVersion, 30) || !text(capability.decisionReference, 160))) || (!capability && item.capabilityRef !== null)
    || !text(item.publishedAt, 60) || !text(item.observedAt, 60) || !oneOf(item.maturityWindow, ["24h", "72h", "7d", "28d"] as const)
    || !provider || !oneOf(provider.source, ["official-meta", "destination-analytics", "owner-manual"] as const) || !text(provider.providerId, 80) || !text(provider.implementationVersion, 80) || !nullableText(provider.apiVersion, 80) || !nullableText(provider.bindingRef, 180) || !text(provider.evidenceRef, 160)
    || !oneOf(item.format, ["text", "image", "carousel", "reel", "video"] as const) || !oneOf(item.locale, ["cs", "en"] as const)
    || !policy || !oneOf(policy.originalSupportClassification, ["original", "support"] as const) || (policy.originalRatio !== null && !number(policy.originalRatio)) || (policy.supportRatio !== null && !number(policy.supportRatio)) || !text(policy.runwayState, 40) || !text(policy.cooldownState, 40) || !text(policy.campaignState, 40) || !text(policy.strategyRef, 180)
    || (amplifier && (!text(amplifier.archetype, 80) || !text(amplifier.policyRef, 180) || !text(amplifier.strategyRef, 180))) || (!amplifier && item.amplifier !== null)
    || !Array.isArray(item.metrics) || metrics.length !== item.metrics.length || !nullableText(item.unavailableReason, 100) || (item.actualCostUsd !== null && !number(item.actualCostUsd)) || !integer(item.droppedMetricCount)
    || item.audienceIdentityExcluded !== true || item.privateMessageExcluded !== true || item.rawProviderPayloadExcluded !== true || item.authorityGranted !== false) return null;
  return { id: item.id, profileId: item.profileId, targetRole: item.targetRole, connectionId: item.connectionId, platform: item.platform, nativePostId: item.nativePostId, publicUrl: item.publicUrl, campaignRef: item.campaignRef as string | null, campaignItemId: item.campaignItemId as string | null, releaseId: item.releaseId as string | null, sourceVentureId: item.sourceVentureId as string | null, capabilityRef: capability ? { mapVersion: capability.mapVersion as string, decisionReference: capability.decisionReference as string } : null, publishedAt: item.publishedAt, observedAt: item.observedAt, maturityWindow: item.maturityWindow, provider: { source: provider.source, providerId: provider.providerId, implementationVersion: provider.implementationVersion, apiVersion: provider.apiVersion as string | null, bindingRef: provider.bindingRef as string | null, evidenceRef: provider.evidenceRef }, format: item.format, locale: item.locale, amplifier: amplifier ? { archetype: amplifier.archetype as string, policyRef: amplifier.policyRef as string, strategyRef: amplifier.strategyRef as string } : null, policyState: { classification: policy.originalSupportClassification, originalRatio: policy.originalRatio as number | null, supportRatio: policy.supportRatio as number | null, runwayState: policy.runwayState, cooldownState: policy.cooldownState, campaignState: policy.campaignState, strategyRef: policy.strategyRef }, metrics, unavailableReason: item.unavailableReason as string | null, actualCostUsd: item.actualCostUsd as number | null, droppedMetricCount: item.droppedMetricCount as number };
}

export function parseSocialAttributionEvent(value: unknown): SocialAttributionEventRecord | null {
  const item = rawRecord(value); const attribution = rawRecord(item?.attribution);
  if (item?.schemaVersion !== "social-attribution-event/1" || !text(item.id, 100) || !oneOf(item.eventType, ["referral-visit", "qualified-action", "conversion"] as const) || !integer(item.eventCount) || item.eventCount < 1 || !text(item.occurredAt, 60) || !attribution || !oneOf(attribution.state, ["attributed", "unattributed", "invalid"] as const) || !nullableText(attribution.campaignRef, 180) || !nullableText(attribution.campaignItemId, 100) || !nullableText(attribution.profileId, 140) || (attribution.targetRole !== null && !oneOf(attribution.targetRole, ["primary", "umbrella", "amplifier"] as const)) || item.identityExcluded !== true || item.fingerprintingExcluded !== true || item.consentInferred !== false || item.sharingInferred !== false) return null;
  return { id: item.id, eventType: item.eventType, eventCount: item.eventCount, occurredAt: item.occurredAt, attribution: { state: attribution.state, campaignRef: attribution.campaignRef as string | null, campaignItemId: attribution.campaignItemId as string | null, profileId: attribution.profileId as string | null, targetRole: attribution.targetRole as SocialResultRole | null } };
}

export function parseSocialBaseline(value: unknown): SocialBaselineRecord | null { const item = rawRecord(value); return item?.schemaVersion === "social-distribution-baseline/1" && text(item.id, 140) && text(item.startsOn, 20) && text(item.endsOn, 20) && oneOf(item.status, ["collecting", "complete"] as const) && integer(item.elapsedDays) && integer(item.acceptedObservationCount) && integer(item.droppedObservationCount) && typeof item.metricsAvailable === "boolean" ? { id: item.id, startsOn: item.startsOn, endsOn: item.endsOn, status: item.status, elapsedDays: item.elapsedDays, acceptedObservationCount: item.acceptedObservationCount, droppedObservationCount: item.droppedObservationCount, metricsAvailable: item.metricsAvailable } : null; }
export function parseSocialExperiment(value: unknown): SocialExperimentRecord | null { const item = rawRecord(value); return item?.schemaVersion === "social-distribution-experiment/1" && text(item.id, 160) && text(item.status, 30) && text(item.hypothesis, 500) && text(item.changedVariable, 80) && oneOf(item.primaryMetric, metricNames) && integer(item.minimumSample) && Array.isArray(item.evidenceObservationRefs) && oneOf(item.verdict, ["KEEP", "ITERATE", "STOP", "INSUFFICIENT_DATA"] as const) && text(item.startsOn, 20) && text(item.endsOn, 20) && item.hardGatesFrozen === true && item.privacyFrozen === true && item.manipulationExcluded === true && item.publishingAuthorized === false ? { id: item.id, status: item.status, hypothesis: item.hypothesis, changedVariable: item.changedVariable, primaryMetric: item.primaryMetric, minimumSample: item.minimumSample, evidenceCount: item.evidenceObservationRefs.length, verdict: item.verdict, startsOn: item.startsOn, endsOn: item.endsOn } : null; }
export function parseSocialBoostProposal(value: unknown): SocialBoostProposalRecord | null { const item = rawRecord(value); return item?.schemaVersion === "social-boost-proposal/1" && text(item.id, 100) && item.status === "held-owner-proposal" && oneOf(item.primaryMetric, metricNames) && number(item.observedValue) && number(item.thresholdValue) && integer(item.sampleSize) && text(item.proposedAt, 60) && item.ownerDecisionRequired === true && item.adApiCalled === false && item.purchaseAuthorized === false && item.spendAuthorized === false && item.publishingAuthorized === false ? { id: item.id, status: "held-owner-proposal", primaryMetric: item.primaryMetric, observedValue: item.observedValue, thresholdValue: item.thresholdValue, sampleSize: item.sampleSize, proposedAt: item.proposedAt } : null; }
