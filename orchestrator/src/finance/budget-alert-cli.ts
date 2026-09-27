import { readFile } from "node:fs/promises";
import path from "node:path";
import { budgetLedgerCostCategory, BudgetLedgerEntrySchema } from "../budget.js";
import { configRoot, stateRoot } from "../paths.js";
import { signedOwnerDecision } from "../portfolio/schedule.js";
import { readJson, readText } from "../state.js";
import { dailyDigestSinkFromEnvironment } from "../notify/digest.js";
import { allInBudgetStatus, sendBudgetAlert, sendBudgetPaceWarning, type AllInCostEntry } from "./budget-alert.js";

const now = new Date();
const month = now.toISOString().slice(0, 7);
const [budgetDecision, ledgerRaw, nonModelRaw, exhaustionDates, allowlist] = await Promise.all([
  readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8"),
  readJson<{ entries?: unknown[] }>(stateRoot, "budget/ledger.json", {}),
  readText(stateRoot, "budget/all-in.jsonl"),
  readJson<{ dates?: string[] }>(stateRoot, "budget/exhaustions.json", {}),
  readFile(path.join(configRoot, "network-allowlist.json"), "utf8").then((raw) => JSON.parse(raw) as { runtimeHosts: string[] })
]);
const modelCosts: AllInCostEntry[] = (ledgerRaw.entries ?? []).map((value) => {
  const entry = BudgetLedgerEntrySchema.parse(value);
  return { at: entry.ts, ventureId: entry.ventureId ?? "global", category: budgetLedgerCostCategory(entry.kind), usd: entry.usd, ref: entry.requestHash };
});
const nonModelCosts = nonModelRaw.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as AllInCostEntry);
const status = allInBudgetStatus([...modelCosts, ...nonModelCosts], month, signedOwnerDecision(budgetDecision) === "countersigned" ? 50 : 20);
const result = await sendBudgetAlert({
  root: stateRoot,
  status,
  dailyExhaustionDates: exhaustionDates.dates ?? [],
  sink: dailyDigestSinkFromEnvironment({ allowHosts: allowlist.runtimeHosts }),
  now
});
// After the alert, so a month that is already over gets one item rather than two: the pace
// notice stands down at 100% and the alert is the voice the owner hears.
const pace = await sendBudgetPaceWarning({ root: stateRoot, status, now });
console.log(JSON.stringify({ result, pace, month, spentUsd: status.spentUsd, capUsd: status.capUsd }));
