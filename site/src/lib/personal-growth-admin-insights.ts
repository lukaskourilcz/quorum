import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export type PersonalGrowthArtifactState = "missing" | "present" | "unreadable";
export type PersonalGrowthPlatform = "instagram" | "threads";
export type PersonalGrowthExperimentStatus = "backlog" | "active" | "review" | "completed" | "stopped";
export type PersonalGrowthExperimentVerdict = "KEEP" | "ITERATE" | "STOP" | "INSUFFICIENT_DATA";
export type PersonalGrowthDegradation = "healthy" | "reduced" | "low" | "critical" | "exhausted";

export interface PersonalGrowthMetricView {
  name: string;
  value: number | null;
  unavailableReason: string | null;
  observedAt: string | null;
}

export interface PersonalGrowthResultView {
  resultId: string;
  platform: PersonalGrowthPlatform;
  nativePostId: string;
  url: string;
  publishedAt: string;
  format: string;
  language: "cs" | "en";
  personalPillar: string;
  contentOrigin: string;
  publicationRelation: "okraj" | "bbarak" | null;
  reelSeries: string | null;
  goviralAssisted: boolean;
  manualVentureReference: boolean;
  experimentId: string | null;
  provenance: "manual" | "api" | "manual-and-api";
  latestObservationAt: string | null;
  metrics: PersonalGrowthMetricView[];
  ownerRating: number | null;
  ownerNote: string | null;
  correctionCount: number;
}

export interface PersonalGrowthResultsWindow {
  days: 7 | 28 | 90;
  startsOn: string;
  endsOn: string;
  resultCount: number;
  manualOnlyCount: number;
  apiObservedCount: number;
  goviralAssistedCount: number;
  ordinaryPersonalCount: number;
  ownerManualVentureCount: number;
  personalRatio: number | null;
  followerDirection: number | null;
  metrics: PersonalGrowthMetricView[];
  breakdowns: Array<{ dimension: "format" | "pillar" | "publication" | "reel-series" | "origin"; label: string; resultCount: number; typicalReachOrViews: number | null }>;
  completedOwnerActions: number;
  missedDeadlines: number;
  currentMonthSpendUsd: number | null;
}

export interface PersonalGrowthExperimentView {
  id: string;
  status: PersonalGrowthExperimentStatus;
  hypothesis: string;
  changedVariable: string;
  platform: PersonalGrowthPlatform;
  format: string;
  primaryMetric: string;
  secondaryGuardrail: string;
  startDate: string;
  minimumSample: number;
  evaluationWindowDays: number;
  stopCondition: string;
  evidenceResultIds: string[];
  verdict: PersonalGrowthExperimentVerdict;
  note: string | null;
  noteRecordedAt: string | null;
}

export interface PersonalGrowthJournalHealthView {
  language: "cs" | "en";
  state: PersonalGrowthArtifactState;
  sourceHash: string | null;
  titleHash: string | null;
  versionId: string | null;
  status: "current" | "superseded" | "unavailable";
  generatedAt: string | null;
  retrievalAvailable: boolean | null;
  styleSampleCount: number | null;
  boundedExemplarCount: number | null;
  costUsd: number | null;
  costStatus: PersonalGrowthDegradation | "unavailable";
}

export interface PersonalGrowthStrategyView {
  defaultLanguage: "cs" | "en";
  platformsUsed: PersonalGrowthPlatform[];
  pillars: Array<{ pillar: string; status: "enabled" | "paused"; weight: number; vetoes: string[] }>;
  policy: {
    revision: number;
    personalFeedMinimum: number;
    ventureLedMaximum: number;
    ventureStoriesPerSevenDaysMaximum: number;
    sameVentureCooldownDays: number;
    ownerManualReferenceRequired: true;
    ownerCommentaryRequired: true;
  };
  historyCount: number;
}

export interface PersonalGrowthBudgetView {
  state: PersonalGrowthArtifactState;
  monthlyCapUsd: 20;
  activeMode: "default" | "buffer" | "unavailable";
  allocations: Array<{ id: "default" | "buffer"; synthesisUsd: number; researchUsd: number; schedulingUsd: number; reserveUsd: number }>;
  activeReserveUsd: number | null;
  monthlySpendUsd: number | null;
  remainingUsd: number | null;
  companyCapUsd: 50;
  companyRecordedSpendUsd: number | null;
  companyRemainingUsd: number | null;
  degradation: PersonalGrowthDegradation;
  spendByCategory: Array<{ category: "model" | "research" | "tool" | "provider"; label: string; usd: number | null; state: "measured" | "unavailable" }>;
  featureFlags: Array<{ id: string; enabled: boolean; canDisable: boolean }>;
  goviralIncrementalUsd: number | null;
  metaProviderStatus: "active" | "held" | "unavailable";
  buffer: {
    adapterEnabled: boolean | null;
    queueEnabled: boolean;
    ownerApprovalRequired: boolean | null;
    purchaseAuthorized: false;
    publishingAuthorized: false;
    subscriptionStatus: "not-assumed" | "unavailable";
  };
}

export interface PersonalGrowthAdminInsightsSnapshot {
  results: {
    state: PersonalGrowthArtifactState;
    windows: PersonalGrowthResultsWindow[];
    items: PersonalGrowthResultView[];
    baseline: {
      state: PersonalGrowthArtifactState;
      status: "collecting" | "proposal-due" | "unavailable";
      startsOn: string | null;
      endsOn: string | null;
      elapsedDays: number | null;
      acceptedResultCount: number | null;
      droppedResultCount: number;
      targetProposalRequired: boolean;
    };
  };
  experiments: {
    state: PersonalGrowthArtifactState;
    activeCount: number;
    maximumActive: 2;
    items: PersonalGrowthExperimentView[];
  };
  voice: {
    journals: PersonalGrowthJournalHealthView[];
    privateStoreStatus: "available" | "missing" | "partial";
    profile: { state: PersonalGrowthArtifactState; ref: string; completedSections: number; totalSections: 5; workspaceHref: "/admin?venture=goviral" };
    leakGate: "pass" | "blocked" | "unavailable";
  };
  strategy: PersonalGrowthStrategyView | null;
  budget: PersonalGrowthBudgetView;
  insightsUnreadable: {
    results: number;
    baseline: number;
    experiments: number;
    voice: number;
    strategy: number;
    budget: number;
    forbidden: number;
    total: number;
  };
}

interface TimelineInput {
  scheduledDate: string;
  status: string;
}

