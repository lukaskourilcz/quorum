import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const TOKEN_ENV = "BOARDLESSAI_GITHUB_TOKEN";
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const SUGGESTION_ID = /^pg-thread-[a-f0-9]{16}$/u;
const RESULT_ID = /^pg-result-[a-f0-9]{16}$/u;
const EXPERIMENT_ID = /^pg-exp-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const BLOCKED = /(?:kvorum|portfolio(?:-item|-bridge|-content)?|social-distribution|campaign-|door-money|booksofhistory|tehdejsi|dneskai|mma-files|fightaiq|contest-radar|monetization)/iu;
const PRIVATE_KEY = /(?:manuscript|sourceText|chunkText|embedding|rawPrompt|rawResponse|unpublishedText)/iu;
const PILLARS = [
  "life-lifestyle", "writing-publishing", "hip-hop", "rapovej-denik", "travel-places-lived", "prague",
  "software-products", "boardlessai-behind-scenes", "fitness-discipline-muay-thai", "books-reading", "clothing-personal-style"
] as const;
const METRICS = [
  "followers", "net_follower_growth", "views", "reach", "non_follower_reach", "profile_views", "follows", "likes",
  "comments", "replies", "reposts", "quotes", "shares", "saves", "watch_time_ms", "average_watch_time_ms", "early_exit_count",
  "non_follower_reach_ratio", "profile_view_to_follow_rate", "saves_per_1000_reach", "shares_per_1000_reach", "early_exit_rate",
  "replies_per_1000_views", "reposts_quotes_per_1000_views"
] as const;
const pendingWrites = new Map<string, Promise<unknown>>();

export type PersonalGrowthAdminAction =
  | {
    type: "anchor";
    lane: "okraj" | "bbarak";
    date: string;
    reason: string;
  }
  | {
    type: "timeline";
    lane: "okraj" | "bbarak";
    occurrenceDate: string;
    operation: "completed" | "skipped" | "rescheduled";
    reason: string;
    rescheduledTo: string | null;
    finalUrl: string | null;
    collaborationUrl: string | null;
  }
  | {
    type: "thread";
    suggestionId: string;
    operation: "approved" | "rejected" | "snoozed" | "posted";
    reason: string | null;
    postUrl: string | null;
  }
  | {
    type: "result-create";
    platform: "instagram" | "threads";
    nativePostId: string;
    url: string;
    publishedAt: string;
    format: "text" | "photo" | "photo-dump" | "carousel" | "reel" | "story" | "publication-distribution";
    language: "cs" | "en";
    personalPillar: typeof PILLARS[number];
    contentOrigin: "owner-private" | "owner-authored-publication" | "goviral-assisted" | "owner-manual-venture-reference" | "owner-current-life";
    collaborator: string | null;
    publicationRelation: "okraj" | "bbarak" | null;
    reelSeries: "rapovej-moment" | "behind-the-page" | "life-between-projects" | "trend-met-memory" | "english-rapovej-denik" | null;
    goviralSignalId: string | null;
    manualReference: {
      sourceProject: string;
      publicItemId: string;
      publicUrl: string;
      ownerAuthored: boolean;
      personalConnection: string | null;
      ownerCommentaryNote: string;
    } | null;
    experimentId: string | null;
    ownerEvidenceRef: string;
    ownerRating: number | null;
    ownerNote: string | null;
  }
  | {
    type: "result-correction";
    resultId: string;
    reason: string;
    evidenceRef: string;
    ownerRating: number | null;
    ownerNote: string | null;
  }
  | {
    type: "experiment-create";
    changedVariable: "trial-reel" | "language" | "photo-format" | "goviral-opening" | "threads-topic-tag" | "timing-window" | "manual-venture-reference";
    hypothesis: string;
    primaryMetric: typeof METRICS[number];
    secondaryGuardrail: string;
    startDate: string;
    minimumSample: number;
    evaluationWindowDays: number;
  }
  | {
    type: "experiment-state";
    experimentId: string;
    operation: "activate" | "pause" | "review" | "stop";
    note: string;
  }
  | {
    type: "experiment-verdict";
    experimentId: string;
    verdict: "KEEP" | "ITERATE" | "STOP" | "INSUFFICIENT_DATA";
    note: string;
  }
  | {
    type: "strategy-pillar";
    pillar: typeof PILLARS[number];
    status: "enabled" | "paused";
    weight: number;
    vetoes: string[];
    reason: string;
  }
  | {
    type: "strategy-policy";
    personalFeedMinimum: number;
    ventureLedMaximum: number;
    ventureStoriesPerSevenDaysMaximum: number;
    sameVentureCooldownDays: number;
    reason: string;
  }
  | {
    type: "strategy-settings";
    defaultLanguage: "cs" | "en";
    platformsUsed: Array<"instagram" | "threads">;
    reason: string;
  }
  | {
    type: "budget-mode";
    mode: "default" | "buffer";
    reason: string;
  }
  | {
    type: "capability-disable";
    capability: "projectLive" | "paidSynthesis" | "insightsIngestion" | "instagramInsights" | "threadsInsights" | "threadsSearch" | "providerLive" | "tokenRefresh" | "bufferQueue";
    reason: string;
  };

export type PersonalGrowthPersistenceCode =
  | "CONFLICT"
  | "INVALID"
  | "CORRUPT"
  | "UNCONFIGURED"
  | "REFUSED"
  | "REMOTE";

export class PersonalGrowthAdminStoreError extends Error {
  constructor(readonly code: PersonalGrowthPersistenceCode, message: string) {
    super(message);
  }
}

interface Persisted<T> {
  value: T;
  commit: string | null;
  idempotent: boolean;
  persistence: "filesystem" | "github";
}

type PersistMutation<T> = (current: unknown | null) => { value: T; idempotent: boolean };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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

function cleanText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maximum && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text) ? text : null;
}

