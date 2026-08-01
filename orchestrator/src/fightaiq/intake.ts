import path from "node:path";
import { EventCardSchema, FighterRecordSchema, SourcedFieldSchema, type EventCard, type FighterRecord } from "../contracts/mma.js";
import { readJson, atomicWriteJson } from "../state.js";
import { loadEventCards, loadFighterRecords, saveOddsSnapshot } from "./store.js";
import { loadMmaModelConfig, modelVersion } from "./engine.js";
import type { ApiBoutOdds, CitoEventSummary, CitoFighterSummary } from "./sources.js";
import type { z } from "zod";

type SourcedField = z.infer<typeof SourcedFieldSchema>;

const PROFILE_FIELDS = ["name", "division", "record", "stance", "heightCm", "reachCm"] as const;
const CRITICAL_FIELDS = ["name", "division", "record"] as const;

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function division(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .toLowerCase()
    .replaceAll("women’s", "womens")
    .replaceAll("women's", "womens")
    .replace(/^ufc\s+/u, "")
    .replace(/\s+/gu, "-")
    .replace(/[^a-z-]/gu, "")
    .replace(/-+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  const aliases: Record<string, string> = {
    "lightheavyweight": "light-heavyweight",
    "light-heavyweight": "light-heavyweight",
    "womensstrawweight": "womens-strawweight",
    "womens-strawweight": "womens-strawweight",
    "womensflyweight": "womens-flyweight",
    "womens-flyweight": "womens-flyweight",
    "womensbantamweight": "womens-bantamweight",
    "womens-bantamweight": "womens-bantamweight"
  };
  return (aliases[normalized] ?? normalized) || null;
}

function sourced(value: SourcedField["value"], sourceRef: string, retrievedAt: string): SourcedField {
  return {
    value,
    sourceRefs: [sourceRef],
    retrievedAt,
    status: "provisional",
    corroborated: false
  };
}

function preserveReviewedField(current: SourcedField | undefined, incoming: SourcedField): SourcedField {
  if (!current) return incoming;
  if (current.status === "verified" || current.status === "disputed" || current.corroborated) return current;
  const currentHasNonCitoSource = current.sourceRefs.some((reference) => !reference.startsWith("source:cito-ufc:"));
  return currentHasNonCitoSource ? current : incoming;
}

function modelEligibility(record: {
  fields: Record<string, SourcedField>;
  criticalFields: readonly string[];
  discrepancies: Array<{ field: string; status: "open" | "resolved" }>;
}): boolean {
  const openFields = new Set(record.discrepancies.filter((item) => item.status === "open").map((item) => item.field));
  return record.criticalFields.every((fieldName) => {
    const field = record.fields[fieldName];
    return Boolean(field && field.sourceRefs.length >= 2 && field.corroborated && field.status === "verified" && !openFields.has(fieldName));
  });
}

async function writeFighter(input: {
  root: string;
  fighter: CitoFighterSummary;
  sourceRef: string;
  retrievedAt: string;
  version: string;
}): Promise<string> {
  const relative = `ventures/fightaiq/fighters/ufc/${input.fighter.slug}.json`;
  const existingValue = await readJson<unknown | null>(input.root, relative, null);
  const existing = existingValue === null ? null : FighterRecordSchema.parse(existingValue);
  const candidates: Record<string, SourcedField["value"] | null> = {
    name: input.fighter.name,
    division: division(input.fighter.division),
    record: input.fighter.record,
    stance: input.fighter.stance?.toLowerCase() ?? null,
    heightCm: input.fighter.heightCm,
    reachCm: input.fighter.reachCm
  };
  const fields: FighterRecord["fields"] = { ...(existing?.fields ?? {}) };
  for (const [name, value] of Object.entries(candidates)) {
    if (value === null || value === "") continue;
    fields[name] = preserveReviewedField(fields[name], sourced(value, input.sourceRef, input.retrievedAt));
  }
  const populated = PROFILE_FIELDS.filter((name) => fields[name]?.value !== null).length;
  const corroborated = PROFILE_FIELDS.filter((name) => fields[name]?.corroborated).length;
  const base = {
    schemaVersion: "fighter-record/1" as const,
    id: `ufc:${input.fighter.slug}`,
    slug: input.fighter.slug,
    org: "ufc" as const,
    fields,
    criticalFields: existing?.criticalFields ?? [...CRITICAL_FIELDS],
    discrepancies: existing?.discrepancies ?? [],
    completeness: Number((populated / PROFILE_FIELDS.length).toFixed(4)),
    corroboration: Number((corroborated / PROFILE_FIELDS.length).toFixed(4)),
    modelVersion: existing?.modelVersion ?? input.version,
    updatedAt: input.retrievedAt
  };
  const record = FighterRecordSchema.parse({ ...base, modelEligible: modelEligibility(base) });
  await atomicWriteJson(input.root, relative, record);
  return relative;
}

function validIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function eventCard(event: CitoEventSummary, retrievedAt: string): EventCard | null {
  const startsAt = validIso(event.startsAt);
  if (!startsAt) return null;
  const bouts = event.bouts.flatMap((bout, index) => {
    const normalizedDivision = division(bout.division);
    if (!normalizedDivision || !bout.scheduledRounds) return [];
    const red = slug(bout.red.slug || bout.red.name);
    const blue = slug(bout.blue.slug || bout.blue.name);
    if (!red || !blue || red === blue) return [];
    const boutSlug = slug(bout.id) || `${red}-vs-${blue}-${index + 1}`;
    return [{
      id: `ufc:${event.slug}:bout:${boutSlug}`.slice(0, 160),
      red: `ufc:${red}` as const,
      blue: `ufc:${blue}` as const,
      division: normalizedDivision,
      scheduledRounds: bout.scheduledRounds,
      status: bout.status
    }];
  });
  if (bouts.length === 0) return null;
  const sourceRef = `source:cito-ufc:${retrievedAt.slice(0, 10)}:event:${event.id}`;
  return EventCardSchema.parse({
    schemaVersion: "event-card/1",
    id: `ufc:event:${event.slug}`,
    org: "ufc",
    name: event.name,
    venue: event.venue ?? "Venue not announced",
    startsAtLocal: startsAt,
    timeZone: event.timeZone ?? "UTC",
    startsAtUtc: startsAt,
    sourceRefs: [sourceRef],
    bouts,
    updatedAt: retrievedAt
  });
}

async function writeEvents(root: string, events: readonly CitoEventSummary[], retrievedAt: string): Promise<string[]> {
  const paths: string[] = [];
  for (const event of events) {
    const card = eventCard(event, retrievedAt);
    if (!card) continue;
    const relative = `ventures/fightaiq/events/ufc/${event.slug}.json`;
    await atomicWriteJson(root, relative, card);
    paths.push(relative);
  }
  return paths;
}

function canonicalName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function fieldName(record: FighterRecord): string | null {
  const value = record.fields.name?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function oddsPhase(commenceTime: string, capturedAt: Date): "t3" | "t1" | "closing" | null {
  const hours = (Date.parse(commenceTime) - capturedAt.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0 || hours > 84) return null;
  if (hours <= 6) return "closing";
  if (hours <= 36) return "t1";
  return "t3";
}

async function writeMatchedOdds(input: {
  root: string;
  odds: readonly ApiBoutOdds[];
  capturedAt: Date;
}): Promise<string[]> {
  const [events, fighters] = await Promise.all([
    loadEventCards(path.join(input.root, "ventures", "fightaiq", "events")),
    loadFighterRecords(path.join(input.root, "ventures", "fightaiq", "fighters"))
  ]);
  const names = new Map(fighters.flatMap((fighter) => {
    const name = fieldName(fighter);
    return name ? [[fighter.id, name] as const] : [];
  }));
  const paths: string[] = [];
  for (const offer of input.odds) {
    const phase = oddsPhase(offer.commenceTime, input.capturedAt);
    if (!phase || offer.bookmakers.length === 0) continue;
    const home = canonicalName(offer.red);
    const away = canonicalName(offer.blue);
    const match = events.flatMap((event) => event.bouts).find((bout) => {
      const red = names.get(bout.red);
      const blue = names.get(bout.blue);
      if (!red || !blue) return false;
      const exact = canonicalName(red) === home && canonicalName(blue) === away;
      const reversed = canonicalName(red) === away && canonicalName(blue) === home;
      return exact || reversed;
    });
    if (!match) continue;
    const redName = names.get(match.red);
    const blueName = names.get(match.blue);
    if (!redName || !blueName) continue;
    const bookmaker = [...offer.bookmakers].sort((left, right) => left.name.localeCompare(right.name))[0];
    if (!bookmaker) continue;
    const offerRedIsCardRed = canonicalName(offer.red) === canonicalName(redName);
    const snapshot = {
      schemaVersion: "odds-snapshot/1" as const,
      boutRef: match.id,
      phase,
      source: "odds-api" as const,
      market: `h2h:${bookmaker.name}`.slice(0, 80),
      prices: [
        { pick: redName, decimal: offerRedIsCardRed ? bookmaker.redDecimal : bookmaker.blueDecimal },
        { pick: blueName, decimal: offerRedIsCardRed ? bookmaker.blueDecimal : bookmaker.redDecimal }
      ],
      capturedAt: input.capturedAt.toISOString()
    };
    try {
      const saved = await saveOddsSnapshot(snapshot, input.root);
      paths.push(saved.path);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("already exists")) throw error;
    }
  }
  return paths;
}

export async function materializeFightAiQSources(input: {
  root: string;
  retrievedAt: Date;
  citoFighters: readonly CitoFighterSummary[];
  citoEvents: readonly CitoEventSummary[];
  odds: readonly ApiBoutOdds[];
}): Promise<string[]> {
  const retrievedAt = input.retrievedAt.toISOString();
  const version = modelVersion(await loadMmaModelConfig());
  const profiles = new Map(input.citoFighters.map((fighter) => [fighter.slug, { ...fighter }]));
  for (const event of input.citoEvents) {
    for (const bout of event.bouts) {
      for (const fighter of [bout.red, bout.blue]) {
        const prior = profiles.get(fighter.slug);
        const normalizedDivision = division(bout.division);
        if (!prior) {
          profiles.set(fighter.slug, {
            id: fighter.id ?? fighter.slug,
            slug: fighter.slug,
            name: fighter.name,
            record: null,
            division: normalizedDivision,
            stance: null,
            heightCm: null,
            reachCm: null
          });
        } else if (!prior.division && normalizedDivision) {
          profiles.set(fighter.slug, { ...prior, division: normalizedDivision });
        }
      }
    }
  }
  const fighterPaths: string[] = [];
  for (const fighter of [...profiles.values()].sort((left, right) => left.slug.localeCompare(right.slug))) {
    fighterPaths.push(await writeFighter({
      root: input.root,
      fighter,
      sourceRef: `source:cito-ufc:${retrievedAt.slice(0, 10)}:fighter:${fighter.id}`,
      retrievedAt,
      version
    }));
  }
  const eventPaths = await writeEvents(input.root, input.citoEvents, retrievedAt);
  const oddsPaths = await writeMatchedOdds({ root: input.root, odds: input.odds, capturedAt: input.retrievedAt });
  return [...new Set([...fighterPaths, ...eventPaths, ...oddsPaths])].sort();
}