type JsonRead = { state: "missing" } | { state: "unreadable" } | { state: "present"; value: unknown };

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/u;
const RESULT_ID = /^pg-result-[a-f0-9]{16}$/u;
const OBSERVATION_ID = /^pg-observation-[a-f0-9]{16}$/u;
const BLOCKED = /(?:kvorum|portfolio(?:-item|-bridge|-content)?|social-distribution|campaign-|door-money|booksofhistory|tehdejsi|dneskai|mma-files|fightaiq|contest-radar|monetization)/iu;
const PRIVATE_KEY = /(?:manuscript|sourceText|chunkText|embedding|rawPrompt|rawResponse|unpublishedText)/iu;
const PLATFORMS = ["instagram", "threads"] as const;
const LANGUAGES = ["cs", "en"] as const;
const EXPERIMENT_STATUSES = ["backlog", "active", "review", "completed", "stopped"] as const;
const EXPERIMENT_VERDICTS = ["KEEP", "ITERATE", "STOP", "INSUFFICIENT_DATA"] as const;
const METRIC_NAMES = new Set([
  "followers", "net_follower_growth", "views", "reach", "non_follower_reach", "profile_views", "follows", "likes",
  "comments", "replies", "reposts", "quotes", "shares", "saves", "watch_time_ms", "average_watch_time_ms",
  "early_exit_count", "non_follower_reach_ratio", "profile_view_to_follow_rate", "saves_per_1000_reach",
  "shares_per_1000_reach", "early_exit_rate", "replies_per_1000_views", "reposts_quotes_per_1000_views"
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function containsBlockedString(value: unknown): boolean {
  if (typeof value === "string") return BLOCKED.test(value);
  if (Array.isArray(value)) return value.some(containsBlockedString);
  const input = record(value);
  return input ? Object.values(input).some(containsBlockedString) : false;
}

function containsPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  const input = record(value);
  return input ? Object.entries(input).some(([key, entry]) => PRIVATE_KEY.test(key) || containsPrivateKey(entry)) : false;
}

function text(value: unknown, maximum = 1_000): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximum ? value.trim() : null;
}

function finite(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  const parsed = finite(value, minimum, maximum);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value as T[number] : null;
}

function validDate(value: unknown): string | null {
  const candidate = text(value, 10);
  return candidate && DATE.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00.000Z`)) ? candidate : null;
}

function validDateTime(value: unknown): string | null {
  const candidate = text(value, 40);
  return candidate && DATE_TIME.test(candidate) && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function validUrl(value: unknown): string | null {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function addDays(value: string, amount: number): string {
  const result = new Date(`${value}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}

function pragueDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function readJson(absolutePath: string): Promise<JsonRead> {
  try {
    return { state: "present", value: JSON.parse(await readFile(absolutePath, "utf8")) as unknown };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { state: "missing" } : { state: "unreadable" };
  }
}

