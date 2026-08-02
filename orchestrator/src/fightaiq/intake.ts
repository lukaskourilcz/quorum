import path from "node:path";
import { BoutRecordSchema, EventCardSchema, FighterCardSchema, SourcedFieldSchema, independentMmaSourceCount, type BoutRecord, type EventCard, type FighterRecord } from "../contracts/mma.js";
import { readJson, atomicWriteJson } from "../state.js";
import { loadBoutRecords, loadFighterRecords, saveBoutRecord, saveOddsSnapshot } from "./store.js";
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

function mergeSourcedField(current: SourcedField | undefined, incoming: SourcedField): SourcedField {
  if (!current) return incoming;
  if (JSON.stringify(current.value) === JSON.stringify(incoming.value)) {
    const sourceRefs = [...new Set([...current.sourceRefs, ...incoming.sourceRefs])].sort();
    const corroborated = independentMmaSourceCount(sourceRefs) >= 2;
    return {
      ...current,
      sourceRefs,
      retrievedAt: incoming.retrievedAt,
      status: corroborated ? "verified" : current.status,
      corroborated
    };
  }
  if (current.status === "verified" || current.status === "disputed" || current.corroborated) return current;
  const currentHasNonCitoSource = current.sourceRefs.some((reference) => !reference.startsWith("source:cito-ufc:"));
  return currentHasNonCitoSource ? current : incoming;
}

function activeOrganizationHistory(existing: FighterRecord | null, sourceRef: string, retrievedAt: string): FighterRecord["organizationHistory"] {
  const history = structuredClone(existing?.organizationHistory ?? []);
  const current = history.filter((entry) => entry.org === "ufc").at(-1);
  if (current?.status === "active") return history;
  if (current && current.to === null) current.to = retrievedAt.slice(0, 10);
  history.push({ org: "ufc", from: retrievedAt.slice(0, 10), to: null, status: "active", sourceRefs: [sourceRef] });
  return history;
}

function modelEligibility(record: {
  fields: Record<string, SourcedField>;
  criticalFields: readonly string[];
  discrepancies: Array<{ field: string; status: "open" | "resolved" }>;
}): boolean {
  const openFields = new Set(record.discrepancies.filter((item) => item.status === "open").map((item) => item.field));
  return record.criticalFields.every((fieldName) => {
    const field = record.fields[fieldName];
    return Boolean(field && independentMmaSourceCount(field.sourceRefs) >= 2 && field.corroborated && field.status === "verified" && !openFields.has(fieldName));
  });
}

