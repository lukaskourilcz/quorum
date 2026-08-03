import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot, stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { rebuildDerivedFighterData } from "./derived.js";
import { materializeFightAiQSources, scheduledEventCard } from "./intake.js";
import { applyEventResults } from "./results.js";
import { loadBoutRecords, loadFighterRecords } from "./store.js";
import { fetchRecentResults, fetchScheduledCards } from "./wikipedia-events.js";

/** How far back to look for a card whose result has not been written yet. */
const RESULTS_WINDOW_DAYS = 10;

/**
 * Write the announced cards, on their own, with no model call.
 *
 * The scheduled-card reader lives inside the daily evidence sweep, so the only way to get an
 * event onto disk was to run a whole cycle — which costs tokens against a one-dollar daily pace
 * and does a great deal besides. `state/mma/events` was empty and every one of the 1,039 bouts on
 * file was a completed historical row with no division, because a division is stated on the event
 * page's `{{MMAevent bout}}` template and nowhere else. A fighter's own infobox lists the weight
 * classes of a career, not the one a particular bout is contracted at; taking it from there would
 * be inventing a fact.
 *
 * Reads two Wikipedia pages. Writes event cards and their announced bouts.
 */

const horizonArgument = process.argv.indexOf("--within-days");
const withinDays = horizonArgument >= 0 ? Number(process.argv[horizonArgument + 1]) : 14;
if (!Number.isFinite(withinDays) || withinDays < 1 || withinDays > 120) {
  throw new Error("--within-days takes a number of days between 1 and 120");
}

const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts: string[] };
const now = new Date();
const context = { allowHosts: allowlist.runtimeHosts, now };

const cards = await fetchScheduledCards({ context, now, withinDays });
const eventCards = cards.flatMap((card) => scheduledEventCard({
  org: card.org,
  name: card.name,
  startsAtUtc: card.startsAtUtc,
  venue: card.venue,
  bouts: card.bouts,
  sourceTitle: card.sourceTitle,
  retrievedAt: now.toISOString()
}) ?? []);

const paths = await materializeFightAiQSources({
  root: stateRoot,
  retrievedAt: now,
  citoFighters: [],
  citoEvents: [],
  odds: [],
  scheduledCards: eventCards
});

// Results after the card, because a bout has to exist before a result can land on it.
const resultCards = await fetchRecentResults({ context, now, sinceDays: RESULTS_WINDOW_DAYS });
const results = await applyEventResults({
  root: stateRoot,
  bouts: await loadBoutRecords(),
  cards: resultCards,
  retrievedAt: now
});
// The ratings and the derived records only move once the bouts are completed.
for (const fighter of rebuildDerivedFighterData({ fighters: await loadFighterRecords(), bouts: await loadBoutRecords(), now })) {
  await atomicWriteJson(stateRoot, `mma/fighters/${fighter.id}.json`, fighter);
}

console.log(JSON.stringify({
  withinDays,
  resultsWindowDays: RESULTS_WINDOW_DAYS,
  results: {
    cards: resultCards.map((card) => ({ name: card.name, startsAtUtc: card.startsAtUtc, results: card.results.length })),
    applied: results.applied.length,
    // A year page carries the whole season, so most of its results belong to events we never
    // tracked a bout for. The count is the useful number; the sample is there to check by eye.
    untracked: results.unmatched.length,
    untrackedSample: results.unmatched.slice(0, 5)
  },
  scheduled: cards.length,
  written: eventCards.length,
  // A card the reader found but could not build is worth seeing, not swallowing.
  dropped: cards.filter((card) => !eventCards.some((event) => event.name === card.name)).map((card) => card.name),
  events: eventCards.map((event) => ({
    id: event.id,
    startsAtUtc: event.startsAtUtc,
    bouts: event.bouts.length,
    divisions: [...new Set(event.bouts.map((bout) => bout.division))].sort()
  })),
  paths: paths.length
}, null, 2));