function validDate(value: unknown): string | null {
  const text = cleanText(value, 10);
  return text && DATE.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00.000Z`)) ? text : null;
}

function validDateTime(value: unknown): string | null {
  const text = cleanText(value, 40);
  return text && DATE_TIME.test(text) && !Number.isNaN(Date.parse(text)) ? text : null;
}

function finite(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  const parsed = finite(value, minimum, maximum);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T): T[number] | null {
  return typeof value === "string" && values.includes(value) ? value as T[number] : null;
}

function nullableText(value: unknown, maximum: number): string | null | undefined {
  return value === null || value === "" ? null : cleanText(value, maximum) ?? undefined;
}

function safeEvidence(value: unknown): string | null {
  const parsed = cleanText(value, 500);
  return parsed && !BLOCKED.test(parsed) ? parsed : null;
}

function validUrl(value: unknown): string | null {
  if (value === null || value === "") return null;
  const text = cleanText(value, 500);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function lane(value: unknown): "okraj" | "bbarak" | null {
  return value === "okraj" || value === "bbarak" ? value : null;
}

export function parsePersonalGrowthAdminAction(value: unknown): PersonalGrowthAdminAction | null {
  const input = record(value);
  if (!input || typeof input.type !== "string") return null;
  if (input.type === "anchor") {
    if (!hasOnlyKeys(input, ["type", "lane", "date", "reason"])) return null;
    const parsedLane = lane(input.lane);
    const parsedDate = validDate(input.date);
    const reason = cleanText(input.reason, 500);
    return parsedLane && parsedDate && reason
      ? { type: "anchor", lane: parsedLane, date: parsedDate, reason }
      : null;
  }
  if (input.type === "timeline") {
    if (!hasOnlyKeys(input, ["type", "lane", "occurrenceDate", "operation", "reason", "rescheduledTo", "finalUrl", "collaborationUrl"])) return null;
    const parsedLane = lane(input.lane);
    const occurrenceDate = validDate(input.occurrenceDate);
    const operation = input.operation === "completed" || input.operation === "skipped" || input.operation === "rescheduled"
      ? input.operation
      : null;
    const reason = cleanText(input.reason, 500);
    const rescheduledTo = validDate(input.rescheduledTo);
    const finalUrl = validUrl(input.finalUrl);
    const collaborationUrl = validUrl(input.collaborationUrl);
    if (!parsedLane || !occurrenceDate || !operation || !reason) return null;
    if ((operation === "rescheduled") !== (rescheduledTo !== null)) return null;
    if (operation !== "completed" && (finalUrl !== null || collaborationUrl !== null)) return null;
    if (input.finalUrl !== null && input.finalUrl !== "" && finalUrl === null) return null;
    if (input.collaborationUrl !== null && input.collaborationUrl !== "" && collaborationUrl === null) return null;
    return {
      type: "timeline",
      lane: parsedLane,
      occurrenceDate,
      operation,
      reason,
      rescheduledTo,
      finalUrl,
      collaborationUrl
    };
  }
  if (input.type === "thread") {
    if (!hasOnlyKeys(input, ["type", "suggestionId", "operation", "reason", "postUrl"])) return null;
    const suggestionId = cleanText(input.suggestionId, 80);
    const operation = input.operation === "approved" || input.operation === "rejected" || input.operation === "snoozed" || input.operation === "posted"
      ? input.operation
      : null;
    const reason = input.reason === null || input.reason === "" ? null : cleanText(input.reason, 500);
    const postUrl = validUrl(input.postUrl);
    if (!suggestionId?.match(SUGGESTION_ID) || !operation || (input.reason !== null && input.reason !== "" && !reason)) return null;
    if ((operation === "posted") !== (postUrl !== null)) return null;
    if (input.postUrl !== null && input.postUrl !== "" && postUrl === null) return null;
    return { type: "thread", suggestionId, operation, reason, postUrl };
  }
  if (input.type === "result-create") {
    if (!hasOnlyKeys(input, ["type", "platform", "nativePostId", "url", "publishedAt", "format", "language", "personalPillar", "contentOrigin", "collaborator", "publicationRelation", "reelSeries", "goviralSignalId", "manualReference", "experimentId", "ownerEvidenceRef", "ownerRating", "ownerNote"])) return null;
    const platform = enumValue(input.platform, ["instagram", "threads"] as const);
    const nativePostId = cleanText(input.nativePostId, 200);
    const url = validUrl(input.url);
    const publishedAt = validDateTime(input.publishedAt);
    const format = enumValue(input.format, ["text", "photo", "photo-dump", "carousel", "reel", "story", "publication-distribution"] as const);
    const language = enumValue(input.language, ["cs", "en"] as const);
    const personalPillar = enumValue(input.personalPillar, PILLARS);
    const contentOrigin = enumValue(input.contentOrigin, ["owner-private", "owner-authored-publication", "goviral-assisted", "owner-manual-venture-reference", "owner-current-life"] as const);
    const collaborator = nullableText(input.collaborator, 120);
    const publicationRelation = input.publicationRelation === null || input.publicationRelation === "" ? null : enumValue(input.publicationRelation, ["okraj", "bbarak"] as const) ?? undefined;
    const reelSeries = input.reelSeries === null || input.reelSeries === "" ? null : enumValue(input.reelSeries, ["rapovej-moment", "behind-the-page", "life-between-projects", "trend-met-memory", "english-rapovej-denik"] as const) ?? undefined;
    const goviralSignalId = nullableText(input.goviralSignalId, 80);
    const experimentId = nullableText(input.experimentId, 120);
    const ownerEvidenceRef = safeEvidence(input.ownerEvidenceRef);
    const ownerRating = input.ownerRating === null ? null : integer(input.ownerRating, 1, 5);
    const ownerNote = nullableText(input.ownerNote, 1_000);
    if (!platform || !nativePostId || !url || !publishedAt || !format || !language || !personalPillar || !contentOrigin || collaborator === undefined ||
        publicationRelation === undefined || reelSeries === undefined || goviralSignalId === undefined || experimentId === undefined || !ownerEvidenceRef ||
        (input.ownerRating !== null && ownerRating === null) || ownerNote === undefined || ((format === "reel") !== (reelSeries !== null)) ||
        ((contentOrigin === "goviral-assisted") !== (goviralSignalId !== null)) || (goviralSignalId !== null && !goviralSignalId.match(/^pg-gv-[a-f0-9]{16}$/u)) ||
        (experimentId !== null && !experimentId.match(EXPERIMENT_ID))) return null;
    const manualInput = input.manualReference === null ? null : record(input.manualReference);
    let manualReference: Extract<PersonalGrowthAdminAction, { type: "result-create" }>["manualReference"] = null;
    if (manualInput) {
      if (!hasOnlyKeys(manualInput, ["sourceProject", "publicItemId", "publicUrl", "ownerAuthored", "personalConnection", "ownerCommentaryNote"])) return null;
      const sourceProject = cleanText(manualInput.sourceProject, 80);
      const publicItemId = cleanText(manualInput.publicItemId, 160);
      const publicUrl = validUrl(manualInput.publicUrl);
      const personalConnection = nullableText(manualInput.personalConnection, 360);
      const ownerCommentaryNote = cleanText(manualInput.ownerCommentaryNote, 600);
      if (!sourceProject?.match(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u) || BLOCKED.test(sourceProject) || !publicItemId || !publicUrl || typeof manualInput.ownerAuthored !== "boolean" || personalConnection === undefined ||
          (!manualInput.ownerAuthored && !personalConnection) || !ownerCommentaryNote || BLOCKED.test(ownerCommentaryNote)) return null;
      manualReference = { sourceProject, publicItemId, publicUrl, ownerAuthored: manualInput.ownerAuthored, personalConnection, ownerCommentaryNote };
    }
    if ((contentOrigin === "owner-manual-venture-reference") !== (manualReference !== null) || (input.manualReference !== null && !manualInput)) return null;
    return { type: "result-create", platform, nativePostId, url, publishedAt, format, language, personalPillar, contentOrigin, collaborator, publicationRelation, reelSeries, goviralSignalId, manualReference, experimentId, ownerEvidenceRef, ownerRating, ownerNote };
  }
  if (input.type === "result-correction") {
    if (!hasOnlyKeys(input, ["type", "resultId", "reason", "evidenceRef", "ownerRating", "ownerNote"])) return null;
    const resultId = cleanText(input.resultId, 80);
    const reason = cleanText(input.reason, 360);
    const evidenceRef = safeEvidence(input.evidenceRef);
    const ownerRating = input.ownerRating === null ? null : integer(input.ownerRating, 1, 5);
    const ownerNote = nullableText(input.ownerNote, 1_000);
    return resultId?.match(RESULT_ID) && reason && evidenceRef && (input.ownerRating === null || ownerRating !== null) && ownerNote !== undefined
      ? { type: "result-correction", resultId, reason, evidenceRef, ownerRating, ownerNote }
      : null;
  }
  if (input.type === "experiment-create") {
    if (!hasOnlyKeys(input, ["type", "changedVariable", "hypothesis", "primaryMetric", "secondaryGuardrail", "startDate", "minimumSample", "evaluationWindowDays"])) return null;
    const changedVariable = enumValue(input.changedVariable, ["trial-reel", "language", "photo-format", "goviral-opening", "threads-topic-tag", "timing-window", "manual-venture-reference"] as const);
    const hypothesis = cleanText(input.hypothesis, 800);
    const primaryMetric = enumValue(input.primaryMetric, METRICS);
    const secondaryGuardrail = cleanText(input.secondaryGuardrail, 240);
    const startDate = validDate(input.startDate);
    const minimumSample = integer(input.minimumSample, 2, 1_000);
    const evaluationWindowDays = integer(input.evaluationWindowDays, 1, 90);
    return changedVariable && hypothesis && !BLOCKED.test(hypothesis) && primaryMetric && secondaryGuardrail && !BLOCKED.test(secondaryGuardrail) && startDate && minimumSample !== null && evaluationWindowDays !== null
      ? { type: "experiment-create", changedVariable, hypothesis, primaryMetric, secondaryGuardrail, startDate, minimumSample, evaluationWindowDays }
      : null;
  }
  if (input.type === "experiment-state") {
    if (!hasOnlyKeys(input, ["type", "experimentId", "operation", "note"])) return null;
    const experimentId = cleanText(input.experimentId, 120);
    const operation = enumValue(input.operation, ["activate", "pause", "review", "stop"] as const);
    const note = cleanText(input.note, 1_000);
    return experimentId?.match(EXPERIMENT_ID) && operation && note && !BLOCKED.test(note) ? { type: "experiment-state", experimentId, operation, note } : null;
  }
  if (input.type === "experiment-verdict") {
    if (!hasOnlyKeys(input, ["type", "experimentId", "verdict", "note"])) return null;
    const experimentId = cleanText(input.experimentId, 120);
    const verdict = enumValue(input.verdict, ["KEEP", "ITERATE", "STOP", "INSUFFICIENT_DATA"] as const);
    const note = cleanText(input.note, 1_000);
    return experimentId?.match(EXPERIMENT_ID) && verdict && note && !BLOCKED.test(note) ? { type: "experiment-verdict", experimentId, verdict, note } : null;
  }
  if (input.type === "strategy-pillar") {
    if (!hasOnlyKeys(input, ["type", "pillar", "status", "weight", "vetoes", "reason"])) return null;
    const pillar = enumValue(input.pillar, PILLARS);
    const status = enumValue(input.status, ["enabled", "paused"] as const);
    const weight = finite(input.weight, 0, 1);
    const vetoes = Array.isArray(input.vetoes) && input.vetoes.length <= 20 ? input.vetoes.map((entry) => cleanText(entry, 240)) : null;
    const reason = cleanText(input.reason, 500);
    return pillar && status && weight !== null && vetoes && vetoes.every((entry) => entry && !BLOCKED.test(entry)) && reason && !BLOCKED.test(reason)
      ? { type: "strategy-pillar", pillar, status, weight, vetoes: vetoes as string[], reason }
      : null;
  }
  if (input.type === "strategy-policy") {
    if (!hasOnlyKeys(input, ["type", "personalFeedMinimum", "ventureLedMaximum", "ventureStoriesPerSevenDaysMaximum", "sameVentureCooldownDays", "reason"])) return null;
    const personalFeedMinimum = finite(input.personalFeedMinimum, 0.85, 1);
    const ventureLedMaximum = finite(input.ventureLedMaximum, 0, 0.15);
    const ventureStoriesPerSevenDaysMaximum = integer(input.ventureStoriesPerSevenDaysMaximum, 0, 2);
    const sameVentureCooldownDays = integer(input.sameVentureCooldownDays, 10, 365);
    const reason = cleanText(input.reason, 500);
    return personalFeedMinimum !== null && ventureLedMaximum !== null && Math.abs(personalFeedMinimum + ventureLedMaximum - 1) < 0.000001 && ventureStoriesPerSevenDaysMaximum !== null && sameVentureCooldownDays !== null && reason && !BLOCKED.test(reason)
      ? { type: "strategy-policy", personalFeedMinimum, ventureLedMaximum, ventureStoriesPerSevenDaysMaximum, sameVentureCooldownDays, reason }
      : null;
  }
  if (input.type === "strategy-settings") {
    if (!hasOnlyKeys(input, ["type", "defaultLanguage", "platformsUsed", "reason"])) return null;
    const defaultLanguage = enumValue(input.defaultLanguage, ["cs", "en"] as const);
    const platformsUsed = Array.isArray(input.platformsUsed) && input.platformsUsed.length <= 2 ? input.platformsUsed.map((entry) => enumValue(entry, ["instagram", "threads"] as const)) : null;
    const reason = cleanText(input.reason, 500);
    return defaultLanguage && platformsUsed && platformsUsed.every((entry) => entry !== null) && new Set(platformsUsed).size === platformsUsed.length && reason && !BLOCKED.test(reason)
      ? { type: "strategy-settings", defaultLanguage, platformsUsed: platformsUsed as Array<"instagram" | "threads">, reason }
      : null;
  }
  if (input.type === "budget-mode") {
    if (!hasOnlyKeys(input, ["type", "mode", "reason"])) return null;
    const mode = enumValue(input.mode, ["default", "buffer"] as const);
    const reason = cleanText(input.reason, 500);
    return mode && reason && !BLOCKED.test(reason) ? { type: "budget-mode", mode, reason } : null;
  }
  if (input.type === "capability-disable") {
    if (!hasOnlyKeys(input, ["type", "capability", "reason"])) return null;
    const capability = enumValue(input.capability, ["projectLive", "paidSynthesis", "insightsIngestion", "instagramInsights", "threadsInsights", "threadsSearch", "providerLive", "tokenRefresh", "bufferQueue"] as const);
    const reason = cleanText(input.reason, 500);
    return capability && reason && !BLOCKED.test(reason) ? { type: "capability-disable", capability, reason } : null;
  }
  return null;
}

function repositoryRoot(explicitRoot?: string): string {
  return explicitRoot ?? process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function shortHash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex").slice(0, 16);
}

function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new PersonalGrowthAdminStoreError("CORRUPT", `${label} is not valid JSON.`);
  }
}

async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  pendingWrites.set(key, next);
  try {
    return await next;
  } finally {
    if (pendingWrites.get(key) === next) pendingWrites.delete(key);
  }
}

function localPath(root: string, relative: string): string {
  const target = path.resolve(root, relative);
  const boundary = path.relative(root, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    throw new PersonalGrowthAdminStoreError("INVALID", "Personal Growth state path escaped the repository.");
  }
  return target;
}

async function writeLocal<T>(relative: string, mutate: PersistMutation<T>, root: string): Promise<Persisted<T>> {
  const target = localPath(root, relative);
  return serialized(target, async () => {
    let current: unknown | null = null;
    try {
      current = parseJson(await readFile(target, "utf8"), relative);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const changed = mutate(current);
    if (!changed.idempotent) {
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, jsonText(changed.value), { encoding: "utf8", mode: 0o600 });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    return { ...changed, commit: null, persistence: "filesystem" };
  });
}

function githubFailure(status: number, what: string): PersonalGrowthAdminStoreError {
  if (status === 401 || status === 403) {
    return new PersonalGrowthAdminStoreError(
      "REFUSED",
      `GitHub refused the Personal Growth ${what} with ${status}. ${TOKEN_ENV} is expired or lacks Contents read and write.`
    );
  }
  return new PersonalGrowthAdminStoreError("REMOTE", `GitHub Personal Growth ${what} failed with ${status}.`);
}

async function writeGitHub<T>(
  relative: string,
  mutate: PersistMutation<T>,
  message: string,
  token: string,
  fetcher: typeof fetch = fetch
): Promise<Persisted<T>> {
  const repository = process.env.BOARDLESSAI_GITHUB_REPOSITORY ?? "lukaskourilcz/quorum";
  const branch = process.env.BOARDLESSAI_GITHUB_BRANCH ?? "main";
  const endpoint = `https://api.github.com/repos/${repository}/contents/${relative.split("/").map(encodeURIComponent).join("/")}`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10"
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetcher(`${endpoint}?ref=${encodeURIComponent(branch)}`, { headers, cache: "no-store" });
    let current: unknown | null = null;
    let sha: string | undefined;
    if (response.status !== 404) {
      if (!response.ok) throw githubFailure(response.status, "read");
      const body = await response.json() as { content?: unknown; encoding?: unknown; sha?: unknown };
      if (body.encoding !== "base64" || typeof body.content !== "string" || typeof body.sha !== "string") {
        throw new PersonalGrowthAdminStoreError("REMOTE", "GitHub returned an invalid Personal Growth file.");
      }
      current = parseJson(Buffer.from(body.content.replaceAll("\n", ""), "base64").toString("utf8"), relative);
      sha = body.sha;
    }
    const changed = mutate(current);
    if (changed.idempotent) return { ...changed, commit: null, persistence: "github" };
    const update = await fetcher(endpoint, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(jsonText(changed.value), "utf8").toString("base64"),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (update.ok) {
      const body = await update.json().catch(() => ({})) as { commit?: { sha?: unknown } };
      return {
        ...changed,
        commit: typeof body.commit?.sha === "string" ? body.commit.sha.slice(0, 7) : null,
        persistence: "github"
      };
    }
    if (update.status !== 409 && !(update.status === 422 && sha === undefined)) throw githubFailure(update.status, "write");
  }
  throw new PersonalGrowthAdminStoreError("CONFLICT", "Personal Growth state changed during every save attempt.");
}

