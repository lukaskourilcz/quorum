export const OWNER_RESULT_METRICS = [
  "views",
  "likes",
  "comments",
  "shares",
  "saves",
  "follows",
  "linkTaps"
] as const;

export type OwnerResultMetric = (typeof OWNER_RESULT_METRICS)[number];
export type OwnerResultLocale = "cs" | "en";
export type OwnerResultMetrics = Record<OwnerResultMetric, number | null>;

export interface OwnerResultEntry {
  schemaVersion: "owner-result-entry/1";
  resultId: string;
  ventureId: string;
  recommendationId: string;
  locale: OwnerResultLocale;
  platform: string;
  postUrl: string;
  capturedAt: string;
  recordedAt: string;
  enteredBy: "owner";
  metrics: OwnerResultMetrics;
  note: string | null;
}

const RESULT_ID = /^result-[a-f0-9]{20}$/u;
const RECOMMENDATION_ID = /^rec-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function https(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function count(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
}

/** Parse the shared owner-result-entry/1 boundary without leaking malformed state to admin. */
export function parseOwnerResultEntry(value: unknown): OwnerResultEntry | null {
  const entry = object(value);
  if (!entry || !exactKeys(entry, [
    "schemaVersion", "resultId", "ventureId", "recommendationId", "locale", "platform",
    "postUrl", "capturedAt", "recordedAt", "enteredBy", "metrics", "note"
  ])) return null;
  const metrics = object(entry.metrics);
  if (!metrics || !exactKeys(metrics, OWNER_RESULT_METRICS) || !OWNER_RESULT_METRICS.every((key) => count(metrics[key]))) return null;
  if (!OWNER_RESULT_METRICS.some((key) => metrics[key] !== null)) return null;
  if (entry.schemaVersion !== "owner-result-entry/1" || typeof entry.resultId !== "string" || !RESULT_ID.test(entry.resultId)) return null;
  if (typeof entry.ventureId !== "string" || !SLUG.test(entry.ventureId) || entry.ventureId.length > 80) return null;
  if (typeof entry.recommendationId !== "string" || !RECOMMENDATION_ID.test(entry.recommendationId) || entry.recommendationId.length > 160) return null;
  if (entry.locale !== "cs" && entry.locale !== "en") return null;
  if (typeof entry.platform !== "string" || !SLUG.test(entry.platform) || entry.platform.length > 80) return null;
  if (!https(entry.postUrl) || typeof entry.capturedAt !== "string" || !INSTANT.test(entry.capturedAt)) return null;
  if (typeof entry.recordedAt !== "string" || !INSTANT.test(entry.recordedAt) || Date.parse(entry.capturedAt) > Date.parse(entry.recordedAt) || entry.enteredBy !== "owner") return null;
  if (entry.note !== null && (typeof entry.note !== "string" || !entry.note.trim() || entry.note.length > 500)) return null;
  return {
    ...entry,
    locale: entry.locale,
    enteredBy: "owner",
    metrics: Object.fromEntries(OWNER_RESULT_METRICS.map((key) => [key, metrics[key]])) as OwnerResultMetrics,
    note: entry.note === null ? null : entry.note.trim()
  } as OwnerResultEntry;
}
