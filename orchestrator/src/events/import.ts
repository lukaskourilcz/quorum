import { createHash } from "node:crypto";
import { BoardlessEventsSchema, EVENT_SCOPES, MagazineEventSchema, type EventScope } from "../contracts/boardless-events.js";
import { canonicalJson } from "../hashing.js";
import { suggestedId } from "./candidates.js";

/**
 * Merging an owner-curated events file into the DNESKAi Akce store (#554, #592).
 *
 * The store is still the owner's: this is the bulk form of the admin's save, run by hand on a
 * file the owner has read, and it obeys the same rules `applyEvent` in
 * `site/src/lib/caught-up-events-store.ts` applies to one save. A new id is added with `added`
 * set to the import date; a future event already in the store is updated with the file's copy;
 * a past event is never touched, because an import is not a correction. Nothing here fetches,
 * calls a model or publishes: the existing cycle step syncs the store to aifirst.
 *
 * Every event the file offers is accounted for — added, updated, unchanged, skipped or dropped
 * with its reason — so a thin import reads as a thin import rather than as a quiet success.
 */

export interface StoreEvent {
  id: string;
  scope: EventScope;
  title: string;
  description?: string;
  starts: string;
  ends?: string;
  city?: string;
  venue?: string;
  online: boolean;
  url: string;
  price?: string;
  organizer?: string;
  added?: string;
  corrected?: string;
}

export interface StoreFile {
  schemaVersion: "boardless-events/1";
  updated: string;
  events: StoreEvent[];
}

export interface ImportOutcome {
  added: string[];
  updated: string[];
  unchanged: string[];
  /** Past events the file also lists: an import never rewrites history. */
  skipped: Array<{ id: string; reason: string }>;
  dropped: Array<{ index: number; title: string | null; reason: string }>;
  /** Optional fields left out because the reader would refuse them, per event. */
  notes: Array<{ id: string; note: string }>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/u;

/** The optional text fields and the lengths the reader keeps (aifirst `lib/events.ts`, the admin's `parseEvent`). */
const OPTIONAL_TEXT: ReadonlyArray<readonly [keyof StoreEvent, number, readonly string[]]> = [
  ["description", 280, ["description", "summary"]],
  ["city", 80, ["city"]],
  ["venue", 120, ["venue", "location", "place"]],
  ["price", 80, ["price", "cost"]],
  ["organizer", 120, ["organizer", "organiser", "host"]]
];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function firstString(raw: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) return value.trim().replace(/\s+/gu, " ");
  }
  return undefined;
}

/** `YYYY-MM-DD` from a date or the date part of a local or ISO date-time. */
function day(value: string | undefined): string | undefined {
  const front = value?.slice(0, 10);
  return front && DATE.test(front) && !Number.isNaN(Date.parse(`${front}T12:00:00Z`)) ? front : undefined;
}

/**
 * The events a curated file offers: a `boardless-events/1` envelope, any object with an
 * `events` or `items` array, or a bare array. Anything else offers nothing, and says so.
 */
export function eventsOffered(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  const envelope = record(value);
  if (!envelope) return null;
  for (const key of ["events", "items"]) {
    if (Array.isArray(envelope[key])) return envelope[key] as unknown[];
  }
  return null;
}

/**
 * One offered event in the store's shape, or the reason it cannot be one.
 *
 * Tolerates the aliases a hand-written or researched file tends to use (`start`, `date`, `link`,
 * `location`), derives a missing id the way the candidate helper suggests one, and takes the
 * scope from the file, or from `defaultScope` when the owner passed one. An https URL, a title,
 * a start date and a scope are required; the result must pass both the orchestrator's contract
 * and the reader's own parser, because the reader drops a whole file that carries one bad event.
 */
