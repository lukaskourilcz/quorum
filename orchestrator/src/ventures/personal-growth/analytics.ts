import {
  PersonalGrowthBaselineSchema,
  PersonalGrowthExperimentRegisterSchema,
  PersonalGrowthExperimentSchema,
  PersonalGrowthFeedbackSchema,
  type PersonalGrowthBaseline,
  type PersonalGrowthExperiment,
  type PersonalGrowthExperimentRegister
} from "../../contracts/personal-growth-analysis.js";
import { PersonalGrowthInstagramRecommendationSchema, PersonalGrowthThreadsPacketSchema } from "../../contracts/personal-growth-recommendations.js";
import { PersonalGrowthResultSchema, type PersonalGrowthMetricName, type PersonalGrowthResult } from "../../contracts/personal-growth-results.js";
import { PersonalGrowthDailyBriefSchema, PersonalGrowthHistoryEventSchema } from "../../contracts/personal-growth.js";
import { addPersonalGrowthDays } from "./planner.js";
import { atomicWriteJson, readJson } from "../../state.js";

const DAY_MS = 86_400_000;
export const PERSONAL_GROWTH_EXPERIMENTS_PATH = "ventures/personal-growth/experiments.json";

export async function readPersonalGrowthExperimentRegister(root: string): Promise<PersonalGrowthExperimentRegister> {
  return PersonalGrowthExperimentRegisterSchema.parse(await readJson<unknown>(root, PERSONAL_GROWTH_EXPERIMENTS_PATH, null));
}

export async function writePersonalGrowthExperimentRegister(input: {
  root: string;
  previous: PersonalGrowthExperimentRegister;
  next: PersonalGrowthExperimentRegister;
}): Promise<void> {
  await atomicWriteJson(input.root, PERSONAL_GROWTH_EXPERIMENTS_PATH,
    assertPersonalGrowthExperimentRegisterUpdate(input.previous, input.next));
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Number(((sorted[middle - 1]! + sorted[middle]!) / 2).toFixed(8))
    : sorted[middle]!;
}

function originClass(result: PersonalGrowthResult): "ordinary-personal" | "goviral-assisted" | "owner-manual-venture-reference" {
  if (result.contentOrigin === "goviral-assisted") return "goviral-assisted";
  if (result.contentOrigin === "owner-manual-venture-reference") return "owner-manual-venture-reference";
  return "ordinary-personal";
}

function latestMetrics(result: PersonalGrowthResult): Map<PersonalGrowthMetricName, { value: number | null; unavailable: boolean }> {
  const values = new Map<PersonalGrowthMetricName, { value: number | null; unavailable: boolean }>();
  for (const observation of [...result.observations].sort((left, right) => left.observedAt.localeCompare(right.observedAt))) {
    for (const metric of observation.metrics) values.set(metric.name, { value: metric.value, unavailable: metric.value === null });
  }
  const derived = (name: PersonalGrowthMetricName, numerators: readonly PersonalGrowthMetricName[], denominator: PersonalGrowthMetricName, scale: number) => {
    const parts = numerators.map((metric) => values.get(metric));
    const divisor = values.get(denominator);
    if (!divisor && parts.every((part) => !part)) return;
    const usable = divisor?.value !== null && divisor?.value !== undefined && divisor.value > 0
      && parts.every((part) => part?.value !== null && part?.value !== undefined);
    values.set(name, usable
      ? { value: Number(((parts.reduce((sum, part) => sum + part!.value!, 0) / divisor.value!) * scale).toFixed(8)), unavailable: false }
      : { value: null, unavailable: true });
  };
  derived("non_follower_reach_ratio", ["non_follower_reach"], "reach", 1);
  derived("profile_view_to_follow_rate", ["follows"], "profile_views", 1);
  derived("saves_per_1000_reach", ["saves"], "reach", 1000);
  derived("shares_per_1000_reach", ["shares"], "reach", 1000);
  derived("early_exit_rate", ["early_exit_count"], "views", 1);
  derived("replies_per_1000_views", ["replies"], "views", 1000);
  derived("reposts_quotes_per_1000_views", ["reposts", "quotes"], "views", 1000);
  return values;
}

