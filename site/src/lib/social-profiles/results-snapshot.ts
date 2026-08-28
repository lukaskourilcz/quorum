import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseSocialAttributionEvent,
  parseSocialBaseline,
  parseSocialBoostProposal,
  parseSocialExperiment,
  parseSocialResultObservation,
  type SocialAttributionEventRecord,
  type SocialBaselineRecord,
  type SocialBoostProposalRecord,
  type SocialExperimentRecord,
  type SocialResultMetricName,
  type SocialResultObservationRecord,
  type SocialResultRole
} from "./results-model";
import { rawRecord } from "./model";

export interface AdminSocialResultProfileView {
  profileId: string;
  targetRole: SocialResultRole;
  latestPostObservations: number;
  unavailablePosts: number;
  originalSample: number;
  supportSample: number;
  verifiedPublishRate: number | null;
  totals: Record<"reach" | "views" | "likes" | "referralVisits" | "qualifiedActions" | "conversions", number | null>;
  originalRatio: number | null;
  supportRatio: number | null;
  policyIncidents: number;
  actualCostUsd: number | null;
  providerState: "measured" | "unavailable";
  amplifierDecisionEvidence: "available" | "insufficient-baseline" | "not-applicable";
  capabilityVersions: string[];
}

export interface AdminSocialResultCampaignView {
  campaignRef: string;
  sourceVentureId: string;
  releaseId: string;
  sample: number;
  targetRoles: SocialResultRole[];
  platforms: string[];
  formats: string[];
  locales: string[];
  primaryOnly: boolean;
  referralVisits: number;
  qualifiedActions: number;
  conversions: number;
  timeToDistributeSeconds: number | null;
  actualCostUsd: number | null;
  state: "measured" | "held" | "failed" | "unavailable";
}

export interface AdminSocialResultsSnapshot {
  observations: SocialResultObservationRecord[];
  attributionEvents: SocialAttributionEventRecord[];
  baselines: SocialBaselineRecord[];
  experiments: SocialExperimentRecord[];
  boostProposals: SocialBoostProposalRecord[];
  profiles: AdminSocialResultProfileView[];
  campaigns: AdminSocialResultCampaignView[];
  summary: { observations: number; measuredPosts: number; unavailablePosts: number; attributedEvents: number; unattributedEvents: number; activeExperiments: number; actualCostUsd: number | null };
  dropped: { observations: number; attribution: number; baselines: number; experiments: number; boostProposals: number; orphanRecords: number };
  unavailable: string[];
  audienceIdentityExposed: false;
  privateMessagesExposed: false;
  authorityGranted: false;
  spendAuthorized: false;
}

async function directory<T>(directoryPath: string, parse: (value: unknown) => T | null, limit = 10_000): Promise<{ accepted: T[]; dropped: number; unavailable: boolean }> {
  const names = await readdir(directoryPath).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (names === null) return { accepted: [], dropped: 1, unavailable: true };
  const accepted: T[] = []; let dropped = 0;
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort().slice(0, limit)) {
    try { const parsed = parse(JSON.parse(await readFile(path.join(directoryPath, name), "utf8")) as unknown); if (parsed) accepted.push(parsed); else dropped += 1; }
    catch { dropped += 1; }
  }
  return { accepted, dropped, unavailable: false };
}

async function experimentRegister(root: string): Promise<{ accepted: SocialExperimentRecord[]; dropped: number; unavailable: boolean }> {
  try {
    const raw = rawRecord(JSON.parse(await readFile(path.join(root, "state/social/results/experiments.json"), "utf8")) as unknown);
    if (raw?.schemaVersion !== "social-distribution-experiment-register/1" || !Array.isArray(raw.experiments)) return { accepted: [], dropped: 1, unavailable: false };
    const parsed = raw.experiments.slice(0, 100).map(parseSocialExperiment);
    return { accepted: parsed.filter((value): value is SocialExperimentRecord => value !== null), dropped: parsed.filter((value) => value === null).length, unavailable: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accepted: [], dropped: 0, unavailable: false };
    return { accepted: [], dropped: 1, unavailable: true };
  }
}

