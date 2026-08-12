import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  TehdejsiFactsFileSchema,
  type TehdejsiFact,
  type TehdejsiFactsFile
} from "../../contracts/tehdejsi-facts.js";
import { canonicalJson, sha256 } from "../../hashing.js";
import { repoRoot } from "../../paths.js";

export const TEHDEJSI_FACTS_PATH = "state/ventures/tehdejsi-svet/facts.json";

export function factsContentHash(facts: readonly TehdejsiFact[]): string {
  return sha256(canonicalJson(facts));
}

let cached: { key: string; file: TehdejsiFactsFile } | null = null;

/**
 * Read the committed facts file and prove its facts are the ones its envelope claims.
 *
 * The hash is not decoration. This file is edited by hand — that is the whole design — and a
 * hand edit that changes a claim without rehashing would leave the room generating from text
 * nobody signed off, under an envelope that still says somebody did. A mismatch is an abort,
 * never a warning, because the alternative is publishing a sentence whose provenance moved.
 *
 * The cache is keyed on the verified hash, so a file that changes on disk between reads is a
 * fresh parse rather than a stale hit, and the same file never re-parses within a run.
 */
export async function loadTehdejsiFacts(
  factsPath: string = TEHDEJSI_FACTS_PATH,
  root = repoRoot
): Promise<TehdejsiFactsFile> {
  const absolute = path.isAbsolute(factsPath) ? factsPath : path.join(root, factsPath);
  const raw = await readFile(absolute, "utf8");
  const key = sha256(raw);
  if (cached?.key === key) return cached.file;

  const file = TehdejsiFactsFileSchema.parse(JSON.parse(raw));
  const actual = factsContentHash(file.facts);
  if (actual !== file.contentHash) {
    throw new Error(
      `Tehdejsi svet facts file has been edited without rehashing: envelope claims ${file.contentHash}, `
      + `facts hash to ${actual}. Recompute the hash rather than loosening this check.`
    );
  }
  cached = { key, file };
  return file;
}

/** Test seam. The cache is process-wide, so a test that writes a fixture has to clear it. */
export function resetTehdejsiFactsCache(): void {
  cached = null;
}
