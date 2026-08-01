import path from "node:path";
import { BoutRecordSchema, FighterCardSchema, independentMmaSourceCount, type BoutRecord, type FighterRecord } from "../contracts/mma.js";
import type { SourceFetchContext } from "../sources/types.js";
import { safeFetch, type SafeFetchOptions } from "../security/url.js";
import { atomicWriteJson } from "../state.js";
import { sha256 } from "./engine.js";
import { fighterSlug, sanitizeSourceText, type BackfillQueueItem } from "./roster.js";
import { loadFighterRecords, saveBoutRecord } from "./store.js";

const USER_AGENT = "BoardlessAI-FightAIQ/1.0 (https://boardless-ai.vercel.app; source review bot)";

interface RevisionPage {
  pageid?: number;
  title?: string;
  revisions?: Array<{ slots?: { main?: { content?: string } } }>;
}

interface RevisionResponse {
  query?: { pages?: RevisionPage[] };
}

export interface ParsedWikiFight {
  result: "win" | "loss" | "draw" | "no-contest";
  opponent: string;
  method: string | null;
  event: string;
  happenedAt: string;
  round: number | null;
  elapsedSeconds: number | null;
}

export interface ParsedWikiProfile {
  fields: Record<string, string | number>;
  fights: ParsedWikiFight[];
}

function wikiText(value: string, maximum = 180): string {
  return sanitizeSourceText(value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/giu, " ")
    .replace(/<ref\b[^>]*\/>/giu, " ")
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/gu, "$1")
    .replace(/\{\{(?:yes2|no2|draw2?|nc2?)\}\}/giu, " ")
    .replace(/\{\{(?:small|nowrap|sortname|flagicon|flag)\|([^{}]+)\}\}/giu, "$1")
    .replace(/'{2,}/gu, ""), maximum);
}

