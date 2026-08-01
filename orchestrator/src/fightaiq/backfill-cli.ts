import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BoutRecordSchema, MmaOrgSchema } from "../contracts/mma.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { rebuildDerivedFighterData } from "./derived.js";
import { sha256 } from "./engine.js";
import { loadBoutRecords, loadFighterRecords, saveBoutRecord } from "./store.js";

const HistoricalBoutSchema = z.object({
  org: MmaOrgSchema,
  red: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  blue: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  outcome: z.enum(["red", "blue", "draw", "no-contest"]),
  happenedAt: z.iso.datetime({ offset: true }),
  eventName: z.string().trim().min(1).max(160).optional(),
  method: z.string().trim().min(1).max(80).nullable().default(null),
  round: z.number().int().min(1).max(5).nullable().default(null),
  elapsedSeconds: z.number().int().nonnegative().max(1_500).nullable().default(null),
  sourceRefs: z.array(z.string().trim().min(1).max(240)).min(1)
}).refine((bout) => bout.red !== bout.blue, "Historical bout needs two fighters");

const args = process.argv.slice(2);
const index = args.indexOf("--input");
const inputPath = index >= 0 ? args[index + 1] : undefined;
if (!inputPath) throw new Error("Usage: pnpm fightaiq:backfill -- --input <owner-reviewed-history.json>");
const rows = z.array(HistoricalBoutSchema).min(1).parse(JSON.parse(await readFile(path.resolve(inputPath), "utf8")));
const ordered = [...rows].sort((left, right) => left.happenedAt.localeCompare(right.happenedAt) || left.org.localeCompare(right.org) || left.red.localeCompare(right.red));
const inputHash = sha256(ordered);
const paths: string[] = [];
for (const row of ordered) {
  const identity = sha256(row).slice(0, 18);
  const date = row.happenedAt.slice(0, 10);
  const sourceRefs = [...new Set(row.sourceRefs)].sort();
  const bout = BoutRecordSchema.parse({
    schemaVersion: "bout/1",
    id: `${row.org}:bout:history-${identity}`,
    org: row.org,
    event: {
      ref: `${row.org}:event:history-${date}-${identity.slice(0, 8)}`,
      name: row.eventName ?? `Historical card ${date}`,
      startsAtUtc: new Date(row.happenedAt).toISOString(),
      venue: null
    },
    fighters: { red: `${row.org}:${row.red}`, blue: `${row.org}:${row.blue}` },
    division: null,
    scheduledRounds: null,
    status: "completed",
    statusHistory: [{ status: "completed", at: new Date(row.happenedAt).toISOString(), sourceRefs, note: "Owner-reviewed historical result import." }],
    discovery: { firstSeenAt: new Date(row.happenedAt).toISOString(), lastSeenAt: new Date(row.happenedAt).toISOString(), sourceRefs },
    sourceRefs,
    result: { winner: row.outcome, method: row.method, round: row.round, elapsedSeconds: row.elapsedSeconds, sourceRefs },
    predictionRefs: [],
    changeLog: [{ at: new Date(row.happenedAt).toISOString(), kind: "created", fields: ["fighters", "event", "result"], sourceRefs, note: "Created from an owner-reviewed historical import." }],
    updatedAt: new Date(row.happenedAt).toISOString()
  });
  paths.push((await saveBoutRecord(bout)).path);
}

const [fighters, bouts] = await Promise.all([loadFighterRecords(), loadBoutRecords()]);
const rebuildAt = new Date(Math.max(...ordered.map((row) => Date.parse(row.happenedAt))) + 1);
for (const fighter of rebuildDerivedFighterData({ fighters, bouts, now: rebuildAt })) {
  const relative = `mma/fighters/${fighter.id}.json`;
  await atomicWriteJson(stateRoot, relative, fighter);
  paths.push(relative);
}
const relative = `mma/backfill/imports/reviewed-${inputHash.slice(0, 12)}.json`;
await atomicWriteJson(stateRoot, relative, {
  schemaVersion: "fightaiq-backfill/2",
  fixture: false,
  inputHash,
  sourceCount: new Set(ordered.flatMap((bout) => bout.sourceRefs)).size,
  boutCount: ordered.length,
  organizations: [...new Set(ordered.map((bout) => bout.org))].sort(),
  artifacts: [...new Set(paths)].sort(),
  generatedAt: rebuildAt.toISOString()
});
console.log(JSON.stringify({ relative, boutCount: ordered.length, inputHash }));
