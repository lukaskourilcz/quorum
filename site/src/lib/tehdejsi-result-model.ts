export const TEHDEJSI_RESULT_METRICS = [
  "sends",
  "saves",
  "views",
  "likes",
  "comments",
  "shares",
  "follows",
  "linkTaps"
] as const;

export const TEHDEJSI_RESULT_PLATFORMS = ["instagram", "facebook", "threads"] as const;

export type TehdejsiResultMetric = (typeof TEHDEJSI_RESULT_METRICS)[number];
export type TehdejsiResultPlatform = (typeof TEHDEJSI_RESULT_PLATFORMS)[number];
export type TehdejsiResultLocale = "cs" | "ua";
export type TehdejsiResultMetrics = Record<TehdejsiResultMetric, number | null>;

export interface TehdejsiOwnerResult {
  schemaVersion: "owner-result-entry/1";
  resultId: string;
  ventureId: "tehdejsi-svet";
  recommendationId: string;
  locale: TehdejsiResultLocale;
  platform: TehdejsiResultPlatform;
  postUrl: string;
  capturedAt: string;
  recordedAt: string;
  enteredBy: "owner";
  metrics: TehdejsiResultMetrics;
  note: string | null;
}

export interface TehdejsiOwnerResultInput {
  recommendationId: string;
  locale: TehdejsiResultLocale;
  platform: TehdejsiResultPlatform;
  capturedAt: string;
  recordedAt: string;
  metrics: TehdejsiResultMetrics;
  note: string | null;
}

const RESULT_ID = /^result-[a-f0-9]{20}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function instant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && Number.isFinite(Date.parse(value));
}

function metrics(value: unknown): TehdejsiResultMetrics | null {
  const record = object(value);
  if (!record || !exact(record, TEHDEJSI_RESULT_METRICS)) return null;
  if (!TEHDEJSI_RESULT_METRICS.every((key) => record[key] === null
    || (typeof record[key] === "number" && Number.isSafeInteger(record[key]) && Number(record[key]) >= 0))) return null;
  if (!TEHDEJSI_RESULT_METRICS.some((key) => record[key] !== null)) return null;
  return record as TehdejsiResultMetrics;
}

function shared(value: Record<string, unknown>): Omit<TehdejsiOwnerResultInput, "recommendationId"> | null {
  const parsedMetrics = metrics(value.metrics);
  if ((value.locale !== "cs" && value.locale !== "ua")
    || !TEHDEJSI_RESULT_PLATFORMS.includes(value.platform as TehdejsiResultPlatform)
    || !instant(value.capturedAt) || !instant(value.recordedAt)
    || Date.parse(value.capturedAt) > Date.parse(value.recordedAt) || !parsedMetrics) return null;
  if (value.note !== null && (typeof value.note !== "string" || !value.note.trim() || value.note.length > 500)) return null;
  return {
    locale: value.locale,
    platform: value.platform as TehdejsiResultPlatform,
    capturedAt: value.capturedAt,
    recordedAt: value.recordedAt,
    metrics: parsedMetrics,
    note: value.note === null ? null : value.note.trim()
  };
}

export function parseTehdejsiOwnerResultInput(value: unknown): TehdejsiOwnerResultInput | null {
  const input = object(value);
  if (!input || !exact(input, ["recommendationId", "locale", "platform", "capturedAt", "recordedAt", "metrics", "note"])) return null;
  const fields = shared(input);
  if (!fields || typeof input.recommendationId !== "string" || !SLUG.test(input.recommendationId) || input.recommendationId.length > 160) return null;
  return { recommendationId: input.recommendationId, ...fields };
}

export function parseTehdejsiOwnerResult(value: unknown): TehdejsiOwnerResult | null {
  const entry = object(value);
  if (!entry || !exact(entry, [
    "schemaVersion", "resultId", "ventureId", "recommendationId", "locale", "platform",
    "postUrl", "capturedAt", "recordedAt", "enteredBy", "metrics", "note"
  ])) return null;
  const fields = shared(entry);
  if (!fields || entry.schemaVersion !== "owner-result-entry/1" || entry.ventureId !== "tehdejsi-svet"
    || entry.enteredBy !== "owner" || typeof entry.resultId !== "string" || !RESULT_ID.test(entry.resultId)
    || typeof entry.recommendationId !== "string" || !SLUG.test(entry.recommendationId) || entry.recommendationId.length > 160
    || typeof entry.postUrl !== "string" || entry.postUrl.length > 2_000) return null;
  try { if (new URL(entry.postUrl).protocol !== "https:") return null; } catch { return null; }
  return {
    schemaVersion: "owner-result-entry/1",
    resultId: entry.resultId,
    ventureId: "tehdejsi-svet",
    recommendationId: entry.recommendationId,
    postUrl: entry.postUrl,
    enteredBy: "owner",
    ...fields
  };
}