function templateDate(value: string): string | null {
  const match = value.match(/\{\{(?:birth date(?: and age)?|start date|dts)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/iu);
  if (match) {
    const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const namedMonth = value.match(/\{\{dts\s*\|(?:\s*format\s*=\s*[a-z]+\s*\|)?\s*(\d{4})\s*\|\s*([a-z]+)\s*\|\s*(\d{1,2})/iu);
  if (namedMonth) {
    const parsed = Date.parse(`${namedMonth[2]} ${namedMonth[3]}, ${namedMonth[1]} UTC`);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  const cleaned = wikiText(value, 80);
  const parsed = Date.parse(cleaned);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function centimetres(value: string): number | null {
  const converted = value.match(/\{\{convert\s*\|\s*(\d{2,3}(?:\.\d+)?)\s*\|\s*(cm|in)(?:\||\}\})/iu);
  if (converted) return Number((Number(converted[1]) * (converted[2]!.toLowerCase() === "in" ? 2.54 : 1)).toFixed(2));
  const cm = value.match(/(?:cm\s*=\s*|\b)(\d{2,3}(?:\.\d+)?)\s*cm\b/iu);
  if (cm) return Number(Number(cm[1]).toFixed(2));
  const inches = value.match(/(?:in\s*=\s*|\b)(\d{2,3}(?:\.\d+)?)\s*(?:in|inches)\b/iu);
  return inches ? Number((Number(inches[1]) * 2.54).toFixed(2)) : null;
}

function infoboxValue(wikitext: string, key: string): string | null {
  const match = wikitext.match(new RegExp(`^\\|[ \\t]*${key}[ \\t]*=[ \\t]*(.*)$`, "imu"));
  return match?.[1]?.trim() || null;
}

function recordFromInfobox(wikitext: string): string | null {
  const number = (key: string) => {
    const raw = infoboxValue(wikitext, key);
    const value = raw ? Number(raw.match(/\d+/u)?.[0]) : NaN;
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  const sum = (...keys: string[]) => {
    const values = keys.map(number);
    return values.every((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
  };
  const wins = number("mma_win") ?? sum("mma_kowin", "mma_subwin", "mma_decwin", "mma_dqwin", "mma_otherwin");
  const losses = number("mma_loss") ?? sum("mma_koloss", "mma_subloss", "mma_decloss", "mma_dqloss", "mma_otherloss");
  if (wins === null || losses === null) return null;
  const draws = number("mma_draw") ?? 0;
  const noContests = number("mma_nc") ?? 0;
  return `${wins}-${losses}-${draws}${noContests ? ` (${noContests} NC)` : ""}`;
}

function tableCell(line: string): string {
  const raw = line.replace(/^\|/u, "").trim();
  const attribute = raw.match(/^(?:(?:align|style|rowspan|colspan|scope|data-sort-value)\s*=\s*[^|]+\|)\s*(.*)$/iu);
  const value = attribute?.[1] ?? raw;
  return /\{\{(?:birth date(?: and age)?|start date|dts)\s*\|/iu.test(value) ? value.slice(0, 200) : wikiText(value, 200);
}

function parseClock(value: string, round: number | null): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/u);
  if (!match || round === null) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  if (minutes > 5 || seconds > 59) return null;
  return (round - 1) * 300 + minutes * 60 + seconds;
}

export function parseWikipediaFighterPage(wikitext: string): ParsedWikiProfile {
  const fields: Record<string, string | number> = {};
  const name = infoboxValue(wikitext, "name");
  const birth = infoboxValue(wikitext, "birth_date");
  const height = infoboxValue(wikitext, "height");
  const reach = infoboxValue(wikitext, "reach");
  const division = infoboxValue(wikitext, "weight_class");
  const stance = infoboxValue(wikitext, "stance");
  const team = infoboxValue(wikitext, "team");
  const record = recordFromInfobox(wikitext);
  if (name && wikiText(name)) fields.name = wikiText(name);
  if (birth && templateDate(birth)) fields.dateOfBirth = templateDate(birth)!.slice(0, 10);
  if (height && centimetres(height)) fields.heightCm = centimetres(height)!;
  if (reach && centimetres(reach)) fields.reachCm = centimetres(reach)!;
  if (division && wikiText(division)) fields.division = wikiText(division).split(/\s{2,}|\(|\//u)[0]!.trim();
  if (stance && wikiText(stance)) fields.stance = wikiText(stance).toLowerCase();
  if (team && wikiText(team)) fields.team = wikiText(team);
  if (record) fields.record = record;

  const fights: ParsedWikiFight[] = [];
  const mmaHeading = /^==+\s*Mixed martial arts (?:exhibition )?record\s*==+\s*$/imu.exec(wikitext);
  const afterHeading = mmaHeading ? wikitext.slice(mmaHeading.index + mmaHeading[0].length) : "";
  const nextSection = afterHeading.search(/^==+\s*[^=].*==+\s*$/mu);
  const mmaSection = nextSection >= 0 ? afterHeading.slice(0, nextSection) : afterHeading;
  if (!/\{\{MMA record start\b|class\s*=\s*["']?wikitable/iu.test(mmaSection)) return { fields, fights };
  for (const row of mmaSection.split(/\n\|-+/u)) {
    const cells = row.split(/\n(?=\|)/u).map(tableCell).filter(Boolean);
    const resultIndex = cells.findIndex((cell) => /^(?:win|loss|draw|nc|no contest)$/iu.test(cell));
    if (resultIndex < 0) continue;
    const resultCell = cells[resultIndex]!.toLowerCase();
    const opponent = cells[resultIndex + 2];
    const method = cells[resultIndex + 3] ?? "";
    const event = cells[resultIndex + 4];
    const happenedAt = cells[resultIndex + 5] ? templateDate(cells[resultIndex + 5]!) : null;
    const roundValue = Number(cells[resultIndex + 6]);
    const round = Number.isSafeInteger(roundValue) && roundValue >= 1 && roundValue <= 5 ? roundValue : null;
    if (!opponent || !event || !happenedAt) continue;
    fights.push({
      result: resultCell === "win" ? "win" : resultCell === "loss" ? "loss" : resultCell === "draw" ? "draw" : "no-contest",
      opponent,
      method: method ? method.slice(0, 80) : null,
      event,
      happenedAt,
      round,
      elapsedSeconds: parseClock(cells[resultIndex + 7] ?? "", round)
    });
  }
  return { fields, fights };
}

function mergeField(current: FighterRecord["fields"][string] | undefined, incomingValue: string | number, sourceRef: string, retrievedAt: string) {
  if (!current) return { value: incomingValue, sourceRefs: [sourceRef], retrievedAt, status: "provisional" as const, corroborated: false };
  if (String(current.value).trim().toLocaleLowerCase("en") !== String(incomingValue).trim().toLocaleLowerCase("en")) return current;
  const sourceRefs = [...new Set([...current.sourceRefs, sourceRef])].sort();
  const corroborated = independentMmaSourceCount(sourceRefs) >= 2;
  return { ...current, sourceRefs, retrievedAt, corroborated, status: corroborated ? "verified" as const : current.status };
}

function modelEligible(card: FighterRecord, fields: FighterRecord["fields"], discrepancies: FighterRecord["discrepancies"]): boolean {
  const open = new Set(discrepancies.filter((item) => item.status === "open").map((item) => item.field));
  return card.criticalFields.every((name) => {
    const field = fields[name];
    return Boolean(field?.status === "verified" && field.corroborated && independentMmaSourceCount(field.sourceRefs) >= 2 && !open.has(name));
  });
}

function opponentCard(input: { org: FighterRecord["org"]; name: string; sourceRef: string; sourceUrl: string; retrievedAt: string; modelVersion: string }): FighterRecord {
  const slug = fighterSlug(input.name);
  return FighterCardSchema.parse({
    schemaVersion: "fighter-card/1",
    id: `${input.org}:${slug}`,
    slug,
    org: input.org,
    canonicalName: input.name,
    aliases: [],
    identity: { wikidataId: null, wikipediaTitle: null, externalIds: {} },
    organizationHistory: [{ org: input.org, from: null, to: null, status: "unknown", sourceRefs: [input.sourceRef] }],
    sources: [{ id: input.sourceRef, url: input.sourceUrl, publisher: "Wikipedia", title: input.name, retrievedAt: input.retrievedAt, evidenceTier: "secondary", license: "CC BY-SA" }],
    fields: { name: { value: input.name, sourceRefs: [input.sourceRef], retrievedAt: input.retrievedAt, status: "provisional", corroborated: false } },
    criticalFields: ["name", "division", "record"],
    discrepancies: [],
    history: [],
    statsProfiles: [],
    rating: { system: "glicko2", rating: 1500, deviation: 350, volatility: 0.06, boutCount: 0, asOfBoutRef: null, updatedAt: input.retrievedAt },
    quality: { evidenceTier: "secondary", gaps: ["division", "record", "stance", "heightCm", "reachCm", "dateOfBirth", "team"], lastReviewedAt: null },
    changeLog: [{ at: input.retrievedAt, kind: "created", fields: ["identity", "name"], sourceRefs: [input.sourceRef], note: "Created as an opponent linked from a sourced fight-history row." }],
    completeness: 0.125,
    corroboration: 0,
    modelEligible: false,
    modelVersion: input.modelVersion,
    updatedAt: input.retrievedAt
  });
}

function historicalBout(input: { fighter: FighterRecord; opponent: FighterRecord; fight: ParsedWikiFight; sourceRef: string; retrievedAt: string }): BoutRecord {
  const identity = sha256({ org: input.fighter.org, fighter: input.fighter.id, opponent: input.opponent.id, event: input.fight.event, happenedAt: input.fight.happenedAt }).slice(0, 20);
  const winner = input.fight.result === "win" ? "red" : input.fight.result === "loss" ? "blue" : input.fight.result;
  return BoutRecordSchema.parse({
    schemaVersion: "bout/1",
    id: `${input.fighter.org}:bout:history-${identity}`,
    org: input.fighter.org,
    event: { ref: `${input.fighter.org}:event:history-${fighterSlug(input.fight.event).slice(0, 80) || identity}`, name: input.fight.event, startsAtUtc: input.fight.happenedAt, venue: null },
    fighters: { red: input.fighter.id, blue: input.opponent.id },
    division: null,
    scheduledRounds: null,
    status: "completed",
    statusHistory: [{ status: "completed", at: input.fight.happenedAt, sourceRefs: [input.sourceRef], note: "Historical result imported from a cited Wikipedia record table." }],
    discovery: { firstSeenAt: input.retrievedAt, lastSeenAt: input.retrievedAt, sourceRefs: [input.sourceRef] },
    sourceRefs: [input.sourceRef],
    result: { winner, method: input.fight.method, round: input.fight.round, elapsedSeconds: input.fight.elapsedSeconds, sourceRefs: [input.sourceRef] },
    predictionRefs: [],
    changeLog: [{ at: input.retrievedAt, kind: "created", fields: ["fighters", "event", "result"], sourceRefs: [input.sourceRef], note: "Created from a single-source historical row; confidence remains provisional." }],
    updatedAt: input.retrievedAt
  });
}

function completedExistingBout(input: { bout: BoutRecord; subjectRef: string; fight: ParsedWikiFight; sourceRef: string; retrievedAt: string }): BoutRecord {
  const subjectIsRed = input.bout.fighters.red === input.subjectRef;
  const winner = input.fight.result === "draw" || input.fight.result === "no-contest"
    ? input.fight.result
    : input.fight.result === "win"
      ? subjectIsRed ? "red" : "blue"
      : subjectIsRed ? "blue" : "red";
  const sourceRefs = [...new Set([...input.bout.sourceRefs, input.sourceRef])].sort();
  return BoutRecordSchema.parse({
    ...input.bout,
    status: "completed",
    statusHistory: [...input.bout.statusHistory, { status: "completed", at: input.fight.happenedAt, sourceRefs, note: "A cited historical result closed the discovered bout." }],
    discovery: { ...input.bout.discovery, lastSeenAt: input.retrievedAt, sourceRefs },
    sourceRefs,
    result: { winner, method: input.fight.method, round: input.fight.round, elapsedSeconds: input.fight.elapsedSeconds, sourceRefs: [input.sourceRef] },
    changeLog: [...input.bout.changeLog, { at: input.retrievedAt, kind: "status-change", fields: ["status", "result"], sourceRefs, note: "Appended the verified post-event result from a cited history row." }],
    updatedAt: input.retrievedAt
  });
}

export async function enrichWikimediaBackfill(input: {
  root: string;
  fighters: readonly FighterRecord[];
  bouts: readonly BoutRecord[];
  queue: readonly BackfillQueueItem[];
  context: SourceFetchContext;
  retrievedAt: Date;
  limit?: number;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<{ paths: string[]; processed: number }> {
  const staleBefore = input.retrievedAt.getTime() - 30 * 86_400_000;
  const byId = new Map(input.fighters.map((fighter) => [fighter.id, fighter]));
  const selected = input.queue.flatMap((item) => {
    const fighter = byId.get(item.fighterRef);
    if (!fighter?.identity.wikipediaTitle) return [];
    if (fighter.quality.lastReviewedAt && Date.parse(fighter.quality.lastReviewedAt) >= staleBefore) return [];
    return [fighter];
  }).slice(0, input.limit ?? 12);
  if (selected.length === 0) return { paths: [], processed: 0 };

  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  endpoint.searchParams.set("action", "query");
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("formatversion", "2");
  endpoint.searchParams.set("prop", "revisions");
  endpoint.searchParams.set("rvprop", "content");
  endpoint.searchParams.set("rvslots", "main");
  endpoint.searchParams.set("redirects", "1");
  endpoint.searchParams.set("maxlag", "5");
  endpoint.searchParams.set("titles", selected.map((fighter) => fighter.identity.wikipediaTitle!).join("|"));
  const response = await safeFetch(endpoint.toString(), {
    allowHosts: input.context.allowHosts,
    headers: { "User-Agent": USER_AGENT },
    maxBytes: 4_000_000,
    fetchImpl: input.fetchImpl,
    resolveImpl: input.resolveImpl
  });
  const payload = JSON.parse(new TextDecoder().decode(response.body)) as RevisionResponse;
  const pages = new Map((payload.query?.pages ?? []).flatMap((page) => page.title ? [[page.title, page] as const] : []));
  const paths: string[] = [];
  const allCards = new Map(input.fighters.map((fighter) => [fighter.id, fighter]));
  const allBouts = new Map(input.bouts.map((bout) => [bout.id, bout]));
  const retrievedAt = input.retrievedAt.toISOString();

  for (const selectedCard of selected) {
    const page = pages.get(selectedCard.identity.wikipediaTitle!);
    const content = page?.revisions?.[0]?.slots?.main?.content;
    if (!content || !page?.pageid || !page.title) continue;
    const sourceRef = `source:wikipedia:${page.pageid}`;
    const sourceUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(" ", "_"))}`;
    const profile = parseWikipediaFighterPage(content);
    const fields = { ...selectedCard.fields };
    const discrepancies = structuredClone(selectedCard.discrepancies);
    for (const [name, value] of Object.entries(profile.fields)) {
      const current = fields[name];
      if (current && String(current.value).trim().toLocaleLowerCase("en") !== String(value).trim().toLocaleLowerCase("en") && !discrepancies.some((item) => item.field === name && item.status === "open")) {
        discrepancies.push({ field: name, values: [{ value: current.value, sourceRef: current.sourceRefs[0] ?? "source:unknown" }, { value, sourceRef }], status: "open" });
      }
      fields[name] = mergeField(current, value, sourceRef, retrievedAt);
    }
    const opponentPaths: string[] = [];
    for (const fight of profile.fights) {
      const opponentSlug = fighterSlug(fight.opponent);
      if (!opponentSlug) continue;
      const opponentId = `${selectedCard.org}:${opponentSlug}`;
      let opponent = allCards.get(opponentId);
      if (!opponent) {
        opponent = opponentCard({ org: selectedCard.org, name: fight.opponent, sourceRef, sourceUrl, retrievedAt, modelVersion: selectedCard.modelVersion });
        allCards.set(opponent.id, opponent);
        const opponentPath = `mma/fighters/${opponent.id}.json`;
        await atomicWriteJson(input.root, opponentPath, opponent);
        opponentPaths.push(opponentPath);
      }
      const existing = [...allBouts.values()].find((bout) => {
        if (bout.org !== selectedCard.org || bout.status === "completed") return false;
        const samePair = new Set([bout.fighters.red, bout.fighters.blue]);
        if (!samePair.has(selectedCard.id) || !samePair.has(opponent!.id)) return false;
        return Math.abs(Date.parse(bout.event.startsAtUtc) - Date.parse(fight.happenedAt)) <= 3 * 86_400_000;
      });
      const resolvedBout = existing
        ? completedExistingBout({ bout: existing, subjectRef: selectedCard.id, fight, sourceRef, retrievedAt })
        : historicalBout({ fighter: selectedCard, opponent, fight, sourceRef, retrievedAt });
      paths.push((await saveBoutRecord(resolvedBout, input.root)).path);
      allBouts.set(resolvedBout.id, resolvedBout);
    }
    const profileNames = ["name", "division", "record", "stance", "heightCm", "reachCm", "dateOfBirth", "team"];
    const gaps = profileNames.filter((name) => !fields[name] || fields[name]?.value === null);
    const populated = profileNames.length - gaps.length;
    const corroborated = profileNames.filter((name) => fields[name]?.corroborated).length;
    const sources = [...selectedCard.sources.filter((source) => source.id !== sourceRef), { id: sourceRef, url: sourceUrl, publisher: "Wikipedia", title: page.title, retrievedAt, evidenceTier: "secondary" as const, license: "CC BY-SA" }].sort((left, right) => left.id.localeCompare(right.id));
    const card = FighterCardSchema.parse({
      ...selectedCard,
      canonicalName: typeof fields.name?.value === "string" ? fields.name.value : selectedCard.canonicalName,
      sources,
      fields,
      discrepancies,
      quality: { evidenceTier: selectedCard.quality.evidenceTier, gaps, lastReviewedAt: retrievedAt },
      changeLog: [...selectedCard.changeLog, {
        at: retrievedAt,
        kind: "source-refresh",
        fields: [...new Set([...Object.keys(profile.fields), ...(profile.fights.length ? ["history"] : [])])],
        sourceRefs: [sourceRef],
        note: `Reviewed the Wikipedia profile and found ${profile.fights.length} historical fight rows.`
      }],
      completeness: Number((populated / profileNames.length).toFixed(4)),
      corroboration: Number((corroborated / profileNames.length).toFixed(4)),
      modelEligible: modelEligible(selectedCard, fields, discrepancies),
      updatedAt: retrievedAt
    });
    const relative = `mma/fighters/${card.id}.json`;
    await atomicWriteJson(input.root, relative, card);
    paths.push(relative, ...opponentPaths);
  }
  return { paths: [...new Set(paths)].sort(), processed: selected.length };
}

export function wikipediaBackfillPath(root: string): string {
  return path.join(root, "mma", "backfill", "last-run.json");
}
