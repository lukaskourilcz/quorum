import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  KvorumEntityLexiconSchema,
  type KvorumEntityLexicon
} from "../../contracts/kvorum-entities.js";
import { configRoot } from "../../paths.js";

export async function loadKvorumEntityLexicon(
  filePath = path.join(configRoot, "kvorum-entities.json")
): Promise<KvorumEntityLexicon> {
  return KvorumEntityLexiconSchema.parse(JSON.parse(await readFile(filePath, "utf8")) as unknown);
}
