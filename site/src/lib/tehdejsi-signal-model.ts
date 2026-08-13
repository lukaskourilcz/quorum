export interface TehdejsiSignalHarvestInput { sourceLabel: string; comments: string[] }
export interface TehdejsiSignalHarvest extends TehdejsiSignalHarvestInput {
  schemaVersion: "ts-signal/1";
  kind: "harvest";
  id: string;
  ventureId: "tehdejsi-svet";
  source: "owner-paste";
  pastedAt: string;
}
export interface TehdejsiSignalRecollection {
  text: string;
  classification: "recollection-not-fact";
  allowedUses: readonly ["research-question", "prompt-seed"];
}
export interface TehdejsiSignalTheme { label: string; recurrence: number; lastSeenAt: string }
export interface TehdejsiSignalRequest { kind: "city" | "year"; value: string; recurrence: number; lastSeenAt: string }
export interface TehdejsiSignalDigest {
  schemaVersion: "ts-signal/1";
  kind: "sunday-digest";
  id: string;
  ventureId: "tehdejsi-svet";
  date: string;
  extractedAt: string;
  sourceHarvestIds: string[];
  recollections: TehdejsiSignalRecollection[];
  themes: TehdejsiSignalTheme[];
  requests: TehdejsiSignalRequest[];
  correctionClaims: TehdejsiSignalRecollection[];
}

const object = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;

export function parseTehdejsiSignalHarvestInput(value: unknown): TehdejsiSignalHarvestInput | null {
  const input = object(value);
  if (!input || !exact(input, ["sourceLabel", "comments"]) || typeof input.sourceLabel !== "string" ||
      !input.sourceLabel.trim() || input.sourceLabel.length > 120 || !Array.isArray(input.comments) ||
      input.comments.length < 1 || input.comments.length > 50) return null;
  const comments = input.comments.map((comment) => typeof comment === "string" ? comment.trim().replace(/\s+/gu, " ") : "");
  if (comments.some((comment) => !comment || comment.length > 600)) return null;
  if (new Set(comments.map((comment) => comment.toLocaleLowerCase("und"))).size !== comments.length) return null;
  return { sourceLabel: input.sourceLabel.trim(), comments };
}

export function parseTehdejsiSignalHarvest(value: unknown): TehdejsiSignalHarvest | null {
  const record = object(value);
  if (!record || !exact(record, ["schemaVersion", "kind", "id", "ventureId", "source", "sourceLabel", "pastedAt", "comments"]) ||
      record.schemaVersion !== "ts-signal/1" || record.kind !== "harvest" || record.ventureId !== "tehdejsi-svet" || record.source !== "owner-paste" ||
      typeof record.id !== "string" || !/^ts-signal-harvest-[a-f0-9]{20}$/u.test(record.id) || typeof record.pastedAt !== "string" ||
      !INSTANT.test(record.pastedAt) || Number.isNaN(Date.parse(record.pastedAt))) return null;
  const input = parseTehdejsiSignalHarvestInput({ sourceLabel: record.sourceLabel, comments: record.comments });
  return input ? { schemaVersion: "ts-signal/1", kind: "harvest", id: record.id, ventureId: "tehdejsi-svet", source: "owner-paste", pastedAt: record.pastedAt, ...input } : null;
}

function instant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function date(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  try { return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value; } catch { return false; }
}

function parseRecollection(value: unknown): TehdejsiSignalRecollection | null {
  const item = object(value);
  if (!item || !exact(item, ["text", "classification", "allowedUses"]) || typeof item.text !== "string" ||
      !item.text.trim() || item.text.length > 600 || item.classification !== "recollection-not-fact" ||
      !Array.isArray(item.allowedUses) || item.allowedUses.length !== 2 || item.allowedUses[0] !== "research-question" ||
      item.allowedUses[1] !== "prompt-seed") return null;
  return { text: item.text.trim(), classification: "recollection-not-fact", allowedUses: ["research-question", "prompt-seed"] };
}