async function jsonDirectory(absolutePath: string): Promise<{ values: JsonRead[]; directoryUnreadable: number }> {
  try {
    const names = (await readdir(absolutePath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(({ name }) => name)
      .sort();
    return { values: await Promise.all(names.map((name) => readJson(path.join(absolutePath, name)))), directoryUnreadable: 0 };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? { values: [], directoryUnreadable: 0 } : { values: [], directoryUnreadable: 1 };
  }
}

function parseMetric(value: unknown, observedAt: string): PersonalGrowthMetricView | null {
  const metric = record(value);
  const name = text(metric?.name, 80);
  const measured = metric?.value === null ? null : finite(metric?.value);
  const unavailableReason = metric?.unavailableReason === null ? null : text(metric?.unavailableReason, 80);
  if (!metric || !hasOnlyKeys(metric, ["name", "value", "unavailableReason"]) || !name || !METRIC_NAMES.has(name) || (metric.value !== null && measured === null) || ((measured === null) !== (unavailableReason !== null))) return null;
  return { name, value: measured, unavailableReason, observedAt };
}

function ratioMetric(name: string, numerator: number | null, denominator: number | null, scale = 1): PersonalGrowthMetricView {
  return denominator !== null && denominator > 0 && numerator !== null
    ? { name, value: Number(((numerator / denominator) * scale).toFixed(8)), unavailableReason: null, observedAt: null }
    : { name, value: null, unavailableReason: "invalid-denominator", observedAt: null };
}

function parseResult(value: unknown): PersonalGrowthResultView | null {
  const input = record(value);
  if (!input || containsBlockedString(input) || containsPrivateKey(input) || !hasOnlyKeys(input, ["schemaVersion", "resultId", "platform", "nativePostId", "url", "publishedAt", "format", "language", "personalPillar", "contentOrigin", "collaborator", "publicationRelation", "reelSeries", "goviralSignalId", "manualVentureReference", "experimentId", "classification", "provenance", "observations", "ownerRating", "ownerNote", "corrections", "updatedAt"])) return null;
  const resultId = text(input.resultId, 80);
  const platform = enumValue(input.platform, PLATFORMS);
  const nativePostId = text(input.nativePostId, 200);
  const url = validUrl(input.url);
  const publishedAt = validDateTime(input.publishedAt);
  const format = enumValue(input.format, ["text", "photo", "photo-dump", "carousel", "reel", "story", "publication-distribution"] as const);
  const language = enumValue(input.language, LANGUAGES);
  const personalPillar = text(input.personalPillar, 100);
  const contentOrigin = enumValue(input.contentOrigin, ["owner-private", "owner-authored-publication", "goviral-assisted", "owner-manual-venture-reference", "owner-current-life"] as const);
  const publicationRelation = input.publicationRelation === null ? null : enumValue(input.publicationRelation, ["okraj", "bbarak"] as const);
  const reelSeries = input.reelSeries === null ? null : enumValue(input.reelSeries, ["rapovej-moment", "behind-the-page", "life-between-projects", "trend-met-memory", "english-rapovej-denik"] as const);
  const goviralSignalId = input.goviralSignalId === null ? null : text(input.goviralSignalId, 80);
  const experimentId = input.experimentId === null ? null : text(input.experimentId, 120);
  const provenance = record(input.provenance);
  const entryMode = enumValue(provenance?.entryMode, ["manual", "api", "manual-and-api"] as const);
  const evidence = Array.isArray(provenance?.ownerEvidenceRefs) ? provenance.ownerEvidenceRefs.map((entry) => text(entry, 500)) : null;
  const ownerRating = input.ownerRating === null ? null : integer(input.ownerRating, 1, 5);
  const ownerNote = input.ownerNote === null ? null : text(input.ownerNote, 1_000);
  if (input.schemaVersion !== "personal-growth-result/1" || !resultId?.match(RESULT_ID) || !platform || !nativePostId || !url || !publishedAt ||
      !format || !language || !personalPillar || !contentOrigin || (input.publicationRelation !== null && !publicationRelation) ||
      (input.reelSeries !== null && !reelSeries) || ((format === "reel") !== (reelSeries !== null)) ||
      ((contentOrigin === "goviral-assisted") !== (goviralSignalId !== null)) || (goviralSignalId !== null && !goviralSignalId.match(/^pg-gv-[a-f0-9]{16}$/u)) ||
      (input.experimentId !== null && !experimentId?.match(/^pg-exp-[a-z0-9]+(?:-[a-z0-9]+)*$/u)) ||
      !entryMode || !evidence?.length || evidence.some((entry) => !entry || BLOCKED.test(entry)) || !provenance ||
      !hasOnlyKeys(provenance, ["entryMode", "ownerEvidenceRefs", "automaticPortfolioLookup", "socialDistributionCampaignRef", "monetizationRef"]) ||
      provenance?.automaticPortfolioLookup !== false || provenance?.socialDistributionCampaignRef !== null || provenance?.monetizationRef !== null ||
      (input.ownerRating !== null && ownerRating === null) || (input.ownerNote !== null && !ownerNote) || !Array.isArray(input.observations) ||
      input.observations.length > 100 || !Array.isArray(input.corrections) || input.corrections.length > 100) return null;
  const manualReference = record(input.manualVentureReference);
  const isManualVenture = contentOrigin === "owner-manual-venture-reference";
  if (isManualVenture !== (manualReference !== null) || (isManualVenture ? input.classification !== "owner-manual-venture-led" : input.classification !== "personal-or-personally-authored")) return null;
  if (manualReference && (!hasOnlyKeys(manualReference, ["referenceId", "sourceProject", "publicItemId", "publicUrl", "ownerAuthored", "personalConnectionRecorded", "ownerCommentaryRecorded", "policyCompliantAtRecommendation", "ownerProvenanceRef"]) ||
      !text(manualReference.referenceId, 80)?.match(/^pg-manual-ref-[a-f0-9]{16}$/u) || !text(manualReference.sourceProject, 80) || !text(manualReference.publicItemId, 160) ||
      containsBlockedString(manualReference) || !validUrl(manualReference.publicUrl) || typeof manualReference.ownerAuthored !== "boolean" || typeof manualReference.personalConnectionRecorded !== "boolean" ||
      manualReference.ownerCommentaryRecorded !== true || manualReference.policyCompliantAtRecommendation !== true || !text(manualReference.ownerProvenanceRef, 500))) return null;

  const latest = new Map<string, PersonalGrowthMetricView>();
  let latestObservationAt: string | null = null;
  for (const rawObservation of input.observations) {
    const observation = record(rawObservation);
    const observedAt = validDateTime(observation?.observedAt);
    const observationId = text(observation?.observationId, 80);
    if (!observation || !hasOnlyKeys(observation, ["schemaVersion", "observationId", "idempotencyKey", "platform", "scope", "ownerAccountAlias", "nativePostId", "nativeUrl", "observedAt", "publishedAt", "pragueReportingDate", "apiVersion", "maturityWindow", "metrics", "unavailableReason", "droppedItemCount", "snapshotHash", "credentialMaterialPresent", "audienceIdentityPresent"]) ||
        observation.schemaVersion !== "personal-growth-provider-observation/1" || !observationId?.match(OBSERVATION_ID) || !text(observation.idempotencyKey, 80)?.match(SHA256) ||
        observation.scope !== "post" || observation.platform !== platform || observation.nativePostId !== nativePostId || validUrl(observation.nativeUrl) !== url ||
        !observedAt || validDateTime(observation.publishedAt) !== publishedAt || !validDate(observation.pragueReportingDate) || !text(observation.apiVersion, 40) ||
        !enumValue(observation.maturityWindow, ["24h", "72h", "7d", "28d"] as const) || !text(observation.unavailableReason, 80) || integer(observation.droppedItemCount, 0, Number.MAX_SAFE_INTEGER) === null ||
        !text(observation.snapshotHash, 80)?.match(SHA256) || !Array.isArray(observation.metrics) || observation.metrics.length > 30 ||
        observation?.credentialMaterialPresent !== false || observation?.audienceIdentityPresent !== false) return null;
    const metrics = observation.metrics.map((metric) => parseMetric(metric, observedAt));
    if (metrics.some((metric) => metric === null) || new Set(metrics.map((metric) => metric!.name)).size !== metrics.length) return null;
    if (!latestObservationAt || observedAt > latestObservationAt) latestObservationAt = observedAt;
    for (const metric of metrics as PersonalGrowthMetricView[]) {
      if (!latest.get(metric.name)?.observedAt || observedAt >= latest.get(metric.name)!.observedAt!) latest.set(metric.name, metric);
    }
  }
  const corrections = input.corrections.map((value) => {
    const correction = record(value);
    const correctionId = text(correction?.correctionId, 80);
    const refs = Array.isArray(correction?.evidenceRefs) ? correction.evidenceRefs.map((entry) => text(entry, 500)) : null;
    return correction && hasOnlyKeys(correction, ["correctionId", "recordedAt", "reason", "evidenceRefs"]) && correctionId?.match(/^pg-correction-[a-f0-9]{16}$/u) &&
      validDateTime(correction.recordedAt) && text(correction.reason, 360) && refs?.length && refs.length <= 8 && refs.every((entry) => entry && !BLOCKED.test(entry));
  });
  if (corrections.some((valid) => !valid) || !validDateTime(input.updatedAt)) return null;
  if ((entryMode === "manual") !== (input.observations.length === 0)) return null;
  const metricValue = (name: string) => latest.get(name)?.value ?? null;
  const reposts = metricValue("reposts");
  const quotes = metricValue("quotes");
  const derived = [
    ratioMetric("non_follower_reach_ratio", metricValue("non_follower_reach"), metricValue("reach")),
    ratioMetric("profile_view_to_follow_rate", metricValue("follows"), metricValue("profile_views")),
    ratioMetric("saves_per_1000_reach", metricValue("saves"), metricValue("reach"), 1_000),
    ratioMetric("shares_per_1000_reach", metricValue("shares"), metricValue("reach"), 1_000),
    ratioMetric("early_exit_rate", metricValue("early_exit_count"), metricValue("views")),
    ratioMetric("replies_per_1000_views", metricValue("replies"), metricValue("views"), 1_000),
    ratioMetric("reposts_quotes_per_1000_views", reposts === null || quotes === null ? null : reposts + quotes, metricValue("views"), 1_000)
  ];
  for (const metric of derived) if (!latest.has(metric.name)) latest.set(metric.name, metric);
  return {
    resultId,
    platform,
    nativePostId,
    url,
    publishedAt,
    format,
    language,
    personalPillar,
    contentOrigin,
    publicationRelation,
    reelSeries,
    goviralAssisted: goviralSignalId !== null,
    manualVentureReference: isManualVenture,
    experimentId,
    provenance: entryMode,
    latestObservationAt,
    metrics: [...latest.values()].sort((left, right) => left.name.localeCompare(right.name)),
    ownerRating,
    ownerNote,
    correctionCount: input.corrections.length
  };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : Number(((sorted[middle - 1]! + sorted[middle]!) / 2).toFixed(8));
}

function primaryOutcome(result: PersonalGrowthResultView): number | null {
  return result.metrics.find(({ name, value }) => name === "reach" && value !== null)?.value
    ?? result.metrics.find(({ name, value }) => name === "views" && value !== null)?.value
    ?? null;
}

function breakdown(results: PersonalGrowthResultView[], dimension: PersonalGrowthResultsWindow["breakdowns"][number]["dimension"], label: (result: PersonalGrowthResultView) => string | null) {
  const groups = new Map<string, PersonalGrowthResultView[]>();
  for (const result of results) {
    const key = label(result);
    if (key) groups.set(key, [...(groups.get(key) ?? []), result]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, items]) => ({
    dimension,
    label: key,
    resultCount: items.length,
    typicalReachOrViews: median(items.flatMap((item) => primaryOutcome(item) === null ? [] : [primaryOutcome(item)!]))
  }));
}

function aggregateMetric(results: PersonalGrowthResultView[], name: string): PersonalGrowthMetricView {
  const values = results.flatMap((result) => result.metrics.find((metric) => metric.name === name)?.value ?? null).filter((value): value is number => value !== null);
  return values.length
    ? { name, value: Number(values.reduce((sum, value) => sum + value, 0).toFixed(8)), unavailableReason: null, observedAt: null }
    : { name, value: null, unavailableReason: "not-returned", observedAt: null };
}

function typicalMetric(results: PersonalGrowthResultView[], name: string): PersonalGrowthMetricView {
  const values = results.flatMap((result) => result.metrics.find((metric) => metric.name === name)?.value ?? null).filter((value): value is number => value !== null);
  const value = median(values);
  return value === null
    ? { name, value: null, unavailableReason: "invalid-denominator", observedAt: null }
    : { name, value, unavailableReason: null, observedAt: null };
}

function buildWindow(input: {
  days: 7 | 28 | 90;
  today: string;
  results: PersonalGrowthResultView[];
  timeline: readonly TimelineInput[];
  spend: number | null;
}): PersonalGrowthResultsWindow {
  const startsOn = addDays(input.today, -(input.days - 1));
  const results = input.results.filter(({ publishedAt }) => publishedAt.slice(0, 10) >= startsOn && publishedAt.slice(0, 10) <= input.today);
  const timeline = input.timeline.filter(({ scheduledDate }) => scheduledDate >= startsOn && scheduledDate <= input.today);
  const accountFollowers = results.flatMap((result) => result.metrics
    .filter(({ name, value, observedAt }) => name === "followers" && value !== null && observedAt)
    .map(({ value, observedAt }) => ({ value: value!, observedAt: observedAt! })))
    .sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  const personalCount = results.filter(({ manualVentureReference }) => !manualVentureReference).length;
  const manualCount = results.length - personalCount;
  const followerDirection = accountFollowers.length > 1 ? accountFollowers.at(-1)!.value - accountFollowers[0]!.value : null;
  return {
    days: input.days,
    startsOn,
    endsOn: input.today,
    resultCount: results.length,
    manualOnlyCount: results.filter(({ provenance }) => provenance === "manual").length,
    apiObservedCount: results.filter(({ latestObservationAt }) => latestObservationAt !== null).length,
    goviralAssistedCount: results.filter(({ goviralAssisted }) => goviralAssisted).length,
    ordinaryPersonalCount: results.filter(({ goviralAssisted, manualVentureReference }) => !goviralAssisted && !manualVentureReference).length,
    ownerManualVentureCount: manualCount,
    personalRatio: results.length ? personalCount / results.length : null,
    followerDirection,
    metrics: [
      ...["reach", "views", "non_follower_reach", "profile_views", "follows", "saves", "shares", "replies", "reposts", "quotes", "watch_time_ms", "average_watch_time_ms", "early_exit_count"].map((name) => aggregateMetric(results, name)),
      ...["non_follower_reach_ratio", "profile_view_to_follow_rate", "saves_per_1000_reach", "shares_per_1000_reach", "early_exit_rate", "replies_per_1000_views", "reposts_quotes_per_1000_views"].map((name) => typicalMetric(results, name))
    ],
    breakdowns: [
      ...breakdown(results, "format", ({ format }) => format),
      ...breakdown(results, "pillar", ({ personalPillar }) => personalPillar),
      ...breakdown(results, "publication", ({ publicationRelation }) => publicationRelation),
      ...breakdown(results, "reel-series", ({ reelSeries }) => reelSeries),
      ...breakdown(results, "origin", ({ goviralAssisted, manualVentureReference }) => manualVentureReference ? "owner-manual-venture" : goviralAssisted ? "goviral-assisted" : "ordinary-personal")
    ],
    completedOwnerActions: timeline.filter(({ status }) => status === "completed").length,
    missedDeadlines: timeline.filter(({ status }) => status === "overdue").length,
    currentMonthSpendUsd: input.spend
  };
}

function parseBaseline(value: unknown): PersonalGrowthAdminInsightsSnapshot["results"]["baseline"] | null {
  const input = record(value);
  const startsOn = validDate(input?.startsOn);
  const endsOn = validDate(input?.endsOn);
  const status = enumValue(input?.status, ["collecting", "proposal-due"] as const);
  const elapsedDays = integer(input?.elapsedDays, 0, 28);
  const accepted = integer(input?.acceptedResultCount);
  const dropped = integer(input?.droppedResultCount);
  const proposal = record(input?.targetProposal);
  if (input?.schemaVersion !== "personal-growth-baseline/1" || input?.ventureId !== "personal-growth" || !startsOn || !endsOn || !validDateTime(input.evaluatedAt) ||
      !status || elapsedDays === null || accepted === null || dropped === null || typeof proposal?.required !== "boolean" || proposal?.ownerDecisionRequired !== true || proposal?.activatedTargets !== 0) return null;
  return { state: "present", status, startsOn, endsOn, elapsedDays, acceptedResultCount: accepted, droppedResultCount: dropped, targetProposalRequired: proposal.required };
}

function parseExperiment(value: unknown, note: { note: string; recordedAt: string } | null): PersonalGrowthExperimentView | null {
  const input = record(value);
  if (!input || BLOCKED.test(JSON.stringify(input))) return null;
  const id = text(input.id, 120);
  const status = enumValue(input.status, EXPERIMENT_STATUSES);
  const hypothesis = text(input.hypothesis, 800);
  const changedVariable = enumValue(input.changedVariable, ["trial-reel", "language", "photo-format", "goviral-opening", "threads-topic-tag", "timing-window", "manual-venture-reference"] as const);
  const platform = enumValue(input.platform, PLATFORMS);
  const format = text(input.format, 80);
  const primaryMetric = text(input.primaryMetric, 80);
  const guardrail = text(input.secondaryGuardrail, 240);
  const startDate = validDate(input.startDate);
  const minimumSample = integer(input.minimumSample, 2, 1_000);
  const window = integer(input.evaluationWindowDays, 1, 90);
  const stopCondition = text(input.stopCondition, 500);
  const verdict = enumValue(input.verdict, EXPERIMENT_VERDICTS);
  const evidence = Array.isArray(input.evidenceResultIds) ? input.evidenceResultIds.map((entry) => text(entry, 80)) : null;
  if (input.schemaVersion !== "personal-growth-experiment/1" || !id?.match(/^pg-exp-[a-z0-9]+(?:-[a-z0-9]+)*$/u) || !status || !hypothesis || !changedVariable ||
      !platform || !format || !primaryMetric || !METRIC_NAMES.has(primaryMetric) || !guardrail || !startDate || minimumSample === null || window === null || !stopCondition ||
      !evidence || evidence.length > 1_000 || evidence.some((entry) => !entry?.match(RESULT_ID)) || !verdict || input.maxCostUsd !== 0 || input.publishingAuthorized !== false) return null;
  return { id, status, hypothesis, changedVariable, platform, format, primaryMetric, secondaryGuardrail: guardrail, startDate, minimumSample, evaluationWindowDays: window, stopCondition, evidenceResultIds: evidence as string[], verdict, note: note?.note ?? null, noteRecordedAt: note?.recordedAt ?? null };
}

function parseExperimentNotes(value: unknown): Map<string, { note: string; recordedAt: string }> | null {
  if (value === null) return new Map();
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-experiment-notes/1" || !Array.isArray(input.notes) || input.notes.length > 500) return null;
  const notes = new Map<string, { note: string; recordedAt: string }>();
  for (const value of input.notes) {
    const item = record(value);
    const experimentId = text(item?.experimentId, 120);
    const note = text(item?.note, 1_000);
    const recordedAt = validDateTime(item?.recordedAt);
    if (!experimentId?.match(/^pg-exp-/u) || !note || !recordedAt) return null;
    if (!notes.get(experimentId) || recordedAt >= notes.get(experimentId)!.recordedAt) notes.set(experimentId, { note, recordedAt });
  }
  return notes;
}

function parseJournal(value: unknown, language: "cs" | "en"): PersonalGrowthJournalHealthView | null {
  const input = record(value);
  const sourceHash = text(input?.sourceHash, 80);
  const titleHash = text(input?.titleHash, 80);
  const versionId = text(input?.versionId, 80);
  const status = enumValue(input?.status, ["current", "superseded"] as const);
  const generatedAt = validDateTime(input?.generatedAt);
  const chunks = integer(input?.chunkCount, 1);
  const style = record(input?.style);
  const sampled = integer(style?.sampledSentences, 1);
  const cost = record(input?.cost);
  const actualUsd = finite(cost?.actualUsd, 0, 20);
  const degradation = enumValue(cost?.degradation, ["healthy", "reduced", "low", "critical", "exhausted"] as const);
  if (input?.schemaVersion !== "personal-growth-journal-metadata/1" || input?.language !== language || !sourceHash?.match(SHA256) || !titleHash?.match(SHA256) ||
      !versionId?.match(new RegExp(`^pg-journal-${language}-[a-f0-9]{16}$`, "u")) || !status || !generatedAt || chunks === null || typeof input?.retrievalAvailable !== "boolean" ||
      !style || sampled === null || finite(style.meanWordsPerSentence, Number.MIN_VALUE) === null || actualUsd === null || cost?.monthlyCapUsd !== 20 || !degradation) return null;
  return { language, state: "present", sourceHash, titleHash, versionId, status, generatedAt, retrievalAvailable: input.retrievalAvailable, styleSampleCount: sampled, boundedExemplarCount: null, costUsd: actualUsd, costStatus: degradation };
}

function parseStrategy(value: unknown, settingsValue: unknown, historyValue: unknown): PersonalGrowthStrategyView | null {
  const input = record(value);
  const policy = record(input?.policy);
  const revision = integer(policy?.currentRevision);
  const revisions = Array.isArray(policy?.revisions) ? policy.revisions : null;
  const current = revisions && revision !== null ? record(revisions.find((entry) => record(entry)?.revision === revision)) : null;
  const defaultLanguage = enumValue(input?.defaultLanguage, LANGUAGES);
  if (input?.schemaVersion !== "personal-growth-content-config/1" || input?.ventureId !== "personal-growth" || !defaultLanguage || !Array.isArray(input.pillars) || !current ||
      policy?.ownerManualReferenceRequired !== true || policy?.ownerCommentaryRequired !== true || policy?.automaticVentureDiscovery !== false || policy?.automaticVentureNomination !== false) return null;
  const pillars = input.pillars.map((value) => {
    const pillar = record(value);
    const id = text(pillar?.pillar, 100);
    const status = enumValue(pillar?.status, ["enabled", "paused"] as const);
    const weight = finite(pillar?.weight, 0, 1);
    const vetoes = Array.isArray(pillar?.vetoes) ? pillar.vetoes.map((entry) => text(entry, 240)) : null;
    return id && status && weight !== null && vetoes && vetoes.length <= 20 && vetoes.every((entry) => entry && !BLOCKED.test(entry))
      ? { pillar: id, status, weight, vetoes: vetoes as string[] }
      : null;
  });
  const minimum = finite(current.personalFeedMinimum, 0.85, 1);
  const maximum = finite(current.ventureLedMaximum, 0, 0.15);
  const stories = integer(current.ventureStoriesPerSevenDaysMaximum, 0, 2);
  const cooldown = integer(current.sameVentureCooldownDays, 10, 365);
  if (pillars.some((pillar) => pillar === null) || minimum === null || maximum === null || Math.abs(minimum + maximum - 1) > 0.000001 || stories === null || cooldown === null) return null;
  const settings = record(settingsValue);
  const platforms = settings?.schemaVersion === "personal-growth-admin-strategy-settings/1" && Array.isArray(settings.platformsUsed)
    ? settings.platformsUsed.map((entry) => enumValue(entry, PLATFORMS)) : [];
  if (platforms.some((entry) => entry === null) || new Set(platforms).size !== platforms.length) return null;
  const history = record(historyValue);
  const historyCount = historyValue === null ? 0 : history?.schemaVersion === "personal-growth-admin-strategy-history/1" && Array.isArray(history.revisions) ? history.revisions.length : -1;
  if (historyCount < 0) return null;
  return {
    defaultLanguage,
    platformsUsed: platforms as PersonalGrowthPlatform[],
    pillars: pillars as PersonalGrowthStrategyView["pillars"],
    policy: { revision: revision!, personalFeedMinimum: minimum, ventureLedMaximum: maximum, ventureStoriesPerSevenDaysMaximum: stories, sameVentureCooldownDays: cooldown, ownerManualReferenceRequired: true, ownerCommentaryRequired: true },
    historyCount
  };
}

interface FoundationView {
  activeMode: "default" | "buffer";
  allocations: PersonalGrowthBudgetView["allocations"];
  featureFlags: Record<string, boolean>;
  thresholds: { healthy: number; reduced: number; low: number };
}

function parseFoundation(value: unknown): FoundationView | null {
  const input = record(value);
  const budget = record(input?.budget);
  const activeMode = enumValue(budget?.activeMode, ["default", "buffer"] as const);
  const allocations = Array.isArray(budget?.modes) ? budget.modes.map((value) => {
    const mode = record(value);
    const id = enumValue(mode?.id, ["default", "buffer"] as const);
    const synthesisUsd = finite(mode?.synthesisUsd, 0, 20);
    const researchUsd = finite(mode?.researchUsd, 0, 20);
    const schedulingUsd = finite(mode?.schedulingUsd, 0, 20);
    const reserveUsd = finite(mode?.reserveUsd, 0, 20);
    const authorised = id === "default"
      ? synthesisUsd === 12 && researchUsd === 5 && schedulingUsd === 0 && reserveUsd === 3
      : id === "buffer" && synthesisUsd === 8 && researchUsd === 0 && schedulingUsd === 10 && reserveUsd === 2;
    return id && synthesisUsd !== null && researchUsd !== null && schedulingUsd !== null && reserveUsd !== null && synthesisUsd + researchUsd + schedulingUsd + reserveUsd === 20 && authorised
      ? { id, synthesisUsd, researchUsd, schedulingUsd, reserveUsd }
      : null;
  }) : null;
  const gates = record(input?.featureGates);
  const degradation = record(input?.degradation);
  const featureFlags = gates ? Object.fromEntries(Object.entries(gates).filter(([, enabled]) => typeof enabled === "boolean")) as Record<string, boolean> : null;
  if (input?.schemaVersion !== "personal-growth-foundation/1" || input?.ventureId !== "personal-growth" || input?.visibility !== "owner-only" || budget?.monthlyAllInUsd !== 20 || !activeMode ||
      !allocations || allocations.length !== 2 || allocations.some((entry) => entry === null) || new Set(allocations.map((entry) => entry?.id)).size !== 2 || !featureFlags || featureFlags.publishing !== false || degradation?.healthyBelowRatio !== 0.5 ||
      degradation?.reducedBelowRatio !== 0.7 || degradation?.lowBelowRatio !== 0.85) return null;
  return { activeMode, allocations: allocations as PersonalGrowthBudgetView["allocations"], featureFlags, thresholds: { healthy: 0.5, reduced: 0.7, low: 0.85 } };
}

interface LedgerEntry { ts: string; ventureId: string | null; provider: "openai" | "anthropic" | "fal"; kind: "text" | "image" | "embedding"; usd: number; }

function parseLedger(value: unknown): { entries: LedgerEntry[]; unreadable: number } | null {
  const input = record(value);
  if (input?.schemaVersion !== 1 || !Array.isArray(input.entries) || input.entries.length > 50_000) return null;
  const entries: LedgerEntry[] = [];
  let unreadable = 0;
  for (const value of input.entries) {
    const entry = record(value);
    const ts = validDateTime(entry?.ts);
    const ventureId = entry?.ventureId === undefined ? null : text(entry.ventureId, 80);
    const provider = enumValue(entry?.provider, ["openai", "anthropic", "fal"] as const);
    const kind = enumValue(entry?.kind, ["text", "image", "embedding"] as const);
    const usd = finite(entry?.usd);
    if (!ts || (entry?.ventureId !== undefined && !ventureId) || !provider || !kind || usd === null) unreadable += 1;
    else entries.push({ ts, ventureId, provider, kind, usd });
  }
  return { entries, unreadable };
}

function degradation(usedRatio: number): PersonalGrowthDegradation {
  if (usedRatio >= 1) return "exhausted";
  if (usedRatio >= 0.85) return "critical";
  if (usedRatio >= 0.7) return "low";
  if (usedRatio >= 0.5) return "reduced";
  return "healthy";
}

function unavailableJournal(language: "cs" | "en", state: PersonalGrowthArtifactState): PersonalGrowthJournalHealthView {
  return { language, state, sourceHash: null, titleHash: null, versionId: null, status: "unavailable", generatedAt: null, retrievalAvailable: null, styleSampleCount: null, boundedExemplarCount: null, costUsd: null, costStatus: "unavailable" };
}

function parseProfile(raw: string | null): { state: PersonalGrowthArtifactState; completedSections: number } {
  if (raw === null) return { state: "missing", completedSections: 0 };
  const cleaned = raw.replace(/<!--[\s\S]*?-->/gu, "");
  const sections = ["Niches and topics I write about", "Voice", "Audiences", "Never write about", "Platforms I actually use"];
  let completedSections = 0;
  for (const [index, heading] of sections.entries()) {
    const start = cleaned.indexOf(`## ${heading}`);
    if (start < 0) return { state: "unreadable", completedSections: 0 };
    const end = index + 1 < sections.length ? cleaned.indexOf(`## ${sections[index + 1]}`, start + heading.length) : cleaned.length;
    if (cleaned.slice(start + heading.length + 3, end < 0 ? cleaned.length : end).trim()) completedSections += 1;
  }
  return { state: "present", completedSections };
}

function parseBufferProvider(value: unknown): PersonalGrowthBudgetView["buffer"] | null {
  const input = record(value);
  const buffer = record(input?.buffer);
  if (input?.schemaVersion !== "personal-growth-provider-config/1" || !buffer || typeof buffer.adapterEnabled !== "boolean" || buffer.ownerApprovalRequired !== true ||
      buffer.purchaseAuthorized !== false || buffer.publishingAuthorized !== false || buffer.planAssumption !== "none") return null;
  return { adapterEnabled: buffer.adapterEnabled, queueEnabled: false, ownerApprovalRequired: true, purchaseAuthorized: false, publishingAuthorized: false, subscriptionStatus: "not-assumed" };
}

export async function readPersonalGrowthAdminInsights(input: {
  root: string;
  now: Date;
  timeline: readonly TimelineInput[];
}): Promise<PersonalGrowthAdminInsightsSnapshot> {
  const stateRoot = path.join(input.root, "state", "ventures", "personal-growth");
  const [resultFiles, baselineRead, experimentsRead, notesRead, csRead, enRead, contentRead, strategySettingsRead, strategyHistoryRead, foundationRead, ledgerRead, providerRead, trendRead, profileRaw, threadFiles] = await Promise.all([
    jsonDirectory(path.join(stateRoot, "results")),
    readJson(path.join(stateRoot, "analysis", "baseline.json")),
    readJson(path.join(stateRoot, "experiments.json")),
    readJson(path.join(stateRoot, "admin", "experiment-notes.json")),
    readJson(path.join(stateRoot, "journal", "cs.json")),
    readJson(path.join(stateRoot, "journal", "en.json")),
    readJson(path.join(input.root, "config", "personal-growth-content.json")),
    readJson(path.join(stateRoot, "admin", "strategy-settings.json")),
    readJson(path.join(stateRoot, "admin", "strategy-history.json")),
    readJson(path.join(input.root, "config", "personal-growth.json")),
    readJson(path.join(input.root, "state", "budget", "ledger.json")),
    readJson(path.join(input.root, "config", "personal-growth-providers.json")),
    readJson(path.join(stateRoot, "intelligence", "current.json")),
    readFile(path.join(input.root, "state", "ventures", "goviral", "profile.md"), "utf8").catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error)),
    jsonDirectory(path.join(stateRoot, "recommendations", "threads"))
  ]);

  let forbidden = 0;
  let resultUnreadable = resultFiles.directoryUnreadable;
  const results: PersonalGrowthResultView[] = [];
  for (const read of resultFiles.values) {
    const raw = read.state === "present" ? record(read.value) : null;
    const parsed = read.state === "present" ? parseResult(read.value) : null;
    if (parsed) results.push(parsed);
    else {
      resultUnreadable += 1;
      const provenance = record(raw?.provenance);
      if (raw && (containsBlockedString(raw) || containsPrivateKey(raw) || provenance?.automaticPortfolioLookup !== false || provenance?.socialDistributionCampaignRef !== null || provenance?.monetizationRef !== null || !hasOnlyKeys(raw, ["schemaVersion", "resultId", "platform", "nativePostId", "url", "publishedAt", "format", "language", "personalPillar", "contentOrigin", "collaborator", "publicationRelation", "reelSeries", "goviralSignalId", "manualVentureReference", "experimentId", "classification", "provenance", "observations", "ownerRating", "ownerNote", "corrections", "updatedAt"]))) forbidden += 1;
    }
  }
  results.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  const foundation = foundationRead.state === "present" ? parseFoundation(foundationRead.value) : null;
  const ledger = ledgerRead.state === "present" ? parseLedger(ledgerRead.value) : null;
  const month = input.now.toISOString().slice(0, 7);
  const personalEntries = ledger?.entries.filter(({ ventureId, ts }) => ventureId === "personal-growth" && ts.startsWith(month)) ?? [];
  const personalSpend = ledger ? Number(personalEntries.reduce((sum, entry) => sum + entry.usd, 0).toFixed(8)) : null;
  const companySpend = ledger ? Number(ledger.entries.filter(({ ts }) => ts.startsWith(month)).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8)) : null;
  const companyRemaining = companySpend === null ? null : Number(Math.max(0, 50 - companySpend).toFixed(8));
  const nestedRemaining = personalSpend === null || companyRemaining === null ? null : Number(Math.min(Math.max(0, 20 - personalSpend), companyRemaining).toFixed(8));
  const budgetDegradation = nestedRemaining === null ? "critical" : degradation((20 - nestedRemaining) / 20);
  const provider = providerRead.state === "present" ? parseBufferProvider(providerRead.value) : null;
  const trend = trendRead.state === "present" ? record(trendRead.value) : null;
  const goviralIncremental = trend?.schemaVersion === "personal-growth-goviral-packet/1" ? finite(trend.incrementalCostUsd, 0, 20) : null;
  const providerSpend = (name: LedgerEntry["provider"]) => ledger ? Number(personalEntries.filter(({ provider }) => provider === name).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8)) : null;
  const modelSpend = ledger ? Number(personalEntries.filter(({ kind }) => kind === "text" || kind === "embedding").reduce((sum, entry) => sum + entry.usd, 0).toFixed(8)) : null;
  const activeMode = foundation?.activeMode ?? "unavailable";
  const activeReserve = foundation?.allocations.find(({ id }) => id === foundation.activeMode)?.reserveUsd ?? null;
  const buffer = provider ?? { adapterEnabled: null, queueEnabled: false, ownerApprovalRequired: null, purchaseAuthorized: false as const, publishingAuthorized: false as const, subscriptionStatus: "unavailable" as const };
  buffer.queueEnabled = foundation?.featureFlags.bufferQueue === true;
  const budget: PersonalGrowthBudgetView = {
    state: foundation && ledger ? "present" : foundationRead.state === "unreadable" || ledgerRead.state === "unreadable" || (foundationRead.state === "present" && !foundation) || (ledgerRead.state === "present" && !ledger) ? "unreadable" : "missing",
    monthlyCapUsd: 20,
    activeMode,
    allocations: foundation?.allocations ?? [],
    activeReserveUsd: activeReserve,
    monthlySpendUsd: personalSpend,
    remainingUsd: nestedRemaining,
    companyCapUsd: 50,
    companyRecordedSpendUsd: companySpend,
    companyRemainingUsd: companyRemaining,
    degradation: budgetDegradation,
    spendByCategory: [
      { category: "model", label: "Model and embedding ledger", usd: modelSpend, state: ledger ? "measured" : "unavailable" },
      { category: "research", label: "Research receipts", usd: null, state: "unavailable" },
      { category: "tool", label: "Tool-only receipts", usd: null, state: "unavailable" },
      ...(["openai", "anthropic", "fal"] as const).map((name) => ({ category: "provider" as const, label: name, usd: providerSpend(name), state: ledger ? "measured" as const : "unavailable" as const }))
    ],
    featureFlags: Object.entries(foundation?.featureFlags ?? {}).sort(([left], [right]) => left.localeCompare(right)).map(([id, enabled]) => ({ id, enabled, canDisable: enabled && id !== "publishing" })),
    goviralIncrementalUsd: goviralIncremental,
    metaProviderStatus: !foundation ? "unavailable" : foundation.featureFlags.providerLive ? "active" : "held",
    buffer
  };

  const baseline = baselineRead.state === "present" ? parseBaseline(baselineRead.value) : null;
  const baselineView = baseline ?? {
    state: baselineRead.state,
    status: "unavailable" as const,
    startsOn: null,
    endsOn: null,
    elapsedDays: null,
    acceptedResultCount: null,
    droppedResultCount: 0,
    targetProposalRequired: false
  };
  const today = pragueDate(input.now);
  const windows = ([7, 28, 90] as const).map((days) => buildWindow({ days, today, results, timeline: input.timeline, spend: personalSpend }));

  const notesValue = notesRead.state === "present" ? notesRead.value : notesRead.state === "missing" ? null : undefined;
  const notes = notesValue !== undefined ? parseExperimentNotes(notesValue) : null;
  const register = experimentsRead.state === "present" ? record(experimentsRead.value) : null;
  const experimentItems = register?.schemaVersion === "personal-growth-experiment-register/1" && register.ventureId === "personal-growth" && Array.isArray(register.experiments) && register.experiments.length <= 100 && notes
    ? register.experiments.map((item) => {
      const id = text(record(item)?.id, 120);
      return parseExperiment(item, id ? notes.get(id) ?? null : null);
    }) : null;
  const experimentsValid = experimentItems && experimentItems.every((item) => item !== null) && new Set(experimentItems.map((item) => item!.id)).size === experimentItems.length &&
    experimentItems.filter((item) => item?.status === "active" || item?.status === "review").length <= 2;
  const experiments = experimentsValid ? experimentItems as PersonalGrowthExperimentView[] : [];

  const journal = (read: JsonRead, language: "cs" | "en") => read.state === "present" ? parseJournal(read.value, language) : null;
  const cs = journal(csRead, "cs");
  const en = journal(enRead, "en");
  const journals = [cs ?? unavailableJournal("cs", csRead.state), en ?? unavailableJournal("en", enRead.state)];
  const presentJournals = journals.filter(({ state }) => state === "present").length;
  const profile = parseProfile(profileRaw);
  const leakStates = threadFiles.values.flatMap((read) => {
    const raw = read.state === "present" ? record(read.value) : null;
    const suggestions = [raw?.primary, ...(Array.isArray(raw?.alternatives) ? raw.alternatives : [])];
    return suggestions.flatMap((suggestion) => {
      const audit = record(record(suggestion)?.leakAudit);
      return audit?.schemaVersion === "personal-growth-leak-audit/1" && (audit.status === "pass" || audit.status === "blocked") ? [audit.status] : [];
    });
  });
  const leakGate = leakStates.includes("blocked") ? "blocked" : leakStates.includes("pass") ? "pass" : "unavailable";
  const settingsValue = strategySettingsRead.state === "present" ? strategySettingsRead.value : strategySettingsRead.state === "missing" ? null : undefined;
  const historyValue = strategyHistoryRead.state === "present" ? strategyHistoryRead.value : strategyHistoryRead.state === "missing" ? null : undefined;
  const strategy = contentRead.state === "present" && settingsValue !== undefined && historyValue !== undefined ? parseStrategy(contentRead.value, settingsValue, historyValue) : null;

  const insightsUnreadable = {
    results: resultUnreadable,
    baseline: Number(baselineRead.state === "unreadable" || (baselineRead.state === "present" && !baseline)),
    experiments: Number(experimentsRead.state === "unreadable" || notesRead.state === "unreadable" || (experimentsRead.state === "present" && !experimentsValid)),
    voice: Number(csRead.state === "unreadable" || (csRead.state === "present" && !cs)) + Number(enRead.state === "unreadable" || (enRead.state === "present" && !en)) + threadFiles.directoryUnreadable,
    strategy: Number(contentRead.state === "unreadable" || strategySettingsRead.state === "unreadable" || strategyHistoryRead.state === "unreadable" || (contentRead.state === "present" && !strategy)),
    budget: Number(foundationRead.state === "unreadable" || ledgerRead.state === "unreadable" || providerRead.state === "unreadable" || (foundationRead.state === "present" && !foundation) || (ledgerRead.state === "present" && !ledger)) + (ledger?.unreadable ?? 0),
    forbidden,
    total: 0
  };
  insightsUnreadable.total = Object.entries(insightsUnreadable).filter(([key]) => key !== "total" && key !== "forbidden").reduce((sum, [, count]) => sum + count, 0);
  return {
    results: { state: results.length ? "present" : resultUnreadable ? "unreadable" : "missing", windows, items: results, baseline: baselineView },
    experiments: { state: experimentsValid ? "present" : experimentsRead.state === "unreadable" || (experimentsRead.state === "present" && !experimentsValid) ? "unreadable" : "missing", activeCount: experiments.filter(({ status }) => status === "active" || status === "review").length, maximumActive: 2, items: experiments },
    voice: { journals, privateStoreStatus: presentJournals === 2 ? "available" : presentJournals === 1 ? "partial" : "missing", profile: { ...profile, ref: "state/ventures/goviral/profile.md", totalSections: 5, workspaceHref: "/admin?venture=goviral" }, leakGate },
    strategy,
    budget,
    insightsUnreadable
  };
}
