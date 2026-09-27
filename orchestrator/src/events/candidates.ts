import { createHash } from "node:crypto";
import { EventCandidateSchema, type EventCandidate, type EventCandidateDraft } from "../contracts/event-candidates.js";
import type { MagazineEvent } from "../contracts/boardless-events.js";
import { canonicalUrl } from "../streams/normalize.js";
import { parseIcsEvents, type IcsEvent } from "./ics.js";
import type { EventSourceEntry } from "./registry.js";

/**
 * Listing entries to Akce candidates.
 *
 * Nothing here writes anything. A candidate is a filled-in form the owner has
 * not submitted: it carries a suggested slug, a suggested scope and whatever
 * the listing published, and the record only exists once a human saves it
 * through the admin. That separation is the whole point of the helper — the
 * calendars supply the typing, not the editorial judgement.
 */
export interface CandidateContext {
  date: string;
  windowDays: number;
  topicKeywords: readonly string[];
  czechCountries: readonly string[];
}

export interface CandidateBatch {
  candidates: EventCandidate[];
  /** Entries the source returned, before any filter. */
  read: number;
  /** Unparseable, outside the window, off topic, or past the source's cap. */
  dropped: number;
}

const DAY_MS = 86_400_000;

function clamp(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.replace(/\s+/gu, " ").trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/**
 * Listing prose to something a form field can hold.
 *
 * WordPress returns rendered HTML with encoded entities, and a `&amp;` that
 * reaches the store is a typo the owner then has to notice and fix by hand.
 */
export function plainText(value: unknown, max = 280): string | undefined {
  if (typeof value !== "string") return undefined;
  const stripped = value
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&#8217;|&rsquo;/gu, "’")
    .replace(/&hellip;/gu, "…")
    .replace(/&quot;/gu, '"')
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&#(\d{2,5});/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    // Last, or an encoded entity decoded above could be decoded twice.
    .replace(/&amp;/gu, "&");
  return clamp(stripped, max);
}

/** `YYYY-MM-DD` from either a date or a `YYYY-MM-DD HH:MM:SS` local stamp. */
export function isoDay(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const front = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(front) ? front : undefined;
}

function daysFrom(anchor: string, day: string): number {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / DAY_MS);
}

/**
 * Whole-word keyword match.
 *
 * Substring matching put "Ukraine" and "Maine" in an AI listing on the first
 * pass, because every one of them contains "ai".
 */
export function matchesTopic(title: string, keywords: readonly string[]): boolean {
  const haystack = title.toLocaleLowerCase("en");
  return keywords.some((keyword) => {
    const needle = keyword.toLocaleLowerCase("en");
    const index = haystack.indexOf(needle);
    if (index === -1) return false;
    const before = haystack[index - 1];
    const after = haystack[index + needle.length];
    return !(before && /[\p{L}\p{N}]/u.test(before)) && !(after && /[\p{L}\p{N}]/u.test(after));
  });
}

/** The slug the form suggests: a Czech title without its diacritics, plus the year. */
export function suggestedId(title: string, starts: string, fallback: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 60)
    .replace(/-+$/gu, "");
  const year = starts.slice(0, 4);
  const slug = base.includes(year) ? base : `${base}-${year}`;
  return /^[a-z0-9][a-z0-9-]{1,80}$/u.test(slug) ? slug : fallback;
}

/** Stable across runs, so the same listing entry is the same candidate. */
export function candidateId(sourceId: string, url: string): string {
  return createHash("sha1").update(`${sourceId}\n${canonicalUrl(url)}`).digest("hex");
}

/**
 * A usable https link, exactly as the listing published it.
 *
 * Canonicalised only to prove it parses. Storing the canonical form instead
 * would hand the reader `https://frontkon.tech` for a site that published
 * `https://www.frontkon.tech`, and a host that answers on one and not the
 * other turns a candidate into a dead link.
 */
function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim().startsWith("https://")) return undefined;
  try {
    canonicalUrl(value.trim());
    return value.trim();
  } catch {
    return undefined;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function named(value: unknown, key: string, max: number): string | undefined {
  const first = Array.isArray(value) ? record(value[0]) : record(value);
  return first ? clamp(typeof first[key] === "string" ? first[key] : undefined, max) : undefined;
}

function labels(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => record(entry)?.name).filter((name): name is string => typeof name === "string")
    : [];
}

