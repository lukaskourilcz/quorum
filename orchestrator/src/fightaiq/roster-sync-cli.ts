import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot, stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { reconcilePredictionResults } from "./analysis.js";
import { rebuildDerivedFighterData } from "./derived.js";
import { buildBackfillQueue, fetchWikimediaRoster, materializeWikimediaRoster, writeBackfillQueue, writeRosterStatus } from "./roster.js";
import { loadRosterPolicy, rosterPolicyIds } from "./roster-policy.js";
import { loadBoutRecords, loadFighterRecords } from "./store.js";
import { enrichWikimediaBackfill } from "./wikimedia-backfill.js";
import { enrichWikidataProfiles } from "./wikidata.js";

const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts: string[] };
const now = new Date();
const context = { allowHosts: allowlist.runtimeHosts, now };
const [ufc, oktagon] = await Promise.all([
  fetchWikimediaRoster({ org: "ufc", context }),
  fetchWikimediaRoster({ org: "oktagon", context })
]);
const rosterPolicy = await loadRosterPolicy(configRoot);
const paths = await materializeWikimediaRoster({ root: stateRoot, entries: [...ufc, ...oktagon], retrievedAt: now, allowedIds: rosterPolicyIds(rosterPolicy) });
const [beforeFighters, beforeBouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
// The same policy gate the intake applies. Without it this documented command re-mints a
// card for every opponent in every record table, which is how 761 of the 800 ids in the
// bout store came to be outside config/mma-roster.json.
// Twelve a run is the steady-state pace. After a parser fix the whole roster needs re-reading,
// and at twelve a run the tail waits days; FIGHTAIQ_BACKFILL_LIMIT is how that catch-up is run.
// Forty is the ceiling because the API takes fifty titles in one query and this sends one query.
const limit = Math.min(40, Math.max(1, Number(process.env.FIGHTAIQ_BACKFILL_LIMIT ?? 12) || 12));
const backfill = await enrichWikimediaBackfill({ root: stateRoot, fighters: beforeFighters, bouts: beforeBouts, queue: buildBackfillQueue({ fighters: beforeFighters, bouts: beforeBouts, now }), context, retrievedAt: now, limit, allowedIds: rosterPolicyIds(rosterPolicy) });
// Wikidata after Wikipedia, so a value the two agree about is already on the card to agree with.
const wikidata = await enrichWikidataProfiles({ root: stateRoot, fighters: await loadFighterRecords(), context, retrievedAt: now });
const [enrichedFighters, enrichedBouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
for (const fighter of rebuildDerivedFighterData({ fighters: enrichedFighters, bouts: enrichedBouts, now })) {
  await atomicWriteJson(stateRoot, `mma/fighters/${fighter.id}.json`, fighter);
}
await reconcilePredictionResults({ root: stateRoot, bouts: enrichedBouts, now });
const [fighters, bouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
const queueItems = buildBackfillQueue({ fighters, bouts, now });
const queue = await writeBackfillQueue({ root: stateRoot, fighters, bouts, now });
const rosterStatus = await writeRosterStatus({ root: stateRoot, fighters, bouts, queue: queueItems, now });
console.log(JSON.stringify({ ufc: ufc.length, oktagon: oktagon.length, cards: paths.length, backfilled: backfill.processed, wikidata: { matched: wikidata.matched, written: wikidata.paths.length }, queue, rosterStatus }));
