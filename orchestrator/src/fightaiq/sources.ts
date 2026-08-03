import { z } from "zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../paths.js";
import { fetchJson } from "../sources/adapters/util.js";
import type { SourceFetchContext } from "../sources/types.js";
import { safeFetch, type SafeFetchOptions } from "../security/url.js";

const MmaSourceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  tier: z.enum(["A", "B", "C", "D"]),
  host: z.string().min(1),
  coverage: z.array(z.string().min(1)).min(1),
  access: z.enum(["api", "html", "rss", "dataset"]),
  state: z.enum(["wired", "proposed", "disabled", "blocked"]),
  credentialEnv: z.string().regex(/^[A-Z][A-Z0-9_]+$/).optional(),
  freeLimit: z.string().min(1),
  termsVerdict: z.enum(["allowed-with-account", "allowed", "unclear", "forbidden"]),
  termsNote: z.string().min(1),
  evidenceUrl: z.string().url()
});

const MmaSourceRegistrySchema = z.object({
  schemaVersion: z.literal("mma-sources/1"),
  verifiedAt: z.iso.date(),
  sources: z.array(MmaSourceSchema).min(1)
}).superRefine((registry, context) => {
  for (const source of registry.sources) {
    if (source.state === "wired" && source.termsVerdict !== "allowed-with-account" && source.termsVerdict !== "allowed") {
      context.addIssue({ code: "custom", message: "Wired sources require an allowed terms verdict", path: ["sources", source.id] });
    }
    if (source.state === "blocked" && source.termsVerdict !== "forbidden") {
      context.addIssue({ code: "custom", message: "Blocked sources require a forbidden verdict", path: ["sources", source.id] });
    }
  }
});

export type MmaSourceRegistry = z.infer<typeof MmaSourceRegistrySchema>;

export async function loadMmaSourceRegistry(filePath = path.join(configRoot, "mma-sources.json")): Promise<MmaSourceRegistry> {
  return MmaSourceRegistrySchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export interface ApiBoutOdds {
  id: string;
  commenceTime: string;
  red: string;
  blue: string;
  bookmakers: Array<{ name: string; redDecimal: number; blueDecimal: number }>;
}

interface OddsApiEvent {
  id?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: Array<{ title?: string; markets?: Array<{ key?: string; outcomes?: Array<{ name?: string; price?: number }> }> }>;
}

export function projectOddsApiEvents(value: unknown): ApiBoutOdds[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const event = item as OddsApiEvent;
    if (!event.id || !event.commence_time || !event.home_team || !event.away_team) return [];
    const bookmakers = (event.bookmakers ?? []).flatMap((bookmaker) => {
      const outcomes = bookmaker.markets?.find((market) => market.key === "h2h")?.outcomes ?? [];
      const red = outcomes.find((outcome) => outcome.name === event.home_team)?.price;
      const blue = outcomes.find((outcome) => outcome.name === event.away_team)?.price;
      if (!bookmaker.title || !red || !blue || red <= 1 || blue <= 1) return [];
      return [{ name: bookmaker.title, redDecimal: red, blueDecimal: blue }];
    });
    return [{ id: event.id, commenceTime: new Date(event.commence_time).toISOString(), red: event.home_team, blue: event.away_team, bookmakers }];
  });
}

export interface OddsApiMmaResult {
  events: ApiBoutOdds[];
  remainingCredits: number | null;
  usedCredits: number | null;
  lastRequestCredits: number | null;
  exhausted: boolean;
}

function quotaInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function fetchOddsApiMma(input: {
  apiKey: string;
  context: SourceFetchContext;
  remainingCredits?: number | null;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<OddsApiMmaResult> {
  if (!input.apiKey.trim() || input.remainingCredits === 0) {
    return { events: [], remainingCredits: input.remainingCredits ?? null, usedCredits: null, lastRequestCredits: null, exhausted: input.remainingCredits === 0 };
  }
  const endpoint = new URL("https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds");
  endpoint.searchParams.set("regions", "eu");
  endpoint.searchParams.set("markets", "h2h");
  endpoint.searchParams.set("oddsFormat", "decimal");
  endpoint.searchParams.set("apiKey", input.apiKey);
  const response = await safeFetch(endpoint.toString(), {
    allowHosts: input.context.allowHosts,
    fetchImpl: input.fetchImpl,
    resolveImpl: input.resolveImpl,
    responseHeaderNames: ["x-requests-remaining", "x-requests-used", "x-requests-last"]
  });
  const remainingCredits = quotaInteger(response.headers["x-requests-remaining"]);
  return {
    events: projectOddsApiEvents(JSON.parse(new TextDecoder().decode(response.body)) as unknown),
    remainingCredits,
    usedCredits: quotaInteger(response.headers["x-requests-used"]),
    lastRequestCredits: quotaInteger(response.headers["x-requests-last"]),
    exhausted: remainingCredits === 0
  };
}

export interface CitoFighterSummary {
  id: string;
  slug: string;
  name: string;
  record: string | null;
  division: string | null;
  stance: string | null;
  heightCm: number | null;
  reachCm: number | null;
}

type JsonObject = Record<string, unknown>;

function jsonObject(value: unknown): JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : null;
}

function nestedRows(value: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value;
  const object = jsonObject(value);
  if (!object) return [];
  for (const key of keys) {
    const candidate = object[key];
    if (Array.isArray(candidate)) return candidate;
    const nested = jsonObject(candidate);
    if (!nested) continue;
    for (const nestedKey of keys) {
      if (Array.isArray(nested[nestedKey])) return nested[nestedKey];
    }
  }
  return [];
}

function firstValue(object: JsonObject, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = object[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const object = jsonObject(value);
  if (!object) return null;
  return textValue(firstValue(object, ["name", "label", "title", "value", "displayName", "fullName"]));
}

function slugValue(value: unknown): string | null {
  const text = textValue(value);
  if (!text) return null;
  const slug = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return slug || null;
}

function recordValue(value: unknown): string | null {
  const direct = textValue(value);
  if (direct && /^\d+\s*[-–]\s*\d+(?:\s*[-–]\s*\d+)?(?:\s*\(\d+\s*NC\))?$/iu.test(direct)) {
    const parts = direct.match(/^\s*(\d+)\s*[-–]\s*(\d+)(?:\s*[-–]\s*(\d+))?(?:\s*\((\d+)\s*NC\))?\s*$/iu);
    return parts ? `${parts[1]}-${parts[2]}-${parts[3] ?? "0"}${parts[4] ? ` (${parts[4]} NC)` : ""}` : null;
  }
  const object = jsonObject(value);
  if (!object) return null;
  const wins = Number(firstValue(object, ["wins", "win"]));
  const losses = Number(firstValue(object, ["losses", "loss"]));
  const draws = Number(firstValue(object, ["draws", "draw"]) ?? 0);
  const noContests = Number(firstValue(object, ["noContests", "no_contests", "nc"]) ?? 0);
  if (![wins, losses, draws, noContests].every(Number.isSafeInteger) || wins < 0 || losses < 0 || draws < 0 || noContests < 0) return null;
  return `${wins}-${losses}-${draws}${noContests ? ` (${noContests} NC)` : ""}`;
}

function centimetres(object: JsonObject, keys: readonly string[]): number | null {
  const value = firstValue(object, keys);
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Number(value.toFixed(2));
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*cm$/iu);
  return match ? Number(Number(match[1]).toFixed(2)) : null;
}

export function projectCitoFighters(value: unknown): CitoFighterSummary[] {
  const rows = nestedRows(value, ["data", "fighters", "results", "items"]);
  return rows.flatMap((row) => {
    const object = jsonObject(row);
    if (!object) return [];
    const name = textValue(firstValue(object, ["name", "fullName", "displayName", "fighterName"]));
    const slug = slugValue(firstValue(object, ["slug", "fighterSlug", "fighter_slug"]) ?? name);
    const id = textValue(firstValue(object, ["id", "fighterId", "fighter_id", "_id"])) ?? slug;
    if (!id || !name || !slug) return [];
    return [{
      id,
      slug,
      name,
      record: recordValue(firstValue(object, ["record", "proRecord", "pro_record"])),
      division: textValue(firstValue(object, ["division", "weightClass", "weight_class"])),
      stance: textValue(firstValue(object, ["stance"])),
      heightCm: centimetres(object, ["heightCm", "height_cm"]),
      reachCm: centimetres(object, ["reachCm", "reach_cm"])
    }];
  });
}

interface CitoFighterRef {
  id: string | null;
  slug: string;
  name: string;
}

export interface CitoBoutSummary {
  id: string;
  red: CitoFighterRef;
  blue: CitoFighterRef;
  division: string | null;
  scheduledRounds: 3 | 5 | null;
  status: "announced" | "weigh-in" | "complete" | "cancelled";
}

export interface CitoEventSummary {
  id: string;
  slug: string;
  name: string;
  venue: string | null;
  startsAt: string | null;
  timeZone: string | null;
  bouts: CitoBoutSummary[];
  /**
   * What the follow-up bout request did, when one was made.
   *
   * An event with no card and an event whose card could not be fetched both arrive as
   * `bouts: []`, and the failure was caught and discarded, so they were indistinguishable
   * downstream. Every FightAIQ intake since founding has recorded three upcoming events with
   * empty cards and status "success"; because intake drops an event with no bouts, the store
   * holds 612 fighters, 572 bouts and not one event, and nothing anywhere says why. This
   * rides out in the source snapshot so the next run answers that in one line.
   */
  boutFetch?: { ok: boolean; rowCount: number; reason: string | null };
}

function fighterReference(value: unknown, fallbackObject: JsonObject, prefix: string): CitoFighterRef | null {
  const object = jsonObject(value);
  const name = object
    ? textValue(firstValue(object, ["name", "fullName", "displayName", "fighterName"]))
    : textValue(value) ?? textValue(firstValue(fallbackObject, [`${prefix}Name`, `${prefix}_name`]));
  const slug = slugValue(object
    ? firstValue(object, ["slug", "fighterSlug", "fighter_slug"]) ?? name
    : firstValue(fallbackObject, [`${prefix}Slug`, `${prefix}_slug`]) ?? name);
  if (!name || !slug) return null;
  return {
    id: object ? textValue(firstValue(object, ["id", "fighterId", "fighter_id", "_id"])) : null,
    slug,
    name
  };
}

function boutStatus(value: unknown): CitoBoutSummary["status"] {
  const normalized = textValue(value)?.toLowerCase().replace(/[_\s]+/gu, "-");
  if (normalized === "complete" || normalized === "completed" || normalized === "final") return "complete";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "weigh-in" || normalized === "weighin" || normalized === "confirmed") return "weigh-in";
  return "announced";
}