function build(
  draft: EventCandidateDraft,
  source: EventSourceEntry,
): EventCandidate | null {
  const id = candidateId(source.id, draft.url);
  const parsed = EventCandidateSchema.safeParse({
    ...draft,
    id,
    suggestedId: suggestedId(draft.title, draft.starts, `${source.id}-${id.slice(0, 8)}`),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The WordPress "The Events Calendar" REST payload.
 *
 * The same site also publishes an `?ical=1` export, registered disabled: it
 * lists the same events, and the JSON carries the venue, the city, the price
 * and the organiser that the export folds into one free-text line.
 */
export function normalizeEventsCalendar(
  payload: unknown,
  source: EventSourceEntry,
  context: CandidateContext,
): CandidateBatch {
  const entries = record(payload)?.events;
  if (!Array.isArray(entries)) return { candidates: [], read: 0, dropped: 0 };

  const candidates: EventCandidate[] = [];
  for (const entry of entries) {
    const raw = record(entry);
    const title = raw ? clamp(plainText(raw.title, 120), 120) : undefined;
    const starts = isoDay(raw?.start_date);
    const listingUrl = httpsUrl(raw?.url);
    const url = httpsUrl(raw?.website) ?? listingUrl;
    if (!raw || !title || !starts || !url) continue;

    const ends = isoDay(raw.end_date);
    const venue = record(raw.venue);
    const city = clamp(typeof venue?.city === "string" ? venue.city : undefined, 80)
      ?? clamp(typeof venue?.venue === "string" ? venue.venue : undefined, 80);
    const place = clamp(typeof venue?.venue === "string" ? venue.venue : undefined, 120);
    const marks = [...labels(raw.categories), ...labels(raw.tags)].map((name) => name.toLocaleLowerCase("cs"));

    const candidate = build({
      source: source.id,
      sourceName: source.name,
      scope: source.scope,
      title,
      starts,
      online: marks.some((mark) => mark.includes("online")),
      url,
      ...(ends && ends > starts ? { ends } : {}),
      ...(plainText(raw.description) ? { description: plainText(raw.description)! } : {}),
      ...(city ? { city } : {}),
      ...(place && place !== city ? { venue: place } : {}),
      ...(listingUrl && listingUrl !== url ? { listingUrl } : {}),
      ...(clamp(plainText(raw.cost, 80), 80) ? { price: clamp(plainText(raw.cost, 80), 80)! } : {}),
      ...(named(raw.organizer, "organizer", 120) ? { organizer: named(raw.organizer, "organizer", 120)! } : {}),
    }, source);
    if (candidate) candidates.push(candidate);
  }

  return filter(candidates, entries.length, source, context, undefined);
}

/**
 * One `tech-conferences/conference-data` topic file.
 *
 * The listing is MIT-licensed and worldwide, so the country decides the scope
 * and the topic filter decides whether a conference outside Czechia is offered
 * at all. There is no `ai.json` in that repository — the AI conferences sit in
 * the topic files the registry names, which is why the filter exists.
 */
export function normalizeConfsTech(
  payload: unknown,
  source: EventSourceEntry,
  context: CandidateContext,
): CandidateBatch {
  if (!Array.isArray(payload)) return { candidates: [], read: 0, dropped: 0 };

  const czech = new Set(context.czechCountries.map((country) => country.toLocaleLowerCase("en")));
  const candidates: EventCandidate[] = [];
  const czechIds = new Set<string>();

  for (const entry of payload) {
    const raw = record(entry);
    const title = raw ? clamp(typeof raw.name === "string" ? raw.name : undefined, 120) : undefined;
    const starts = isoDay(raw?.startDate);
    const url = httpsUrl(raw?.url);
    if (!raw || !title || !starts || !url) continue;

    const ends = isoDay(raw.endDate);
    const country = typeof raw.country === "string" ? raw.country.toLocaleLowerCase("en") : "";
    const isCzech = czech.has(country);
    const candidate = build({
      source: source.id,
      sourceName: source.name,
      scope: isCzech ? "cz" : "global",
      title,
      starts,
      online: raw.online === true,
      url,
      ...(ends && ends > starts ? { ends } : {}),
      ...(clamp(typeof raw.city === "string" ? raw.city : undefined, 80)
        ? { city: clamp(raw.city as string, 80)! }
        : {}),
    }, source);
    if (!candidate) continue;
    if (isCzech) czechIds.add(candidate.id);
    candidates.push(candidate);
  }

  return filter(candidates, payload.length, source, context, czechIds);
}

const ONLINE = /\b(online|zoom|google meet|meet\.google|teams|livestream|stream)\b/iu;

/**
 * The event's own https page: the `URL` property, a UID that is itself a link, or a link in the
 * description on one of the source's own event hosts. Nothing else, because a guessed link is a
 * dead link the owner has to catch by hand.
 */
function icsUrl(event: IcsEvent, source: EventSourceEntry): string | undefined {
  const direct = httpsUrl(event.url) ?? httpsUrl(event.uid);
  if (direct) return direct;
  const hosts = source.eventLinkHosts ?? [];
  for (const match of `${event.description ?? ""}\n${event.location ?? ""}`.matchAll(/https:\/\/[^\s<>"')]+/gu)) {
    const candidate = httpsUrl(match[0].replace(/[.,;]+$/u, ""));
    if (!candidate) continue;
    try {
      if (hosts.includes(new URL(candidate).hostname)) return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * The city in a written address: the last part that is not a country, without its postcode.
 * "Na Příkopě 388/1, 110 00 Praha 1, Czechia" is Praha 1.
 */
export function cityOf(address: string, countries: readonly string[]): string | undefined {
  const skip = new Set(countries.map((country) => country.toLocaleLowerCase("cs")));
  const parts = address.split(",").map((part) => part.trim()).filter((part) => part && !skip.has(part.toLocaleLowerCase("cs")));
  return clamp(parts.at(-1)?.replace(/^\d{3}\s?\d{2}\s*/u, ""), 80);
}

/**
 * An iCalendar export: the ČAUI Luma calendar, or any other calendar that publishes one.
 *
 * `LOCATION` is a place or a meeting link. A link or an online word makes the event online; a
 * place fills the venue, and its last comma-separated part the city. The description is the
 * listing's own prose, clamped like every other source's.
 */
export function normalizeIcs(
  payload: unknown,
  source: EventSourceEntry,
  context: CandidateContext,
): CandidateBatch {
  if (typeof payload !== "string") return { candidates: [], read: 0, dropped: 0 };
  const events = parseIcsEvents(payload);
  const candidates: EventCandidate[] = [];
  for (const event of events) {
    const title = clamp(event.summary, 120);
    const url = icsUrl(event, source);
    if (!title || !event.starts || !url) continue;
    const location = clamp(event.location, 120);
    const locationIsLink = location ? /^https?:\/\//iu.test(location) : false;
    const online = locationIsLink || ONLINE.test(location ?? "");
    const place = location && !locationIsLink && !online ? location : undefined;
    const city = place ? cityOf(place, context.czechCountries) : undefined;
    const description = plainText(event.description
      ?.split("\n")
      .filter((line) => !/^get up-to-date information at/iu.test(line.trim()))
      .join("\n")
      .replace(/https?:\/\/\S+/gu, " "));
    const candidate = build({
      source: source.id,
      sourceName: source.name,
      scope: source.scope,
      title,
      starts: event.starts,
      online,
      url,
      ...(event.ends && event.ends > event.starts ? { ends: event.ends } : {}),
      ...(description ? { description } : {}),
      ...(city ? { city } : {}),
      ...(place && place !== city ? { venue: place } : {}),
    }, source);
    if (candidate) candidates.push(candidate);
  }
  return filter(candidates, events.length, source, context, undefined);
}

/**
 * Window, topic and cap, in that order.
 *
 * A Czech entry is never topic-filtered: the magazine covers what happens in
 * Czechia whether or not the conference put "AI" in its name, and the owner is
 * the one who decides that anyway.
 */
function filter(
  candidates: readonly EventCandidate[],
  read: number,
  source: EventSourceEntry,
  context: CandidateContext,
  exemptIds: ReadonlySet<string> | undefined,
): CandidateBatch {
  const inWindow = candidates.filter((candidate) => {
    const offset = daysFrom(context.date, candidate.ends ?? candidate.starts);
    if (offset < 0 || daysFrom(context.date, candidate.starts) > context.windowDays) return false;
    if (!source.topicFilter || exemptIds?.has(candidate.id)) return true;
    return matchesTopic(candidate.title, context.topicKeywords);
  });
  const kept = [...inWindow]
    .sort((left, right) => left.starts.localeCompare(right.starts) || left.title.localeCompare(right.title));
  return { candidates: kept, read, dropped: read - kept.length };
}

/**
 * The source's own cap, applied after the store has been subtracted.
 *
 * Capping before that would let a source spend its whole allowance on events
 * the owner accepted last week and offer nothing new.
 */
export function capCandidates(
  candidates: readonly EventCandidate[],
  max: number,
): { candidates: EventCandidate[]; overflow: number } {
  return { candidates: candidates.slice(0, max), overflow: Math.max(0, candidates.length - max) };
}

/**
 * Candidates the store does not already hold.
 *
 * Matched on the canonical link and on the suggested slug, because the owner
 * saves an event under their own id and the listing keeps offering the same
 * entry every day until something recognises it as already accepted.
 */
export function withoutKnown(
  candidates: readonly EventCandidate[],
  events: readonly Pick<MagazineEvent, "id" | "url">[],
): { candidates: EventCandidate[]; known: number } {
  const links = new Set<string>();
  const ids = new Set<string>();
  for (const event of events) {
    ids.add(event.id);
    try {
      links.add(canonicalUrl(event.url));
    } catch {
      // A store entry whose URL will not parse still blocks nothing but itself.
    }
  }
  const kept = candidates.filter((candidate) => {
    if (ids.has(candidate.suggestedId)) return false;
    try {
      return !links.has(canonicalUrl(candidate.url));
    } catch {
      return true;
    }
  });
  return { candidates: kept, known: candidates.length - kept.length };
}
