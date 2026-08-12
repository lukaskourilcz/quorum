import "./env.js";
import { BudgetError } from "./budget.js";
import { runCycle } from "./cycle.js";
import { pragueClockParts } from "./meetings/clock.js";
import { stateRoot } from "./paths.js";
import { atomicWriteJson, readJson } from "./state.js";
import { RunnablePhaseSchema, type RunnablePhase } from "./types.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: pnpm cycle -- --phase founding|cu-edition|morning|mma-intake|mag-editorial|article-am|tt-marketing|studio|afternoon|cu-product|article-pm|mma-analysis|mag-desk|kv-desk|night [--dry] [--explain-budget] [--explain-routing]"
    );
    return;
  }
  const phase = RunnablePhaseSchema.parse(
    (valueAfter(args, "--phase") ?? "morning") as RunnablePhase
  );
  const result = await runCycle({
    phase,
    dry: args.includes("--dry"),
    explainBudget: args.includes("--explain-budget"),
    explainRouting: args.includes("--explain-routing")
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(async (error: unknown) => {
  if (error instanceof BudgetError && error.code === "DAILY_CAP" && !process.argv.includes("--dry")) {
    const existing = await readJson<{ dates?: string[] }>(stateRoot, "budget/exhaustions.json", {});
    await atomicWriteJson(stateRoot, "budget/exhaustions.json", {
      schemaVersion: 1,
      dates: [...new Set([...(existing.dates ?? []), pragueClockParts(new Date()).date])].sort()
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ status: "failed", error: message }, null, 2));
  process.exitCode = 1;
});