export function parseTehdejsiSignalDigest(value: unknown): TehdejsiSignalDigest | null {
  const digest = object(value);
  if (!digest || !exact(digest, ["schemaVersion", "kind", "id", "ventureId", "date", "extractedAt", "sourceHarvestIds", "recollections", "themes", "requests", "correctionClaims"]) ||
      digest.schemaVersion !== "ts-signal/1" || digest.kind !== "sunday-digest" || digest.ventureId !== "tehdejsi-svet" ||
      typeof digest.id !== "string" || !/^ts-signal-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(digest.id) || digest.id.length > 160 ||
      !date(digest.date) || !instant(digest.extractedAt) ||
      !Array.isArray(digest.sourceHarvestIds) || digest.sourceHarvestIds.length < 1 || digest.sourceHarvestIds.length > 200 ||
      digest.sourceHarvestIds.some((id) => typeof id !== "string" || !/^ts-signal-harvest-[a-f0-9]{20}$/u.test(id)) ||
      new Set(digest.sourceHarvestIds).size !== digest.sourceHarvestIds.length || !Array.isArray(digest.recollections) ||
      digest.recollections.length < 1 || digest.recollections.length > 2_000 || !Array.isArray(digest.themes) || digest.themes.length > 200 ||
      !Array.isArray(digest.requests) || digest.requests.length > 200 || !Array.isArray(digest.correctionClaims) || digest.correctionClaims.length > 200) return null;
  const recollections = digest.recollections.map(parseRecollection);
  const correctionClaims = digest.correctionClaims.map(parseRecollection);
  if (recollections.some((item) => item === null) || correctionClaims.some((item) => item === null)) return null;
  const themes: TehdejsiSignalTheme[] = [];
  for (const raw of digest.themes) {
    const item = object(raw);
    if (!item || !exact(item, ["label", "recurrence", "lastSeenAt"]) || typeof item.label !== "string" || !item.label.trim() ||
        item.label.length > 120 || !Number.isSafeInteger(item.recurrence) || Number(item.recurrence) < 1 || Number(item.recurrence) > 1_000 ||
        !instant(item.lastSeenAt)) return null;
    themes.push({ label: item.label.trim(), recurrence: item.recurrence as number, lastSeenAt: item.lastSeenAt });
  }
  const requests: TehdejsiSignalRequest[] = [];
  for (const raw of digest.requests) {
    const item = object(raw);
    if (!item || !exact(item, ["kind", "value", "recurrence", "lastSeenAt"]) || (item.kind !== "city" && item.kind !== "year") ||
        typeof item.value !== "string" || !item.value.trim() || item.value.length > 120 ||
        (item.kind === "year" && !/^(?:19|20)\d{2}$/u.test(item.value)) || !Number.isSafeInteger(item.recurrence) ||
        Number(item.recurrence) < 1 || Number(item.recurrence) > 1_000 || !instant(item.lastSeenAt)) return null;
    requests.push({ kind: item.kind, value: item.value.trim(), recurrence: item.recurrence as number, lastSeenAt: item.lastSeenAt });
  }
  const uniqueThemes = new Set(themes.map(({ label }) => label.toLocaleLowerCase("und")));
  const uniqueRequests = new Set(requests.map(({ kind, value }) => `${kind}:${value.toLocaleLowerCase("und")}`));
  const corrections = correctionClaims as TehdejsiSignalRecollection[];
  if (uniqueThemes.size !== themes.length || uniqueRequests.size !== requests.length ||
      new Set(corrections.map(({ text }) => text.toLocaleLowerCase("und"))).size !== corrections.length) return null;
  return {
    schemaVersion: "ts-signal/1", kind: "sunday-digest", id: digest.id, ventureId: "tehdejsi-svet", date: digest.date,
    extractedAt: digest.extractedAt, sourceHarvestIds: digest.sourceHarvestIds as string[],
    recollections: recollections as TehdejsiSignalRecollection[], themes, requests, correctionClaims: corrections
  };
}
