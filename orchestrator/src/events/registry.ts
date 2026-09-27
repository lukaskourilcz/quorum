import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { openObject } from "../contracts/common.js";
import { EVENT_CANDIDATE_SOURCE_KINDS } from "../contracts/event-candidates.js";
import { configRoot } from "../paths.js";

/**
 * The event calendars the candidate helper is allowed to read.
 *
 * Same posture as the stream registry: every entry carries the exact hostname
 * that must also appear in `config/network-allowlist.json`, and a source whose
 * URL could not be resolved ships `enabled: false` with a note rather than a
 * guessed address. Reading a calendar costs nothing — no model call anywhere on
 * this path — and it can only ever produce a suggestion. The events store is
 * still written by hand, from the admin, one save at a time.
 */
export const EventSourceEntrySchema = openObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/u),
  kind: z.enum(EVENT_CANDIDATE_SOURCE_KINDS),
  name: z.string().trim().min(1).max(80),
  /**
   * The exact URL to read. `{year}` expands to the run's year and the one
   * after it, which is what keeps a year-partitioned listing working across a
   * January without an edit. Held as a string rather than a URL because the
   * brace is only a URL once it has been expanded.
   */
  url: z.string().trim().startsWith("https://").max(300).optional(),
  host: z.string().trim().min(1).max(120),
  /** The scope the form pre-selects. A listing's own country still wins. */
  scope: z.enum(["cz", "global"]),
  /**
   * Whether a candidate has to look like an AI event to be offered.
   *
   * A curated AI calendar needs no filter — everything in it is on topic. A
   * general conference listing does, or the owner opens the panel to ninety
   * developer conferences with nothing to do with the magazine.
   */
  topicFilter: z.boolean(),
  /** What the listing permits. Recorded because a candidate is reused copy. */
  license: z.string().trim().min(1).max(200),
  maxCandidates: z.number().int().positive().max(60).default(20),
  enabled: z.boolean().default(true),
  note: z.string().trim().min(1).max(300).optional(),
});

export const EventSourceRegistrySchema = openObject({
  schemaVersion: z.literal("caught-up-event-sources/1"),
  /** Candidates further out than this are noise the owner cannot act on. */
  windowDays: z.number().int().positive().max(730),
  /** Matched as whole words, so "ai" does not match "Ukraine". */
  topicKeywords: z.array(z.string().trim().min(2).max(40)).min(1),
  /** Every spelling a listing uses for the country that makes a `cz` event. */
  czechCountries: z.array(z.string().trim().min(2).max(40)).min(1),
  sources: z.array(EventSourceEntrySchema).min(1).max(20),
}).refine(
  (registry) => new Set(registry.sources.map((source) => source.id)).size === registry.sources.length,
  { message: "event source ids must be unique", path: ["sources"] },
).refine(
  // `event-candidates/1` holds 200. Enforcing it here means a cap raise fails
  // the config that made it rather than silently truncating the panel.
  (registry) => registry.sources.reduce((total, source) => total + source.maxCandidates, 0) <= 200,
  { message: "the source caps together exceed the 200 a candidate file holds", path: ["sources"] },
);

export type EventSourceEntry = z.infer<typeof EventSourceEntrySchema>;
export type EventSourceRegistry = z.infer<typeof EventSourceRegistrySchema>;

export function eventRegistryPath(): string {
  return path.join(configRoot, "caught-up-events.json");
}

export function loadEventSourceRegistry(file = eventRegistryPath()): EventSourceRegistry {
  return EventSourceRegistrySchema.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** The sources a run may read: enabled and carrying a URL to expand. */
export function fetchableEventSources(registry: EventSourceRegistry): EventSourceEntry[] {
  return registry.sources.filter((source) => source.enabled && source.url);
}

/** Every host a run can contact, for the allowlist cross-check. */
export function eventSourceHosts(registry: EventSourceRegistry): string[] {
  return [...new Set(fetchableEventSources(registry).map((source) => source.host))].sort();
}

/**
 * The addresses one entry reads this year.
 *
 * A year-partitioned listing publishes next year's file at an unpredictable
 * moment, so both are requested and a missing one is a note rather than a
 * failure. An entry with no `{year}` is read exactly once.
 */
export function sourceUrls(source: EventSourceEntry, date: string): string[] {
  const url = source.url;
  if (!url) return [];
  if (!url.includes("{year}")) return [url];
  const year = Number(date.slice(0, 4));
  return [year, year + 1].map((value) => url.replaceAll("{year}", String(value)));
}
