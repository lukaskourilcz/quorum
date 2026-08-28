import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  SOCIAL_LEARNING_FROZEN_GATES,
  SocialLearningEvaluationSchema,
  SocialStrategyAdjustmentSchema,
  socialLearningEvaluationHash,
  socialStrategyAdjustmentHash,
  type SocialLearningEvaluation,
  type SocialStrategyAdjustment
} from "../contracts/social-learning.js";
import { SocialProfileOperationSchema } from "../contracts/social-operations.js";
import { SocialProfileStrategySchema, type SocialProfileStrategy } from "../contracts/social-inventory.js";
import { SocialDistributionExperimentSchema, SocialMetricObservationSchema, type SocialMetricObservation } from "../contracts/social-results.js";
import { configRoot } from "../paths.js";

export const SocialLearningPolicySchema = z.strictObject({
  schemaVersion: z.literal("social-learning-policy/1"), version: z.string().regex(/^\d+\.\d+\.\d+$/u), minimumMeasuredPosts: z.number().int().min(2).max(1_000), minimumAdjustmentEvidence: z.number().int().min(3).max(100), outlierMinimumPeers: z.number().int().min(4).max(100), maximumActiveExperiments: z.literal(2), maximumRankShift: z.literal(1), primaryReviewDays: z.literal(28), amplifierReviewDays: z.number().int().min(60).max(90), maximumOwnerAttentionPerWindow: z.number().int().nonnegative().max(100), minimumPublishReliability: z.number().min(0).max(1), hardGatesFrozen: z.array(z.enum(SOCIAL_LEARNING_FROZEN_GATES)).length(12), ownerDecisionRef: z.string().trim().min(1).max(160)
});
export type SocialLearningPolicy = z.infer<typeof SocialLearningPolicySchema>;

export async function loadSocialLearningPolicy(filePath = path.join(configRoot, "social-learning-policy.json")): Promise<SocialLearningPolicy> {
  return SocialLearningPolicySchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}

function median(values: readonly number[]): number | null { if (!values.length) return null; const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2; }
function metric(observation: SocialMetricObservation, name: string): number | null { return observation.metrics.find((entry) => entry.name === name)?.value ?? null; }
function observationRef(observation: SocialMetricObservation): string { return `state/social/results/observations/${observation.id}.json`; }
function operationRef(id: string): string { return `state/social/profile-operations/${id}.json`; }
function weekStart(date: string): string { const at = new Date(`${date}T00:00:00.000Z`); const day = at.getUTCDay(); at.setUTCDate(at.getUTCDate() - (day === 0 ? 6 : day - 1)); return at.toISOString().slice(0, 10); }
function nextPatch(version: string): string { const [major, minor, patch] = version.split(".").map(Number); return `${major}.${minor}.${patch! + 1}`; }

function latest28dByPost(values: readonly unknown[], profileId: string): SocialMetricObservation[] {
  const byPost = new Map<string, SocialMetricObservation>();
  for (const value of values) {
    const parsed = SocialMetricObservationSchema.safeParse(value); if (!parsed.success || parsed.data.profileId !== profileId || parsed.data.maturityWindow !== "28d") continue;
    const current = byPost.get(parsed.data.nativePostId); if (!current || parsed.data.observedAt > current.observedAt) byPost.set(parsed.data.nativePostId, parsed.data);
  }
  return [...byPost.values()].sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.id.localeCompare(right.id));
}

function outliers(observations: readonly SocialMetricObservation[], minimumPeers: number): string[] {
  if (observations.length < minimumPeers) return [];
  const measured = observations.flatMap((observation) => { const value = metric(observation, "qualified_actions") ?? metric(observation, "reach"); return value === null ? [] : [{ observation, value }]; });
  const center = median(measured.map(({ value }) => value)); if (center === null) return [];
  return measured.filter(({ value }) => value > Math.max(1, center) * 4).map(({ observation }) => observationRef(observation));
}