export function buildPersonalGrowthBaseline(input: {
  startsOn: string;
  evaluatedAt: Date;
  results: readonly unknown[];
}): PersonalGrowthBaseline {
  const endsOn = addPersonalGrowthDays(input.startsOn, 27);
  const evaluatedDate = input.evaluatedAt.toISOString().slice(0, 10);
  const parses = input.results.map((result) => PersonalGrowthResultSchema.safeParse(result));
  const results = parses.flatMap((parsed) => parsed.success ? [parsed.data] : [])
    .filter((result) => result.publishedAt.slice(0, 10) >= input.startsOn && result.publishedAt.slice(0, 10) <= endsOn);
  const grouped = new Map<string, PersonalGrowthResult[]>();
  for (const result of results) {
    const key = JSON.stringify([result.platform, result.format, result.personalPillar, originClass(result)]);
    grouped.set(key, [...(grouped.get(key) ?? []), result]);
  }
  const segments = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => {
    const [platform, format, pillar, origin] = JSON.parse(key) as [PersonalGrowthResult["platform"], string, PersonalGrowthResult["personalPillar"], ReturnType<typeof originClass>];
    const byResult = group.map(latestMetrics);
    const metricNames = [...new Set(byResult.flatMap((metrics) => [...metrics.keys()]))].sort();
    return {
      platform,
      format,
      pillar,
      originClass: origin,
      resultCount: group.length,
      metrics: metricNames.map((metric) => {
        const entries = byResult.flatMap((metrics) => metrics.has(metric) ? [metrics.get(metric)!] : []);
        const values = entries.flatMap((entry) => entry.value === null ? [] : [entry.value]);
        return {
          metric,
          median: median(values),
          sampleSize: values.length,
          unavailableCount: entries.filter(({ unavailable }) => unavailable).length
        };
      })
    };
  });
  const elapsedDays = Math.max(0, Math.min(28, Math.floor(
    (Date.parse(`${evaluatedDate}T00:00:00.000Z`) - Date.parse(`${input.startsOn}T00:00:00.000Z`)) / DAY_MS
  ) + 1));
  const proposalDue = evaluatedDate >= endsOn;
  return PersonalGrowthBaselineSchema.parse({
    schemaVersion: "personal-growth-baseline/1",
    ventureId: "personal-growth",
    startsOn: input.startsOn,
    endsOn,
    evaluatedAt: input.evaluatedAt.toISOString(),
    elapsedDays,
    status: proposalDue ? "proposal-due" : "collecting",
    acceptedResultCount: results.length,
    droppedResultCount: parses.filter((parsed) => !parsed.success).length,
    segments,
    targetProposal: {
      required: proposalDue,
      ownerDecisionRequired: true,
      activatedTargets: 0,
      evidenceRefs: proposalDue ? results.slice(0, 20).map(({ resultId }) => `${resultId}`) : []
    }
  });
}

export function evaluatePersonalGrowthExperiment(input: {
  experiment: PersonalGrowthExperiment;
  results: readonly unknown[];
  proposedVerdict: Exclude<PersonalGrowthExperiment["verdict"], "INSUFFICIENT_DATA">;
}): PersonalGrowthExperiment {
  const experiment = PersonalGrowthExperimentSchema.parse(input.experiment);
  const eligibleIds = new Set(input.results.flatMap((value) => {
    const parsed = PersonalGrowthResultSchema.safeParse(value);
    if (!parsed.success || parsed.data.experimentId !== experiment.id) return [];
    const measured = [...latestMetrics(parsed.data).entries()].some(([name, metric]) => name === experiment.primaryMetric && metric.value !== null);
    return measured ? [parsed.data.resultId] : [];
  }));
  return PersonalGrowthExperimentSchema.parse({
    ...experiment,
    evidenceResultIds: [...eligibleIds].sort(),
    verdict: eligibleIds.size < experiment.minimumSample ? "INSUFFICIENT_DATA" : input.proposedVerdict
  });
}

