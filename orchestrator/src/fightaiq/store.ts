import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { BoutRecordSchema, EventCardSchema, FighterCardSchema, OddsSnapshotSchema, SourceProposalSchema, TrackRecordSchema, independentMmaSourceCount, type BoutRecord, type EventCard, type FighterRecord, type SourceProposal, type TrackRecord } from "../contracts/mma.js";
import { repoRoot, stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";

async function jsonFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => entry.isDirectory() ? jsonFiles(path.join(root, entry.name)) : Promise.resolve(entry.name.endsWith(".json") ? [path.join(root, entry.name)] : [])));
    return nested.flat().sort();
  } catch {
    return [];
  }
}

export const mmaStateRoot = path.join(stateRoot, "mma");

export async function loadFighterRecords(root = path.join(mmaStateRoot, "fighters")): Promise<FighterRecord[]> {
  const records: FighterRecord[] = [];
  for (const file of await jsonFiles(root)) records.push(FighterCardSchema.parse(JSON.parse(await readFile(file, "utf8"))));
  return records.sort((left, right) => left.org.localeCompare(right.org) || left.canonicalName.localeCompare(right.canonicalName));
}

export async function loadEventCards(root = path.join(mmaStateRoot, "events")): Promise<EventCard[]> {
  const records: EventCard[] = [];
  for (const file of await jsonFiles(root)) records.push(EventCardSchema.parse(JSON.parse(await readFile(file, "utf8"))));
  return records.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
}

export function publicFighterMirror(value: unknown): FighterRecord {
  const parsed = FighterCardSchema.parse(structuredClone(value));
  const disputed = new Set(parsed.discrepancies.filter((item) => item.status === "open").map((item) => item.field));
  const fields = Object.fromEntries(Object.entries(parsed.fields).map(([name, field]) => [name, disputed.has(name) ? { ...field, status: "disputed" as const, corroborated: false } : field]));
  const modelEligible = parsed.criticalFields.every((name) => {
    const field = fields[name];
    return Boolean(field?.status === "verified" && field.corroborated && independentMmaSourceCount(field.sourceRefs) >= 2);
  });
  return FighterCardSchema.parse({
    ...parsed,
    fields,
    discrepancies: [],
    changeLog: parsed.changeLog.map((entry) => ({ ...entry, note: "Card state changed from the cited source set." })),
    modelEligible
  });
}

export function publicEventMirror(value: unknown): EventCard {
  return EventCardSchema.parse(structuredClone(value));
}

export function publicBoutMirror(value: unknown): BoutRecord {
  const parsed = BoutRecordSchema.parse(structuredClone(value));
  return BoutRecordSchema.parse({
    ...parsed,
    statusHistory: parsed.statusHistory.map((entry) => ({ ...entry, note: `Bout status recorded as ${entry.status}.` })),
    changeLog: parsed.changeLog.map((entry) => ({ ...entry, note: "Bout state changed from the cited source set." }))
  });
}

export async function loadBoutRecords(root = path.join(mmaStateRoot, "bouts")): Promise<BoutRecord[]> {
  const records: BoutRecord[] = [];
  for (const file of await jsonFiles(root)) records.push(BoutRecordSchema.parse(JSON.parse(await readFile(file, "utf8"))));
  return records.sort((left, right) => left.event.startsAtUtc.localeCompare(right.event.startsAtUtc) || left.id.localeCompare(right.id));
}

function boutRelativePath(bout: BoutRecord): string {
  return `mma/bouts/${bout.org}/${bout.id.replace(`${bout.org}:bout:`, "")}.json`;
}

