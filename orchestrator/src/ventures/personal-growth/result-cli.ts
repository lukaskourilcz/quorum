import { readFile } from "node:fs/promises";
import path from "node:path";
import { PersonalGrowthResultSchema } from "../../contracts/personal-growth-results.js";
import { stateRoot as defaultStateRoot } from "../../paths.js";
import { writeNewPersonalGrowthResult } from "./results.js";

function option(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const file = option("--file");
if (!file) throw new Error("Usage: personal-growth:result -- --file <result.json> [--state-root <path>]");
const root = path.resolve(option("--state-root") ?? defaultStateRoot);
const result = PersonalGrowthResultSchema.parse(JSON.parse(await readFile(path.resolve(file), "utf8")) as unknown);
const written = await writeNewPersonalGrowthResult(root, result);
process.stdout.write(`${JSON.stringify({ resultId: written.result.resultId, created: written.created })}\n`);
