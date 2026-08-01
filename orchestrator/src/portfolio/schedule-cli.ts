import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema } from "../budget.js";
import { stateRoot } from "../paths.js";
import { ScheduledPhaseSchema } from "../types.js";
import { loadVentureRegistry } from "../ventures/registry.js";
import {
  budgetDecisionStatus,
  phaseEnabled,
  resolveEffectivePortfolioSchedule,
  signedOwnerDecision
} from "./schedule.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const phase = ScheduledPhaseSchema.parse(valueAfter(args, "--phase"));
const now = new Date(valueAfter(args, "--at") ?? Date.now());
const [registry, decisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw, ledgerRaw] = await Promise.all([
  loadVentureRegistry(),
  readFile(path.join(stateRoot, "decisions", "2026-08-01-budget-raise.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-02-budget-mma.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-02-fightaiq-founding.md"), "utf8"),
  readFile(path.join(stateRoot, "budget", "ledger.json"), "utf8")
]);
const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit"
}).format(now);
const parsedLedger = JSON.parse(ledgerRaw) as { entries?: unknown[] };
const entries = (parsedLedger.entries ?? []).map((entry) => BudgetLedgerEntrySchema.parse(entry));
const spent = entries
  .filter((entry) => entry.ts.slice(0, 7) === month)
  .reduce((sum, entry) => sum + entry.usd, 0);
const provisionalCap = signedOwnerDecision(budgetFiftyRaw) === "countersigned" ? 42 : budgetDecisionStatus(decisionRaw) === "countersigned-shape-a" ? 18 : 15;
const schedule = resolveEffectivePortfolioSchedule({
  registry,
  budgetDecisionRaw: decisionRaw,
  budgetMmaRaw,
  budgetFiftyRaw,
  fightAiQFoundingRaw,
  monthlyApiHeadroomUsd: Math.max(0, provisionalCap - spent)
});
const output = {
  phase,
  enabled: phaseEnabled(schedule, phase),
  envelopeUsd: schedule.envelopeByPhase[phase] ?? 0,
  ...schedule
};

if (args.includes("--github-output")) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(target, [
    `enabled=${output.enabled}`,
    `shape=${output.shape}`,
    `envelope_usd=${output.envelopeUsd}`,
    `monthly_budget_usd=${output.monthlyBudgetUsd}`,
    `daily_budget_usd=${output.dailyBudgetUsd}`,
    `monthly_operating_usd=${output.monthlyOperatingUsd}`,
    `tt_transcript_mode=${output.ttTranscriptMode}`,
    ""
  ].join("\n"));
} else {
  console.log(JSON.stringify(output, null, 2));
}
