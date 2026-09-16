import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stateRoot } from "../paths.js";
import { resolveStatePath } from "../state.js";
import { loadEditionQualityConfig } from "./config.js";
import {
  buildEditionRubricReceipt,
  EDITION_RUBRIC_DIRECTORY,
  readEditionRunReportsByDate,
  storeEditionRubricReceipt
} from "./rubric.js";

/**
 * Regrade every committed edition run against the rubric, and write one receipt per date.
 *
 * `--check` is what CI runs, and it answers three questions in one exit code: does every date
 * with a run report have a receipt, does each committed receipt match a fresh build, and does any
 * run's recorded grade disagree with the regrade. Missing and stale are the drift signal — the
 * rubric, the thresholds or the evaluator moved and the committed record no longer follows from
 * them — and a divergence is the finding itself.
 *
 * Regenerating cannot silence a divergence: it is written into the receipt, so `--check` reports
 * it whether or not the bytes match. The only way to clear it is to make the recorded grade and
 * the rubric agree again, which is a code or threshold change somebody has to explain.
 *
 * It costs nothing to run. Two reads and a pure function; no model, no provider, no network.
 */
async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const config = await loadEditionQualityConfig();
  const byDate = await readEditionRunReportsByDate(stateRoot);

  const stale: string[] = [];
  const diverged: string[] = [];
  let written = 0;
  let runs = 0;

  for (const [date, reports] of [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const receipt = buildEditionRubricReceipt({ date, config, reports });
    runs += receipt.runs.length;
    for (const run of receipt.runs) {
      if (run.grade && run.grade.divergence.length > 0) {
        diverged.push(`${run.reportRef}: ${run.grade.divergence.join(", ")}`);
      }
    }
    const next = `${JSON.stringify(receipt, null, 2)}\n`;
    const target = resolveStatePath(stateRoot, `${EDITION_RUBRIC_DIRECTORY}/${date}.json`);
    const current = await readFile(target, "utf8").catch(() => "");
    if (check) {
      if (current !== next) stale.push(`${EDITION_RUBRIC_DIRECTORY}/${date}.json`);
      continue;
    }
    if (current !== next) {
      await storeEditionRubricReceipt(stateRoot, receipt);
      written += 1;
    }
  }

  const summary = {
    mode: check ? "check" : "write",
    dates: byDate.size,
    runs,
    ...(check ? { stale: stale.length } : { written }),
    diverged: diverged.length
  };
  console.log(JSON.stringify(summary));

  for (const entry of stale) {
    console.error(`stale or missing receipt: ${entry}`);
  }
  for (const entry of diverged) {
    console.error(`recorded grade and regrade disagree: ${entry}`);
  }
  if (stale.length > 0) {
    console.error("Regenerate with `pnpm edition:rubric` and review the diff: it names every day whose verdict changed.");
  }
  if (stale.length > 0 || diverged.length > 0) process.exitCode = 1;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  await main();
}
