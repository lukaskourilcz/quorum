import { readdir } from "node:fs/promises";
import {
  ContestOwnerEventSchema,
  ContestRecordSchema,
  ContestRunSchema,
  type ContestOwnerEvent,
  type ContestRecord,
  type ContestRun
} from "../../contracts/contest-radar.js";
import { atomicWriteJson, readJson, resolveStatePath } from "../../state.js";
import type { ContestFetchCache } from "./fetch.js";

/**
 * Where Contest Radar keeps what it found and what the owner did about it, in two separate places.
 *
 * A record is what the world says about an opportunity and it is rewritten whenever the world
 * changes. An owner event is what the owner did and it is never rewritten at all — the file is
 * append-only, and a mistake is corrected by appending a correction that names the event it
 * supersedes. Merging the two stores would mean tomorrow's scan could overwrite the fact that
 * somebody entered something, which is the one piece of history this venture cannot regenerate.
 *
 * A field the owner corrected is locked on the record, and re-extraction leaves it alone. That is
 * the only direction the two stores touch: the owner outranks the extractor, never the reverse.
 */

export function contestRecordRef(id: string): string {
  return `ventures/contest-radar/records/${id}.json`;
}

export function contestRunRef(date: string): string {
  return `ventures/contest-radar/runs/${date}.json`;
}

export const CONTEST_OWNER_EVENTS_REF = "ventures/contest-radar/owner-events.json";
export const CONTEST_FETCH_CACHE_REF = "ventures/contest-radar/fetch-cache.json";

/**
 * Write a record, preserving every field the owner has corrected.
 *
 * `lockedFields` is the owner's veto over re-extraction. A deadline they fixed by hand survives
 * tomorrow's scan reading the listing wrong again, which is what makes correcting one worth the
 * effort — otherwise the fix lasts until the next run and the owner learns not to bother.
 */
export async function writeContestRecord(root: string, record: ContestRecord): Promise<string> {
  const relative = contestRecordRef(record.id);
  const existing = await readJson<ContestRecord | null>(root, relative, null);
  let next = record;

  if (existing) {
    const locked = new Set(existing.lockedFields);
    const merged: Record<string, unknown> = { ...record };
    for (const field of locked) {
      const [head, tail] = field.split(".");
      if (!head) continue;
      if (tail) {
        const group = { ...(merged[head] as Record<string, unknown> | undefined) };
        const preserved = (existing as unknown as Record<string, Record<string, unknown>>)[head]?.[tail];
        if (preserved !== undefined) group[tail] = preserved;
        merged[head] = group;
      } else if ((existing as unknown as Record<string, unknown>)[head] !== undefined) {
        merged[head] = (existing as unknown as Record<string, unknown>)[head];
      }
    }
    next = ContestRecordSchema.parse({
      ...merged,
      lockedFields: existing.lockedFields,
      // First seen belongs to the first sighting, whatever a later run computes.
      firstSeenAt: existing.firstSeenAt
    });
  }

  await atomicWriteJson(root, relative, next);
  return relative;
}

export async function readContestRecords(root: string): Promise<{ records: ContestRecord[]; dropped: number }> {
  let names: string[];
  try {
    names = (await readdir(resolveStatePath(root, "ventures/contest-radar/records")))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { records: [], dropped: 0 };
    throw error;
  }

  const records: ContestRecord[] = [];
  let dropped = 0;
  for (const name of names) {
    let raw: unknown = null;
    try {
      raw = await readJson<unknown>(root, `ventures/contest-radar/records/${name}`, null);
    } catch {
      dropped += 1;
      continue;
    }
    const parsed = ContestRecordSchema.safeParse(raw);
    if (parsed.success) records.push(parsed.data);
    else dropped += 1;
  }
  return { records, dropped };
}

export async function writeContestRun(root: string, run: ContestRun): Promise<string> {
  const relative = contestRunRef(run.date);
  await atomicWriteJson(root, relative, ContestRunSchema.parse(run));
  return relative;
}

/**
 * Append one owner event. Nothing here ever rewrites an earlier one.
 *
 * A duplicate id is refused rather than overwritten: two different actions sharing an id means a
 * caller is generating them wrong, and silently keeping the second would lose the first.
 */
export async function appendContestOwnerEvent(root: string, event: ContestOwnerEvent): Promise<string> {
  const parsed = ContestOwnerEventSchema.parse(event);
  const existing = await readJson<{ events?: unknown } | null>(root, CONTEST_OWNER_EVENTS_REF, null);
  const events = Array.isArray(existing?.events)
    ? existing.events.flatMap((value) => {
      const candidate = ContestOwnerEventSchema.safeParse(value);
      return candidate.success ? [candidate.data] : [];
    })
    : [];

  if (events.some((entry) => entry.id === parsed.id)) {
    throw new Error(`Contest owner event ${parsed.id} already exists; append a correction instead.`);
  }
  if (parsed.supersedesEventId && !events.some((entry) => entry.id === parsed.supersedesEventId)) {
    throw new Error(`Contest owner event ${parsed.id} supersedes ${parsed.supersedesEventId}, which is not on file.`);
  }

  await atomicWriteJson(root, CONTEST_OWNER_EVENTS_REF, {
    schemaVersion: "contest-owner-events/1",
    events: [...events, parsed]
  });
  return CONTEST_OWNER_EVENTS_REF;
}

export async function readContestOwnerEvents(root: string): Promise<{ events: ContestOwnerEvent[]; dropped: number }> {
  let raw: { events?: unknown } | null = null;
  try {
    raw = await readJson<{ events?: unknown } | null>(root, CONTEST_OWNER_EVENTS_REF, null);
  } catch {
    return { events: [], dropped: 1 };
  }
  if (!Array.isArray(raw?.events)) return { events: [], dropped: 0 };

  const events: ContestOwnerEvent[] = [];
  let dropped = 0;
  for (const value of raw.events) {
    const parsed = ContestOwnerEventSchema.safeParse(value);
    if (parsed.success) events.push(parsed.data);
    else dropped += 1;
  }
  return { events, dropped };
}

/**
 * The events that still stand, with every superseded one removed.
 *
 * Superseded events remain on file — the history is the point — but a reader asking "what is true
 * now" should not have to reconstruct the chain itself and get it subtly wrong.
 */
export function effectiveOwnerEvents(events: readonly ContestOwnerEvent[]): ContestOwnerEvent[] {
  const superseded = new Set(
    events.map((event) => event.supersedesEventId).filter((value): value is string => value !== null)
  );
  return events.filter((event) => !superseded.has(event.id));
}

export async function readContestFetchCache(root: string): Promise<ContestFetchCache> {
  const raw = await readJson<ContestFetchCache | null>(root, CONTEST_FETCH_CACHE_REF, null).catch(() => null);
  return raw ?? {};
}

export async function writeContestFetchCache(root: string, cache: ContestFetchCache): Promise<string> {
  await atomicWriteJson(root, CONTEST_FETCH_CACHE_REF, cache);
  return CONTEST_FETCH_CACHE_REF;
}