export async function saveBoutRecord(value: unknown, root = stateRoot): Promise<{ path: string; repeated: boolean }> {
  const bout = BoutRecordSchema.parse(value);
  const relative = boutRelativePath(bout);
  const target = path.join(root, relative);
  try {
    const existing = BoutRecordSchema.parse(JSON.parse(await readFile(target, "utf8")));
    if (JSON.stringify(existing) === JSON.stringify(bout)) return { path: relative, repeated: true };
    const historyPrefix = JSON.stringify(bout.statusHistory.slice(0, existing.statusHistory.length));
    if (historyPrefix !== JSON.stringify(existing.statusHistory) || bout.statusHistory.length < existing.statusHistory.length) {
      throw new Error("Bout status history is append-only");
    }
    const changePrefix = JSON.stringify(bout.changeLog.slice(0, existing.changeLog.length));
    if (changePrefix !== JSON.stringify(existing.changeLog) || bout.changeLog.length < existing.changeLog.length) {
      throw new Error("Bout change log is append-only");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWriteJson(root, relative, bout);
  return { path: relative, repeated: false };
}

export function upcomingBoutRecords(bouts: readonly BoutRecord[], now = new Date()): BoutRecord[] {
  return bouts
    .filter((bout) => !["completed", "cancelled", "postponed"].includes(bout.status) && Date.parse(bout.event.startsAtUtc) >= now.getTime())
    .sort((left, right) => left.event.startsAtUtc.localeCompare(right.event.startsAtUtc) || left.id.localeCompare(right.id));
}

export async function saveOddsSnapshot(value: unknown, root = stateRoot): Promise<{ path: string; repeated: boolean }> {
  const snapshot = OddsSnapshotSchema.parse(value);
  const id = createHash("sha256").update(`${snapshot.boutRef}:${snapshot.phase}:${snapshot.source}`).digest("hex").slice(0, 16);
  const relative = `mma/odds/${id}.json`;
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const existing = OddsSnapshotSchema.parse(JSON.parse(await readFile(target, "utf8")));
    if (JSON.stringify(existing) === JSON.stringify(snapshot)) return { path: relative, repeated: true };
    throw new Error("An odds snapshot already exists for this bout, phase and source");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await atomicWriteJson(root, relative, snapshot);
  return { path: relative, repeated: false };
}

export function normalizedSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
  url.searchParams.sort();
  return url.toString();
}

export async function saveSourceProposal(value: unknown, root = stateRoot): Promise<{ path: string; repeated: boolean }> {
  const proposal = SourceProposalSchema.parse(value);
  if (proposal.tosVerdict.status === "forbidden" && proposal.status === "wired") throw new Error("A forbidden source cannot be wired");
  const normalized = normalizedSourceUrl(proposal.url);
  const directory = path.join(root, "mma", "source-proposals");
  for (const file of await jsonFiles(directory)) {
    const existing = SourceProposalSchema.parse(JSON.parse(await readFile(file, "utf8")));
    if (normalizedSourceUrl(existing.url) !== normalized) continue;
    if (JSON.stringify(existing) === JSON.stringify(proposal)) return { path: path.relative(root, file), repeated: true };
    throw new Error("A proposal for this normalized source URL already exists");
  }
  const id = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  const relative = `mma/source-proposals/${id}.json`;
  await atomicWriteJson(root, relative, proposal);
  return { path: relative, repeated: false };
}

type TrackPick = TrackRecord["picks"][number];

export async function appendTrackRecordPick(value: unknown, root = stateRoot, now = new Date()): Promise<{ path: string; repeated: boolean }> {
  const pick = TrackRecordSchema.shape.picks.element.parse(value);
  const relative = "mma/track-record.json";
  let current: TrackRecord = TrackRecordSchema.parse({ schemaVersion: "track-record/1", picks: [], rollups: [], updatedAt: now.toISOString() });
  try {
    current = TrackRecordSchema.parse(JSON.parse(await readFile(path.join(root, relative), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const existing = current.picks.find((candidate) => candidate.id === pick.id);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(pick)) return { path: relative, repeated: true };
    throw new Error("A published FightAIQ pick is immutable");
  }
  const picks = [...current.picks, pick].sort((left, right) => left.publishedAt.localeCompare(right.publishedAt) || left.id.localeCompare(right.id));
  const keys = [...new Set(picks.map((candidate) => `${candidate.modelVersion}:${candidate.org}`))].sort();
  const rollups = keys.map((key) => {
    const split = key.lastIndexOf(":");
    const modelVersion = key.slice(0, split);
    const org = key.slice(split + 1) as TrackPick["org"];
    const group = picks.filter((candidate) => candidate.modelVersion === modelVersion && candidate.org === org);
    const brier = group.flatMap((candidate) => candidate.brierContribution === null ? [] : [candidate.brierContribution]);
    const clv = group.flatMap((candidate) => candidate.clv === null ? [] : [candidate.clv]);
    const mean = (items: number[]) => items.length ? Number((items.reduce((sum, item) => sum + item, 0) / items.length).toFixed(8)) : null;
    return { modelVersion, org, picks: group.length, brier: mean(brier), meanClv: mean(clv) };
  });
  await atomicWriteJson(root, relative, TrackRecordSchema.parse({ schemaVersion: "track-record/1", picks, rollups, updatedAt: now.toISOString() }));
  return { path: relative, repeated: false };
}

function pragueDay(value: Date): number {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(value);
  return Math.floor(Date.parse(`${date}T12:00:00.000Z`) / 86_400_000);
}

export type FightClockState = "building-files" | "three-days-out" | "fight-week" | "results-in";

export function fightClock(event: EventCard, now: Date): { state: FightClockState; label: string; daysUntil: number } {
  const starts = new Date(event.startsAtUtc);
  const daysUntil = pragueDay(starts) - pragueDay(now);
  if (event.bouts.every((bout) => bout.status === "complete") || daysUntil < 0) return { state: "results-in", label: "Results are in", daysUntil };
  if (daysUntil <= 1) return { state: "fight-week", label: "Fight week", daysUntil };
  if (daysUntil <= 3) return { state: "three-days-out", label: "3 days out: the team is focused on this card", daysUntil };
  return { state: "building-files", label: "Building the fighter files", daysUntil };
}

export function fightWeekFocus(events: readonly EventCard[], now: Date): EventCard[] {
  return events.filter((event) => {
    const days = fightClock(event, now).daysUntil;
    return days >= 0 && days <= 3;
  }).sort((left, right) => {
    const proximity = fightClock(left, now).daysUntil - fightClock(right, now).daysUntil;
    return proximity || left.org.localeCompare(right.org) || left.id.localeCompare(right.id);
  });
}

export function fighterStatePath(record: FighterRecord): string {
  return path.join(repoRoot, "state", "mma", "fighters", `${record.id}.json`);
}
