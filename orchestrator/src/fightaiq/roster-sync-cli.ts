import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot, stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { reconcilePredictionResults } from "./analysis.js";
import { rebuildDerivedFighterData } from "./derived.js";
import { buildBackfillQueue, fetchWikimediaRoster, materializeWikimediaRoster, writeBackfillQueue, writeRosterStatus } from "./roster.js";
import { loadBoutRecords, loadFighterRecords } from "./store.js";
import { enrichWikimediaBackfill } from "./wikimedia-backfill.js";

const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts: string[] };
const now = new Date();
const context = { allowHosts: allowlist.runtimeHosts, now };
const [ufc, oktagon] = await Promise.all([
  fetchWikimediaRoster({ org: "ufc", context }),
  fetchWikimediaRoster({ org: "oktagon", context })
]);
const paths = await materializeWikimediaRoster({ root: stateRoot, entries: [...ufc, ...oktagon], retrievedAt: now });
const [beforeFighters, beforeBouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
const backfill = await enrichWikimediaBackfill({ root: stateRoot, fighters: beforeFighters, bouts: beforeBouts, queue: buildBackfillQueue({ fighters: beforeFighters, bouts: beforeBouts, now }), context, retrievedAt: now });
const [enrichedFighters, enrichedBouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
for (const fighter of rebuildDerivedFighterData({ fighters: enrichedFighters, bouts: enrichedBouts, now })) {
  await atomicWriteJson(stateRoot, `mma/fighters/${fighter.id}.json`, fighter);
}
await reconcilePredictionResults({ root: stateRoot, bouts: enrichedBouts, now });
const [fighters, bouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
const queueItems = buildBackfillQueue({ fighters, bouts, now });
const queue = await writeBackfillQueue({ root: stateRoot, fighters, bouts, now });
const rosterStatus = await writeRosterStatus({ root: stateRoot, fighters, bouts, queue: queueItems, now });
console.log(JSON.stringify({ ufc: ufc.length, oktagon: oktagon.length, cards: paths.length, backfilled: backfill.processed, queue, rosterStatus }));
