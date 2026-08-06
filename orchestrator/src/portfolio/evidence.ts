import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../paths.js";
import { atomicWriteJson, readJson } from "../state.js";
import { createDigest } from "../sources/digest.js";
import { loadSourceRegistry } from "../sources/registry.js";
import { runScrapersDetailed } from "../sources/run.js";
import type { SourceFetchContext } from "../sources/types.js";
import { fetchCitoFighters, fetchCitoUpcomingEvents, fetchOddsApiMma, loadMmaSourceRegistry, type ApiBoutOdds, type CitoEventSummary, type CitoFighterSummary } from "../fightaiq/sources.js";
import { materializeFightAiQSources, scheduledEventCard } from "../fightaiq/intake.js";
import { buildBackfillQueue, fetchWikimediaRoster, fetchWikimediaRosterByTitles, materializeWikimediaRoster, reconcileRosterStatuses, writeBackfillQueue, writeRosterStatus, type WikimediaRosterEntry } from "../fightaiq/roster.js";
import { loadRosterPolicy, rosterPolicyIds, rosterPolicyTitles } from "../fightaiq/roster-policy.js";
import { fetchCurrentRosterNames, fetchRecentResults, fetchScheduledCards } from "../fightaiq/wikipedia-events.js";
import { applyEventResults } from "../fightaiq/results.js";
import { enrichWikidataProfiles } from "../fightaiq/wikidata.js";

import { loadBoutRecords, loadFighterRecords } from "../fightaiq/store.js";
import { rebuildDerivedFighterData } from "../fightaiq/derived.js";
import { reconcilePredictionResults, runConfirmedBoutAnalysis } from "../fightaiq/analysis.js";
import { enrichWikimediaBackfill } from "../fightaiq/wikimedia-backfill.js";

/** How far back the results reader looks for a card whose outcome is not on file yet. */
const RESULT_WINDOW_DAYS = 10;

interface NetworkAllowlist {
  runtimeHosts: string[];
}

async function sourceContext(now: Date): Promise<SourceFetchContext> {
  const allowlist = JSON.parse(
    await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")
  ) as NetworkAllowlist;
  return { allowHosts: allowlist.runtimeHosts, now };
}


type SourceState = "success" | "skipped" | "failed";

interface FightSourceResult {
  sourceId: string;
  status: SourceState;
  reason: string | null;
  items: unknown[];
  quota?: {
    remainingCredits: number | null;
    usedCredits: number | null;
    lastRequestCredits: number | null;
    exhausted: boolean;
  };
}

function cleanFailure(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown source failure";
  return `${error.name}: ${error.message}`
    .replace(/([?&](?:api_?key|key|token|access_token)=)[^&\s]+/giu, "$1[redacted]")
    .slice(0, 300);
}

/**
 * How far ahead a scheduled card counts as worth enriching.
 *
 * Deliberately wider than the three-day fight-week window in store.ts, which is an editorial
 * signal about what to write. This one decides whether to gather at all, and gathering has to
 * start early enough that a critical field can be corroborated before the card, not on the
 * morning of it.
 */
const INTAKE_HORIZON_DAYS = 14;

/**
 * Cito's free tier, as named in the owner checklist: 500 calls a month and 200 a day.
 *
 * Constants rather than literals buried in a condition, because a test has to be able to say
 * "the guard stops when the reservation would cross the cap" without restating the numbers and
 * quietly agreeing with whatever the code happens to do.
 */
export const CITO_MONTHLY_CALL_CAP = 500;
export const CITO_DAILY_CALL_CAP = 200;
/** Calls one run may make: the upcoming-event probe, plus a fighter page when a card is due. */
export const CITO_CALL_RESERVATION = 2;

export function withinIntakeHorizon(startsAt: string | null, now: Date): boolean {
  if (!startsAt) return false;
  const starts = Date.parse(startsAt);
  if (Number.isNaN(starts)) return false;
  const days = (starts - now.getTime()) / 86_400_000;
  return days >= 0 && days <= INTAKE_HORIZON_DAYS;
}

