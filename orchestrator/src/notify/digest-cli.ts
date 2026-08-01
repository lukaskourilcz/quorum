import { readFile } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema } from "../budget.js";
import { loadMeetingRecords, mondayOfWeek } from "../meetings/calendar.js";
import { pragueClockParts } from "../meetings/clock.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import {
  budgetDecisionStatus,
  resolveEffectivePortfolioSchedule,
  signedOwnerDecision
} from "../portfolio/schedule.js";
import { loadVentureRegistry, resolveScheduledClock } from "../ventures/registry.js";
import { allInBudgetStatus, sendBudgetAlert, type AllInCostEntry } from "../finance/budget-alert.js";
import { readJson, readText } from "../state.js";
import {
  buildDailyDigest,
  dailyDigestSinkFromEnvironment,
  sendDailyDigest
} from "./digest.js";
import { collectDigestOperations } from "./operations.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const now = new Date(valueAfter(args, "--at") ?? Date.now());
const date = valueAfter(args, "--date") ?? pragueClockParts(now).date;
const dry = args.includes("--dry");
const digestRoot = dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
const [registry, decisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw, ledgerRaw, nonModelRaw, allowlist, records] = await Promise.all([
  loadVentureRegistry(),
  readFile(path.join(stateRoot, "decisions", "2026-08-01-budget-raise.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-02-budget-mma.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-02-fightaiq-founding.md"), "utf8"),
  readFile(path.join(stateRoot, "budget", "ledger.json"), "utf8"),
  readText(stateRoot, "budget/all-in.jsonl"),
  readFile(path.join(configRoot, "network-allowlist.json"), "utf8").then((raw) => JSON.parse(raw) as { runtimeHosts: string[] }),
  loadMeetingRecords(digestRoot)
]);
const entries = ((JSON.parse(ledgerRaw) as { entries?: unknown[] }).entries ?? [])
  .map((entry) => BudgetLedgerEntrySchema.parse(entry));
const month = date.slice(0, 7);
const spent = entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
const provisionalCap = signedOwnerDecision(budgetFiftyRaw) === "countersigned" ? 42 : budgetDecisionStatus(decisionRaw) === "countersigned-shape-a" ? 18 : 15;
const effective = resolveEffectivePortfolioSchedule({
  registry,
  budgetDecisionRaw: decisionRaw,
  budgetMmaRaw,
  budgetFiftyRaw,
  fightAiQFoundingRaw,
  monthlyApiHeadroomUsd: Math.max(0, provisionalCap - spent)
});
const schedule = resolveScheduledClock(registry).filter((slot) => effective.activePhases.includes(slot.phase));
const allInEntries: AllInCostEntry[] = [
  ...entries.map((entry) => ({ at: entry.ts, ventureId: entry.ventureId ?? "global", category: entry.kind === "image" ? "media" as const : "model" as const, usd: entry.usd, ref: entry.requestHash })),
  ...nonModelRaw.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line) as AllInCostEntry)
];
const allIn = allInBudgetStatus(allInEntries, month, effective.monthlyOperatingUsd);
const weekOf = mondayOfWeek(date);
const operations = await collectDigestOperations(stateRoot, date);
const digest = buildDailyDigest({
  date,
  weekOf,
  records,
  schedule,
  dailyBudgetUsd: effective.dailyBudgetUsd,
  allInBudget: allIn,
  operations,
  finalMeetingFailed: args.includes("--final-failed")
});
const baseUrl = (process.env.PUBLIC_SITE_URL || "https://quorum-site-chi.vercel.app").replace(/\/$/, "");
const sink = dry
  ? dailyDigestSinkFromEnvironment({ environment: {}, allowHosts: allowlist.runtimeHosts })
  : dailyDigestSinkFromEnvironment({ allowHosts: allowlist.runtimeHosts });
const status = await sendDailyDigest({
  digest,
  sink,
  stateRoot: digestRoot,
  roomsLink: `${baseUrl}/calendar/${weekOf}`,
  now
});
const exhaustionDates = await readJson<{ dates?: string[] }>(stateRoot, "budget/exhaustions.json", {});
const alertStatus = await sendBudgetAlert({
  root: digestRoot,
  status: allIn,
  dailyExhaustionDates: exhaustionDates.dates ?? [],
  sink,
  now
});
console.log(JSON.stringify({ date, status, alertStatus, shape: effective.shape, meetings: digest.meetings.length, bodyWordCount: digest.bodyWordCount }));