async function writeFighter(input: {
  root: string;
  fighter: CitoFighterSummary;
  sourceRef: string;
  retrievedAt: string;
  version: string;
}): Promise<string> {
  const relative = `mma/fighters/ufc:${input.fighter.slug}.json`;
  const existingValue = await readJson<unknown | null>(input.root, relative, null);
  const existing = existingValue === null ? null : FighterCardSchema.parse(existingValue);
  const candidates: Record<string, SourcedField["value"] | null> = {
    name: input.fighter.name,
    division: division(input.fighter.division),
    record: input.fighter.record,
    stance: input.fighter.stance?.toLowerCase() ?? null,
    heightCm: input.fighter.heightCm,
    reachCm: input.fighter.reachCm
  };
  const fields: FighterRecord["fields"] = { ...(existing?.fields ?? {}) };
  const discrepancies = structuredClone(existing?.discrepancies ?? []);
  for (const [name, value] of Object.entries(candidates)) {
    if (value === null || value === "") continue;
    const current = fields[name];
    if (current && current.status !== "verified" && !current.corroborated && JSON.stringify(current.value) !== JSON.stringify(value) && !discrepancies.some((item) => item.field === name && item.status === "open")) {
      discrepancies.push({
        field: name,
        values: [
          { value: current.value, sourceRef: current.sourceRefs[0] ?? "source:unknown" },
          { value, sourceRef: input.sourceRef }
        ],
        status: "open"
      });
    }
    fields[name] = mergeSourcedField(current, sourced(value, input.sourceRef, input.retrievedAt));
  }
  const populated = PROFILE_FIELDS.filter((name) => fields[name]?.value !== null).length;
  const corroborated = PROFILE_FIELDS.filter((name) => fields[name]?.corroborated).length;
  const changedFields = PROFILE_FIELDS.filter((name) => JSON.stringify(existing?.fields[name]) !== JSON.stringify(fields[name]));
  const sourceId = input.sourceRef;
  const sources = [...(existing?.sources ?? []).filter((source) => source.id !== sourceId), {
    id: sourceId,
    publisher: "Cito API",
    title: `UFC fighter record for ${input.fighter.name}`,
    retrievedAt: input.retrievedAt,
    evidenceTier: "secondary" as const
  }].sort((left, right) => left.id.localeCompare(right.id));
  const changeLog = existing?.changeLog ?? [{
    at: input.retrievedAt,
    kind: "created" as const,
    fields: ["identity"],
    sourceRefs: [sourceId],
    note: "Created from the approved Cito free-tier intake."
  }];
  const organizationHistory = activeOrganizationHistory(existing, sourceId, input.retrievedAt);
  const statusChanged = JSON.stringify(existing?.organizationHistory ?? []) !== JSON.stringify(organizationHistory);
  if (existing && changedFields.length > 0 && !changeLog.some((entry) => entry.at === input.retrievedAt && entry.kind === "source-refresh")) {
    changeLog.push({ at: input.retrievedAt, kind: "source-refresh", fields: changedFields, sourceRefs: [sourceId], note: "Updated fields returned by the Cito intake." });
  }
  if (existing && statusChanged && !changeLog.some((entry) => entry.at === input.retrievedAt && entry.kind === "status-change")) {
    changeLog.push({ at: input.retrievedAt, kind: "status-change", fields: ["organizationHistory"], sourceRefs: [sourceId], note: "The reviewed roster source lists this fighter as active." });
  }
  const gaps = PROFILE_FIELDS.filter((name) => !fields[name] || fields[name]?.value === null);
  const base = {
    schemaVersion: "fighter-card/1" as const,
    id: `ufc:${input.fighter.slug}`,
    slug: input.fighter.slug,
    org: "ufc" as const,
    canonicalName: input.fighter.name,
    aliases: existing?.aliases ?? [],
    identity: {
      ...(existing?.identity ?? { wikidataId: null, wikipediaTitle: null, externalIds: {} }),
      externalIds: { ...(existing?.identity.externalIds ?? {}), cito: input.fighter.id }
    },
    organizationHistory,
    sources,
    fields,
    criticalFields: existing?.criticalFields ?? [...CRITICAL_FIELDS],
    discrepancies,
    history: existing?.history ?? [],
    statsProfiles: existing?.statsProfiles ?? [],
    rating: existing?.rating ?? { system: "glicko2" as const, rating: 1500, deviation: 350, volatility: 0.06, boutCount: 0, asOfBoutRef: null, updatedAt: input.retrievedAt },
    quality: { evidenceTier: existing?.quality.evidenceTier ?? "secondary" as const, gaps, lastReviewedAt: existing?.quality.lastReviewedAt ?? null },
    changeLog,
    completeness: Number((populated / PROFILE_FIELDS.length).toFixed(4)),
    corroboration: Number((corroborated / PROFILE_FIELDS.length).toFixed(4)),
    modelVersion: existing?.modelVersion ?? input.version,
    updatedAt: changedFields.length > 0 || statusChanged || !existing ? input.retrievedAt : existing.updatedAt
  };
  const record = FighterCardSchema.parse({ ...base, modelEligible: modelEligibility(base) });
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

function boutRecord(event: EventCard, bout: EventCard["bouts"][number], retrievedAt: string): BoutRecord {
  const sourceRefs = event.sourceRefs;
  const sourceStatus = bout.status === "complete" ? "completed" : bout.status;
  const status = sourceStatus === "weigh-in" && independentMmaSourceCount(sourceRefs) < 2 ? "announced" : sourceStatus;
  return BoutRecordSchema.parse({
    schemaVersion: "bout/1",
    id: `${event.org}:bout:${slug(bout.id.replaceAll(":", "-"))}`,
    org: event.org,
    event: { ref: event.id, name: event.name, startsAtUtc: event.startsAtUtc, venue: event.venue },
    fighters: { red: bout.red, blue: bout.blue },
    division: bout.division,
    scheduledRounds: bout.scheduledRounds,
    status,
    statusHistory: [{ status, at: retrievedAt, sourceRefs, note: status === sourceStatus ? "Status imported from the Cito event listing." : "One source lists the bout at weigh-in; it remains announced until a second source agrees." }],
    discovery: { firstSeenAt: retrievedAt, lastSeenAt: retrievedAt, sourceRefs },
    sourceRefs,
    result: null,
    predictionRefs: [],
    changeLog: [{ at: retrievedAt, kind: "created", fields: ["event", "fighters", "status"], sourceRefs, note: "Discovered on the approved Cito free-tier intake." }],
    updatedAt: retrievedAt
  });
}

async function writeEvents(root: string, events: readonly CitoEventSummary[], retrievedAt: string): Promise<string[]> {
  const paths: string[] = [];
  for (const event of events) {
    const card = eventCard(event, retrievedAt);
    if (!card) continue;
    const relative = `mma/events/ufc/${event.slug}.json`;
    await atomicWriteJson(root, relative, card);
    paths.push(relative);
    for (const bout of card.bouts) {
      const incoming = boutRecord(card, bout, retrievedAt);
      const existingValue = await readJson<unknown | null>(root, `mma/bouts/ufc/${incoming.id.replace("ufc:bout:", "")}.json`, null);
      if (existingValue) {
        const existing = BoutRecordSchema.parse(existingValue);
        const combinedSources = [...new Set([...existing.sourceRefs, ...incoming.sourceRefs])];
        const sourceStatus = bout.status === "complete" ? "completed" : bout.status;
        const candidateStatus = sourceStatus === "weigh-in" && independentMmaSourceCount(combinedSources) < 2 ? "announced" : sourceStatus;
        const terminal = ["completed", "cancelled"].includes(existing.status);
        const nextStatus = terminal && candidateStatus !== existing.status ? existing.status : candidateStatus;
        const statusChanged = existing.status !== nextStatus;
        const merged = BoutRecordSchema.parse({
          ...existing,
          event: incoming.event,
          fighters: incoming.fighters,
          division: incoming.division,
          scheduledRounds: incoming.scheduledRounds,
          status: nextStatus,
          statusHistory: statusChanged ? [...existing.statusHistory, { status: nextStatus, at: retrievedAt, sourceRefs: combinedSources, note: "The reviewed source set changed the bout status." }] : existing.statusHistory,
          discovery: { ...existing.discovery, lastSeenAt: retrievedAt, sourceRefs: [...new Set([...existing.discovery.sourceRefs, ...incoming.sourceRefs])] },
          sourceRefs: combinedSources,
          changeLog: statusChanged ? [...existing.changeLog, { at: retrievedAt, kind: "status-change", fields: ["status"], sourceRefs: combinedSources, note: `Status changed to ${nextStatus}.` }] : existing.changeLog,
          updatedAt: statusChanged ? retrievedAt : existing.updatedAt
        });
        paths.push((await saveBoutRecord(merged, root)).path);
      } else {
        paths.push((await saveBoutRecord(incoming, root)).path);
      }
    }
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
  const [bouts, fighters] = await Promise.all([
    loadBoutRecords(path.join(input.root, "mma", "bouts")),
    loadFighterRecords(path.join(input.root, "mma", "fighters"))
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
    const match = bouts.find((bout) => {
      const red = names.get(bout.fighters.red);
      const blue = names.get(bout.fighters.blue);
      if (!red || !blue) return false;
      if (Math.abs(Date.parse(bout.event.startsAtUtc) - Date.parse(offer.commenceTime)) > 7 * 86_400_000) return false;
      const exact = canonicalName(red) === home && canonicalName(blue) === away;
      const reversed = canonicalName(red) === away && canonicalName(blue) === home;
      return exact || reversed;
    });
    if (!match) continue;
    const redName = names.get(match.fighters.red);
    const blueName = names.get(match.fighters.blue);
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
    const sourceRef = `source:the-odds-api:${offer.id}`;
    if (match.sourceRefs.includes(sourceRef)) continue;
    const combinedSources = [...new Set([...match.sourceRefs, sourceRef])].sort();
    const canConfirm = ["proposed", "announced"].includes(match.status) && independentMmaSourceCount(combinedSources) >= 2;
    const updated = BoutRecordSchema.parse({
      ...match,
      status: canConfirm ? "confirmed" : match.status,
      statusHistory: canConfirm ? [...match.statusHistory, { status: "confirmed", at: input.capturedAt.toISOString(), sourceRefs: combinedSources, note: "A second independent current listing confirmed the matchup." }] : match.statusHistory,
      discovery: { ...match.discovery, lastSeenAt: input.capturedAt.toISOString(), sourceRefs: combinedSources },
      sourceRefs: combinedSources,
      changeLog: [...match.changeLog, {
        at: input.capturedAt.toISOString(),
        kind: canConfirm ? "status-change" : "source-refresh",
        fields: canConfirm ? ["status", "sourceRefs"] : ["sourceRefs"],
        sourceRefs: combinedSources,
        note: canConfirm ? "The second source promoted the bout to confirmed." : "Added an independent current matchup source."
      }],
      updatedAt: input.capturedAt.toISOString()
    });
    paths.push((await saveBoutRecord(updated, input.root)).path);
  }
  return paths;
}

export async function materializeFightAiQSources(input: {
  root: string;
  retrievedAt: Date;
  citoFighters: readonly CitoFighterSummary[];
  citoEvents: readonly CitoEventSummary[];
  odds: readonly ApiBoutOdds[];
  /**
   * The curated roster from config/mma-roster.json. Without it this path wrote a card for
   * every Cito profile and every event participant: one live intake took the store from 39
   * to 339 while the policy listed 92. The Wikipedia path was already gated; this one is the
   * other half, and events and bouts are unaffected — only fighter cards are narrowed.
   */
  allowedIds?: ReadonlySet<string>;
}): Promise<string[]> {
  const retrievedAt = input.retrievedAt.toISOString();
  const version = modelVersion(await loadMmaModelConfig());
  const permitted = (slug: string) => !input.allowedIds || input.allowedIds.has(`ufc:${slug}`);
  const profiles = new Map(input.citoFighters.filter((fighter) => permitted(fighter.slug)).map((fighter) => [fighter.slug, { ...fighter }]));
  for (const event of input.citoEvents) {
    for (const bout of event.bouts) {
      for (const fighter of [bout.red, bout.blue]) {
        if (!permitted(fighter.slug)) continue;
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