const IMMUTABLE_EXPERIMENT_FIELDS = [
  "hypothesis", "changedVariable", "platform", "format", "primaryMetric", "secondaryGuardrail",
  "startDate", "minimumSample", "evaluationWindowDays", "stopCondition", "maxCostUsd", "publishingAuthorized"
] as const satisfies readonly (keyof PersonalGrowthExperiment)[];

export function assertPersonalGrowthExperimentRegisterUpdate(
  previous: PersonalGrowthExperimentRegister,
  next: PersonalGrowthExperimentRegister
): PersonalGrowthExperimentRegister {
  const before = PersonalGrowthExperimentRegisterSchema.parse(previous);
  const after = PersonalGrowthExperimentRegisterSchema.parse(next);
  const priorById = new Map(before.experiments.map((experiment) => [experiment.id, experiment]));
  for (const experiment of after.experiments) {
    const prior = priorById.get(experiment.id);
    if (!prior || (prior.status !== "active" && prior.status !== "review")) continue;
    for (const field of IMMUTABLE_EXPERIMENT_FIELDS) {
      if (JSON.stringify(prior[field]) !== JSON.stringify(experiment[field])) {
        throw new Error(`Started Personal Growth experiment field is immutable: ${field}`);
      }
    }
    if (!experiment.evidenceResultIds.slice(0, prior.evidenceResultIds.length)
      .every((value, index) => value === prior.evidenceResultIds[index])) {
      throw new Error("Personal Growth experiment evidence is append-only");
    }
  }
  return after;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Number((numerator / denominator).toFixed(8));
}

