import { rawRecord } from "./model";

export type LearningConclusion = "INSUFFICIENT_DATA" | "STABLE" | "PROPOSE_BOUNDED_CHANGE";
export type ContinuationVerdict = "CONTINUE" | "NARROW" | "PAUSE" | "RETIRE" | "INSUFFICIENT_DATA";

export interface AdminSocialLearningEvaluation {
  id: string; profileId: string; targetRole: "primary" | "umbrella" | "amplifier"; strategyId: string; strategyVersion: string; evaluatedWeek: string; evaluatedAt: string;
  sample: { distinctPosts: number; measured28dPosts: number; qualifiedOutcomePosts: number; unavailablePosts: number; operationDays: number; queued: number; noPost: number; heldOrFailed: number; originalPosts: number; supportPosts: number; actualCostUsd: number | null; ownerAttentionCount: number };
  robustMetrics: { publishReliability: number | null; qualifiedActionsMedian: number | null; referralVisitsMedian: number | null; reachMedian: number | null; originalRatio: number | null; supportRatio: number | null };
  outlierCount: number; minimumSample: number; conclusion: LearningConclusion; signals: string[]; proposedAdjustmentRef: string | null; hardGatesFrozen: string[];
}

export interface AdminSocialStrategyAdjustment {
  id: string; profileId: string; baseVersion: string; nextVersion: string; status: "proposed" | "owner-approved" | "applied" | "vetoed" | "corrected";
  change: { kind: string; targetRef: string; beforeRank: number; afterRank: number; delta: number }; explanation: string; evidenceCount: number; ownerDecisionRef: string | null; appliedStrategyRef: string | null; updatedAt: string;
}

export interface AdminSocialContinuationProposal {
  id: string; profileId: string; targetRole: "primary" | "umbrella" | "amplifier"; validationDays: number; evaluatedAt: string; verdict: ContinuationVerdict;
  evidence: { independentAudienceReason: string; originalConsistency: string; ratioPolicy: string; publishReliability: number | null; qualifiedOutcomeSample: number; supportBaselineComparable: boolean; policyIncidents: number; actualCostUsd: number | null; ownerAttentionCount: number; separateProfileJustified: string };
  reasons: string[]; queueAction: "none" | "request-pause"; ownerDecisionRequired: true; externalAccountAction: "none";
}

export interface AdminSocialLearningCheckpoint {
  profileId: string; evaluatedWeek: string; currentEvaluationRef: string; evaluationRefs: string[]; adjustmentEventRefs: string[]; continuationRefs: string[]; strategyVersionRefs: string[]; correctionCount: number; generatedAt: string;
}