function projectCitoBout(row: unknown, index: number): CitoBoutSummary | null {
  const object = jsonObject(row);
  if (!object) return null;
  const red = fighterReference(firstValue(object, ["red", "redFighter", "red_fighter", "fighter1", "fighterA", "homeFighter"]), object, "red");
  const blue = fighterReference(firstValue(object, ["blue", "blueFighter", "blue_fighter", "fighter2", "fighterB", "awayFighter"]), object, "blue");
  if (!red || !blue || red.slug === blue.slug) return null;
  const rawRounds = Number(firstValue(object, ["scheduledRounds", "scheduled_rounds", "rounds", "numberOfRounds"]));
  const scheduledRounds = rawRounds === 3 || rawRounds === 5 ? rawRounds : null;
  const id = textValue(firstValue(object, ["id", "boutId", "bout_id", "fightId", "fight_id", "_id"]))
    ?? `${red.slug}-vs-${blue.slug}-${index + 1}`;
  return {
    id,
    red,
    blue,
    division: textValue(firstValue(object, ["division", "weightClass", "weight_class"])),
    scheduledRounds,
    status: boutStatus(firstValue(object, ["status", "state"]))
  };
}

export function projectCitoBouts(value: unknown): CitoBoutSummary[] {
  return nestedRows(value, ["data", "bouts", "fights", "results", "items"])
    .map(projectCitoBout)
    .filter((bout): bout is CitoBoutSummary => Boolean(bout));
}

