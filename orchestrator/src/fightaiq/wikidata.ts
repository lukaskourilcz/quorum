import { FighterCardSchema, type FighterRecord } from "../contracts/mma.js";
import type { SourceFetchContext } from "../sources/types.js";
import { safeFetch, type SafeFetchOptions } from "../security/url.js";
import { atomicWriteJson } from "../state.js";
import { fieldValuesAgree, supersedesSameProvider } from "./field-agreement.js";
import { mergeField, modelEligible } from "./wikimedia-backfill.js";

/**
 * Wikidata as a second provider for the facts it actually holds.
 *
 * It holds date of birth, height and citizenship, and it does not hold a weight class or a fight
 * record — checked against the live items for Belal Muhammad, Ilia Topuria and Conor McGregor
 * before any of this was written. So this cannot make a fighter model-eligible: the critical
 * fields are name, division and record, and Wikidata can only corroborate the first. What it can
 * do is fill height on ninety-one of ninety-two cards and date of birth on sixty-three, which is
 * what the analysis layer needs to compute an age at all.
 */

const USER_AGENT = "BoardlessAI-FightAIQ/1.0 (https://boardless-ai.vercel.app; source review bot)";

const CENTIMETRE = "http://www.wikidata.org/entity/Q174728";
const METRE = "http://www.wikidata.org/entity/Q11573";
const INCH = "http://www.wikidata.org/entity/Q218593";
const FOOT = "http://www.wikidata.org/entity/Q3710";

export interface WikidataProfile {
  qid: string;
  enwikiTitle: string;
  label: string | null;
  dateOfBirth: string | null;
  heightCm: number | null;
}

interface Snak {
  mainsnak?: { datavalue?: { value?: unknown } };
  rank?: string;
}

function preferred(claims: Snak[] | undefined): Snak | null {
  if (!claims || claims.length === 0) return null;
  // Wikidata keeps superseded values on the item at deprecated or normal rank. A fighter who has
  // moved gyms or been re-measured has several; the preferred one is the maintainers' answer.
  return claims.find((claim) => claim.rank === "preferred")
    ?? claims.find((claim) => claim.rank !== "deprecated")
    ?? null;
}

export function readDateOfBirth(claims: Snak[] | undefined): string | null {
  const value = preferred(claims)?.mainsnak?.datavalue?.value as { time?: string; precision?: number } | undefined;
  // Precision 11 is "day". Anything coarser is a year or a decade, and a birthday we invent from
  // it would be a fabricated fact rather than a missing one.
  if (!value?.time || value.precision !== 11) return null;
  const match = /^\+(\d{4}-\d{2}-\d{2})T/u.exec(value.time);
  return match ? match[1]! : null;
}

export function readHeightCm(claims: Snak[] | undefined): number | null {
  const value = preferred(claims)?.mainsnak?.datavalue?.value as { amount?: string; unit?: string } | undefined;
  if (!value?.amount || !value.unit) return null;
  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  // Items disagree about the unit for the same fact: Belal Muhammad is stored as 178 centimetres
  // and Ilia Topuria as 1.73 metres. Reading the number without the unit files one of them as a
  // 1.73 cm fighter.
  const centimetres = value.unit === CENTIMETRE ? amount
    : value.unit === METRE ? amount * 100
      : value.unit === INCH ? amount * 2.54
        : value.unit === FOOT ? amount * 30.48
          : null;
  if (centimetres === null) return null;
  const rounded = Math.round(centimetres);
  return rounded >= 120 && rounded <= 230 ? rounded : null;
}

/**
 * Looks items up by their English Wikipedia title, which is the identifier we already store.
 *
 * Fifty titles per request is the API's own limit for `titles`.
 */
