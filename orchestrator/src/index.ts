import "./env.js";
import { runCycle } from "./cycle.js";
import { RunnablePhaseSchema, type RunnablePhase } from "./types.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: pnpm cycle -- --phase founding|cu-edition|morning|afternoon|cu-product|night [--dry] [--explain-budget] [--explain-routing]"
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

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ status: "failed", error: message }, null, 2));
  process.exitCode = 1;
});