function proposedFormatChange(input: { observations: readonly SocialMetricObservation[]; strategy: SocialProfileStrategy; policy: SocialLearningPolicy; evaluatedAt: Date }): SocialStrategyAdjustment | null {
  const scored = input.strategy.recurringFormats.map((format, rank) => {
    const observations = input.observations.filter((entry) => entry.format === format.id || entry.format === (format.assetRequirement === "none" ? "text" : "carousel"));
    return { format, rank, observations, score: median(observations.flatMap((entry) => { const value = metric(entry, "qualified_actions") ?? metric(entry, "referral_visits"); return value === null ? [] : [value]; })) };
  }).filter(({ observations, score }) => observations.length >= input.policy.minimumAdjustmentEvidence && score !== null);
  const winner = [...scored].sort((left, right) => right.score! - left.score! || left.rank - right.rank)[0];
  if (!winner || winner.rank === 0) return null;
  const previous = scored.find(({ rank }) => rank === winner.rank - 1); if (!previous || winner.score! <= Math.max(1, previous.score!) * 1.25) return null;
  const evaluatedWeek = weekStart(input.evaluatedAt.toISOString().slice(0, 10));
  const base = {
    schemaVersion: "social-strategy-adjustment/1" as const, id: "social-strategy-adjustment-" + "0".repeat(20), adjustmentHash: "0".repeat(64), profileId: input.strategy.profileId, strategyId: input.strategy.id, baseVersion: input.strategy.version, nextVersion: nextPatch(input.strategy.version), status: "proposed" as const,
    change: { kind: "format-priority" as const, targetRef: winner.format.id, beforeRank: winner.rank, afterRank: winner.rank - 1, delta: -1 as const }, evidenceEvaluationRef: `state/social/learning/evaluations/${input.strategy.profileId}/${evaluatedWeek}.json`, evidenceObservationRefs: winner.observations.slice(0, 100).map(observationRef), explanation: `The robust median for ${winner.format.id} is at least 25% above the adjacent format; move one rank only.`, hardGatesFrozen: [...SOCIAL_LEARNING_FROZEN_GATES], createsSourceOrTarget: false as const, createsCapabilityOrScope: false as const, ownerDecisionRef: null, appliedStrategyRef: null, createdAt: input.evaluatedAt.toISOString(), updatedAt: input.evaluatedAt.toISOString(), authorityGranted: false as const, publishingAuthorized: false as const
  };
  const adjustmentHash = socialStrategyAdjustmentHash(base);
  return SocialStrategyAdjustmentSchema.parse({ ...base, id: `social-strategy-adjustment-${adjustmentHash.slice(0, 20)}`, adjustmentHash });
}

export function evaluateSocialProfileLearning(input: { profileId: string; targetRole: "primary" | "umbrella" | "amplifier"; strategy: unknown; observations: readonly unknown[]; operations: readonly unknown[]; experiments: readonly unknown[]; policy: unknown; evaluatedAt: Date }): { evaluation: SocialLearningEvaluation; adjustment: SocialStrategyAdjustment | null } {
  const policy = SocialLearningPolicySchema.parse(input.policy); const strategy = SocialProfileStrategySchema.parse(input.strategy); if (strategy.profileId !== input.profileId) throw new Error("Learning strategy does not match profile");
  const experiments = input.experiments.flatMap((value) => { const parsed = SocialDistributionExperimentSchema.safeParse(value); return parsed.success && parsed.data.scopeProfileIds.includes(input.profileId) && ["active", "review"].includes(parsed.data.status) ? [parsed.data] : []; });
  if (experiments.length > policy.maximumActiveExperiments) throw new Error("At most two Social Distribution experiments may be active or under review");
  const observations = latest28dByPost(input.observations, input.profileId); const operations = input.operations.flatMap((value) => { const parsed = SocialProfileOperationSchema.safeParse(value); return parsed.success && parsed.data.profileId === input.profileId ? [parsed.data] : []; }).sort((left, right) => left.targetDate.localeCompare(right.targetDate));
  const ignored = new Set(outliers(observations, policy.outlierMinimumPeers)); const robust = observations.filter((entry) => !ignored.has(observationRef(entry))); const adjustment = observations.length >= policy.minimumMeasuredPosts ? proposedFormatChange({ observations: robust, strategy, policy, evaluatedAt: input.evaluatedAt }) : null;
  const originalPosts = observations.filter(({ policyState }) => policyState.originalSupportClassification === "original").length; const supportPosts = observations.length - originalPosts; const verified = robust.flatMap((entry) => { const value = metric(entry, "verified_publish"); return value === null ? [] : [value]; });
  const costs = observations.flatMap(({ actualCostUsd }) => actualCostUsd === null ? [] : [actualCostUsd]); const evaluatedWeek = weekStart(input.evaluatedAt.toISOString().slice(0, 10)); const proposedAdjustmentRef = adjustment ? `state/social/learning/adjustments/${input.profileId}/${evaluatedWeek}.json` : null;
  const base = {
    schemaVersion: "social-learning-evaluation/1" as const, id: "social-learning-evaluation-" + "0".repeat(20), evaluationHash: "0".repeat(64), profileId: input.profileId, targetRole: input.targetRole, strategyId: strategy.id, strategyVersion: strategy.version, evaluatedWeek, evaluatedAt: input.evaluatedAt.toISOString(), observationRefs: observations.map(observationRef), operationRefs: operations.map(({ id }) => operationRef(id)), experimentRefs: experiments.map(({ id }) => `state/social/results/experiments.json#${id}`),
    sample: { distinctPosts: observations.length, measured28dPosts: observations.filter(({ unavailableReason }) => unavailableReason === null).length, unavailablePosts: observations.filter(({ unavailableReason }) => unavailableReason !== null).length, operationDays: new Set(operations.map(({ targetDate }) => targetDate).values()).size, queued: operations.filter(({ outcome }) => outcome === "queued").length, noPost: operations.filter(({ outcome }) => outcome === "NO_POST").length, heldOrFailed: operations.filter(({ outcome, providerConnectionState }) => ["held", "paused"].includes(outcome) || ["failed", "ambiguous"].includes(providerConnectionState)).length, originalPosts, supportPosts, actualCostUsd: costs.length ? costs.reduce((total, value) => total + value, 0) : null, ownerAttentionCount: new Set(operations.flatMap(({ ownerAttentionRefs }) => ownerAttentionRefs)).size },
    robustMetrics: { publishReliability: verified.length ? verified.reduce((total, value) => total + value, 0) / verified.length : null, qualifiedActionsMedian: median(robust.flatMap((entry) => { const value = metric(entry, "qualified_actions"); return value === null ? [] : [value]; })), referralVisitsMedian: median(robust.flatMap((entry) => { const value = metric(entry, "referral_visits"); return value === null ? [] : [value]; })), reachMedian: median(robust.flatMap((entry) => { const value = metric(entry, "reach"); return value === null ? [] : [value]; })), originalRatio: observations.length ? originalPosts / observations.length : null, supportRatio: observations.length ? supportPosts / observations.length : null },
    outlierObservationRefs: [...ignored].sort(), minimumSample: policy.minimumMeasuredPosts, conclusion: observations.length < policy.minimumMeasuredPosts ? "INSUFFICIENT_DATA" as const : adjustment ? "PROPOSE_BOUNDED_CHANGE" as const : "STABLE" as const, signals: observations.length < policy.minimumMeasuredPosts ? [`${observations.length}/${policy.minimumMeasuredPosts} distinct 28-day post observations are available.`] : [`${observations.length} distinct 28-day post observations evaluated with robust medians.`, `${ignored.size} extreme observation(s) ignored for strategy change.`], proposedAdjustmentRef, hardGatesFrozen: [...SOCIAL_LEARNING_FROZEN_GATES], authorityGranted: false as const, publishingAuthorized: false as const
  };
  const evaluationHash = socialLearningEvaluationHash(base); const evaluation = SocialLearningEvaluationSchema.parse({ ...base, id: `social-learning-evaluation-${evaluationHash.slice(0, 20)}`, evaluationHash });
  return { evaluation, adjustment };
}