export function normalizeImportedEvent(
  value: unknown,
  options: { defaultScope?: EventScope } = {}
): { event: StoreEvent; notes: string[] } | { reason: string; title: string | null } {
  const raw = record(value);
  if (!raw) return { reason: "not an object", title: null };
  const title = firstString(raw, ["title", "name"]);
  if (!title) return { reason: "no title", title: null };
  if (title.length > 120) return { reason: "title longer than 120 characters", title };
  const starts = day(firstString(raw, ["starts", "start", "startDate", "start_date", "date"]));
  if (!starts) return { reason: "no start date as YYYY-MM-DD", title };
  const endsRaw = firstString(raw, ["ends", "end", "endDate", "end_date"]);
  const ends = day(endsRaw);
  if (endsRaw && !ends) return { reason: `end date ${endsRaw} is not YYYY-MM-DD`, title };
  if (ends && ends < starts) return { reason: "ends before it starts", title };
  const url = firstString(raw, ["url", "link", "href"]);
  if (!url || !url.startsWith("https://")) return { reason: "no https URL", title };
  try {
    new URL(url);
  } catch {
    return { reason: `URL ${url} does not parse`, title };
  }
  const scopeRaw = firstString(raw, ["scope"]);
  const scope = scopeRaw ?? options.defaultScope;
  if (!scope || !(EVENT_SCOPES as readonly string[]).includes(scope)) {
    return { reason: scopeRaw ? `scope ${scopeRaw} is neither cz nor global` : "no scope (pass --default-scope to set one)", title };
  }
  const idRaw = firstString(raw, ["id", "slug"]);
  const id = idRaw ?? suggestedId(title, starts, "");
  if (!SLUG.test(id)) return { reason: `id ${id || "(none)"} is not a lowercase slug`, title };

  const notes: string[] = [];
  // A researched list writes "online" where a city would go; that is a format, not a place.
  const onlineCity = /^online$/iu.test(firstString(raw, ["city"]) ?? "");
  const event: StoreEvent = { id, scope: scope as EventScope, title, starts, online: raw.online === true || onlineCity, url };
  if (ends && ends !== starts) event.ends = ends;
  for (const [field, max, keys] of OPTIONAL_TEXT) {
    const text = firstString(raw, keys);
    if (!text || (field === "city" && onlineCity)) continue;
    if (text.length > max) {
      notes.push(`${field} left out: longer than ${max} characters`);
      continue;
    }
    (event as unknown as Record<string, string>)[field] = text;
  }
  // `free: true` is the one price a list can state without a figure the owner must check.
  if (!event.price && raw.free === true) event.price = "Zdarma";
  const checked = MagazineEventSchema.safeParse(event);
  if (!checked.success) return { reason: checked.error.issues.map((issue) => issue.message).join("; ").slice(0, 200), title };
  return { event, notes };
}

function isPast(event: Pick<StoreEvent, "starts" | "ends">, today: string): boolean {
  return (event.ends ?? event.starts) < today;
}

/** Everything but the bookkeeping the store owns: what an update compares. */
function content(event: StoreEvent): Omit<StoreEvent, "added" | "corrected"> {
  const { added: _added, corrected: _corrected, ...rest } = event;
  return rest;
}

/**
 * Merge offered events into the store as of `today`.
 *
 * A duplicate id inside the file keeps its first occurrence and drops the rest by name, so the
 * file's own order decides rather than whichever copy happened to be written last.
 */
export function mergeImportedEvents(input: {
  store: StoreFile;
  offered: readonly unknown[];
  today: string;
  defaultScope?: EventScope;
}): { file: StoreFile; outcome: ImportOutcome } {
  const outcome: ImportOutcome = { added: [], updated: [], unchanged: [], skipped: [], dropped: [], notes: [] };
  const byId = new Map(input.store.events.map((event) => [event.id, event]));
  const seen = new Set<string>();
  input.offered.forEach((value, index) => {
    const normalized = normalizeImportedEvent(value, input.defaultScope ? { defaultScope: input.defaultScope } : {});
    if ("reason" in normalized) {
      outcome.dropped.push({ index, title: normalized.title, reason: normalized.reason });
      return;
    }
    const { event, notes } = normalized;
    if (seen.has(event.id)) {
      outcome.dropped.push({ index, title: event.title, reason: `id ${event.id} appears earlier in the file` });
      return;
    }
    seen.add(event.id);
    for (const note of notes) outcome.notes.push({ id: event.id, note });
    const existing = byId.get(event.id);
    if (existing && isPast(existing, input.today)) {
      outcome.skipped.push({ id: event.id, reason: "already in the store and past; an import is not a correction" });
      return;
    }
    if (!existing && isPast(event, input.today)) {
      outcome.skipped.push({ id: event.id, reason: "ended before the import date" });
      return;
    }
    if (existing && canonicalJson(content(existing)) === canonicalJson(event)) {
      outcome.unchanged.push(event.id);
      return;
    }
    byId.set(event.id, { ...event, added: existing?.added ?? input.today, ...(existing?.corrected ? { corrected: existing.corrected } : {}) });
    (existing ? outcome.updated : outcome.added).push(event.id);
  });
  const changed = outcome.added.length + outcome.updated.length > 0;
  const events = [...byId.values()].sort((a, b) => a.starts.localeCompare(b.starts) || a.title.localeCompare(b.title));
  const file: StoreFile = { schemaVersion: "boardless-events/1", updated: changed ? input.today : input.store.updated, events };
  BoardlessEventsSchema.parse(file);
  return { file, outcome };
}

/** The store as read, or an empty one when it has never been written. A malformed store stops the import. */
export function parseStore(value: unknown, today: string): StoreFile {
  if (value === undefined) return { schemaVersion: "boardless-events/1", updated: today, events: [] };
  const parsed = BoardlessEventsSchema.parse(value);
  return {
    schemaVersion: "boardless-events/1",
    updated: parsed.updated,
    events: parsed.events.map((event) => Object.fromEntries(
      Object.entries(event).filter(([, field]) => field !== null && field !== undefined)
    ) as unknown as StoreEvent)
  };
}

/** The receipt's name: the date and the first twelve hex of the offered file's hash. */
export function importHash(offered: unknown): string {
  return createHash("sha256").update(canonicalJson(offered)).digest("hex").slice(0, 12);
}
