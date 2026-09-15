import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  WebDevRecordSchema,
  WebDevRunSchema,
  parseWebDevCandidates,
  type WebDevCandidate,
  type WebDevRun
} from "../../contracts/webdev-signal.js";
import { atomicWriteJson, readJson, resolveStatePath } from "../../state.js";
import type { WebDevSelectionHistoryEntry } from "./selection/records.js";

/**
 * Where a Prague day's records live, and how a malformed one costs exactly one record.
 *
 * Every ref carries the `state/` prefix, the form the observation, the design payload and the
 * render receipt already use for evidence refs; a write strips it and resolves under the state
 * root. The venture directory is derived from the one path the registration reserves
 * (`schedule.statePath`), so the runs directory and its siblings cannot drift apart.
 *
 * Two of these directories are read back on later days. `candidates/` is a rolling window: a feed
 * that answers 304 today still carried yesterday's story, and a story that lost yesterday's margin
 * deserves today's comparison. `records/` is the selection history the cooldowns read, so the
 * same story is not chosen twice in a week. Both are parsed item by item, and a file that will not
 * parse is counted, never thrown.
 */

export interface WebDevDayRefs {
  venture: string;
  run: string;
  candidates: string;
  selection: string;
  record: string;
  brief: string;
  sourceCache: string;
  package: (locale: "cs" | "en") => string;
}

export function webDevDayRefs(runsStatePath: string, pragueDate: string): WebDevDayRefs {
  const venture = path.posix.dirname(runsStatePath);
  return {
    venture,
    run: `${runsStatePath}/${pragueDate}.json`,
    candidates: `${venture}/candidates/${pragueDate}.json`,
    selection: `${venture}/selections/${pragueDate}.json`,
    record: `${venture}/records/${pragueDate}.json`,
    brief: `${venture}/briefs/${pragueDate}.json`,
    sourceCache: `${venture}/sources/cache.json`,
    package: (locale) => `${venture}/packages/${pragueDate}-${locale}.json`
  };
}

export function webDevStateRelativePath(ref: string): string {
  return ref.replace(/^state\//u, "");
}

export async function writeWebDevJson(stateRoot: string, ref: string, value: unknown): Promise<void> {
  await atomicWriteJson(stateRoot, webDevStateRelativePath(ref), value);
}

async function readRaw(stateRoot: string, ref: string): Promise<{ value: unknown; malformed: boolean }> {
  try {
    return { value: await readJson<unknown>(stateRoot, webDevStateRelativePath(ref), null), malformed: false };
  } catch {
    return { value: null, malformed: true };
  }
}

/** The day's receipt when one exists and parses; `malformed` says a file was there but unreadable. */
export async function readWebDevRun(stateRoot: string, ref: string): Promise<{ run: WebDevRun | null; malformed: boolean }> {
  const raw = await readRaw(stateRoot, ref);
  if (raw.malformed) return { run: null, malformed: true };
  if (raw.value === null) return { run: null, malformed: false };
  const parsed = WebDevRunSchema.safeParse(raw.value);
  return parsed.success ? { run: parsed.data, malformed: false } : { run: null, malformed: true };
}

export async function readWebDevCandidateFile(stateRoot: string, ref: string): Promise<{ candidates: WebDevCandidate[]; dropped: number }> {
  const raw = await readRaw(stateRoot, ref);
  if (raw.value === null) return { candidates: [], dropped: raw.malformed ? 1 : 0 };
  if (!Array.isArray(raw.value)) return { candidates: [], dropped: 1 };
  return parseWebDevCandidates(raw.value);
}

function dayBefore(pragueDate: string, days: number): string {
  return new Date(Date.parse(`${pragueDate}T00:00:00.000Z`) - days * 86_400_000).toISOString().slice(0, 10);
}

async function datedFiles(stateRoot: string, directoryRef: string, from: string, to: string, includeTo: boolean): Promise<string[]> {
  let names: string[];
  try {
    names = await readdir(resolveStatePath(stateRoot, webDevStateRelativePath(directoryRef)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name))
    .map((name) => name.slice(0, 10))
    .filter((date) => date >= from && (includeTo ? date <= to : date < to))
    .sort();
}

/** Every stored candidate from `days` before the Prague day up to and including the day itself. */
export async function readWebDevCandidateWindow(
  stateRoot: string,
  refs: WebDevDayRefs,
  input: { pragueDate: string; days: number }
): Promise<{ candidates: WebDevCandidate[]; dropped: number }> {
  const directory = `${refs.venture}/candidates`;
  const dates = await datedFiles(stateRoot, directory, dayBefore(input.pragueDate, input.days), input.pragueDate, true);
  const candidates: WebDevCandidate[] = [];
  let dropped = 0;
  for (const date of dates) {
    const file = await readWebDevCandidateFile(stateRoot, `${directory}/${date}.json`);
    candidates.push(...file.candidates);
    dropped += file.dropped;
  }
  return { candidates, dropped };
}

/** The records selected on earlier days, in the shape the cooldown gates read. */
export async function readWebDevSelectionHistory(
  stateRoot: string,
  refs: WebDevDayRefs,
  input: { pragueDate: string; days: number }
): Promise<{ history: WebDevSelectionHistoryEntry[]; dropped: number }> {
  const directory = `${refs.venture}/records`;
  const dates = await datedFiles(stateRoot, directory, dayBefore(input.pragueDate, input.days), input.pragueDate, false);
  const history: WebDevSelectionHistoryEntry[] = [];
  let dropped = 0;
  for (const date of dates) {
    const raw = await readRaw(stateRoot, `${directory}/${date}.json`);
    const parsed = WebDevRecordSchema.safeParse(raw.value);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    history.push({
      recordId: parsed.data.id,
      canonicalUrl: parsed.data.canonicalUrl,
      project: parsed.data.project,
      topic: parsed.data.topic,
      selectedAt: parsed.data.lastSeenAt
    });
  }
  return { history, dropped };
}