function venueValue(object: JsonObject): string | null {
  const venue = textValue(firstValue(object, ["venue", "arena"]));
  if (venue) return venue;
  const location = firstValue(object, ["location"]);
  const direct = textValue(location);
  if (direct) return direct;
  const nested = jsonObject(location);
  if (!nested) return null;
  const parts = [textValue(nested.venue), textValue(nested.city), textValue(nested.country)].filter((part): part is string => Boolean(part));
  return parts.length ? [...new Set(parts)].join(", ") : null;
}

export function projectCitoEvents(value: unknown): CitoEventSummary[] {
  const rows = nestedRows(value, ["data", "events", "results", "items"]);
  return rows.flatMap((row) => {
    const object = jsonObject(row);
    if (!object) return [];
    const name = textValue(firstValue(object, ["name", "title", "eventName", "event_name"]));
    const slug = slugValue(firstValue(object, ["slug", "eventSlug", "event_slug"]) ?? name);
    const id = textValue(firstValue(object, ["id", "eventId", "event_id", "_id"])) ?? slug;
    if (!name || !slug || !id) return [];
    const embeddedBouts = projectCitoBouts(firstValue(object, ["bouts", "fights", "fightCard", "fight_card"]));
    return [{
      id,
      slug,
      name,
      venue: venueValue(object),
      startsAt: textValue(firstValue(object, ["startsAt", "starts_at", "startTime", "start_time", "eventDate", "event_date", "date"])),
      timeZone: textValue(firstValue(object, ["timeZone", "timezone", "time_zone"])),
      bouts: embeddedBouts
    }];
  });
}

interface CitoFetchOptions {
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}

export async function fetchCitoFighters(input: { apiKey: string; context: SourceFetchContext; page?: number } & CitoFetchOptions): Promise<CitoFighterSummary[]> {
  if (!input.apiKey.trim()) return [];
  const page = Number.isSafeInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
  const value = await fetchJson<unknown>(`https://api.citoapi.com/api/v1/ufc/fighters?page=${page}&limit=50`, input.context, {
    headers: { "x-api-key": input.apiKey },
    fetchImpl: input.fetchImpl,
    resolveImpl: input.resolveImpl
  });
  return projectCitoFighters(value);
}

/**
 * The upcoming-event probe. One call, and the cheapest signal that a card exists at all.
 *
 * It used to follow each event with `/ufc/events/{slug}/bouts` to fill a card. That endpoint has
 * returned `rowCount: 0` for every event on every run since the probe was added — three calls a
 * day, three of the five reserved, for nothing. Cards come from Wikipedia instead, which
 * publishes scheduled bouts; this call is left doing the one thing it does well.
 *
 * The limit was 3, which made any card beyond the next three UFC events invisible — a horizon
 * question cannot be answered by a window narrower than the horizon.
 */
export async function fetchCitoUpcomingEvents(input: { apiKey: string; context: SourceFetchContext } & CitoFetchOptions): Promise<CitoEventSummary[]> {
  if (!input.apiKey.trim()) return [];
  const value = await fetchJson<unknown>(
    "https://api.citoapi.com/api/v1/ufc/events/upcoming?page=1&limit=10",
    input.context,
    {
      headers: { "x-api-key": input.apiKey },
      fetchImpl: input.fetchImpl,
      resolveImpl: input.resolveImpl
    }
  );
  return projectCitoEvents(value);
}
