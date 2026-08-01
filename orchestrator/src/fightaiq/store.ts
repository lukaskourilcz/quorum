import { createHash } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { EventCardSchema, FighterRecordSchema, OddsSnapshotSchema, type EventCard, type FighterRecord } from "../contracts/mma.js";
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

export async function loadFighterRecords(root = path.join(stateRoot, "ventures", "fightaiq", "fighters")): Promise<FighterRecord[]> {
  const records: FighterRecord[] = [];
  for (const file of await jsonFiles(root)) records.push(FighterRecordSchema.parse(JSON.parse(await readFile(file, "utf8"))));
  return records.sort((left, right) => left.org.localeCompare(right.org) || String(left.fields.name?.value ?? left.slug).localeCompare(String(right.fields.name?.value ?? right.slug)));
}

export async function loadEventCards(root = path.join(stateRoot, "ventures", "fightaiq", "events")): Promise<EventCard[]> {
  const records: EventCard[] = [];
  for (const file of await jsonFiles(root)) records.push(EventCardSchema.parse(JSON.parse(await readFile(file, "utf8"))));
  return records.sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
}

export function publicFighterMirror(value: unknown): FighterRecord {
  const parsed = FighterRecordSchema.parse(structuredClone(value));
  return parsed;
}

export function publicEventMirror(value: unknown): EventCard {
  return EventCardSchema.parse(structuredClone(value));
}

export async function saveOddsSnapshot(value: unknown, root = stateRoot): Promise<{ path: string; repeated: boolean }> {
  const snapshot = OddsSnapshotSchema.parse(value);
  const id = createHash("sha256").update(`${snapshot.boutRef}:${snapshot.phase}:${snapshot.source}`).digest("hex").slice(0, 16);
  const relative = `ventures/fightaiq/odds/${id}.json`;
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

export type FightClockState = "building-files" | "three-days-out" | "fight-week" | "results-in";

export function fightClock(event: EventCard, now: Date): { state: FightClockState; label: string; daysUntil: number } {
  const starts = new Date(event.startsAtUtc);
  const daysUntil = Math.ceil((starts.getTime() - now.getTime()) / 86_400_000);
  if (event.bouts.every((bout) => bout.status === "complete") || daysUntil < 0) return { state: "results-in", label: "Results are in", daysUntil };
  if (daysUntil <= 1) return { state: "fight-week", label: "Fight week", daysUntil };
  if (daysUntil <= 3) return { state: "three-days-out", label: "3 days out: the team is focused on this card", daysUntil };
  return { state: "building-files", label: "Building the fighter files", daysUntil };
}

export function fighterStatePath(record: FighterRecord): string {
  return path.join(repoRoot, "state", "ventures", "fightaiq", "fighters", record.org, `${record.slug}.json`);
}