async function persist<T>(
  relative: string,
  mutate: PersistMutation<T>,
  message: string,
  root: string
): Promise<Persisted<T>> {
  const token = process.env[TOKEN_ENV];
  if (token) return writeGitHub(relative, mutate, message, token);
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new PersonalGrowthAdminStoreError(
      "UNCONFIGURED",
      `${TOKEN_ENV} is not set on this deployment, so the Personal Growth owner action was not recorded.`
    );
  }
  return writeLocal(relative, mutate, root);
}

function parsePlannerForWrite(value: unknown): { raw: Record<string, unknown>; lanes: Record<string, unknown>[] } {
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-planner-config/1" || input.ventureId !== "personal-growth" ||
      !Array.isArray(input.lanes) || input.lanes.length !== 2 || input.lanes.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth planner configuration is malformed.");
  }
  return { raw: input, lanes: input.lanes as Record<string, unknown>[] };
}

function parseAnchorHistory(value: unknown | null): { schemaVersion: "personal-growth-admin-anchor-history/1"; revisions: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-anchor-history/1", revisions: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-anchor-history/1" || !Array.isArray(input.revisions) || input.revisions.length > 500 || input.revisions.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth anchor history is malformed.");
  }
  return { schemaVersion: "personal-growth-admin-anchor-history/1", revisions: input.revisions as Record<string, unknown>[] };
}

