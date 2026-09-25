/**
 * Import devShark's coding challenges into the committed snapshot the Wednesday teaser reads
 * (quorum#576).
 *
 * Run at implementation time from a local clone, after devShark ships its difficulty labels (D5):
 *
 *   pnpm marketingshark:import-challenges -- --brand devshark --source ../react-express-app
 *
 * `--source` is read from the directory the command is typed in (pnpm's `INIT_CWD`), so run it from
 * the quorum clone with devShark cloned beside it.
 *
 * The room never runs this and never fetches anything. Until the snapshot exists, a Wednesday
 * drafts the quiz carousel instead and says why. `--check` compares a fresh import with the
 * committed snapshot and fails when it is stale.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadMarketingSharkConfig } from "../orchestrator/src/ventures/marketingshark/config.js";
import { resolveSourcePath } from "../orchestrator/src/ventures/marketingshark/source-path.js";
import {
  CHALLENGE_LABEL_SOURCE,
  ChallengeBankSnapshotSchema,
  challengesContentHash
} from "../orchestrator/src/ventures/marketingshark/challenges.js";
import { loadDevSharkChallenges } from "../orchestrator/src/ventures/marketingshark/react-express-app-adapter.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const brandId = valueAfter(args, "--brand");
  const source = valueAfter(args, "--source");
  if (!brandId || !source) {
    throw new Error("Usage: pnpm marketingshark:import-challenges -- --brand <id> --source <path-to-clone> [--check]");
  }
  const config = await loadMarketingSharkConfig();
  const brand = config.brands.find((candidate) => candidate.id === brandId);
  const teaser = brand?.postKinds["challenge-teaser"];
  if (!brand || !teaser) throw new Error(`${brandId} has no challenge-teaser kind in config/marketingshark.json`);

  const localPath = resolveSourcePath(source);
  if (execFileSync("git", ["-C", localPath, "status", "--porcelain", "--", "lib", "shared"], { encoding: "utf8" }).trim()) {
    throw new Error("Commit the source changes before importing: the recorded commit must reproduce the challenges.");
  }
  const commit = execFileSync("git", ["-C", localPath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const { challenges, dropped } = await loadDevSharkChallenges(localPath);
  const snapshot = ChallengeBankSnapshotSchema.parse({
    schemaVersion: "marketingshark-challenges/1",
    brandId: brand.id,
    sourceRepo: teaser.challengeBank.sourceRepo,
    sourceCommit: commit,
    importedAt: new Date().toISOString(),
    labelSource: CHALLENGE_LABEL_SOURCE,
    contentHash: challengesContentHash(challenges),
    challenges
  });

  const target = path.join(repoRoot, teaser.challengeBank.snapshotPath);
  if (args.includes("--check")) {
    const existing = ChallengeBankSnapshotSchema.parse(JSON.parse(await readFile(target, "utf8")));
    if (existing.contentHash !== snapshot.contentHash) throw new Error(`Stale ${brand.id} challenge snapshot: re-import the committed source.`);
    console.log(JSON.stringify({ brand: brand.id, status: "current", sourceCommit: commit, challenges: challenges.length }));
    return;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    brand: brand.id,
    sourceCommit: commit,
    challenges: challenges.length,
    easy: challenges.filter((challenge) => challenge.difficulty === "easy").length,
    dropped,
    contentHash: snapshot.contentHash,
    written: teaser.challengeBank.snapshotPath
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
