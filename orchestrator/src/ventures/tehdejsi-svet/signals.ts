import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  TehdejsiSignalDigestSchema,
  TehdejsiSignalHarvestSchema,
  type TehdejsiSignalDigest,
  type TehdejsiSignalHarvest
} from "../../contracts/tehdejsi-signal.js";
import { atomicWriteJson } from "../../state.js";

const SIGNALS_ROOT = "ventures/tehdejsi-svet/signals";
const ANNOTATION = /\[(?:theme|téma|тема|city|město|місто|year|rok|рік|correction|oprava|виправлення)\s*:\s*[^\]]+\]/giu;

type Recurrence = { label: string; recurrence: number; lastSeenAt: string };
type Request = TehdejsiSignalDigest["requests"][number];

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function valuesFor(comment: string, names: string): string[] {
  const expression = new RegExp(`\\[(?:${names})\\s*:\\s*([^\\]]+)\\]`, "giu");
  return [...comment.matchAll(expression)].map((match) => normalize(match[1] ?? "")).filter(Boolean);
}

function recurrence<T extends { key: string; label: string; at: string }>(items: T[]): Recurrence[] {
  const totals = new Map<string, Recurrence>();
  for (const item of items) {
    const existing = totals.get(item.key);
    if (existing) {
      existing.recurrence += 1;
      if (item.at > existing.lastSeenAt) existing.lastSeenAt = item.at;
    } else totals.set(item.key, { label: item.label, recurrence: 1, lastSeenAt: item.at });
  }
  return [...totals.values()].sort((left, right) =>
    right.recurrence - left.recurrence || left.label.localeCompare(right.label, "und")
  ).slice(0, 200);
}

function requests(items: Array<{ kind: "city" | "year"; value: string; at: string }>): Request[] {
  const totals = new Map<string, Request>();
  for (const item of items) {
    if (item.kind === "year" && !/^(?:19|20)\d{2}$/u.test(item.value)) continue;
    const key = `${item.kind}:${item.value.toLocaleLowerCase("und")}`;
    const existing = totals.get(key);
    if (existing) {
      existing.recurrence += 1;
      if (item.at > existing.lastSeenAt) existing.lastSeenAt = item.at;
    } else totals.set(key, { kind: item.kind, value: item.value, recurrence: 1, lastSeenAt: item.at });
  }
  return [...totals.values()].sort((left, right) =>
    right.recurrence - left.recurrence || left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value, "und")
  ).slice(0, 200);
}

const recollection = (text: string) => ({
  text: normalize(text),
  classification: "recollection-not-fact" as const,
  allowedUses: ["research-question", "prompt-seed"] as const
});

/**
 * Deterministic Sunday extraction. Optional inline labels make the owner's intent explicit:
 * `[theme: …]`, `[city: …]`, `[year: 1989]`, and `[correction: …]` (including the documented
 * Czech and Ukrainian label variants). Unlabelled prose remains a recollection only.
 */
export function extractSundaySignalDigest(input: {
  date: string;
  extractedAt: string;
  harvests: readonly TehdejsiSignalHarvest[];
}): TehdejsiSignalDigest {
  const harvests = [...input.harvests].sort((left, right) => left.pastedAt.localeCompare(right.pastedAt) || left.id.localeCompare(right.id));
  const themeItems: Array<{ key: string; label: string; at: string }> = [];
  const requestItems: Array<{ kind: "city" | "year"; value: string; at: string }> = [];
  const recollections: ReturnType<typeof recollection>[] = [];
  const corrections: ReturnType<typeof recollection>[] = [];

  for (const harvest of harvests) {
    for (const comment of harvest.comments) {
      const stripped = normalize(comment.replace(ANNOTATION, " ")) || normalize(comment);
      recollections.push(recollection(stripped));
      for (const label of valuesFor(comment, "theme|téma|тема")) {
        themeItems.push({ key: label.toLocaleLowerCase("und"), label, at: harvest.pastedAt });
      }
      for (const value of valuesFor(comment, "city|město|місто")) requestItems.push({ kind: "city", value, at: harvest.pastedAt });
      for (const value of valuesFor(comment, "year|rok|рік")) requestItems.push({ kind: "year", value, at: harvest.pastedAt });
      for (const claim of valuesFor(comment, "correction|oprava|виправлення")) corrections.push(recollection(claim));
    }
  }

  const sourceHarvestIds = harvests.map(({ id }) => id);
  const digestHash = createHash("sha256")
    .update(JSON.stringify({ date: input.date, sourceHarvestIds }))
    .digest("hex")
    .slice(0, 12);
  return TehdejsiSignalDigestSchema.parse({
    schemaVersion: "ts-signal/1",
    kind: "sunday-digest",
    id: `ts-signal-digest-${input.date}-${digestHash}`,
    ventureId: "tehdejsi-svet",
    date: input.date,
    extractedAt: input.extractedAt,
    sourceHarvestIds,
    recollections,
    themes: recurrence(themeItems),
    requests: requests(requestItems),
    correctionClaims: [...new Map(corrections.map((item) => [item.text.toLocaleLowerCase("und"), item])).values()].slice(0, 200)
  });
}

async function collection<T>(directory: string, parse: (value: unknown) => T | null): Promise<T[]> {
  let names: string[];
  try { names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: T[] = [];
  for (const name of names) {
    try {
      const value = parse(JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown);
      if (value && name === `${(value as { id?: string }).id}.json`) records.push(value);
    } catch { /* Malformed owner input is dropped rather than reinterpreted. */ }
  }
  return records;
}

export async function runSundaySignalOverlay(input: {
  root: string;
  date: string;
  now: Date;
  approvalGranted: boolean;
}): Promise<string[]> {
  if (!input.approvalGranted || new Date(`${input.date}T12:00:00.000Z`).getUTCDay() !== 0) return [];
  const [harvests, digests] = await Promise.all([
    collection(path.join(input.root, SIGNALS_ROOT, "harvests"), (value) => {
      const parsed = TehdejsiSignalHarvestSchema.safeParse(value);
      return parsed.success && Date.parse(parsed.data.pastedAt) <= input.now.getTime() ? parsed.data : null;
    }),
    collection(path.join(input.root, SIGNALS_ROOT, "digests"), (value) => {
      const parsed = TehdejsiSignalDigestSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    })
  ]);
  const consumed = new Set(digests.flatMap(({ sourceHarvestIds }) => sourceHarvestIds));
  const pending: TehdejsiSignalHarvest[] = [];
  let commentCount = 0;
  for (const harvest of harvests.filter(({ id }) => !consumed.has(id))) {
    if (pending.length >= 200 || commentCount + harvest.comments.length > 2_000) break;
    pending.push(harvest);
    commentCount += harvest.comments.length;
  }
  if (!pending.length) return [];
  const digest = extractSundaySignalDigest({ date: input.date, extractedAt: input.now.toISOString(), harvests: pending });
  const relative = `${SIGNALS_ROOT}/digests/${digest.id}.json`;
  await atomicWriteJson(input.root, relative, digest);
  return [relative];
}