const idPattern = /^social-(?:learning-evaluation|strategy-adjustment|continuation-proposal)-[a-f0-9]{20}$/u;
const profilePattern = /^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const finiteNullable = (value: unknown): number | null | undefined => value === null ? null : typeof value === "number" && Number.isFinite(value) ? value : undefined;
const integer = (value: unknown): number | null => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const strings = (value: unknown, max: number): string[] | null => Array.isArray(value) && value.length <= max && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 500) ? value as string[] : null;
const dateTime = (value: unknown): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function parseAdminSocialLearningEvaluation(value: unknown): AdminSocialLearningEvaluation | null {
  const item = rawRecord(value); const sample = rawRecord(item?.sample); const metrics = rawRecord(item?.robustMetrics);
  const conclusion = ["INSUFFICIENT_DATA", "STABLE", "PROPOSE_BOUNDED_CHANGE"].includes(String(item?.conclusion)) ? item?.conclusion as LearningConclusion : null;
  const role = ["primary", "umbrella", "amplifier"].includes(String(item?.targetRole)) ? item?.targetRole as AdminSocialLearningEvaluation["targetRole"] : null;
  const signals = strings(item?.signals, 30); const hardGatesFrozen = strings(item?.hardGatesFrozen, 12); const outliers = strings(item?.outlierObservationRefs, 100);
  const counts = ["distinctPosts", "measured28dPosts", "qualifiedOutcomePosts", "unavailablePosts", "operationDays", "queued", "noPost", "heldOrFailed", "originalPosts", "supportPosts", "ownerAttentionCount"] as const;
  const countValues = Object.fromEntries(counts.map((key) => [key, integer(sample?.[key])])) as Record<(typeof counts)[number], number | null>;
  const metricKeys = ["publishReliability", "qualifiedActionsMedian", "referralVisitsMedian", "reachMedian", "originalRatio", "supportRatio"] as const;
  const metricValues = Object.fromEntries(metricKeys.map((key) => [key, finiteNullable(metrics?.[key])])) as Record<(typeof metricKeys)[number], number | null | undefined>;
  if (item?.schemaVersion !== "social-learning-evaluation/1" || typeof item.id !== "string" || !idPattern.test(item.id) || typeof item.profileId !== "string" || !profilePattern.test(item.profileId) || !role || !conclusion || !dateTime(item.evaluatedAt) || typeof item.evaluatedWeek !== "string" || typeof item.strategyId !== "string" || typeof item.strategyVersion !== "string" || !signals || !hardGatesFrozen || hardGatesFrozen.length !== 12 || !outliers || counts.some((key) => countValues[key] === null) || metricKeys.some((key) => metricValues[key] === undefined) || integer(item.minimumSample) === null || finiteNullable(sample?.actualCostUsd) === undefined || !(item.proposedAdjustmentRef === null || typeof item.proposedAdjustmentRef === "string") || item.authorityGranted !== false || item.publishingAuthorized !== false) return null;
  return { id: item.id, profileId: item.profileId, targetRole: role, strategyId: item.strategyId, strategyVersion: item.strategyVersion, evaluatedWeek: item.evaluatedWeek, evaluatedAt: item.evaluatedAt, sample: { ...countValues, actualCostUsd: finiteNullable(sample?.actualCostUsd)! } as AdminSocialLearningEvaluation["sample"], robustMetrics: metricValues as AdminSocialLearningEvaluation["robustMetrics"], outlierCount: outliers.length, minimumSample: item.minimumSample as number, conclusion, signals, proposedAdjustmentRef: item.proposedAdjustmentRef as string | null, hardGatesFrozen };
}

export function parseAdminSocialStrategyAdjustment(value: unknown): AdminSocialStrategyAdjustment | null {
  const item = rawRecord(value); const change = rawRecord(item?.change); const status = ["proposed", "owner-approved", "applied", "vetoed", "corrected"].includes(String(item?.status)) ? item?.status as AdminSocialStrategyAdjustment["status"] : null;
  const evidence = strings(item?.evidenceObservationRefs, 100); const ownerDecisionRef = item?.ownerDecisionRef === null ? null : typeof item?.ownerDecisionRef === "string" ? item.ownerDecisionRef : undefined; const appliedStrategyRef = item?.appliedStrategyRef === null ? null : typeof item?.appliedStrategyRef === "string" ? item.appliedStrategyRef : undefined;
  if (item?.schemaVersion !== "social-strategy-adjustment/1" || typeof item.id !== "string" || !idPattern.test(item.id) || typeof item.profileId !== "string" || !profilePattern.test(item.profileId) || !status || typeof item.baseVersion !== "string" || typeof item.nextVersion !== "string" || !change || typeof change.kind !== "string" || typeof change.targetRef !== "string" || integer(change.beforeRank) === null || integer(change.afterRank) === null || typeof change.delta !== "number" || Math.abs(change.delta) !== 1 || typeof item.explanation !== "string" || !evidence || ownerDecisionRef === undefined || appliedStrategyRef === undefined || !dateTime(item.updatedAt) || item.authorityGranted !== false || item.publishingAuthorized !== false) return null;
  return { id: item.id, profileId: item.profileId, baseVersion: item.baseVersion, nextVersion: item.nextVersion, status, change: { kind: change.kind, targetRef: change.targetRef, beforeRank: change.beforeRank as number, afterRank: change.afterRank as number, delta: change.delta }, explanation: item.explanation, evidenceCount: evidence.length, ownerDecisionRef, appliedStrategyRef, updatedAt: item.updatedAt };
}