function metric(observation: SocialResultObservationRecord, name: SocialResultMetricName): number | null {
  return observation.metrics.find((entry) => entry.name === name)?.value ?? null;
}

function latestByPost(observations: readonly SocialResultObservationRecord[]) {
  const latest = new Map<string, SocialResultObservationRecord>();
  for (const observation of [...observations].sort((left, right) => left.observedAt.localeCompare(right.observedAt))) latest.set(`${observation.profileId}:${observation.platform}:${observation.nativePostId}`, observation);
  return [...latest.values()];
}

function sum(values: Array<number | null>): number | null { const available = values.filter((value): value is number => value !== null); return available.length ? available.reduce((total, value) => total + value, 0) : null; }
function ratio(numerator: number, denominator: number): number | null { return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null; }

function profileViews(observations: readonly SocialResultObservationRecord[], attribution: readonly SocialAttributionEventRecord[]): AdminSocialResultProfileView[] {
  const ids = [...new Set(observations.map(({ profileId }) => profileId))].sort();
  return ids.map((profileId) => {
    const all = observations.filter((entry) => entry.profileId === profileId); const latest = latestByPost(all); const role = all[0]!.targetRole;
    const events = attribution.filter((entry) => entry.attribution.state === "attributed" && entry.attribution.profileId === profileId);
    const originalSample = latest.filter(({ policyState }) => policyState.classification === "original").length; const supportSample = latest.length - originalSample;
    const verified = latest.map((entry) => metric(entry, "verified_publish"));
    const total = (name: SocialResultMetricName) => sum(latest.map((entry) => metric(entry, name)));
    const attributed = (eventType: SocialAttributionEventRecord["eventType"]) => sum(events.filter((entry) => entry.eventType === eventType).map(({ eventCount }) => eventCount));
    const costs = all.map(({ actualCostUsd }) => actualCostUsd);
    return {
      profileId, targetRole: role, latestPostObservations: latest.length, unavailablePosts: latest.filter(({ unavailableReason }) => unavailableReason !== null).length,
      originalSample, supportSample, verifiedPublishRate: ratio(verified.filter((value) => value !== null && value > 0).length, verified.filter((value) => value !== null).length),
      totals: { reach: total("reach"), views: total("views"), likes: total("likes"), referralVisits: attributed("referral-visit"), qualifiedActions: attributed("qualified-action"), conversions: attributed("conversion") },
      originalRatio: ratio(originalSample, latest.length), supportRatio: ratio(supportSample, latest.length),
      policyIncidents: latest.filter(({ policyState }) => ["low-runway", "no-candidate", "held"].includes(policyState.runwayState) || policyState.cooldownState === "held" || ["held", "failed"].includes(policyState.campaignState)).length,
      actualCostUsd: sum(costs), providerState: latest.some(({ unavailableReason }) => unavailableReason === null) ? "measured" : "unavailable",
      amplifierDecisionEvidence: role !== "amplifier" ? "not-applicable" : originalSample > 0 && supportSample > 0 ? "available" : "insufficient-baseline",
      capabilityVersions: [...new Set(all.flatMap(({ capabilityRef }) => capabilityRef ? [capabilityRef.mapVersion] : []))]
    };
  });
}