function parseTimelineHistory(value: unknown | null): { schemaVersion: "personal-growth-history/1"; events: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-history/1", events: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-history/1" || !Array.isArray(input.events) || input.events.length > 500 || input.events.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth timeline history is malformed.");
  }
  return { schemaVersion: "personal-growth-history/1", events: input.events as Record<string, unknown>[] };
}

function parseTimelineReasons(value: unknown | null): { schemaVersion: "personal-growth-admin-timeline-reasons/1"; reasons: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-timeline-reasons/1", reasons: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-timeline-reasons/1" || !Array.isArray(input.reasons) || input.reasons.length > 500 || input.reasons.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth timeline correction notes are malformed.");
  }
  return { schemaVersion: "personal-growth-admin-timeline-reasons/1", reasons: input.reasons as Record<string, unknown>[] };
}

function parseThreadDecisions(value: unknown | null): { schemaVersion: "personal-growth-admin-thread-decisions/1"; decisions: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-thread-decisions/1", decisions: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-thread-decisions/1" || !Array.isArray(input.decisions) || input.decisions.length > 500 || input.decisions.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth Threads decision history is malformed.");
  }
  return { schemaVersion: "personal-growth-admin-thread-decisions/1", decisions: input.decisions as Record<string, unknown>[] };
}

async function applyAnchor(
  action: Extract<PersonalGrowthAdminAction, { type: "anchor" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const configPath = "config/personal-growth-planner.json";
  const raw = parseJson(await readFile(localPath(root, configPath), "utf8"), configPath);
  const planner = parsePlannerForWrite(raw);
  const currentLane = planner.lanes.find((entry) => entry.lane === action.lane);
  if (!currentLane || validDate(currentLane.recurrenceAnchorDate) === null) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", `The ${action.lane.toUpperCase()} planner lane is malformed.`);
  }
  const previousDate = currentLane.recurrenceAnchorDate as string;
  const identity = { lane: action.lane, previousDate, nextDate: action.date, reason: action.reason };
  const id = `pg-anchor-${shortHash(identity)}`;
  if (previousDate === action.date) return { changed: false, commits: [], id };
  const historyWrite = await persist(
    "state/ventures/personal-growth/admin/anchor-history.json",
    (current) => {
      const history = parseAnchorHistory(current);
      if (history.revisions.some((entry) => entry.id === id)) return { value: history, idempotent: true };
      return {
        value: {
          ...history,
          revisions: [...history.revisions, { id, ...identity, recordedAt: now.toISOString() }]
        },
        idempotent: false
      };
    },
    `admin(personal-growth): record ${action.lane} anchor correction`,
    root
  );
  const configWrite = await persist(
    configPath,
    (current) => {
      const latest = parsePlannerForWrite(current);
      const existing = latest.lanes.find((entry) => entry.lane === action.lane);
      if (!existing) throw new PersonalGrowthAdminStoreError("CORRUPT", `The ${action.lane.toUpperCase()} planner lane is missing.`);
      if (existing.recurrenceAnchorDate === action.date) return { value: latest.raw, idempotent: true };
      return {
        value: {
          ...latest.raw,
          lanes: latest.lanes.map((entry) => entry.lane === action.lane ? { ...entry, recurrenceAnchorDate: action.date } : entry)
        },
        idempotent: false
      };
    },
    `admin(personal-growth): set ${action.lane} anchor ${action.date}`,
    root
  );
  return {
    changed: !historyWrite.idempotent || !configWrite.idempotent,
    commits: [historyWrite.commit, configWrite.commit].filter((commit): commit is string => commit !== null),
    id
  };
}

