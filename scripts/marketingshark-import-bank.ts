/**
 * Import one product's question bank into a committed snapshot.
 *
 * Run at implementation time from a local clone, and re-runnable whenever the source bank grows:
 *
 *   pnpm marketingshark:import-bank -- --brand devshark --source ../react-express-app
 *
 * The daily room never runs this and never fetches anything. It reads the committed snapshot and
 * checks its hash, which is what makes the whole selection path deterministic and $0.
 */
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadMarketingSharkConfig } from "../orchestrator/src/ventures/marketingshark/config.js";
import { contentHashOf, QuestionBankSnapshotSchema } from "../orchestrator/src/ventures/marketingshark/bank.js";
import { reactExpressAppAdapter } from "../orchestrator/src/ventures/marketingshark/react-express-app-adapter.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function sourceCommit(localPath: string): string {
  try {
    return execFileSync("git", ["-C", localPath, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(`${localPath} is not a git checkout, so no source commit can be recorded`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const brandId = valueAfter(args, "--brand");
  const source = valueAfter(args, "--source");
  if (!brandId || !source) {
    throw new Error("Usage: pnpm marketingshark:import-bank -- --brand <id> --source <path-to-clone>");
  }

  const config = await loadMarketingSharkConfig();
  const brand = config.brands.find((candidate) => candidate.id === brandId);
  if (!brand) throw new Error(`${brandId} is not a brand in config/marketingshark.json`);

  const localPath = path.resolve(source);
  const commit = sourceCommit(localPath);
  const questions = await reactExpressAppAdapter.load({
    repo: brand.questionBank.sourceRepo,
    commit,
    subject: brand.questionBank.sourceSubject,
    localPath
  });

  const snapshot = QuestionBankSnapshotSchema.parse({
    schemaVersion: "marketingshark-bank/1",
    brandId: brand.id,
    sourceRepo: brand.questionBank.sourceRepo,
    sourceCommit: commit,
    sourceSubject: brand.questionBank.sourceSubject,
    // Recorded, not derived at read time: it is the moment this snapshot was taken, and a
    // re-import that changes nothing else still honestly moves it.
    importedAt: new Date().toISOString(),
    contentHash: contentHashOf(questions),
    questions
  });

  const target = path.join(repoRoot, brand.questionBank.snapshotPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    brand: brand.id,
    subject: brand.questionBank.sourceSubject,
    sourceCommit: commit,
    questions: questions.length,
    withCzech: questions.filter((question) => question.cs !== undefined).length,
    withCode: questions.filter((question) => question.hasCode).length,
    contentHash: snapshot.contentHash,
    written: brand.questionBank.snapshotPath
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
