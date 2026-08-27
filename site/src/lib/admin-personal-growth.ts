import "server-only";

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  readPersonalGrowthAdminInsights,
  type PersonalGrowthAdminInsightsSnapshot
} from "./personal-growth-admin-insights";

export type PersonalGrowthCoreTab =
  | "today"
  | "timeline"
  | "threads"
  | "instagram"
  | "reels"
  | "trend-radar"
  | "results"
  | "experiments"
  | "voice-strategy"
  | "budget";

export type PersonalGrowthArtifactState = "missing" | "present" | "unreadable";
export type PersonalGrowthTimelineStatus =
  | "due"
  | "upcoming"
  | "overdue"
  | "completed"
  | "skipped"
  | "rescheduled";

export interface PersonalGrowthTimelineItem {
  occurrenceId: string;
  lane: "okraj" | "bbarak";
  originalDate: string;
  scheduledDate: string;
  status: PersonalGrowthTimelineStatus;
  source: "recurrence" | "reschedule";
  finalUrl: string | null;
  reason: string | null;
}

export interface PersonalGrowthThreadsSuggestionView {
  suggestionId: string;
  text: string;
  language: "cs" | "en";
  characterCount: number;
  topicTag: string | null;
  sourceLane: string;
  personalPillar: string;
  provenanceRefs: string[];
  selectionReason: string;
  conversationPurpose: string;
  goviralSignalId: string | null;
  recentSimilarity: number;
  similarityVerdict: "pass";
  experimentId: string | null;
}

export interface PersonalGrowthThreadDecisionView {
  suggestionId: string;
  action: "approved" | "rejected" | "snoozed" | "posted";
  reason: string | null;
  postUrl: string | null;
  recordedAt: string;
}

export interface PersonalGrowthInstagramView {
  state: PersonalGrowthArtifactState;
  recommendationDate: string | null;
  actionType: string | null;
  format: string | null;
  pillar: string | null;
  goal: string | null;
  dueWindow: string | null;
  collaborator: string | null;
  assetChecklist: string[];
  distributionChecklist: string[];
  storiesSupport: string[];
  projectedPersonalRatio: number | null;
  goviralSignalId: string | null;
  experimentId: string | null;
  reason: string | null;
  noPostReason: string | null;
  manualVentureReferenceId: string | null;
}

export interface PersonalGrowthReelView {
  series: string;
  concept: string;
  purpose: string;
  durationBandSeconds: [number, number] | null;
  assetChecklist: string[];
  shotChecklist: string[];
  language: "cs" | "en" | null;
  subtitleLanguages: Array<"cs" | "en">;
  collaborator: string | null;
  trendExpiresAt: string | null;
  considerTrialReel: boolean;
  experimentId: string | null;
  state: "recommended" | "inventory" | "unavailable";
}

export interface PersonalGrowthTrendView {
  opportunityId: string;
  disposition: "use" | "watch" | "ignore";
  observedAt: string;
  expiresAt: string;
  evidenceRefs: string[];
  sourceRefs: string[];
  relevance: number;
  pillar: string;
  format: string;
  fit: string;
  risk: string;
  overload: string;
  status: string;
  outcome: string;
}

export interface PersonalGrowthManualReferenceView {
  referenceId: string;
  sourceProject: string;
  publicItemId: string;
  publicUrl: string;
  ownerAuthored: boolean;
  personalConnection: string | null;
  ownerCommentaryNote: string;
  requestedAction: "WATCH" | "RESHARE_WITH_PERSONAL_NOTE" | "SKIP";
  personalRatio: number | null;
  recordedAt: string;
  expiresAt: string;
  verdict: "eligible" | "expired";
}

export interface AdminPersonalGrowthSnapshot extends PersonalGrowthAdminInsightsSnapshot {
  generatedAt: string;
  today: {
    pragueDate: string;
    briefState: PersonalGrowthArtifactState;
    briefStatus: string;
    nextAction: {
      title: string;
      why: string;
      dueWindow: string | null;
      provenance: "owner" | "goviral";
    };
    due: PersonalGrowthTimelineItem[];
    overdueCount: number;
    warnings: string[];
    budgetDegradation: "healthy" | "reduced" | "low" | "critical" | "exhausted";
    personalRatio: number;
    ownerWritesAllContent: true;
  };
  timeline: {
    rangeStart: string;
    rangeEnd: string;
    anchors: Array<{ lane: "okraj" | "bbarak"; date: string; intervalDays: 10 | 3 }>;
    occurrences: PersonalGrowthTimelineItem[];
    rhythmOpportunities: Array<{
      id: string;
      date: string;
      kind: "personal-photo" | "story" | "reel";
      reason: string;
    }>;
    warnings: string[];
  };
  threads: {
    state: PersonalGrowthArtifactState;
    recommendationDate: string | null;
    decision: "RECOMMEND" | "NO_POST" | "HELD" | "unavailable";
    noPostReason: string | null;
    primary: PersonalGrowthThreadsSuggestionView | null;
    alternatives: PersonalGrowthThreadsSuggestionView[];
    conversationStatus: "available" | "unavailable";
    conversationOpportunities: Array<{
      opportunityId: string;
      provider: string;
      publicUrl: string;
      observedAt: string;
      expiresAt: string;
      purpose: string;
    }>;
    decisions: PersonalGrowthThreadDecisionView[];
  };
  instagram: PersonalGrowthInstagramView;
  reels: PersonalGrowthReelView[];
  trends: {
    state: PersonalGrowthArtifactState;
    packetId: string | null;
    generatedAt: string | null;
    expiresAt: string | null;
    sourceHealth: string;
    quota: string;
    opportunities: PersonalGrowthTrendView[];
    workspaceHref: "/admin?venture=goviral";
  };
  manualReferences: PersonalGrowthManualReferenceView[];
  overview: {
    nextOkrajDeadline: string | null;
    nextBbarakDeadline: string | null;
    latestGoViral: PersonalGrowthTrendView | null;
    monthlyCapUsd: 20;
    monthlySpendUsd: number | null;
    monthlyHeadroomUsd: number | null;
  };
  unavailable: {
    optionalInputs: number;
    conversations: number;
  };
  unreadable: {
    config: number;
    history: number;
    briefs: number;
    threads: number;
    instagram: number;
    trends: number;
    manualReferences: number;
    decisions: number;
    total: number;
  };
}

