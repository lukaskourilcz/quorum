import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { MmaOrgSchema } from "../contracts/mma.js";
import { stateRoot } from "../paths.js";
import { atomicWriteJson } from "../state.js";
import { seedRatings, sha256 } from "./engine.js";

const HistoricalBoutSchema = z.object({
  org: MmaOrgSchema,
  red: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  blue: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  outcome: z.enum(["red", "blue"]),
  happenedAt: z.iso.datetime({ offset: true }),
  sourceRefs: z.array(z.string().trim().min(1).max(240)).min(2)
});

const args = process.argv.slice(2);
const index = args.indexOf("--input");
const inputPath = index >= 0 ? args[index + 1] : undefined;
if (!inputPath) throw new Error("Usage: pnpm fightaiq:backfill -- --input <reviewed-history.json>");
const bouts = z.array(HistoricalBoutSchema).min(1).parse(JSON.parse(await readFile(path.resolve(inputPath), "utf8")));
const ordered = [...bouts].sort((left, right) => left.happenedAt.localeCompare(right.happenedAt) || left.org.localeCompare(right.org));
const hash = sha256(ordered);
const relative = `ventures/fightaiq/backfills/reviewed-${hash.slice(0, 12)}.json`;
await atomicWriteJson(stateRoot, relative, {
  schemaVersion: "fightaiq-backfill/1",
  fixture: false,
  inputHash: hash,
  sourceCount: new Set(ordered.flatMap((bout) => bout.sourceRefs)).size,
  boutCount: ordered.length,
  organizations: [...new Set(ordered.map((bout) => bout.org))].sort(),
  ratings: seedRatings(ordered),
  generatedAt: new Date().toISOString()
});
console.log(JSON.stringify({ relative, boutCount: ordered.length, inputHash: hash }));