export async function fetchWikidataProfiles(input: {
  titles: readonly string[];
  context: SourceFetchContext;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<Map<string, WikidataProfile>> {
  const output = new Map<string, WikidataProfile>();
  const unique = [...new Set(input.titles.filter((title) => title.trim().length > 0))];
  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const endpoint = new URL("https://www.wikidata.org/w/api.php");
    endpoint.searchParams.set("action", "wbgetentities");
    endpoint.searchParams.set("format", "json");
    endpoint.searchParams.set("sites", "enwiki");
    endpoint.searchParams.set("titles", batch.join("|"));
    endpoint.searchParams.set("props", "claims|labels|sitelinks");
    endpoint.searchParams.set("languages", "en");
    endpoint.searchParams.set("sitefilter", "enwiki");
    const response = await safeFetch(endpoint.toString(), {
      allowHosts: input.context.allowHosts,
      headers: { "User-Agent": USER_AGENT },
      maxBytes: 4_000_000,
      fetchImpl: input.fetchImpl,
      resolveImpl: input.resolveImpl
    });
    const body = JSON.parse(new TextDecoder().decode(response.body)) as {
      entities?: Record<string, {
        id?: string;
        missing?: unknown;
        labels?: { en?: { value?: string } };
        sitelinks?: { enwiki?: { title?: string } };
        claims?: Record<string, Snak[]>;
      }>;
    };
    for (const entity of Object.values(body.entities ?? {})) {
      const enwikiTitle = entity.sitelinks?.enwiki?.title;
      if (!entity.id || entity.missing !== undefined || !enwikiTitle) continue;
      output.set(enwikiTitle, {
        qid: entity.id,
        enwikiTitle,
        label: entity.labels?.en?.value ?? null,
        dateOfBirth: readDateOfBirth(entity.claims?.P569),
        heightCm: readHeightCm(entity.claims?.P2048)
      });
    }
  }
  return output;
}

const PROFILE_FIELDS = ["name", "division", "record", "stance", "heightCm", "reachCm", "dateOfBirth", "team"] as const;

/**
 * A card reduced to what it asserts, with the clock readings taken out.
 *
 * Every sourced field carries the moment it was last read, and so does every entry in `sources`.
 * A sweep stamps the current time on both whether or not the value underneath moved, so a card
 * built from an unchanged Wikidata item never equals the card it came from. Comparing whole cards
 * therefore compared each one against a version of itself it could not match: measured against the
 * real store, three consecutive sweeps of the same replayed item each rewrote all ninety-two
 * files. What survives here is everything a reader would call a fact — the field values and their
 * sourceRefs, the source entries, the identity, the discrepancies and the derived quality numbers.
 */
function assertedFacts(card: FighterRecord): string {
  return JSON.stringify({
    ...card,
    fields: Object.fromEntries(
      Object.entries(card.fields).map(([name, field]) => [name, { ...field, retrievedAt: "" }])
    ),
    sources: card.sources.map((source) => ({ ...source, retrievedAt: "" }))
  });
}

/**
 * Writes what Wikidata holds onto the cards, as a second provider beside Wikipedia.
 *
 * Values are merged, never overwritten: a field the two disagree about keeps the value it has and
 * gains an open discrepancy, because a height of 178 and a height of 180 are a question for a
 * human, not something to average.
 */
export async function enrichWikidataProfiles(input: {
  root: string;
  fighters: readonly FighterRecord[];
  context: SourceFetchContext;
  retrievedAt: Date;
  limit?: number;
  fetchImpl?: SafeFetchOptions["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<{ paths: string[]; processed: number; matched: number }> {
  const retrievedAt = input.retrievedAt.toISOString();
  const candidates = input.fighters
    .filter((fighter) => Boolean(fighter.identity.wikipediaTitle))
    .slice(0, input.limit ?? 200);
  if (candidates.length === 0) return { paths: [], processed: 0, matched: 0 };

  const profiles = await fetchWikidataProfiles({
    titles: candidates.map((fighter) => fighter.identity.wikipediaTitle!),
    context: input.context,
    fetchImpl: input.fetchImpl,
    resolveImpl: input.resolveImpl
  });

  const paths: string[] = [];
  let matched = 0;
  for (const fighter of candidates) {
    const profile = profiles.get(fighter.identity.wikipediaTitle!);
    if (!profile) continue;
    matched += 1;
    const sourceRef = `source:wikidata:${profile.qid}`;
    const sourceUrl = `https://www.wikidata.org/wiki/${profile.qid}`;
    const incoming: Array<[string, string | number]> = [
      ...(profile.label ? [["name", profile.label] as [string, string]] : []),
      ...(profile.dateOfBirth ? [["dateOfBirth", profile.dateOfBirth] as [string, string]] : []),
      ...(profile.heightCm ? [["heightCm", profile.heightCm] as [string, number]] : [])
    ];
    const fields = { ...fighter.fields };
    const discrepancies = structuredClone(fighter.discrepancies);
    for (const [name, value] of incoming) {
      const current = fields[name];
      const conflicts = Boolean(current)
        && !fieldValuesAgree(name, current!.value, value)
        && !supersedesSameProvider(current!.sourceRefs, sourceRef);
      if (conflicts && !discrepancies.some((item) => item.field === name && item.status === "open")) {
        discrepancies.push({
          field: name,
          values: [
            { value: current!.value, sourceRef: current!.sourceRefs[0] ?? "source:unknown" },
            { value, sourceRef }
          ],
          status: "open"
        });
      }
      fields[name] = mergeField(current, value, sourceRef, retrievedAt, name);
    }

    const gaps = PROFILE_FIELDS.filter((name) => !fields[name] || fields[name]?.value === null);
    const corroborated = PROFILE_FIELDS.filter((name) => fields[name]?.corroborated).length;
    const sources = [
      ...fighter.sources.filter((source) => source.id !== sourceRef),
      {
        id: sourceRef,
        url: sourceUrl,
        publisher: "Wikidata",
        title: profile.label ?? profile.enwikiTitle,
        retrievedAt,
        evidenceTier: "secondary" as const,
        license: "CC0"
      }
    ].sort((left, right) => left.id.localeCompare(right.id));

    const card = FighterCardSchema.parse({
      ...fighter,
      identity: { ...fighter.identity, wikidataId: profile.qid },
      sources,
      fields,
      discrepancies,
      quality: { ...fighter.quality, gaps: [...gaps] },
      completeness: Number(((PROFILE_FIELDS.length - gaps.length) / PROFILE_FIELDS.length).toFixed(4)),
      corroboration: Number((corroborated / PROFILE_FIELDS.length).toFixed(4)),
      modelEligible: modelEligible(fighter, fields, discrepancies)
    });
    // Compared on the facts alone, and before the log entry is added rather than after.
    //
    // Both halves matter. Appending the entry first meant every card differed from itself; so did
    // comparing the per-field and per-source `retrievedAt`, which this sweep rewrites on every run
    // by design. With either one left in, the guard below could never fire, and a daily sweep that
    // learned nothing still rewrote all ninety-two files and grew ninety-two change-log entries.
    // The log and the timestamp are only stamped once the facts themselves have moved.
    if (assertedFacts(card) === assertedFacts(fighter)) continue;
    const written = FighterCardSchema.parse({
      ...card,
      changeLog: [...fighter.changeLog, {
        at: retrievedAt,
        kind: "source-refresh" as const,
        fields: incoming.map(([name]) => name),
        sourceRefs: [sourceRef],
        note: `Read the Wikidata item ${profile.qid} for date of birth, height and the English label.`
      }],
      updatedAt: retrievedAt
    });
    const relative = `mma/fighters/${card.id}.json`;
    await atomicWriteJson(input.root, relative, written);
    paths.push(relative);
  }
  return { paths: [...new Set(paths)].sort(), processed: candidates.length, matched };
}