type JsonRead =
  | { state: "missing" }
  | { state: "unreadable" }
  | { state: "present"; value: unknown };

interface ParsedHistoryEvent {
  eventId: string;
  lane: "okraj" | "bbarak";
  occurrenceDate: string;
  action: "completed" | "skipped" | "rescheduled";
  recordedAt: string;
  rescheduledTo: string | null;
  finalUrl: string | null;
  articleUrl: string | null;
  collaborationUrl: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const BLOCKED_REFERENCE = /(?:kvorum|portfolio(?:-item|-bridge|-content)?|social-distribution|campaign-|door-money|booksofhistory|tehdejsi|dneskai|mma-files|fightaiq|contest-radar|monetization)/iu;
const REEL_SERIES: Readonly<Record<string, { concept: string; purpose: string }>> = {
  "rapovej-moment": {
    concept: "A real memory or observation tied to an owner-confirmed place, object or photograph.",
    purpose: "Connect the owner's hip-hop history to the present without inventing an experience."
  },
  "behind-the-page": {
    concept: "The personal context around a finished owner-authored publication.",
    purpose: "Show the work around a published page without rewriting its text."
  },
  "life-between-projects": {
    concept: "An ordinary visual diary from Prague, coding, writing, training, books or travel.",
    purpose: "Keep the account centred on the owner's real life between formal releases."
  },
  "trend-met-memory": {
    concept: "A live accepted GoVIRAL signal connected to an owner-approved memory.",
    purpose: "Use trend intelligence without letting it invent or own the final story."
  },
  "english-rapovej-denik": {
    concept: "A bounded English Rapovej deník experiment with optional Czech subtitles.",
    purpose: "Test the separate English lane only after its private profile exists."
  }
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function string(value: unknown, maximum = 1_000): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum ? value : null;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value as T[number] : null;
}

function stringArray(value: unknown, maximum = 20): string[] | null {
  if (!Array.isArray(value) || value.length > maximum) return null;
  const parsed = value.map((entry) => string(entry, 500));
  return parsed.every((entry): entry is string => entry !== null) ? parsed : null;
}

function finite(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function safeUrl(value: unknown): string | null {
  const candidate = string(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function safeReference(value: unknown): string | null {
  const candidate = string(value, 500);
  return candidate && !BLOCKED_REFERENCE.test(candidate) ? candidate : null;
}

function date(value: unknown): string | null {
  const candidate = string(value, 10);
  return candidate && DATE.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00.000Z`))
    ? candidate
    : null;
}

function dateTime(value: unknown): string | null {
  const candidate = string(value, 40);
  return candidate && DATE_TIME.test(candidate) && !Number.isNaN(Date.parse(candidate)) ? candidate : null;
}

function addDays(value: string, amount: number): string {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function dayDifference(left: string, right: string): number {
  return Math.round((Date.parse(`${left}T00:00:00.000Z`) - Date.parse(`${right}T00:00:00.000Z`)) / 86_400_000);
}

function pragueDate(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function readJson(absolutePath: string): Promise<JsonRead> {
  try {
    return { state: "present", value: JSON.parse(await readFile(absolutePath, "utf8")) as unknown };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { state: "missing" }
      : { state: "unreadable" };
  }
}

async function jsonDirectory(absolutePath: string): Promise<{ files: JsonRead[]; directoryUnreadable: number }> {
  let names: string[];
  try {
    names = (await readdir(absolutePath, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { files: [], directoryUnreadable: 0 }
      : { files: [], directoryUnreadable: 1 };
  }
  return { files: await Promise.all(names.map((name) => readJson(path.join(absolutePath, name)))), directoryUnreadable: 0 };
}

function parsePlanner(value: unknown): {
  lanes: Array<{ lane: "okraj" | "bbarak"; intervalDays: 10 | 3; recurrenceAnchorDate: string }>;
} | null {
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-planner-config/1" || input.ventureId !== "personal-growth" ||
      input.timezone !== "Europe/Prague" || !Array.isArray(input.lanes) || input.lanes.length !== 2) return null;
  const lanes = input.lanes.flatMap((entry) => {
    const lane = record(entry);
    const id = enumValue(lane?.lane, ["okraj", "bbarak"] as const);
    const anchor = date(lane?.recurrenceAnchorDate);
    const interval = lane?.intervalDays;
    if (!id || !anchor || (id === "okraj" ? interval !== 10 : interval !== 3) || lane?.ownerAuthorshipRequired !== true) return [];
    return [{ lane: id, intervalDays: interval as 10 | 3, recurrenceAnchorDate: anchor }];
  });
  return lanes.length === 2 && new Set(lanes.map(({ lane }) => lane)).size === 2 ? { lanes } : null;
}

function parseFoundation(value: unknown): {
  activeMode: "default" | "buffer";
  monthlyCapUsd: 20;
  projectLive: boolean;
} | null {
  const input = record(value);
  const budget = record(input?.budget);
  const featureGates = record(input?.featureGates);
  const activeMode = enumValue(budget?.activeMode, ["default", "buffer"] as const);
  if (input?.schemaVersion !== "personal-growth-foundation/1" || input.ventureId !== "personal-growth" ||
      input.visibility !== "owner-only" || budget?.monthlyAllInUsd !== 20 || !activeMode ||
      typeof featureGates?.projectLive !== "boolean" || featureGates?.publishing !== false) return null;
  return { activeMode, monthlyCapUsd: 20, projectLive: featureGates.projectLive };
}

function parseHistory(value: unknown): { events: ParsedHistoryEvent[]; unreadable: number } | null {
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-history/1" || !Array.isArray(input.events) || input.events.length > 500) return null;
  const events: ParsedHistoryEvent[] = [];
  let unreadable = 0;
  for (const entry of input.events) {
    const event = record(entry);
    const eventId = string(event?.eventId, 40);
    const lane = enumValue(event?.lane, ["okraj", "bbarak"] as const);
    const occurrenceDate = date(event?.occurrenceDate);
    const action = enumValue(event?.action, ["completed", "skipped", "rescheduled"] as const);
    const recordedAt = dateTime(event?.recordedAt);
    const rescheduledTo = event?.rescheduledTo === null ? null : date(event?.rescheduledTo);
    const finalUrl = event?.finalUrl === null ? null : safeUrl(event?.finalUrl);
    const articleUrl = event?.articleUrl === null ? null : safeUrl(event?.articleUrl);
    const collaborationUrl = event?.collaborationUrl === null ? null : safeUrl(event?.collaborationUrl);
    if (!eventId?.match(/^pg-event-[a-f0-9]{16}$/u) || !lane || !occurrenceDate || !action || !recordedAt ||
        ((action === "rescheduled") !== (rescheduledTo !== null)) ||
        (event?.finalUrl !== null && !finalUrl) || (event?.articleUrl !== null && !articleUrl) ||
        (event?.collaborationUrl !== null && !collaborationUrl)) {
      unreadable += 1;
      continue;
    }
    events.push({ eventId, lane, occurrenceDate, action, recordedAt, rescheduledTo, finalUrl, articleUrl, collaborationUrl });
  }
  return { events, unreadable };
}

function latestEvent(events: readonly ParsedHistoryEvent[], lane: "okraj" | "bbarak", occurrenceDate: string): ParsedHistoryEvent | null {
  return events
    .filter((event) => event.lane === lane && event.occurrenceDate === occurrenceDate)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .at(-1) ?? null;
}

function timeline(input: {
  planner: NonNullable<ReturnType<typeof parsePlanner>>;
  events: readonly ParsedHistoryEvent[];
  today: string;
}): PersonalGrowthTimelineItem[] {
  const rangeEnd = addDays(input.today, 29);
  const lookback = addDays(input.today, -30);
  return input.planner.lanes.flatMap((lane) => {
    const firstOffset = Math.ceil(dayDifference(lookback < lane.recurrenceAnchorDate ? lane.recurrenceAnchorDate : lookback, lane.recurrenceAnchorDate) / lane.intervalDays) * lane.intervalDays;
    const rows: PersonalGrowthTimelineItem[] = [];
    for (let offset = firstOffset; ; offset += lane.intervalDays) {
      const originalDate = addDays(lane.recurrenceAnchorDate, offset);
      if (originalDate > rangeEnd) break;
      const event = latestEvent(input.events, lane.lane, originalDate);
      const scheduledDate = event?.action === "rescheduled" && event.rescheduledTo ? event.rescheduledTo : originalDate;
      const status: PersonalGrowthTimelineStatus = event?.action === "completed" ? "completed"
        : event?.action === "skipped" ? "skipped"
          : event?.action === "rescheduled" && scheduledDate > input.today ? "rescheduled"
            : scheduledDate < input.today ? "overdue"
              : scheduledDate === input.today ? "due" : "upcoming";
      if (scheduledDate >= input.today || status === "overdue") {
        rows.push({
          occurrenceId: `pg-${lane.lane}-${originalDate}`,
          lane: lane.lane,
          originalDate,
          scheduledDate,
          status,
          source: event?.action === "rescheduled" ? "reschedule" : "recurrence",
          finalUrl: event?.finalUrl ?? event?.articleUrl ?? event?.collaborationUrl ?? null,
          reason: null
        });
      }
    }
    return rows;
  }).sort((left, right) => left.scheduledDate.localeCompare(right.scheduledDate) || left.lane.localeCompare(right.lane));
}

function parseThreadSuggestion(value: unknown): PersonalGrowthThreadsSuggestionView | null {
  const input = record(value);
  const suggestionId = string(input?.suggestionId, 80);
  const text = string(input?.text, 10_000);
  const language = enumValue(input?.language, ["cs", "en"] as const);
  const characterCount = finite(input?.characterCount, 1, 10_000);
  const topicTag = input?.topicTag === null ? null : string(input?.topicTag, 80);
  const sourceLane = string(input?.sourceLane, 80);
  const personalPillar = string(input?.personalPillar, 100);
  const refs = stringArray(input?.provenanceRefs, 12);
  const selectionReason = string(input?.selectionReason, 360);
  const conversationPurpose = string(input?.conversationPurpose, 240);
  const goviralSignalId = input?.goviralSignalId === null ? null : string(input?.goviralSignalId, 80);
  const recentSimilarity = finite(input?.recentSimilarity, 0, 1);
  const leakAudit = record(input?.leakAudit);
  if (!suggestionId?.match(/^pg-thread-[a-f0-9]{16}$/u) || !text || !language || characterCount === null ||
      [...text].length !== characterCount || !sourceLane || !personalPillar || !refs?.length ||
      refs.some((ref) => !safeReference(ref)) || !selectionReason || !conversationPurpose ||
      recentSimilarity === null || input?.similarityVerdict !== "pass" ||
      leakAudit?.status !== "pass" || leakAudit?.safeToPersistPublicly !== true ||
      (goviralSignalId !== null && !goviralSignalId.match(/^pg-gv-[a-f0-9]{16}$/u))) return null;
  return {
    suggestionId,
    text,
    language,
    characterCount,
    topicTag,
    sourceLane,
    personalPillar,
    provenanceRefs: refs,
    selectionReason,
    conversationPurpose,
    goviralSignalId,
    recentSimilarity,
    similarityVerdict: "pass",
    experimentId: input?.activeExperimentId === null ? null : string(input?.activeExperimentId, 120)
  };
}

function parseThreads(value: unknown): Omit<AdminPersonalGrowthSnapshot["threads"], "state" | "decisions"> | null {
  const input = record(value);
  const recommendationDate = date(input?.recommendationDate);
  const decision = enumValue(input?.decision, ["RECOMMEND", "NO_POST", "HELD"] as const);
  const primary = input?.primary === null ? null : parseThreadSuggestion(input?.primary);
  const alternatives = Array.isArray(input?.alternatives) ? input.alternatives.map(parseThreadSuggestion) : null;
  const conversationStatus = enumValue(input?.conversationStatus, ["available", "unavailable"] as const);
  const opportunities = Array.isArray(input?.conversationOpportunities) && input.conversationOpportunities.length <= 3
    ? input.conversationOpportunities.flatMap((entry) => {
      const opportunity = record(entry);
      const opportunityId = string(opportunity?.opportunityId, 80);
      const provider = string(opportunity?.provider, 80);
      const publicUrl = safeUrl(opportunity?.publicUrl);
      const observedAt = dateTime(opportunity?.observedAt);
      const expiresAt = dateTime(opportunity?.expiresAt);
      const purpose = string(opportunity?.purpose, 240);
      return opportunityId && provider && publicUrl && observedAt && expiresAt && purpose
        ? [{ opportunityId, provider, publicUrl, observedAt, expiresAt, purpose }]
        : [];
    })
    : null;
  if (input?.schemaVersion !== "personal-growth-threads-recommendation/1" || !recommendationDate || !decision ||
      (input?.primary !== null && !primary) || !alternatives || alternatives.some((item) => item === null) ||
      alternatives.length > 2 || !conversationStatus || !opportunities ||
      (conversationStatus === "available") !== (opportunities.length > 0) ||
      input?.publishingAuthorized !== false || input?.repliesAuthorized !== false) return null;
  return {
    recommendationDate,
    decision,
    noPostReason: input?.noPostReason === null ? null : string(input?.noPostReason, 100),
    primary,
    alternatives: alternatives as PersonalGrowthThreadsSuggestionView[],
    conversationStatus,
    conversationOpportunities: opportunities
  };
}

function parseInstagram(value: unknown): Omit<PersonalGrowthInstagramView, "state"> | null {
  const input = record(value);
  const recommendationDate = date(input?.recommendationDate);
  const actionType = string(input?.actionType, 80);
  const format = string(input?.format, 80);
  const reason = string(input?.reason, 360);
  const ownerSourceRefs = stringArray(input?.ownerSourceRefs, 12);
  const assetChecklist = stringArray(input?.assetChecklist, 12);
  const distributionChecklist = stringArray(input?.distributionChecklist, 12);
  const storiesSupport = stringArray(input?.storiesSupport, 8);
  if (input?.schemaVersion !== "personal-growth-instagram-recommendation/1" || !recommendationDate || !actionType ||
      !format || !reason || !ownerSourceRefs || ownerSourceRefs.some((ref) => !safeReference(ref)) || !assetChecklist ||
      !distributionChecklist || !storiesSupport || input?.ownerWritesArtifact !== true || input?.publishingAuthorized !== false) return null;
  return {
    recommendationDate,
    actionType,
    format,
    pillar: input?.pillar === null ? null : string(input?.pillar, 100),
    goal: input?.goal === null ? null : string(input?.goal, 240),
    dueWindow: input?.dueWindow === null ? null : string(input?.dueWindow, 120),
    collaborator: input?.collaborator === null ? null : string(input?.collaborator, 120),
    assetChecklist,
    distributionChecklist,
    storiesSupport,
    projectedPersonalRatio: input?.projectedPersonalRatio === null ? null : finite(input?.projectedPersonalRatio, 0, 1),
    goviralSignalId: input?.goviralSignalId === null ? null : string(input?.goviralSignalId, 80),
    experimentId: input?.activeExperimentId === null ? null : string(input?.activeExperimentId, 120),
    reason,
    noPostReason: input?.noPostReason === null ? null : string(input?.noPostReason, 120),
    manualVentureReferenceId: input?.manualVentureReferenceId === null ? null : string(input?.manualVentureReferenceId, 80)
  };
}

function parseRecommendedReel(value: unknown): PersonalGrowthReelView | null {
  const input = record(value);
  const series = string(input?.series, 80);
  const concept = string(input?.concept, 600);
  const purpose = string(input?.purpose, 360);
  const range = Array.isArray(input?.durationBandSeconds) && input.durationBandSeconds.length === 2
    ? input.durationBandSeconds.map((item) => finite(item, 1, 300))
    : null;
  const assetChecklist = stringArray(input?.assetChecklist, 12);
  const shotChecklist = stringArray(input?.shotChecklist, 12);
  const language = enumValue(input?.language, ["cs", "en"] as const);
  const subtitleLanguages = Array.isArray(input?.subtitleLanguages)
    ? input.subtitleLanguages.map((item) => enumValue(item, ["cs", "en"] as const)) : null;
  if (!series || !concept || !purpose || !range || range.some((item) => item === null) || range[1]! < range[0]! ||
      !assetChecklist || !shotChecklist || !language || !subtitleLanguages || subtitleLanguages.some((item) => item === null)) return null;
  return {
    series,
    concept,
    purpose,
    durationBandSeconds: [range[0]!, range[1]!],
    assetChecklist,
    shotChecklist,
    language,
    subtitleLanguages: subtitleLanguages as Array<"cs" | "en">,
    collaborator: input?.collaborator === null ? null : string(input?.collaborator, 120),
    trendExpiresAt: input?.trendExpiresAt === null ? null : dateTime(input?.trendExpiresAt),
    considerTrialReel: input?.considerTrialReel === true,
    experimentId: input?.experimentId === null ? null : string(input?.experimentId, 120),
    state: "recommended"
  };
}

function parseTrend(value: unknown, generatedAt: string): PersonalGrowthTrendView | null {
  const input = record(value);
  const opportunityId = string(input?.opportunityId, 80);
  const disposition = enumValue(input?.disposition, ["use", "watch", "ignore"] as const);
  const expiresAt = dateTime(input?.expiresAt);
  const evidenceRefs = stringArray(input?.evidenceRefs, 8);
  const sourceRefs = stringArray(input?.sourceRefs, 8);
  const relevance = finite(input?.relevance, 0, 1);
  const pillar = string(input?.pillar, 80);
  const format = string(input?.format, 80);
  const fit = string(input?.fit, 40);
  const risk = string(input?.risk, 40);
  const overload = string(input?.overload, 40);
  const status = string(input?.status, 40);
  const outcome = string(input?.outcome, 40);
  if (!opportunityId?.match(/^pg-gv-[a-f0-9]{16}$/u) || !disposition || !expiresAt || !evidenceRefs?.length ||
      evidenceRefs.some((ref) => !safeReference(ref)) || !sourceRefs?.length || sourceRefs.some((ref) => !safeReference(ref)) ||
      relevance === null || !pillar || !format || !fit || !risk || !overload || !status || !outcome) return null;
  return { opportunityId, disposition, observedAt: generatedAt, expiresAt, evidenceRefs, sourceRefs, relevance, pillar, format, fit, risk, overload, status, outcome };
}

function parseTrends(value: unknown): Omit<AdminPersonalGrowthSnapshot["trends"], "state" | "workspaceHref"> | null {
  const input = record(value);
  const packetId = string(input?.packetId, 80);
  const generatedAt = dateTime(input?.generatedAt);
  const expiresAt = dateTime(input?.expiresAt);
  const sourceHealth = string(input?.sourceHealth, 40);
  const quota = string(input?.quota, 40);
  const refs = [input?.sourceRegistryRef, input?.profileRef];
  const opportunities = Array.isArray(input?.opportunities) && generatedAt ? input.opportunities.map((item) => parseTrend(item, generatedAt)) : null;
  if (input?.schemaVersion !== "personal-growth-goviral-packet/1" || !packetId || !generatedAt || !expiresAt ||
      !sourceHealth || !quota || refs.some((ref) => !safeReference(ref)) || !opportunities ||
      opportunities.some((item) => item === null) || opportunities.length > 3 || input?.reusedWeeklyBrief !== true ||
      input?.providerRerun !== false) return null;
  return { packetId, generatedAt, expiresAt, sourceHealth, quota, opportunities: opportunities as PersonalGrowthTrendView[] };
}

function parseManualReference(value: unknown, now: Date): PersonalGrowthManualReferenceView | null {
  const input = record(value);
  const referenceId = string(input?.referenceId, 80);
  const sourceProject = string(input?.sourceProject, 80);
  const publicItemId = string(input?.publicItemId, 160);
  const publicUrl = safeUrl(input?.publicUrl);
  const personalConnection = input?.personalConnection === null ? null : string(input?.personalConnection, 360);
  const ownerCommentaryNote = string(input?.ownerCommentaryNote, 600);
  const requestedAction = enumValue(input?.requestedAction, ["WATCH", "RESHARE_WITH_PERSONAL_NOTE", "SKIP"] as const);
  const personal = finite(input?.personalItemsInRollingWindow, 0);
  const venture = finite(input?.ventureItemsInRollingWindow, 0);
  const recordedAt = dateTime(input?.recordedAt);
  const expiresAt = dateTime(input?.expiresAt);
  const provenance = safeReference(input?.ownerProvenanceRef);
  if (input?.schemaVersion !== "owner-manual-reference/1" || !referenceId?.match(/^pg-manual-ref-[a-f0-9]{16}$/u) ||
      !sourceProject || BLOCKED_REFERENCE.test(sourceProject) || !publicItemId || !publicUrl || typeof input?.ownerAuthored !== "boolean" ||
      (!input.ownerAuthored && !personalConnection) || !ownerCommentaryNote || input?.publicationVerifiedByOwner !== true ||
      input?.ownerManuallySupplied !== true || personal === null || venture === null || !requestedAction || !recordedAt || !expiresAt || !provenance) return null;
  const total = personal + venture;
  return {
    referenceId,
    sourceProject,
    publicItemId,
    publicUrl,
    ownerAuthored: input.ownerAuthored,
    personalConnection,
    ownerCommentaryNote,
    requestedAction,
    personalRatio: total === 0 ? null : personal / total,
    recordedAt,
    expiresAt,
    verdict: Date.parse(expiresAt) <= now.getTime() ? "expired" : "eligible"
  };
}

function parseDecisions(value: unknown): { items: PersonalGrowthThreadDecisionView[]; unreadable: number } | null {
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-thread-decisions/1" || !Array.isArray(input.decisions) || input.decisions.length > 500) return null;
  const items: PersonalGrowthThreadDecisionView[] = [];
  let unreadable = 0;
  for (const entry of input.decisions) {
    const decision = record(entry);
    const suggestionId = string(decision?.suggestionId, 80);
    const action = enumValue(decision?.action, ["approved", "rejected", "snoozed", "posted"] as const);
    const reason = decision?.reason === null ? null : string(decision?.reason, 500);
    const postUrl = decision?.postUrl === null ? null : safeUrl(decision?.postUrl);
    const recordedAt = dateTime(decision?.recordedAt);
    if (!suggestionId?.match(/^pg-thread-[a-f0-9]{16}$/u) || !action || !recordedAt ||
        ((action === "posted") !== (postUrl !== null)) || (decision?.reason !== null && !reason)) {
      unreadable += 1;
      continue;
    }
    items.push({ suggestionId, action, reason, postUrl, recordedAt });
  }
  return { items, unreadable };
}

function latestPresent<T>(items: Array<{ read: JsonRead; parsed: T | null; date: string | null }>): { value: T | null; state: PersonalGrowthArtifactState; unreadable: number } {
  const unreadable = items.filter(({ read, parsed }) => read.state === "unreadable" || (read.state === "present" && parsed === null)).length;
  const valid = items.filter((item): item is { read: JsonRead; parsed: T; date: string } => item.parsed !== null && item.date !== null)
    .sort((left, right) => right.date.localeCompare(left.date));
  return {
    value: valid[0]?.parsed ?? null,
    state: valid.length ? "present" : unreadable ? "unreadable" : "missing",
    unreadable
  };
}

export async function readAdminPersonalGrowth(
  explicitRoot?: string,
  now = new Date()
): Promise<AdminPersonalGrowthSnapshot> {
  const root = explicitRoot ?? process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  const stateRoot = path.join(root, "state", "ventures", "personal-growth");
  const today = pragueDate(now);
  const [plannerRead, foundationRead, contentRead, historyRead, briefFiles, threadFiles, instagramFiles, trendsRead, referencesFiles, decisionsRead] = await Promise.all([
    readJson(path.join(root, "config", "personal-growth-planner.json")),
    readJson(path.join(root, "config", "personal-growth.json")),
    readJson(path.join(root, "config", "personal-growth-content.json")),
    readJson(path.join(stateRoot, "history.json")),
    jsonDirectory(path.join(stateRoot, "briefs")),
    jsonDirectory(path.join(stateRoot, "recommendations", "threads")),
    jsonDirectory(path.join(stateRoot, "recommendations", "instagram")),
    readJson(path.join(stateRoot, "intelligence", "current.json")),
    jsonDirectory(path.join(stateRoot, "manual-references")),
    readJson(path.join(stateRoot, "admin", "thread-decisions.json"))
  ]);

  const planner = plannerRead.state === "present" ? parsePlanner(plannerRead.value) : null;
  const foundation = foundationRead.state === "present" ? parseFoundation(foundationRead.value) : null;
  const content = contentRead.state === "present" ? record(contentRead.value) : null;
  const historyParsed = historyRead.state === "present" ? parseHistory(historyRead.value) : historyRead.state === "missing" ? { events: [], unreadable: 0 } : null;
  const events = historyParsed?.events ?? [];
  const occurrences = planner ? timeline({ planner, events, today }) : [];
  const insightsPromise = readPersonalGrowthAdminInsights({ root, now, timeline: occurrences });

  const briefs = latestPresent(briefFiles.files.map((read) => {
    const input = read.state === "present" ? record(read.value) : null;
    const target = date(input?.targetPragueDate);
    const room = record(input?.room);
    const authority = record(input?.authority);
    const parsed = input?.schemaVersion === "personal-growth-daily-brief/1" && target && room?.kind === "pg-desk" &&
      string(room.result, 40) && authority?.ownerWritesAllContent === true && authority?.publishingAuthorized === false
      ? { targetDate: target, status: string(room.result, 40)!, warnings: stringArray(input.warnings, 20) ?? [] }
      : null;
    return { read, parsed, date: target };
  }));
  const threadsLatest = latestPresent(threadFiles.files.map((read) => {
    const parsed = read.state === "present" ? parseThreads(read.value) : null;
    return { read, parsed, date: parsed?.recommendationDate ?? null };
  }));
  const instagramLatest = latestPresent(instagramFiles.files.map((read) => {
    const parsed = read.state === "present" ? parseInstagram(read.value) : null;
    return { read, parsed, date: parsed?.recommendationDate ?? null };
  }));
  const trends = trendsRead.state === "present" ? parseTrends(trendsRead.value) : null;
  const manualReferences: PersonalGrowthManualReferenceView[] = [];
  let manualReferenceUnreadable = referencesFiles.directoryUnreadable;
  for (const read of referencesFiles.files) {
    const parsed = read.state === "present" ? parseManualReference(read.value, now) : null;
    if (parsed) manualReferences.push(parsed);
    else manualReferenceUnreadable += 1;
  }
  manualReferences.sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  const decisions = decisionsRead.state === "present" ? parseDecisions(decisionsRead.value) : decisionsRead.state === "missing" ? { items: [], unreadable: 0 } : null;

  const activeOccurrences = occurrences.filter(({ status }) => ["due", "overdue", "upcoming", "rescheduled"].includes(status));
  const due = activeOccurrences.filter(({ status }) => status === "due" || status === "overdue");
  const firstDue = due[0] ?? activeOccurrences[0] ?? null;
  const primaryThread = threadsLatest.value?.primary ?? null;
  const instagram = instagramLatest.value
    ? { state: instagramLatest.state, ...instagramLatest.value }
    : {
      state: instagramLatest.state,
      recommendationDate: null,
      actionType: null,
      format: null,
      pillar: null,
      goal: null,
      dueWindow: null,
      collaborator: null,
      assetChecklist: [],
      distributionChecklist: [],
      storiesSupport: [],
      projectedPersonalRatio: null,
      goviralSignalId: null,
      experimentId: null,
      reason: null,
      noPostReason: null,
      manualVentureReferenceId: null
    };
  const recommendedReel = instagramFiles.files.flatMap((read) => {
    const input = read.state === "present" ? record(read.value) : null;
    return input?.reel === null || input?.reel === undefined ? [] : [parseRecommendedReel(input.reel)];
  }).filter((item): item is PersonalGrowthReelView => item !== null).at(-1) ?? null;
  const reelFormats = content?.schemaVersion === "personal-growth-content-config/1" ? stringArray(content.reelFormats, 5) : null;
  const reels = (reelFormats ?? Object.keys(REEL_SERIES)).map((series) => {
    if (recommendedReel?.series === series) return recommendedReel;
    const copy = REEL_SERIES[series];
    return {
      series,
      concept: copy?.concept ?? "Configured Personal Growth Reel series.",
      purpose: copy?.purpose ?? "Owner-grounded recurring visual format.",
      durationBandSeconds: null,
      assetChecklist: [],
      shotChecklist: [],
      language: null,
      subtitleLanguages: [],
      collaborator: null,
      trendExpiresAt: null,
      considerTrialReel: false,
      experimentId: null,
      state: series === "english-rapovej-denik" && content?.englishProfileAvailable !== true ? "unavailable" as const : "inventory" as const
    };
  });

  const insights = await insightsPromise;
  const spendUsd = insights.budget.monthlySpendUsd;
  const personalRatio = instagram.projectedPersonalRatio ?? 0.85;
  const warnings = [
    ...(new Set(activeOccurrences.map(({ scheduledDate }) => scheduledDate)).size < activeOccurrences.length ? ["collision"] : []),
    ...(activeOccurrences.some(({ status }) => status === "overdue") ? ["overdue"] : []),
    ...(personalRatio < 0.85 ? ["personal-content-below-85-percent"] : [])
  ];
  const unreadable = {
    config: Number(plannerRead.state === "unreadable" || (plannerRead.state === "present" && !planner)) +
      Number(foundationRead.state === "unreadable" || (foundationRead.state === "present" && !foundation)) +
      Number(contentRead.state === "unreadable" || (contentRead.state === "present" && content?.schemaVersion !== "personal-growth-content-config/1")),
    history: historyRead.state === "unreadable" || !historyParsed ? 1 : historyParsed.unreadable,
    briefs: briefs.unreadable + briefFiles.directoryUnreadable,
    threads: threadsLatest.unreadable + threadFiles.directoryUnreadable,
    instagram: instagramLatest.unreadable + instagramFiles.directoryUnreadable,
    trends: Number(trendsRead.state === "unreadable" || (trendsRead.state === "present" && !trends)),
    manualReferences: manualReferenceUnreadable,
    decisions: decisionsRead.state === "unreadable" || !decisions ? 1 : decisions.unreadable,
    total: 0
  };
  unreadable.total = Object.entries(unreadable).filter(([key]) => key !== "total").reduce((sum, [, count]) => sum + count, 0) + insights.insightsUnreadable.total;
  const trendItems = trends?.opportunities ?? [];
  const nextByLane = (lane: "okraj" | "bbarak") => activeOccurrences.find((item) => item.lane === lane)?.scheduledDate ?? null;
  const okrajAnchor = planner?.lanes.find(({ lane }) => lane === "okraj")?.recurrenceAnchorDate ?? today;
  const cycleOffset = Math.floor(dayDifference(today, okrajAnchor) / 10) * 10;
  const firstCycle = addDays(okrajAnchor, cycleOffset);
  const rhythmOpportunities: AdminPersonalGrowthSnapshot["timeline"]["rhythmOpportunities"] = Array.from({ length: 4 }, (_, cycle) => addDays(firstCycle, cycle * 10))
    .flatMap((cycleStart) => [
      {
        id: `pg-rhythm-reel-${addDays(cycleStart, 2)}`,
        date: addDays(cycleStart, 2),
        kind: "reel" as const,
        reason: "First owner-grounded Reel opportunity in the ten-day rhythm."
      },
      {
        id: `pg-rhythm-photo-${addDays(cycleStart, 4)}`,
        date: addDays(cycleStart, 4),
        kind: "personal-photo" as const,
        reason: "Personal photo or photo-dump space between major authored items."
      },
      {
        id: `pg-rhythm-reel-${addDays(cycleStart, 7)}`,
        date: addDays(cycleStart, 7),
        kind: "reel" as const,
        reason: "Second optional Reel window; NO_POST remains valid."
      }
    ])
    .filter(({ date: opportunityDate }) => opportunityDate >= today && opportunityDate <= addDays(today, 29));
  for (const occurrence of occurrences.filter(({ lane }) => lane === "bbarak")) {
    rhythmOpportunities.push({
      id: `pg-rhythm-story-${occurrence.originalDate}`,
      date: occurrence.scheduledDate,
      kind: "story",
      reason: "Optional Story support for a finished owner-authored BBARAK article."
    });
  }
  rhythmOpportunities.sort((left, right) => left.date.localeCompare(right.date) || left.kind.localeCompare(right.kind));
  const nextAction = primaryThread
    ? {
      title: "Review today's primary Threads suggestion",
      why: primaryThread.selectionReason,
      dueWindow: threadsLatest.value?.recommendationDate ?? null,
      provenance: primaryThread.goviralSignalId ? "goviral" as const : "owner" as const
    }
    : firstDue
      ? {
        title: firstDue.lane === "okraj" ? "Finish the owner-authored OKRAJ step" : "Finish the owner-authored BBARAK step",
        why: firstDue.status === "overdue" ? "The recorded recurrence is overdue." : "The recorded recurrence is next in the owner's timeline.",
        dueWindow: firstDue.scheduledDate,
        provenance: "owner" as const
      }
      : {
        title: "Review the next Personal Growth window",
        why: foundation?.projectLive === false ? "The project is held by authority." : "No owner-grounded action is due today.",
        dueWindow: null,
        provenance: "owner" as const
      };

  return {
    ...insights,
    generatedAt: now.toISOString(),
    today: {
      pragueDate: today,
      briefState: briefs.state,
      briefStatus: briefs.value?.status ?? "unavailable",
      nextAction,
      due,
      overdueCount: activeOccurrences.filter(({ status }) => status === "overdue").length,
      warnings: [...new Set([...(briefs.value?.warnings ?? []), ...warnings])],
      budgetDegradation: foundation?.projectLive === false ? "critical" : insights.budget.degradation,
      personalRatio,
      ownerWritesAllContent: true
    },
    timeline: {
      rangeStart: today,
      rangeEnd: addDays(today, 29),
      anchors: planner?.lanes.map(({ lane, recurrenceAnchorDate, intervalDays }) => ({ lane, date: recurrenceAnchorDate, intervalDays })) ?? [],
      occurrences,
      rhythmOpportunities,
      warnings
    },
    threads: threadsLatest.value
      ? { state: threadsLatest.state, ...threadsLatest.value, decisions: decisions?.items ?? [] }
      : {
        state: threadsLatest.state,
        recommendationDate: null,
        decision: "unavailable",
        noPostReason: "No readable recommendation is recorded.",
        primary: null,
        alternatives: [],
        conversationStatus: "unavailable",
        conversationOpportunities: [],
        decisions: decisions?.items ?? []
      },
    instagram,
    reels,
    trends: trends
      ? { state: "present", ...trends, workspaceHref: "/admin?venture=goviral" }
      : {
        state: trendsRead.state,
        packetId: null,
        generatedAt: null,
        expiresAt: null,
        sourceHealth: "unavailable",
        quota: "unknown",
        opportunities: [],
        workspaceHref: "/admin?venture=goviral"
      },
    manualReferences,
    overview: {
      nextOkrajDeadline: nextByLane("okraj"),
      nextBbarakDeadline: nextByLane("bbarak"),
      latestGoViral: trendItems.find(({ status, disposition }) => status === "accepted" && disposition === "use")
        ?? trendItems.find(({ status }) => status === "accepted")
        ?? null,
      monthlyCapUsd: 20,
      monthlySpendUsd: spendUsd,
      monthlyHeadroomUsd: insights.budget.remainingUsd
    },
    unavailable: {
      optionalInputs: Number(!trends) + Number(manualReferences.length === 0),
      conversations: threadsLatest.value?.conversationStatus === "available" ? 0 : 1
    },
    unreadable
  };
}