function campaignViews(observations: readonly SocialResultObservationRecord[], attribution: readonly SocialAttributionEventRecord[]): AdminSocialResultCampaignView[] {
  const refs = [...new Set(observations.flatMap(({ campaignRef }) => campaignRef ? [campaignRef] : []))].sort();
  return refs.map((campaignRef) => {
    const all = observations.filter((entry) => entry.campaignRef === campaignRef); const latest = latestByPost(all); const events = attribution.filter((entry) => entry.attribution.state === "attributed" && entry.attribution.campaignRef === campaignRef);
    const eventTotal = (type: SocialAttributionEventRecord["eventType"]) => events.filter(({ eventType }) => eventType === type).reduce((total, { eventCount }) => total + eventCount, 0);
    const time = sum(latest.map((entry) => metric(entry, "time_to_distribute_seconds"))); const costs = sum(all.map(({ actualCostUsd }) => actualCostUsd));
    const campaignStates = latest.map(({ policyState }) => policyState.campaignState);
    return { campaignRef, sourceVentureId: all[0]!.sourceVentureId ?? "unavailable", releaseId: all[0]!.releaseId ?? "unavailable", sample: latest.length, targetRoles: [...new Set(latest.map(({ targetRole }) => targetRole))], platforms: [...new Set(latest.map(({ platform }) => platform))], formats: [...new Set(latest.map(({ format }) => format))], locales: [...new Set(latest.map(({ locale }) => locale))], primaryOnly: latest.every(({ targetRole }) => targetRole === "primary"), referralVisits: eventTotal("referral-visit"), qualifiedActions: eventTotal("qualified-action"), conversions: eventTotal("conversion"), timeToDistributeSeconds: time, actualCostUsd: costs, state: campaignStates.includes("failed") ? "failed" : campaignStates.includes("held") ? "held" : latest.some(({ unavailableReason }) => unavailableReason === null) ? "measured" : "unavailable" };
  });
}

export async function readAdminSocialResults(root: string, allowedProfileIds?: ReadonlySet<string>, allowedCampaignRefs?: ReadonlySet<string>): Promise<AdminSocialResultsSnapshot> {
  const [observationsState, attributionState, baselineState, experimentsState, boostState] = await Promise.all([
    directory(path.join(root, "state/social/results/observations"), parseSocialResultObservation),
    directory(path.join(root, "state/social/results/attribution"), parseSocialAttributionEvent),
    directory(path.join(root, "state/social/results/baselines"), parseSocialBaseline, 100),
    experimentRegister(root),
    directory(path.join(root, "state/social/results/boost-proposals"), parseSocialBoostProposal, 100)
  ]);
  const permitted = allowedProfileIds ?? new Set(observationsState.accepted.map(({ profileId }) => profileId));
  const observations = observationsState.accepted.filter(({ profileId, campaignRef }) => permitted.has(profileId) && (campaignRef === null || !allowedCampaignRefs || allowedCampaignRefs.has(campaignRef)));
  const attributionEvents = attributionState.accepted.filter(({ attribution }) => (attribution.profileId === null || permitted.has(attribution.profileId)) && (attribution.campaignRef === null || !allowedCampaignRefs || allowedCampaignRefs.has(attribution.campaignRef)));
  const orphanRecords = observationsState.accepted.length - observations.length + attributionState.accepted.length - attributionEvents.length;
  const profiles = profileViews(observations, attributionEvents); const campaigns = campaignViews(observations, attributionEvents); const latest = latestByPost(observations);
  const costs = observations.map(({ actualCostUsd }) => actualCostUsd);
  const unavailable: string[] = [];
  if (observationsState.unavailable) unavailable.push("social result observations: unavailable");
  if (attributionState.unavailable) unavailable.push("social attribution events: unavailable");
  if (baselineState.unavailable) unavailable.push("social baselines: unavailable");
  if (experimentsState.unavailable) unavailable.push("social experiments: unavailable");
  if (boostState.unavailable) unavailable.push("social boost proposals: unavailable");
  return {
    observations, attributionEvents, baselines: baselineState.accepted, experiments: experimentsState.accepted, boostProposals: boostState.accepted, profiles, campaigns,
    summary: { observations: observations.length, measuredPosts: latest.filter(({ unavailableReason }) => unavailableReason === null).length, unavailablePosts: latest.filter(({ unavailableReason }) => unavailableReason !== null).length, attributedEvents: attributionEvents.filter(({ attribution }) => attribution.state === "attributed").length, unattributedEvents: attributionEvents.filter(({ attribution }) => attribution.state !== "attributed").length, activeExperiments: experimentsState.accepted.filter(({ status }) => status === "active" || status === "review").length, actualCostUsd: sum(costs) },
    dropped: { observations: observationsState.dropped, attribution: attributionState.dropped, baselines: baselineState.dropped, experiments: experimentsState.dropped, boostProposals: boostState.dropped, orphanRecords },
    unavailable, audienceIdentityExposed: false, privateMessagesExposed: false, authorityGranted: false, spendAuthorized: false
  };
}