async function applyTimeline(
  action: Extract<PersonalGrowthAdminAction, { type: "timeline" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const identity = {
    lane: action.lane,
    occurrenceDate: action.occurrenceDate,
    action: action.operation,
    rescheduledTo: action.rescheduledTo,
    finalUrl: action.finalUrl,
    collaborationUrl: action.collaborationUrl,
    reason: action.reason
  };
  const eventId = `pg-event-${shortHash(identity)}`;
  const event = {
    schemaVersion: "personal-growth-history-event/1",
    eventId,
    lane: action.lane,
    occurrenceDate: action.occurrenceDate,
    action: action.operation,
    recordedAt: now.toISOString(),
    rescheduledTo: action.rescheduledTo,
    finalUrl: action.lane === "okraj" ? action.finalUrl : null,
    articleUrl: action.lane === "bbarak" ? action.finalUrl : null,
    collaborationUrl: action.lane === "bbarak" ? action.collaborationUrl : null
  };
  const historyWrite = await persist(
    "state/ventures/personal-growth/history.json",
    (current) => {
      const history = parseTimelineHistory(current);
      if (history.events.some((entry) => entry.eventId === eventId)) return { value: history, idempotent: true };
      return { value: { ...history, events: [...history.events, event] }, idempotent: false };
    },
    `admin(personal-growth): ${action.operation} ${action.lane} ${action.occurrenceDate}`,
    root
  );
  const reasonWrite = await persist(
    "state/ventures/personal-growth/admin/timeline-reasons.json",
    (current) => {
      const history = parseTimelineReasons(current);
      if (history.reasons.some((entry) => entry.eventId === eventId)) return { value: history, idempotent: true };
      return {
        value: { ...history, reasons: [...history.reasons, { eventId, reason: action.reason, recordedAt: now.toISOString() }] },
        idempotent: false
      };
    },
    `admin(personal-growth): explain ${eventId}`,
    root
  );
  return {
    changed: !historyWrite.idempotent || !reasonWrite.idempotent,
    commits: [historyWrite.commit, reasonWrite.commit].filter((commit): commit is string => commit !== null),
    id: eventId
  };
}

async function applyThread(
  action: Extract<PersonalGrowthAdminAction, { type: "thread" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const identity = {
    suggestionId: action.suggestionId,
    action: action.operation,
    reason: action.reason,
    postUrl: action.postUrl
  };
  const decisionId = `pg-thread-decision-${shortHash(identity)}`;
  const write = await persist(
    "state/ventures/personal-growth/admin/thread-decisions.json",
    (current) => {
      const history = parseThreadDecisions(current);
      if (history.decisions.some((entry) => entry.decisionId === decisionId)) return { value: history, idempotent: true };
      return {
        value: {
          ...history,
          decisions: [...history.decisions, {
            decisionId,
            suggestionId: action.suggestionId,
            action: action.operation,
            reason: action.reason,
            postUrl: action.postUrl,
            recordedAt: now.toISOString()
          }]
        },
        idempotent: false
      };
    },
    `admin(personal-growth): record Threads ${action.operation}`,
    root
  );
  return { changed: !write.idempotent, commits: write.commit ? [write.commit] : [], id: decisionId };
}

function parseResultForWrite(value: unknown, expectedId: string): Record<string, unknown> {
  const input = record(value);
  const provenance = record(input?.provenance);
  if (input?.schemaVersion !== "personal-growth-result/1" || input.resultId !== expectedId || !Array.isArray(input.observations) || input.observations.length > 100 ||
      !Array.isArray(input.corrections) || input.corrections.length > 100 || containsBlockedString(input) || containsPrivateKey(input) ||
      !provenance || provenance.automaticPortfolioLookup !== false || provenance.socialDistributionCampaignRef !== null || provenance.monetizationRef !== null ||
      !hasOnlyKeys(provenance, ["entryMode", "ownerEvidenceRefs", "automaticPortfolioLookup", "socialDistributionCampaignRef", "monetizationRef"]) ||
      !hasOnlyKeys(input, ["schemaVersion", "resultId", "platform", "nativePostId", "url", "publishedAt", "format", "language", "personalPillar", "contentOrigin", "collaborator", "publicationRelation", "reelSeries", "goviralSignalId", "manualVentureReference", "experimentId", "classification", "provenance", "observations", "ownerRating", "ownerNote", "corrections", "updatedAt"])) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth result is malformed or crosses an isolation boundary.");
  }
  return input;
}

async function applyResultCreate(
  action: Extract<PersonalGrowthAdminAction, { type: "result-create" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const resultId = `pg-result-${shortHash({ platform: action.platform, nativePostId: action.nativePostId, publishedAt: action.publishedAt })}`;
  const manualReference = action.manualReference ? {
    referenceId: `pg-manual-ref-${shortHash({ resultId, ...action.manualReference })}`,
    sourceProject: action.manualReference.sourceProject,
    publicItemId: action.manualReference.publicItemId,
    publicUrl: action.manualReference.publicUrl,
    ownerAuthored: action.manualReference.ownerAuthored,
    personalConnectionRecorded: action.manualReference.personalConnection !== null,
    ownerCommentaryRecorded: true,
    policyCompliantAtRecommendation: true,
    ownerProvenanceRef: action.ownerEvidenceRef
  } : null;
  const result = {
    schemaVersion: "personal-growth-result/1",
    resultId,
    platform: action.platform,
    nativePostId: action.nativePostId,
    url: action.url,
    publishedAt: action.publishedAt,
    format: action.format,
    language: action.language,
    personalPillar: action.personalPillar,
    contentOrigin: action.contentOrigin,
    collaborator: action.collaborator,
    publicationRelation: action.publicationRelation,
    reelSeries: action.reelSeries,
    goviralSignalId: action.goviralSignalId,
    manualVentureReference: manualReference,
    experimentId: action.experimentId,
    classification: action.manualReference ? "owner-manual-venture-led" : "personal-or-personally-authored",
    provenance: {
      entryMode: "manual",
      ownerEvidenceRefs: [action.ownerEvidenceRef],
      automaticPortfolioLookup: false,
      socialDistributionCampaignRef: null,
      monetizationRef: null
    },
    observations: [],
    ownerRating: action.ownerRating,
    ownerNote: action.ownerNote,
    corrections: [],
    updatedAt: now.toISOString()
  };
  const write = await persist(
    `state/ventures/personal-growth/results/${resultId}.json`,
    (current) => current === null
      ? { value: result, idempotent: false }
      : { value: parseResultForWrite(current, resultId), idempotent: true },
    `admin(personal-growth): record manual result ${resultId}`,
    root
  );
  return { changed: !write.idempotent, commits: write.commit ? [write.commit] : [], id: resultId };
}

async function applyResultCorrection(
  action: Extract<PersonalGrowthAdminAction, { type: "result-correction" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const correctionId = `pg-correction-${shortHash(action)}`;
  const correctionBase = { recordedAt: now.toISOString(), reason: action.reason, evidenceRefs: [action.evidenceRef] };
  const write = await persist(
    `state/ventures/personal-growth/results/${action.resultId}.json`,
    (current) => {
      if (current === null) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth result does not exist.");
      const result = parseResultForWrite(current, action.resultId);
      const corrections = result.corrections as Record<string, unknown>[];
      if (corrections.some((entry) => entry.correctionId === correctionId)) return { value: result, idempotent: true };
      return {
        value: {
          ...result,
          ownerRating: action.ownerRating,
          ownerNote: action.ownerNote,
          corrections: [...corrections, { correctionId, ...correctionBase }],
          updatedAt: now.toISOString()
        },
        idempotent: false
      };
    },
    `admin(personal-growth): append correction ${correctionId}`,
    root
  );
  return { changed: !write.idempotent, commits: write.commit ? [write.commit] : [], id: correctionId };
}

function parseExperimentRegisterForWrite(value: unknown | null): { schemaVersion: "personal-growth-experiment-register/1"; ventureId: "personal-growth"; experiments: Record<string, unknown>[]; updatedAt: string } {
  const input = record(value);
  const experiments = Array.isArray(input?.experiments) ? input.experiments.flatMap((entry) => record(entry) ? [entry as Record<string, unknown>] : []) : [];
  if (input?.schemaVersion !== "personal-growth-experiment-register/1" || input.ventureId !== "personal-growth" || !Array.isArray(input.experiments) ||
      input.experiments.length > 100 || experiments.length !== input.experiments.length || experiments.some((entry) => containsBlockedString(entry) || containsPrivateKey(entry) ||
        !cleanText(entry.id, 120)?.match(EXPERIMENT_ID) || !enumValue(entry.status, ["backlog", "active", "review", "completed", "stopped"] as const) ||
        integer(entry.minimumSample, 2, 1_000) === null || !Array.isArray(entry.evidenceResultIds) || entry.maxCostUsd !== 0 || entry.publishingAuthorized !== false) ||
      new Set(experiments.map(({ id }) => id)).size !== experiments.length || experiments.filter(({ status }) => status === "active" || status === "review").length > 2 || !validDateTime(input.updatedAt)) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth experiment register is malformed.");
  }
  return { schemaVersion: "personal-growth-experiment-register/1", ventureId: "personal-growth", experiments, updatedAt: input.updatedAt as string };
}

function experimentTemplate(variable: Extract<PersonalGrowthAdminAction, { type: "experiment-create" }>["changedVariable"]): { platform: "instagram" | "threads"; format: string; stopCondition: string } {
  if (variable === "threads-topic-tag") return { platform: "threads", format: "text", stopCondition: "Stop on a voice, provenance, privacy or quality-gate violation." };
  if (variable === "trial-reel" || variable === "language" || variable === "goviral-opening") return { platform: "instagram", format: "reel", stopCondition: "Stop on a privacy, authority, personal-content-policy or leak-gate violation." };
  if (variable === "photo-format") return { platform: "instagram", format: "photo", stopCondition: "Stop on a privacy, authority or personal-content-policy violation." };
  if (variable === "manual-venture-reference") return { platform: "instagram", format: "photo", stopCondition: "Stop if owner provenance, commentary, personal connection or the 85/15 floor is missing." };
  return { platform: "instagram", format: "mixed", stopCondition: "Stop on a privacy, authority or personal-content-policy violation." };
}

function parseExperimentNotesForWrite(value: unknown | null): { schemaVersion: "personal-growth-admin-experiment-notes/1"; notes: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-experiment-notes/1", notes: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-experiment-notes/1" || !Array.isArray(input.notes) || input.notes.length > 500 || input.notes.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth experiment notes are malformed.");
  }
  return { schemaVersion: "personal-growth-admin-experiment-notes/1", notes: input.notes as Record<string, unknown>[] };
}

async function appendExperimentNote(input: { experimentId: string; note: string; operation: string; identity: string; now: Date; root: string }): Promise<Persisted<{ schemaVersion: "personal-growth-admin-experiment-notes/1"; notes: Record<string, unknown>[] }>> {
  return persist(
    "state/ventures/personal-growth/admin/experiment-notes.json",
    (current) => {
      const notes = parseExperimentNotesForWrite(current);
      if (notes.notes.some((entry) => entry.noteId === input.identity)) return { value: notes, idempotent: true };
      return { value: { ...notes, notes: [...notes.notes, { noteId: input.identity, experimentId: input.experimentId, operation: input.operation, note: input.note, recordedAt: input.now.toISOString() }] }, idempotent: false };
    },
    `admin(personal-growth): note experiment ${input.experimentId}`,
    input.root
  );
}

async function applyExperimentCreate(
  action: Extract<PersonalGrowthAdminAction, { type: "experiment-create" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const template = experimentTemplate(action.changedVariable);
  const experimentId = `pg-exp-${action.changedVariable}-${shortHash(action).slice(0, 8)}`;
  const experiment = {
    schemaVersion: "personal-growth-experiment/1",
    id: experimentId,
    status: "backlog",
    hypothesis: action.hypothesis,
    changedVariable: action.changedVariable,
    platform: template.platform,
    format: template.format,
    primaryMetric: action.primaryMetric,
    secondaryGuardrail: action.secondaryGuardrail,
    startDate: action.startDate,
    minimumSample: action.minimumSample,
    evaluationWindowDays: action.evaluationWindowDays,
    stopCondition: template.stopCondition,
    evidenceResultIds: [],
    verdict: "INSUFFICIENT_DATA",
    maxCostUsd: 0,
    publishingAuthorized: false
  };
  const write = await persist(
    "state/ventures/personal-growth/experiments.json",
    (current) => {
      const register = parseExperimentRegisterForWrite(current);
      if (register.experiments.some((entry) => entry.id === experimentId)) return { value: register, idempotent: true };
      return { value: { ...register, experiments: [...register.experiments, experiment], updatedAt: now.toISOString() }, idempotent: false };
    },
    `admin(personal-growth): create experiment ${experimentId}`,
    root
  );
  return { changed: !write.idempotent, commits: write.commit ? [write.commit] : [], id: experimentId };
}

async function applyExperimentState(
  action: Extract<PersonalGrowthAdminAction, { type: "experiment-state" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const stateByOperation = { activate: "active", pause: "backlog", review: "review", stop: "stopped" } as const;
  const nextStatus = stateByOperation[action.operation];
  const identity = `pg-experiment-note-${shortHash(action)}`;
  const registerWrite = await persist(
    "state/ventures/personal-growth/experiments.json",
    (current) => {
      const register = parseExperimentRegisterForWrite(current);
      const experiment = register.experiments.find((entry) => entry.id === action.experimentId);
      if (!experiment) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth experiment does not exist.");
      if (experiment.status === "completed" || experiment.status === "stopped") {
        if (experiment.status === nextStatus) return { value: register, idempotent: true };
        throw new PersonalGrowthAdminStoreError("REFUSED", "A completed or stopped Personal Growth experiment cannot be restarted.");
      }
      if (action.operation === "review" && experiment.status !== "active") throw new PersonalGrowthAdminStoreError("REFUSED", "Only an active experiment can enter review.");
      if (action.operation === "pause" && experiment.status !== "active" && experiment.status !== "review") throw new PersonalGrowthAdminStoreError("REFUSED", "Only a live experiment can be paused.");
      if (experiment.status === nextStatus) return { value: register, idempotent: true };
      const experiments = register.experiments.map((entry) => entry.id === action.experimentId ? { ...entry, status: nextStatus } : entry);
      if (experiments.filter(({ status }) => status === "active" || status === "review").length > 2) throw new PersonalGrowthAdminStoreError("REFUSED", "At most two Personal Growth experiments may be active or under review.");
      return { value: { ...register, experiments, updatedAt: now.toISOString() }, idempotent: false };
    },
    `admin(personal-growth): ${action.operation} experiment ${action.experimentId}`,
    root
  );
  const noteWrite = await appendExperimentNote({ experimentId: action.experimentId, note: action.note, operation: action.operation, identity, now, root });
  return { changed: !registerWrite.idempotent || !noteWrite.idempotent, commits: [registerWrite.commit, noteWrite.commit].filter((commit): commit is string => commit !== null), id: identity };
}

async function applyExperimentVerdict(
  action: Extract<PersonalGrowthAdminAction, { type: "experiment-verdict" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const identity = `pg-experiment-note-${shortHash(action)}`;
  const registerWrite = await persist(
    "state/ventures/personal-growth/experiments.json",
    (current) => {
      const register = parseExperimentRegisterForWrite(current);
      const experiment = register.experiments.find((entry) => entry.id === action.experimentId);
      if (!experiment) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth experiment does not exist.");
      const alreadyRecorded = experiment.verdict === action.verdict && (
        (action.verdict === "INSUFFICIENT_DATA" && experiment.status === "review") ||
        (action.verdict === "STOP" && experiment.status === "stopped") ||
        ((action.verdict === "KEEP" || action.verdict === "ITERATE") && experiment.status === "completed")
      );
      if (alreadyRecorded) return { value: register, idempotent: true };
      if (experiment.status !== "active" && experiment.status !== "review") throw new PersonalGrowthAdminStoreError("REFUSED", "Only a live Personal Growth experiment can receive a verdict.");
      const evidence = Array.isArray(experiment.evidenceResultIds) ? experiment.evidenceResultIds : [];
      const minimum = integer(experiment.minimumSample, 2, 1_000);
      if (minimum === null) throw new PersonalGrowthAdminStoreError("CORRUPT", "The experiment minimum sample is malformed.");
      if (evidence.length < minimum && action.verdict !== "INSUFFICIENT_DATA") throw new PersonalGrowthAdminStoreError("REFUSED", "The experiment has not reached its preregistered minimum sample.");
      const status = action.verdict === "INSUFFICIENT_DATA" ? "review" : action.verdict === "STOP" ? "stopped" : "completed";
      const experiments = register.experiments.map((entry) => entry.id === action.experimentId ? { ...entry, verdict: action.verdict, status } : entry);
      return { value: { ...register, experiments, updatedAt: now.toISOString() }, idempotent: false };
    },
    `admin(personal-growth): record ${action.verdict} for ${action.experimentId}`,
    root
  );
  const noteWrite = await appendExperimentNote({ experimentId: action.experimentId, note: action.note, operation: `verdict:${action.verdict}`, identity, now, root });
  return { changed: !registerWrite.idempotent || !noteWrite.idempotent, commits: [registerWrite.commit, noteWrite.commit].filter((commit): commit is string => commit !== null), id: identity };
}

function parseContentForWrite(value: unknown): { raw: Record<string, unknown>; pillars: Record<string, unknown>[]; policy: Record<string, unknown>; revisions: Record<string, unknown>[] } {
  const input = record(value);
  const policy = record(input?.policy);
  if (input?.schemaVersion !== "personal-growth-content-config/1" || input.ventureId !== "personal-growth" || !Array.isArray(input.pillars) || input.pillars.some((entry) => !record(entry)) ||
      policy?.schemaVersion !== "personal-growth-content-policy/1" || policy.ventureId !== "personal-growth" || !Array.isArray(policy.revisions) || policy.revisions.some((entry) => !record(entry)) ||
      policy.ownerManualReferenceRequired !== true || policy.ownerCommentaryRequired !== true || policy.automaticVentureDiscovery !== false || policy.automaticVentureNomination !== false) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth content strategy is malformed.");
  }
  return { raw: input, pillars: input.pillars as Record<string, unknown>[], policy, revisions: policy.revisions as Record<string, unknown>[] };
}

function parseStrategyHistory(value: unknown | null): { schemaVersion: "personal-growth-admin-strategy-history/1"; revisions: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-strategy-history/1", revisions: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-strategy-history/1" || !Array.isArray(input.revisions) || input.revisions.length > 500 || input.revisions.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth strategy history is malformed.");
  }
  return { schemaVersion: "personal-growth-admin-strategy-history/1", revisions: input.revisions as Record<string, unknown>[] };
}

async function writeStrategyHistory(input: { id: string; action: string; details: unknown; reason: string; now: Date; root: string }): Promise<Persisted<{ schemaVersion: "personal-growth-admin-strategy-history/1"; revisions: Record<string, unknown>[] }>> {
  return persist(
    "state/ventures/personal-growth/admin/strategy-history.json",
    (current) => {
      const history = parseStrategyHistory(current);
      if (history.revisions.some((entry) => entry.id === input.id)) return { value: history, idempotent: true };
      return { value: { ...history, revisions: [...history.revisions, { id: input.id, action: input.action, details: input.details, reason: input.reason, recordedAt: input.now.toISOString() }] }, idempotent: false };
    },
    `admin(personal-growth): record ${input.action} strategy history`,
    input.root
  );
}

async function applyStrategyPillar(
  action: Extract<PersonalGrowthAdminAction, { type: "strategy-pillar" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const details = { pillar: action.pillar, status: action.status, weight: action.weight, vetoes: action.vetoes };
  const id = `pg-strategy-${shortHash({ ...details, reason: action.reason })}`;
  const historyWrite = await writeStrategyHistory({ id, action: "pillar", details, reason: action.reason, now, root });
  const configWrite = await persist(
    "config/personal-growth-content.json",
    (current) => {
      const content = parseContentForWrite(current);
      const pillar = content.pillars.find((entry) => entry.pillar === action.pillar);
      if (!pillar) throw new PersonalGrowthAdminStoreError("CORRUPT", "The selected Personal Growth pillar is missing.");
      if (pillar.status === action.status && pillar.weight === action.weight && stable(pillar.vetoes) === stable(action.vetoes)) return { value: content.raw, idempotent: true };
      return { value: { ...content.raw, pillars: content.pillars.map((entry) => entry.pillar === action.pillar ? { ...entry, ...details } : entry) }, idempotent: false };
    },
    `admin(personal-growth): update pillar ${action.pillar}`,
    root
  );
  return { changed: !historyWrite.idempotent || !configWrite.idempotent, commits: [historyWrite.commit, configWrite.commit].filter((commit): commit is string => commit !== null), id };
}

async function applyStrategyPolicy(
  action: Extract<PersonalGrowthAdminAction, { type: "strategy-policy" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const details = { personalFeedMinimum: action.personalFeedMinimum, ventureLedMaximum: action.ventureLedMaximum, ventureStoriesPerSevenDaysMaximum: action.ventureStoriesPerSevenDaysMaximum, sameVentureCooldownDays: action.sameVentureCooldownDays };
  const id = `pg-strategy-${shortHash({ ...details, reason: action.reason })}`;
  const historyWrite = await writeStrategyHistory({ id, action: "policy", details, reason: action.reason, now, root });
  const configWrite = await persist(
    "config/personal-growth-content.json",
    (current) => {
      const content = parseContentForWrite(current);
      const currentRevision = integer(content.policy.currentRevision, 0, 10_000);
      if (currentRevision === null) throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth policy revision is malformed.");
      const active = content.revisions.find((entry) => entry.revision === currentRevision);
      if (!active) throw new PersonalGrowthAdminStoreError("CORRUPT", "The active Personal Growth policy revision is missing.");
      if (Object.entries(details).every(([key, value]) => active[key] === value)) return { value: content.raw, idempotent: true };
      const nextRevision = currentRevision + 1;
      return {
        value: {
          ...content.raw,
          policy: {
            ...content.policy,
            currentRevision: nextRevision,
            revisions: [...content.revisions, { revision: nextRevision, effectiveFrom: now.toISOString().slice(0, 10), ...details, looseningDecisionRef: null }]
          }
        },
        idempotent: false
      };
    },
    "admin(personal-growth): append bounded content policy revision",
    root
  );
  return { changed: !historyWrite.idempotent || !configWrite.idempotent, commits: [historyWrite.commit, configWrite.commit].filter((commit): commit is string => commit !== null), id };
}

function parseStrategySettings(value: unknown | null): { schemaVersion: "personal-growth-admin-strategy-settings/1"; platformsUsed: Array<"instagram" | "threads"> } {
  if (value === null) return { schemaVersion: "personal-growth-admin-strategy-settings/1", platformsUsed: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-strategy-settings/1" || !Array.isArray(input.platformsUsed) || input.platformsUsed.length > 2 || input.platformsUsed.some((entry) => entry !== "instagram" && entry !== "threads")) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth platform settings are malformed.");
  }
  return { schemaVersion: "personal-growth-admin-strategy-settings/1", platformsUsed: input.platformsUsed as Array<"instagram" | "threads"> };
}

async function applyStrategySettings(
  action: Extract<PersonalGrowthAdminAction, { type: "strategy-settings" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const details = { defaultLanguage: action.defaultLanguage, platformsUsed: action.platformsUsed };
  const id = `pg-strategy-${shortHash({ ...details, reason: action.reason })}`;
  const historyWrite = await writeStrategyHistory({ id, action: "settings", details, reason: action.reason, now, root });
  const contentWrite = await persist(
    "config/personal-growth-content.json",
    (current) => {
      const content = parseContentForWrite(current);
      return content.raw.defaultLanguage === action.defaultLanguage ? { value: content.raw, idempotent: true } : { value: { ...content.raw, defaultLanguage: action.defaultLanguage }, idempotent: false };
    },
    `admin(personal-growth): set ${action.defaultLanguage} default lane`,
    root
  );
  const settingsWrite = await persist(
    "state/ventures/personal-growth/admin/strategy-settings.json",
    (current) => {
      const settings = parseStrategySettings(current);
      return stable(settings.platformsUsed) === stable(action.platformsUsed) ? { value: settings, idempotent: true } : { value: { ...settings, platformsUsed: action.platformsUsed }, idempotent: false };
    },
    "admin(personal-growth): record platforms actually used",
    root
  );
  return { changed: !historyWrite.idempotent || !contentWrite.idempotent || !settingsWrite.idempotent, commits: [historyWrite.commit, contentWrite.commit, settingsWrite.commit].filter((commit): commit is string => commit !== null), id };
}

function parseFoundationForWrite(value: unknown): { raw: Record<string, unknown>; budget: Record<string, unknown>; modes: Record<string, unknown>[]; featureGates: Record<string, unknown> } {
  const input = record(value);
  const budget = record(input?.budget);
  const featureGates = record(input?.featureGates);
  const modes = Array.isArray(budget?.modes) ? budget.modes.flatMap((entry) => record(entry) ? [entry as Record<string, unknown>] : []) : [];
  const authorisedMode = (mode: Record<string, unknown>) => mode.id === "default"
    ? mode.synthesisUsd === 12 && mode.researchUsd === 5 && mode.schedulingUsd === 0 && mode.reserveUsd === 3
    : mode.id === "buffer" && mode.synthesisUsd === 8 && mode.researchUsd === 0 && mode.schedulingUsd === 10 && mode.reserveUsd === 2;
  if (input?.schemaVersion !== "personal-growth-foundation/1" || input.ventureId !== "personal-growth" || input.visibility !== "owner-only" || budget?.monthlyAllInUsd !== 20 ||
      !Array.isArray(budget.modes) || budget.modes.length !== 2 || budget.modes.some((entry) => !record(entry)) || !featureGates || featureGates.publishing !== false) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth foundation is malformed.");
  }
  if (modes.length !== 2 || !modes.every(authorisedMode) || new Set(modes.map(({ id }) => id)).size !== 2 || !modes.some(({ id }) => id === budget.activeMode)) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth allocation modes exceed their authorised bounds.");
  }
  return { raw: input, budget, modes, featureGates };
}

function parseBudgetHistory(value: unknown | null): { schemaVersion: "personal-growth-admin-budget-history/1"; revisions: Record<string, unknown>[] } {
  if (value === null) return { schemaVersion: "personal-growth-admin-budget-history/1", revisions: [] };
  const input = record(value);
  if (input?.schemaVersion !== "personal-growth-admin-budget-history/1" || !Array.isArray(input.revisions) || input.revisions.length > 500 || input.revisions.some((entry) => !record(entry))) {
    throw new PersonalGrowthAdminStoreError("CORRUPT", "The Personal Growth budget history is malformed.");
  }
  return { schemaVersion: "personal-growth-admin-budget-history/1", revisions: input.revisions as Record<string, unknown>[] };
}

async function applyBudgetChange(
  action: Extract<PersonalGrowthAdminAction, { type: "budget-mode" | "capability-disable" }>,
  now: Date,
  root: string
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const details = action.type === "budget-mode" ? { mode: action.mode } : { capability: action.capability, enabled: false };
  const id = `pg-budget-${shortHash({ ...details, reason: action.reason })}`;
  const historyWrite = await persist(
    "state/ventures/personal-growth/admin/budget-history.json",
    (current) => {
      const history = parseBudgetHistory(current);
      if (history.revisions.some((entry) => entry.id === id)) return { value: history, idempotent: true };
      return { value: { ...history, revisions: [...history.revisions, { id, action: action.type, ...details, reason: action.reason, recordedAt: now.toISOString() }] }, idempotent: false };
    },
    `admin(personal-growth): record ${action.type}`,
    root
  );
  const configWrite = await persist(
    "config/personal-growth.json",
    (current) => {
      const foundation = parseFoundationForWrite(current);
      if (action.type === "budget-mode") {
        if (!foundation.modes.some((mode) => mode.id === action.mode)) throw new PersonalGrowthAdminStoreError("REFUSED", "Only a pre-authorised Personal Growth allocation mode can be selected.");
        return foundation.budget.activeMode === action.mode
          ? { value: foundation.raw, idempotent: true }
          : { value: { ...foundation.raw, budget: { ...foundation.budget, activeMode: action.mode } }, idempotent: false };
      }
      if (foundation.featureGates[action.capability] === false) return { value: foundation.raw, idempotent: true };
      if (foundation.featureGates[action.capability] !== true) throw new PersonalGrowthAdminStoreError("CORRUPT", "The selected Personal Growth capability is malformed.");
      return { value: { ...foundation.raw, featureGates: { ...foundation.featureGates, [action.capability]: false, publishing: false } }, idempotent: false };
    },
    action.type === "budget-mode" ? `admin(personal-growth): select ${action.mode} allocation` : `admin(personal-growth): disable ${action.capability}`,
    root
  );
  return { changed: !historyWrite.idempotent || !configWrite.idempotent, commits: [historyWrite.commit, configWrite.commit].filter((commit): commit is string => commit !== null), id };
}

export async function applyPersonalGrowthAdminAction(
  raw: unknown,
  options: { root?: string; now?: Date } = {}
): Promise<{ changed: boolean; commits: string[]; id: string }> {
  const action = parsePersonalGrowthAdminAction(raw);
  if (!action) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth action is invalid or exceeds its bounded fields.");
  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime())) throw new PersonalGrowthAdminStoreError("INVALID", "The Personal Growth action time is invalid.");
  const root = repositoryRoot(options.root);
  if (action.type === "anchor") return applyAnchor(action, now, root);
  if (action.type === "timeline") return applyTimeline(action, now, root);
  if (action.type === "thread") return applyThread(action, now, root);
  if (action.type === "result-create") return applyResultCreate(action, now, root);
  if (action.type === "result-correction") return applyResultCorrection(action, now, root);
  if (action.type === "experiment-create") return applyExperimentCreate(action, now, root);
  if (action.type === "experiment-state") return applyExperimentState(action, now, root);
  if (action.type === "experiment-verdict") return applyExperimentVerdict(action, now, root);
  if (action.type === "strategy-pillar") return applyStrategyPillar(action, now, root);
  if (action.type === "strategy-policy") return applyStrategyPolicy(action, now, root);
  if (action.type === "strategy-settings") return applyStrategySettings(action, now, root);
  return applyBudgetChange(action, now, root);
}