export function applyBoundedSocialStrategyAdjustment(input: { strategy: unknown; adjustment: unknown; appliedAt: Date }): { strategy: SocialProfileStrategy; adjustment: SocialStrategyAdjustment } {
  const strategy = SocialProfileStrategySchema.parse(input.strategy); const adjustment = SocialStrategyAdjustmentSchema.parse(input.adjustment);
  if (adjustment.status !== "owner-approved" || !adjustment.ownerDecisionRef || adjustment.profileId !== strategy.profileId || adjustment.strategyId !== strategy.id || adjustment.baseVersion !== strategy.version || adjustment.nextVersion !== nextPatch(strategy.version)) throw new Error("Adjustment lacks exact owner approval or current base strategy");
  if (adjustment.change.kind !== "format-priority" && adjustment.change.kind !== "preferred-window") throw new Error("This strategy shape supports only bounded format or preferred-window reordering");
  const recurringFormats = [...strategy.recurringFormats]; const preferredWindows = [...strategy.cadence.preferredWindows];
  const index = adjustment.change.kind === "format-priority" ? recurringFormats.findIndex(({ id }) => id === adjustment.change.targetRef) : preferredWindows.findIndex((window) => window === adjustment.change.targetRef);
  const length = adjustment.change.kind === "format-priority" ? recurringFormats.length : preferredWindows.length;
  if (index !== adjustment.change.beforeRank || Math.abs(adjustment.change.delta) > 1 || adjustment.change.afterRank < 0 || adjustment.change.afterRank >= length) throw new Error("Adjustment target or rank is stale or exceeds the one-rank bound");
  if (adjustment.change.kind === "format-priority") { const [moved] = recurringFormats.splice(index, 1); recurringFormats.splice(adjustment.change.afterRank, 0, moved!); }
  else { const [moved] = preferredWindows.splice(index, 1); preferredWindows.splice(adjustment.change.afterRank, 0, moved!); }
  const next = SocialProfileStrategySchema.parse({ ...strategy, version: adjustment.nextVersion, recurringFormats, cadence: { ...strategy.cadence, preferredWindows } });
  const appliedStrategyRef = `state/social/learning/strategy-versions/${strategy.profileId}/${next.version}.json`; const updated = { ...adjustment, status: "applied" as const, appliedStrategyRef, updatedAt: input.appliedAt.toISOString() }; const adjustmentHash = socialStrategyAdjustmentHash(updated);
  return { strategy: next, adjustment: SocialStrategyAdjustmentSchema.parse({ ...updated, adjustmentHash, id: `social-strategy-adjustment-${adjustmentHash.slice(0, 20)}` }) };
}
