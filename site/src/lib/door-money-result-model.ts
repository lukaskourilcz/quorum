import { boundedText, hasOnlyKeys, isDateTime, isRecord } from "./door-money-recommendation-model";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const PLATFORMS = ["instagram", "tiktok", "x", "threads", "youtube"] as const;
export const DOOR_MONEY_RESULT_METRICS = [
  "views", "likes", "comments", "shares", "saves", "follows", "linkTaps"
] as const;

export type DoorMoneyResultPlatform = (typeof PLATFORMS)[number];
export type DoorMoneyResultMetric = (typeof DOOR_MONEY_RESULT_METRICS)[number];
export type DoorMoneyResultMetrics = Partial<Record<DoorMoneyResultMetric, number>>;

export interface DoorMoneyOwnerResult {
  schemaVersion: "owner-result-entry/1";
  id: string;
  ventureId: "door-money";
  recommendationId: string;
  platform: DoorMoneyResultPlatform;
  postUrl: string;
  metrics: DoorMoneyResultMetrics;
  outcome: string;
  source: "owner-entry";
  capturedAt: string;
}

export interface DoorMoneyOwnerResultInput {
  recommendationId: string;
  platform: DoorMoneyResultPlatform;
  metrics: DoorMoneyResultMetrics;
  outcome: string;
}

function slug(value: unknown): value is string {
  return boundedText(value, 160) && SLUG.test(value);
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2_000) return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function platform(value: unknown): value is DoorMoneyResultPlatform {
  return typeof value === "string" && (PLATFORMS as readonly string[]).includes(value);
}

export const isDoorMoneyResultPlatform = platform;

export function parseDoorMoneyResultMetrics(value: unknown): DoorMoneyResultMetrics | null {
  if (!isRecord(value) || Object.keys(value).length < 1 ||
      Object.keys(value).some((key) => !(DOOR_MONEY_RESULT_METRICS as readonly string[]).includes(key))) return null;
  const metrics: DoorMoneyResultMetrics = {};
  for (const metric of DOOR_MONEY_RESULT_METRICS) {
    const amount = value[metric];
    if (amount === undefined) continue;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) return null;
    metrics[metric] = amount;
  }
  return metrics;
}

export function parseDoorMoneyOwnerResultInput(value: unknown): DoorMoneyOwnerResultInput | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["recommendationId", "platform", "metrics", "outcome"]) ||
      !slug(value.recommendationId) || !platform(value.platform) || !boundedText(value.outcome, 1_000)) return null;
  const metrics = parseDoorMoneyResultMetrics(value.metrics);
  return metrics ? {
    recommendationId: value.recommendationId,
    platform: value.platform,
    metrics,
    outcome: value.outcome.trim()
  } : null;
}

export function parseDoorMoneyOwnerResult(value: unknown): DoorMoneyOwnerResult | null {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "schemaVersion", "id", "ventureId", "recommendationId", "platform", "postUrl",
    "metrics", "outcome", "source", "capturedAt"
  ]) || value.schemaVersion !== "owner-result-entry/1" || value.ventureId !== "door-money" ||
      value.source !== "owner-entry" || !slug(value.id) || !slug(value.recommendationId) ||
      !platform(value.platform) || !httpsUrl(value.postUrl) || !boundedText(value.outcome, 1_000) ||
      !isDateTime(value.capturedAt)) return null;
  const metrics = parseDoorMoneyResultMetrics(value.metrics);
  return metrics ? {
    schemaVersion: "owner-result-entry/1",
    id: value.id,
    ventureId: "door-money",
    recommendationId: value.recommendationId,
    platform: value.platform,
    postUrl: new URL(value.postUrl).toString(),
    metrics,
    outcome: value.outcome.trim(),
    source: "owner-entry",
    capturedAt: new Date(value.capturedAt).toISOString()
  } : null;
}
