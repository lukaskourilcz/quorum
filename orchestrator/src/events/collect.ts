import { readFileSync } from "node:fs";
import path from "node:path";
import { BoardlessEventsSchema, type MagazineEvent } from "../contracts/boardless-events.js";
import {
  EventCandidateFileSchema,
  type EventCandidate,
  type EventCandidateFile,
  type EventCandidateSourceResult,
} from "../contracts/event-candidates.js";
import { configRoot, stateRoot } from "../paths.js";
import { safeFetch } from "../security/url.js";
import {
  capCandidates,
  normalizeConfsTech,
  normalizeEventsCalendar,
  withoutKnown,
  type CandidateBatch,
  type CandidateContext,
} from "./candidates.js";
import { fetchableEventSources, sourceUrls, type EventSourceEntry, type EventSourceRegistry } from "./registry.js";

/**
 * One candidate pass over the configured event calendars.
 *
 * No model call lives anywhere on this path, so it sits outside the model share
 * of the operating cap exactly like the stream sync. The only network calls are
 * reads through `safeFetch`, which enforces the host allowlist, the
 * public-address check and the byte and redirect caps.
 *
 * Failure posture is the stream's: a malformed entry costs one entry, a failing
 * source costs a section and a line in the file, and neither costs the run —
 * this helper only ever offers suggestions, so a bad day is an empty panel.
 */
const MAX_LISTING_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 15_000;

export const CANDIDATES_RELATIVE_PATH = "ventures/caught-up/events/candidates.json";
const STORE_RELATIVE_PATH = "ventures/caught-up/events/events.json";

export interface EventFetchDeps {
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
  now: string;
}

function allowedHosts(): string[] {
  const raw = readFileSync(path.join(configRoot, "network-allowlist.json"), "utf8");
  return (JSON.parse(raw) as { runtimeHosts: string[] }).runtimeHosts;
}

/** The hand-maintained store, or nothing when it has never been written. */
export function readEventsStore(root = stateRoot): MagazineEvent[] {
  try {
    const parsed = BoardlessEventsSchema.safeParse(
      JSON.parse(readFileSync(path.join(root, STORE_RELATIVE_PATH), "utf8")),
    );
    return parsed.success ? parsed.data.events : [];
  } catch {
    return [];
  }
}

function normalize(payload: unknown, source: EventSourceEntry, context: CandidateContext): CandidateBatch {
  return source.kind === "confs-tech"
    ? normalizeConfsTech(payload, source, context)
    : normalizeEventsCalendar(payload, source, context);
}

async function readListing(url: string, allowHosts: readonly string[], deps: EventFetchDeps): Promise<unknown> {
  const response = await safeFetch(url, {
    allowHosts,
    maxBytes: MAX_LISTING_BYTES,
    timeoutMs: FETCH_TIMEOUT_MS,
    // A year-partitioned listing publishes next year's file when it feels like
    // it. Asking for one that does not exist yet is an expected answer, not an
    // outage, so 404 is read rather than thrown.
    acceptedStatuses: [404],
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.resolveImpl ? { resolveImpl: deps.resolveImpl } : {}),
  });
  if (response.status === 404) return null;
  return JSON.parse(new TextDecoder().decode(response.body)) as unknown;
}

export interface CollectInput {
  registry: EventSourceRegistry;
  /** The events already in the store, so the same entry is offered once. */
  events: readonly Pick<MagazineEvent, "id" | "url">[];
  deps: EventFetchDeps;
}

export async function collectEventCandidates(input: CollectInput): Promise<EventCandidateFile> {
  const { registry, deps } = input;
  const allowHosts = allowedHosts();
  const context: CandidateContext = {
    date: deps.now,
    windowDays: registry.windowDays,
    topicKeywords: registry.topicKeywords,
    czechCountries: registry.czechCountries,
  };

  const candidates: EventCandidate[] = [];
  const sources: EventCandidateSourceResult[] = [];

  for (const source of fetchableEventSources(registry)) {
    let read = 0;
    let dropped = 0;
    let error: string | undefined;
    const collected = new Map<string, EventCandidate>();

    for (const url of sourceUrls(source, deps.now)) {
      try {
        const payload = await readListing(url, allowHosts, deps);
        if (payload === null) continue;
        const batch = normalize(payload, source, context);
        read += batch.read;
        dropped += batch.dropped;
        for (const candidate of batch.candidates) collected.set(candidate.id, candidate);
      } catch (failure) {
        error ??= failure instanceof Error ? failure.message.slice(0, 200) : "unknown error";
      }
    }

    const fresh = withoutKnown([...collected.values()], input.events);
    const capped = capCandidates(fresh.candidates, source.maxCandidates);
    candidates.push(...capped.candidates);
    sources.push({
      id: source.id,
      name: source.name,
      kind: source.kind,
      host: source.host,
      read,
      accepted: capped.candidates.length,
      dropped: dropped + capped.overflow,
      known: fresh.known,
      ...(error ? { error } : {}),
    });
  }

  candidates.sort((left, right) => left.starts.localeCompare(right.starts) || left.title.localeCompare(right.title));

  return EventCandidateFileSchema.parse({
    schemaVersion: "event-candidates/1",
    date: deps.now,
    windowDays: registry.windowDays,
    candidates,
    sources,
  });
}
