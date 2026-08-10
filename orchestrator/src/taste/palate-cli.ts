import path from "node:path";
import { pathToFileURL } from "node:url";
import { BudgetLedgerEntrySchema, type BudgetLedgerEntry } from "../budget.js";
import { loadFixedMonthlyUsd } from "../money/fixed-costs.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { loadRuntimeBudgetLimits } from "../portfolio/limits.js";
import { readJson } from "../state.js";
import type { Stage } from "../types.js";
import { GuardedPalateDistiller, runPalatePass } from "./pipeline.js";

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function cycleId(now: Date): string {
  return `palate-${now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

export async function runStandalonePalate(input: {
  ventureId: string;
  now?: Date;
}): Promise<Awaited<ReturnType<typeof runPalatePass>>> {
  const now = input.now ?? new Date();
  const [budget, stageState, fixedMonthlyUsd, limits] = await Promise.all([
    readJson<{ entries: BudgetLedgerEntry[] }>(stateRoot, "budget/ledger.json", { entries: [] }),
    readJson<{ current: Stage }>(configRoot, "stages.json", { current: "VALIDATION" as Stage }),
    loadFixedMonthlyUsd(configRoot, now),
    loadRuntimeBudgetLimits()
  ]);
  const ledger = budget.entries.map((entry) => BudgetLedgerEntrySchema.parse(entry));
  const id = cycleId(now);
  return runPalatePass({
    repoRoot,
    ventureId: input.ventureId,
    now,
    // This is deliberately the same guarded call path and complete reservation context used by
    // the room pre-step. A manual distillation may wait for a scheduled meeting; it may not
    // become an unmetered shortcut around one.
    distiller: new GuardedPalateDistiller({
      stateRoot,
      cycleId: id,
      ventureId: input.ventureId,
      budgetContext: {
        now,
        cycleId: id,
        stage: stageState.current,
        ledger,
        allInNonApiSpentUsd: fixedMonthlyUsd,
        allInCommittedUsd: 0,
        knownMonthlyForecastUsd: 0,
        remainingScheduledCycles: 60,
        limits
      }
    })
  });
}

async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = argv.filter((arg) => arg !== "--");
  if (args.includes("--help")) {
    console.log("Usage: pnpm palate -- --venture <venture-id>");
    return;
  }
  const ventureId = valueAfter(args, "--venture")?.trim();
  if (!ventureId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ventureId)) {
    throw new Error("--venture <venture-id> is required");
  }
  const result = await runStandalonePalate({ ventureId });
  console.log(JSON.stringify({
    status: result.status,
    processedRatings: result.processedRatings,
    watermark: result.taste.watermark,
    pursue: result.taste.pursue.length,
    avoid: result.taste.avoid.length,
    open: result.taste.open.length,
    writes: result.writes
  }, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