export function parseAdminSocialContinuation(value: unknown): AdminSocialContinuationProposal | null {
  const item = rawRecord(value); const evidence = rawRecord(item?.evidence); const verdict = ["CONTINUE", "NARROW", "PAUSE", "RETIRE", "INSUFFICIENT_DATA"].includes(String(item?.verdict)) ? item?.verdict as ContinuationVerdict : null; const role = ["primary", "umbrella", "amplifier"].includes(String(item?.targetRole)) ? item?.targetRole as AdminSocialContinuationProposal["targetRole"] : null; const reasons = strings(item?.reasons, 30);
  const reliability = finiteNullable(evidence?.publishReliability); const cost = finiteNullable(evidence?.actualCostUsd); const qualified = integer(evidence?.qualifiedOutcomeSample); const incidents = integer(evidence?.policyIncidents); const attention = integer(evidence?.ownerAttentionCount);
  if (item?.schemaVersion !== "social-continuation-proposal/1" || typeof item.id !== "string" || !idPattern.test(item.id) || typeof item.profileId !== "string" || !profilePattern.test(item.profileId) || !role || !verdict || integer(item.validationDays) === null || !dateTime(item.evaluatedAt) || !evidence || reliability === undefined || cost === undefined || qualified === null || incidents === null || attention === null || typeof evidence.independentAudienceReason !== "string" || typeof evidence.originalConsistency !== "string" || typeof evidence.ratioPolicy !== "string" || typeof evidence.supportBaselineComparable !== "boolean" || typeof evidence.separateProfileJustified !== "string" || !reasons || !["none", "request-pause"].includes(String(item.queueAction)) || item.ownerDecisionRequired !== true || item.externalAccountAction !== "none" || item.accountDeleted !== false || item.accountRetiredAutomatically !== false || item.publishingAuthorized !== false) return null;
  return { id: item.id, profileId: item.profileId, targetRole: role, validationDays: item.validationDays as number, evaluatedAt: item.evaluatedAt, verdict, evidence: { independentAudienceReason: evidence.independentAudienceReason, originalConsistency: evidence.originalConsistency, ratioPolicy: evidence.ratioPolicy, publishReliability: reliability, qualifiedOutcomeSample: qualified, supportBaselineComparable: evidence.supportBaselineComparable, policyIncidents: incidents, actualCostUsd: cost, ownerAttentionCount: attention, separateProfileJustified: evidence.separateProfileJustified }, reasons, queueAction: item.queueAction as "none" | "request-pause", ownerDecisionRequired: true, externalAccountAction: "none" };
}

export function parseAdminSocialLearningCheckpoint(value: unknown): AdminSocialLearningCheckpoint | null {
  const item = rawRecord(value); const evaluationRefs = strings(item?.evaluationRefs, 100); const adjustmentEventRefs = strings(item?.adjustmentEventRefs, 100); const continuationRefs = strings(item?.continuationRefs, 100); const strategyVersionRefs = strings(item?.strategyVersionRefs, 100); const correctionCount = integer(item?.correctionCount);
  if (item?.schemaVersion !== "social-learning-checkpoint/1" || typeof item.profileId !== "string" || !profilePattern.test(item.profileId) || typeof item.evaluatedWeek !== "string" || typeof item.currentEvaluationRef !== "string" || !evaluationRefs?.includes(item.currentEvaluationRef) || !adjustmentEventRefs || !continuationRefs?.length || !strategyVersionRefs?.length || correctionCount === null || correctionCount !== evaluationRefs.length - 1 || !dateTime(item.generatedAt) || item.authorityGranted !== false || item.publishingAuthorized !== false) return null;
  return { profileId: item.profileId, evaluatedWeek: item.evaluatedWeek, currentEvaluationRef: item.currentEvaluationRef, evaluationRefs, adjustmentEventRefs, continuationRefs, strategyVersionRefs, correctionCount, generatedAt: item.generatedAt };
}