export function collectPersonalGrowthOperationalMeasurements(input: {
  briefs: readonly unknown[];
  threadsPackets: readonly unknown[];
  instagramRecommendations: readonly unknown[];
  results: readonly unknown[];
  historyEvents: readonly unknown[];
}): Record<string, number | null> {
  const briefs = input.briefs.map((value) => PersonalGrowthDailyBriefSchema.safeParse(value));
  const validBriefs = briefs.flatMap((parsed) => parsed.success ? [parsed.data] : []);
  const threads = input.threadsPackets.map((value) => PersonalGrowthThreadsPacketSchema.safeParse(value));
  const validThreads = threads.flatMap((parsed) => parsed.success ? [parsed.data] : []);
  const instagram = input.instagramRecommendations.map((value) => PersonalGrowthInstagramRecommendationSchema.safeParse(value));
  const validInstagram = instagram.flatMap((parsed) => parsed.success ? [parsed.data] : []);
  const invalidManualVentureRecommendations = input.instagramRecommendations.filter((value, index) => {
    if (instagram[index]?.success || !value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return record.actionType === "owner-manual-venture-reshare" || "manualVentureReferenceId" in record;
  }).length;
  const results = input.results.map((value) => PersonalGrowthResultSchema.safeParse(value));
  const validResults = results.flatMap((parsed) => parsed.success ? [parsed.data] : []);
  const history = input.historyEvents.map((value) => PersonalGrowthHistoryEventSchema.safeParse(value));
  const validHistory = history.flatMap((parsed) => parsed.success ? [parsed.data] : []);
  const recommendations = validThreads.filter(({ decision }) => decision === "RECOMMEND");
  const instagramActions = validInstagram.filter(({ actionType }) => actionType !== "no-post");
  const provenanceTotal = recommendations.length + instagramActions.length;
  const provenanceComplete = recommendations.filter(({ primary }) => (primary?.provenanceRefs.length ?? 0) > 0).length
    + instagramActions.filter(({ ownerSourceRefs }) => ownerSourceRefs.length > 0).length;
  const unavailableMetrics = validResults.flatMap(({ observations }) => observations)
    .flatMap(({ metrics }) => metrics).filter(({ value }) => value === null);
  const honestUnavailable = unavailableMetrics.filter(({ unavailableReason }) => unavailableReason !== null).length;
  const isolationMarkers = ["kvorum", "portfolio-item", "social-distribution", "campaign-"];
  const isolatedSerialized = JSON.stringify([...validThreads, ...validInstagram, ...validResults]).toLowerCase();
  const isolationViolations = ["kvorum", "portfolio-item", "social-distribution", "campaign-"]
    .reduce((count, marker) => count + (isolatedSerialized.includes(marker) ? 1 : 0), 0)
    + input.results.filter((value, index) => !results[index]?.success
      && isolationMarkers.some((marker) => JSON.stringify(value).toLowerCase().includes(marker))).length;
  return {
    "state/ventures/personal-growth/briefs#valid_result_rate": ratio(
      validBriefs.filter(({ room }) => ["planned", "quiet", "not-needed", "held"].includes(room.result)).length,
      briefs.length
    ),
    "state/ventures/personal-growth/briefs#availability_rate": ratio(validBriefs.length, briefs.length),
    "state/ventures/personal-growth/history#deadline_reliability_rate": ratio(
      validHistory.filter(({ action }) => action === "completed" || action === "rescheduled").length,
      validHistory.length
    ),
    "state/ventures/personal-growth/recommendations#provenance_completeness_rate": ratio(provenanceComplete, provenanceTotal),
    "state/ventures/personal-growth/recommendations#policy_violation_count": instagram.filter((parsed) => !parsed.success).length,
    "state/ventures/personal-growth/recommendations#manual_venture_policy_violation_count": invalidManualVentureRecommendations,
    "state/ventures/personal-growth/results#isolation_violation_count": isolationViolations,
    "state/ventures/personal-growth/recommendations#manuscript_leak_count": recommendations.filter(({ primary }) => primary?.leakAudit.status !== "pass").length,
    "state/ventures/personal-growth/results#unavailable_honesty_rate": unavailableMetrics.length === 0 && results.every((parsed) => parsed.success)
      ? (validResults.length > 0 ? 1 : null)
      : ratio(honestUnavailable, unavailableMetrics.length + results.filter((parsed) => !parsed.success).length),
    "state/ventures/personal-growth/history#owner_action_completion_rate": ratio(
      validHistory.filter(({ action }) => action === "completed").length,
      validHistory.length
    ),
    "state/ventures/personal-growth/history#missed_deadline_rate": ratio(
      validHistory.filter(({ action }) => action === "skipped").length,
      validHistory.length
    )
  };
}

export function buildPersonalGrowthFeedback(resultsInput: readonly unknown[], evaluatedAt: Date) {
  const results = resultsInput.flatMap((value) => {
    const parsed = PersonalGrowthResultSchema.safeParse(value);
    return parsed.success && parsed.data.ownerRating !== null ? [parsed.data] : [];
  });
  if (results.length === 0) return null;
  const pillarGroups = new Map<string, PersonalGrowthResult[]>();
  for (const result of results) pillarGroups.set(result.personalPillar, [...(pillarGroups.get(result.personalPillar) ?? []), result]);
  return PersonalGrowthFeedbackSchema.parse({
    schemaVersion: "personal-growth-feedback/1",
    evaluatedAt: evaluatedAt.toISOString(),
    sourceResultIds: results.map(({ resultId }) => resultId),
    pillarWeights: [...pillarGroups.entries()].map(([pillar, values]) => ({
      pillar,
      prior: 0.5,
      proposed: Number((values.reduce((sum, value) => sum + value.ownerRating!, 0) / (values.length * 5)).toFixed(4)),
      sampleSize: values.length
    })),
    formatPriors: {},
    goviralUtility: null,
    reelSeriesUtility: {},
    manualVentureReferenceUseful: null,
    mutatesEvidence: false,
    weakensPolicy: false,
    externalDestinations: []
  });
}