export async function refreshFightAiQEvidence(input: {
  root: string;
  date: string;
  now: Date;
}): Promise<{ artifactPaths: string[]; evidenceRefs: string[]; contentHash: string; materialChange: boolean }> {
  const [registry, context] = await Promise.all([
    loadMmaSourceRegistry(),
    sourceContext(input.now)
  ]);
  const wired = new Set(registry.sources.filter((source) => source.state === "wired").map((source) => source.id));
  const month = input.date.slice(0, 7);
  const quotaPath = "ventures/fightaiq/source-snapshots/quota.json";
  const priorQuota = await readJson<{ month?: string; remainingCredits?: number | null }>(input.root, quotaPath, {});
  const oddsKey = process.env.THE_ODDS_API_KEY?.trim() ?? "";
  const citoKey = process.env.CITO_API_KEY?.trim() ?? "";
  const results: FightSourceResult[] = [];
  let oddsEvents: ApiBoutOdds[] = [];
  let citoFighters: CitoFighterSummary[] = [];
  let citoEvents: CitoEventSummary[] = [];
  let wikimediaRoster: WikimediaRosterEntry[] = [];

  if (!wired.has("the-odds-api")) {
    results.push({ sourceId: "the-odds-api", status: "skipped", reason: "Source is not wired.", items: [] });
  } else if (!oddsKey) {
    results.push({ sourceId: "the-odds-api", status: "skipped", reason: "THE_ODDS_API_KEY is unavailable.", items: [] });
  } else {
    try {
      const odds = await fetchOddsApiMma({
        apiKey: oddsKey,
        context,
        remainingCredits: priorQuota.month === month ? priorQuota.remainingCredits : null
      });
      oddsEvents = odds.events;
      results.push({
        sourceId: "the-odds-api",
        status: odds.events.length > 0 ? "success" : "skipped",
        reason: odds.events.length > 0 ? null : odds.exhausted ? "Monthly source credits are exhausted." : "No MMA prices were returned.",
        items: odds.events,
        quota: {
          remainingCredits: odds.remainingCredits,
          usedCredits: odds.usedCredits,
          lastRequestCredits: odds.lastRequestCredits,
          exhausted: odds.exhausted
        }
      });
      await atomicWriteJson(input.root, quotaPath, {
        schemaVersion: "fightaiq-source-quota/1",
        month,
        remainingCredits: odds.remainingCredits,
        updatedAt: input.now.toISOString()
      });
    } catch (error) {
      results.push({ sourceId: "the-odds-api", status: "failed", reason: cleanFailure(error), items: [] });
    }
  }

  const citoQuotaPath = "mma/source-quota/cito.json";
  const citoQuota = await readJson<{ month?: string; day?: string; monthlyCalls?: number; dailyCalls?: number; nextFighterPage?: number; currentCycleFighterRefs?: string[] }>(input.root, citoQuotaPath, {});
  const citoMonthlyCalls = citoQuota.month === month ? citoQuota.monthlyCalls ?? 0 : 0;
  const citoDailyCalls = citoQuota.day === input.date ? citoQuota.dailyCalls ?? 0 : 0;
  // It reserved five, three of which went to a bouts endpoint that returned nothing on every
  // run. The reservation still covers whatever the run may spend, so it is the ceiling of the
  // plan below rather than a number chosen for comfort.
  const citoCallReservation = CITO_CALL_RESERVATION;
  let citoQuotaRecorded = false;
  let citoRosterCycleComplete = false;
  let citoRosterCycleRefs: string[] = [];
  if (!wired.has("cito-ufc")) {
    results.push({ sourceId: "cito-ufc", status: "skipped", reason: "Source is not wired.", items: [] });
  } else if (!citoKey) {
    results.push({ sourceId: "cito-ufc", status: "skipped", reason: "CITO_API_KEY is unavailable.", items: [] });
  } else if (citoMonthlyCalls + citoCallReservation > CITO_MONTHLY_CALL_CAP || citoDailyCalls + citoCallReservation > CITO_DAILY_CALL_CAP) {
    results.push({ sourceId: "cito-ufc", status: "skipped", reason: "The free-tier quota guard stopped this run before a request.", items: [] });
  } else {
    try {
      // Events first, then the fighters on those cards. The two used to run together, so the
      // roster was paged fifty at a time whether or not a card existed — the owner's exact
      // complaint. Now nothing is enriched until something is scheduled.
      citoEvents = await fetchCitoUpcomingEvents({ apiKey: citoKey, context });
      const inHorizon = citoEvents.filter((event) => withinIntakeHorizon(event.startsAt, input.now));
      citoFighters = inHorizon.length > 0
        ? await fetchCitoFighters({ apiKey: citoKey, context, page: citoQuota.nextFighterPage ?? 1 })
        : [];
      const items = [
        ...citoFighters.map((fighter) => ({ kind: "fighter", ...fighter })),
        ...citoEvents.map((event) => ({ kind: "event", ...event }))
      ];
      results.push({
        sourceId: "cito-ufc",
        status: items.length > 0 ? "success" : "skipped",
        reason: items.length > 0
          ? null
          : "No UFC fighter or upcoming-event records were returned.",
        items
      });
      const currentPage = citoQuota.nextFighterPage ?? 1;
      const priorCycleRefs = currentPage > 1 ? citoQuota.currentCycleFighterRefs ?? [] : [];
      citoRosterCycleRefs = [...new Set([...priorCycleRefs, ...citoFighters.map((fighter) => `ufc:${fighter.slug}`)])].sort();
      citoRosterCycleComplete = citoFighters.length < 50;
      await atomicWriteJson(input.root, citoQuotaPath, {
        schemaVersion: "cito-free-quota/1",
        month,
        day: input.date,
        monthlyCalls: citoMonthlyCalls + citoCallReservation,
        dailyCalls: citoDailyCalls + citoCallReservation,
        reservedCallsPerRun: citoCallReservation,
        nextFighterPage: citoRosterCycleComplete ? 1 : currentPage + 1,
        currentCycleFighterRefs: citoRosterCycleComplete ? [] : citoRosterCycleRefs,
        updatedAt: input.now.toISOString()
      });
      citoQuotaRecorded = true;
    } catch (error) {
      results.push({ sourceId: "cito-ufc", status: "failed", reason: cleanFailure(error), items: [] });
    }
  }

  if (wired.has("wikimedia")) {
    try {
      // Resolve the listed fighters by name rather than crawling the category, which stops at
      // 500 entries and is shared across both promotions: 34 of the 92 fighters the policy
      // names never reached the store at all, among them Pereira, Topuria, Pantoja and Nunes,
      // and 20 more arrived without the Wikipedia title the enrichment step needs, so they
      // could never gain a division, a record or a history. Asking for exactly the listed
      // titles is both narrower and complete.
      const titlePolicy = await loadRosterPolicy(configRoot);
      const rosters = await Promise.all([
        fetchWikimediaRosterByTitles({ org: "ufc", titles: rosterPolicyTitles(titlePolicy, "ufc"), context }),
        fetchWikimediaRosterByTitles({ org: "oktagon", titles: rosterPolicyTitles(titlePolicy, "oktagon"), context })
      ]);
      wikimediaRoster = rosters.flat();
      results.push({
        sourceId: "wikimedia",
        status: wikimediaRoster.length ? "success" : "skipped",
        reason: wikimediaRoster.length ? null : "The reviewed fighter categories returned no pages.",
        items: wikimediaRoster
      });
    } catch (error) {
      results.push({ sourceId: "wikimedia", status: "failed", reason: cleanFailure(error), items: [] });
    }
  }

  // The published schedule, and the card for each event close enough to matter. This is what
  // event-first is first from: Cito announces events and its bouts endpoint has returned nothing
  // on every run, so without this state/mma/events stays empty and nothing downstream has a card
  // to work from.
  let scheduledCards: Array<NonNullable<ReturnType<typeof scheduledEventCard>>> = [];
  try {
    const cards = await fetchScheduledCards({ context, now: input.now, withinDays: INTAKE_HORIZON_DAYS });
    scheduledCards = cards.flatMap((card) => scheduledEventCard({
      org: card.org,
      name: card.name,
      startsAtUtc: card.startsAtUtc,
      venue: card.venue,
      bouts: card.bouts,
      sourceTitle: card.sourceTitle,
      retrievedAt: input.now.toISOString()
    }) ?? []);
    results.push({
      sourceId: "wikipedia-schedule",
      status: scheduledCards.length > 0 ? "success" : "skipped",
      reason: scheduledCards.length > 0 ? null : "No scheduled card with an announced bout list is inside the horizon.",
      items: scheduledCards.map((card) => ({ kind: "event", id: card.id, name: card.name, startsAtUtc: card.startsAtUtc, bouts: card.bouts.length }))
    });
  } catch (error) {
    results.push({ sourceId: "wikipedia-schedule", status: "failed", reason: cleanFailure(error), items: [] });
  }


  const evidenceRefs = results
    .filter((result) => result.status === "success")
    .map((result) => `source:${result.sourceId}:${input.date}`);
  const artifactPath = `ventures/fightaiq/source-snapshots/${input.date}.json`;
  const previousDate = new Date(Date.parse(`${input.date}T12:00:00.000Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [sameDaySnapshot, previousSnapshot] = await Promise.all([
    readJson<{ contentHash?: string }>(input.root, artifactPath, {}),
    readJson<{ contentHash?: string }>(
      input.root,
      `ventures/fightaiq/source-snapshots/${previousDate}.json`,
      {}
    )
  ]);
  // Material facts, not payloads.
  //
  // Hashing the raw items meant the hash changed every single day whether or not anything had:
  // bookmaker decimals move by the hour, and the fighter page cursor advanced on every run, so
  // mma-intake's change trigger could never fire negative and the room opened daily regardless.
  // What counts as change here is a card, its date and its bout roster; who is on the roster;
  // and whether a source answered at all.
  const contentHash = createHash("sha256")
    .update(JSON.stringify({
      sources: results.map(({ sourceId, status }) => ({ sourceId, status })).sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
      events: scheduledCards
        .map((card) => ({
          id: card.id,
          startsAtUtc: card.startsAtUtc,
          bouts: card.bouts.map((bout) => `${bout.red}-${bout.blue}-${bout.division}-${bout.status}`).sort()
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      roster: wikimediaRoster.map((entry) => `${entry.org}:${entry.slug}`).sort()
    }))
    .digest("hex");
  const priorContentHash = sameDaySnapshot.contentHash ?? previousSnapshot.contentHash ?? null;
  await atomicWriteJson(input.root, artifactPath, {
    schemaVersion: "fightaiq-source-snapshot/1",
    date: input.date,
    retrievedAt: input.now.toISOString(),
    contentHash,
    evidenceRefs,
    sources: results
  });
  const rosterPolicy = await loadRosterPolicy(configRoot);
  const normalizedPaths = await materializeFightAiQSources({
    scheduledCards,
    root: input.root,
    retrievedAt: input.now,
    citoFighters,
    citoEvents,
    odds: oddsEvents,
    allowedIds: rosterPolicyIds(rosterPolicy)
  });
  const wikimediaPaths = await materializeWikimediaRoster({ root: input.root, entries: wikimediaRoster, retrievedAt: input.now, allowedIds: rosterPolicyIds(rosterPolicy) });

  // What happened on the cards that have already been fought.
  //
  // Without this a bout goes in announced and stays announced: the rating engine only counts
  // completed bouts, so every derived record froze at whatever the last historical import left.
  // Ten days back is two or three articles, read off the same pages the announced card came from.
  const resultPaths: string[] = [];
  const resultsRunPath = "mma/results/last-run.json";
  try {
    const resultCards = await fetchRecentResults({ context, now: input.now, sinceDays: RESULT_WINDOW_DAYS });
    const applied = await applyEventResults({
      root: input.root,
      bouts: await loadBoutRecords(path.join(input.root, "mma", "bouts")),
      cards: resultCards,
      retrievedAt: input.now
    });
    resultPaths.push(...applied.paths);
    await atomicWriteJson(input.root, resultsRunPath, {
      schemaVersion: "mma-results-run/1",
      status: "success",
      windowDays: RESULT_WINDOW_DAYS,
      cards: resultCards.map((card) => ({ name: card.name, startsAtUtc: card.startsAtUtc, results: card.results.length })),
      applied: applied.applied,
      // A year page carries the whole season, so most of its results are for events we never
      // tracked a bout for. The count says so without listing a hundred of them.
      untracked: applied.unmatched.length,
      generatedAt: input.now.toISOString()
    });
  } catch (error) {
    // A card we cannot read leaves its bouts announced, which is the honest state.
    await atomicWriteJson(input.root, resultsRunPath, {
      schemaVersion: "mma-results-run/1",
      status: "failed",
      windowDays: RESULT_WINDOW_DAYS,
      cards: [],
      applied: [],
      untracked: 0,
      reason: cleanFailure(error),
      generatedAt: input.now.toISOString()
    });
  }

  // Active or former, from the page that lists who is currently on the roster.
  //
  // This used to wait for a completed pass of Cito's all-time UFC list, which took two months of
  // daily paging and now never runs at all — so `former` has been zero against sixty-five
  // `unknown` since founding. A null answer means the page could not be read or its shape
  // changed, and nothing is reconciled: marking every tracked fighter former on a parser
  // regression is a far worse outcome than leaving the status as it was.
  const rosterStatusPaths: string[] = [];
  const currentRoster = await fetchCurrentRosterNames({ org: "ufc", context });
  if (currentRoster) {
    const currentFighters = await loadFighterRecords(path.join(input.root, "mma", "fighters"));
    const seen = new Set(
      wikimediaRoster
        .filter((entry) => entry.org === "ufc" && currentRoster.has(entry.wikipediaTitle))
        .map((entry) => `ufc:${entry.slug}`)
    );
    rosterStatusPaths.push(...await reconcileRosterStatuses({
      root: input.root,
      org: "ufc",
      fighters: currentFighters,
      seenFighterRefs: seen,
      sourceRef: `source:wikipedia:${input.date}:List of current UFC fighters`,
      reviewedAt: input.now,
      externalIdKey: "wikipediaPageId"
    }));
  }
  const backfillPaths: string[] = [];
  const backfillRunPath = "mma/backfill/last-run.json";
  try {
    const [preliminaryFighters, preliminaryBouts] = await Promise.all([
      loadFighterRecords(path.join(input.root, "mma", "fighters")),
      loadBoutRecords(path.join(input.root, "mma", "bouts"))
    ]);
    const queue = buildBackfillQueue({ fighters: preliminaryFighters, bouts: preliminaryBouts, now: input.now });
    const backfill = await enrichWikimediaBackfill({ root: input.root, fighters: preliminaryFighters, bouts: preliminaryBouts, queue, context, retrievedAt: input.now, allowedIds: rosterPolicyIds(await loadRosterPolicy(configRoot)) });
    backfillPaths.push(...backfill.paths);
    await atomicWriteJson(input.root, backfillRunPath, {
      schemaVersion: "wikimedia-backfill-run/1",
      status: "success",
      processed: backfill.processed,
      artifacts: backfill.paths,
      generatedAt: input.now.toISOString()
    });
  } catch (error) {
    await atomicWriteJson(input.root, backfillRunPath, {
      schemaVersion: "wikimedia-backfill-run/1",
      status: "failed",
      processed: 0,
      artifacts: [],
      reason: cleanFailure(error),
      generatedAt: input.now.toISOString()
    });
  }

  // Wikidata after Wikipedia, so a value the two agree about is already there to agree with.
  //
  // It holds a date of birth, a height and an English label, and no weight class or fight record.
  // So it cannot corroborate two of the three critical fields — but it took date of birth from 37
  // cards to 92 and height from 2 to 79, which is what the analysis layer needs to work out an age
  // at all. One batched request per fifty fighters, on a host already in the allowlist.
  const wikidataPaths: string[] = [];
  try {
    const wikidata = await enrichWikidataProfiles({
      root: input.root,
      fighters: await loadFighterRecords(path.join(input.root, "mma", "fighters")),
      context,
      retrievedAt: input.now
    });
    wikidataPaths.push(...wikidata.paths);
  } catch {
    // A card keeps whatever it already had; nothing downstream depends on this having run.
  }

  const [fighters, bouts] = await Promise.all([
    loadFighterRecords(path.join(input.root, "mma", "fighters")),
    loadBoutRecords(path.join(input.root, "mma", "bouts"))
  ]);
  const rebuilt = rebuildDerivedFighterData({ fighters, bouts, now: input.now });
  const derivedPaths: string[] = [];
  for (const fighter of rebuilt) {
    const relative = `mma/fighters/${fighter.id}.json`;
    await atomicWriteJson(input.root, relative, fighter);
    derivedPaths.push(relative);
  }
  const evaluationPaths = await reconcilePredictionResults({ root: input.root, bouts, now: input.now });
  const queuePath = await writeBackfillQueue({ root: input.root, fighters: rebuilt, bouts, now: input.now });
  const queue = buildBackfillQueue({ fighters: rebuilt, bouts, now: input.now });
  const rosterStatusPath = await writeRosterStatus({ root: input.root, fighters: rebuilt, bouts, queue, now: input.now });
  return {
    artifactPaths: [artifactPath, ...(results.some((result) => result.quota) ? [quotaPath] : []), ...(citoQuotaRecorded ? [citoQuotaPath] : []), ...normalizedPaths, ...wikimediaPaths, ...rosterStatusPaths, ...resultPaths, resultsRunPath, ...backfillPaths, backfillRunPath, ...wikidataPaths, ...derivedPaths, ...evaluationPaths, queuePath, rosterStatusPath],
    evidenceRefs,
    contentHash,
    materialChange: priorContentHash !== contentHash
  };
}

export async function refreshFightAiQAnalysis(input: { root: string; now: Date }): Promise<string[]> {
  const [fighters, bouts] = await Promise.all([
    loadFighterRecords(path.join(input.root, "mma", "fighters")),
    loadBoutRecords(path.join(input.root, "mma", "bouts"))
  ]);
  return runConfirmedBoutAnalysis({ root: input.root, fighters, bouts, now: input.now });
}
