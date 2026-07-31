import { readFile } from "node:fs/promises";
import path from "node:path";
import { BudgetLedgerEntrySchema } from "../budget.js";
import { loadMeetingRecords, mondayOfWeek } from "../meetings/calendar.js";
import { pragueClockParts } from "../meetings/clock.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import {
  budgetDecisionStatus,
  resolveEffectivePortfolioSchedule
} from "../portfolio/schedule.js";
import { loadVentureRegistry, resolveMeetingClock } from "../ventures/registry.js";
import {
  buildDailyDigest,
  dailyDigestSinkFromEnvironment,
  sendDailyDigest
} from "./digest.js";

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
const now = new Date(valueAfter(args, "--at") ?? Date.now());
const date = valueAfter(args, "--date") ?? pragueClockParts(now).date;
const dry = args.includes("--dry");
const digestRoot = dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
const [registry, decisionRaw, ledgerRaw, allowlist, records] = await Promise.all([
  loadVentureRegistry(),
  readFile(path.join(stateRoot, "decisions", "2026-08-01-budget-raise.md"), "utf8"),
  readFile(path.join(stateRoot, "budget", "ledger.json"), "utf8"),
  readFile(path.join(configRoot, "network-allowlist.json"), "utf8").then((raw) => JSON.parse(raw) as { runtimeHosts: string[] }),
  loadMeetingRecords(digestRoot)
]);
const entries = ((JSON.parse(ledgerRaw) as { entries?: unknown[] }).entries ?? [])
  .map((entry) => BudgetLedgerEntrySchema.parse(entry));
const month = date.slice(0, 7);
const spent = entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
const provisionalCap = budgetDecisionStatus(decisionRaw) === "countersigned-shape-a" ? 18 : 15;
const effective = resolveEffectivePortfolioSchedule({
  registry,
  budgetDecisionRaw: decisionRaw,
  monthlyApiHeadroomUsd: Math.max(0, provisionalCap - spent)
});
const schedule = resolveMeetingClock(registry).filter((slot) => effective.activePhases.includes(slot.phase));
const weekOf = mondayOfWeek(date);
const digest = buildDailyDigest({
  date,
  weekOf,
  records,
  schedule,
  dailyBudgetUsd: effective.dailyBudgetUsd,
  finalMeetingFailed: args.includes("--final-failed")
});
const baseUrl = (process.env.PUBLIC_SITE_URL || "https://quorum-site-chi.vercel.app").replace(/\/$/, "");
const status = await sendDailyDigest({
  digest,
  sink: dry ? dailyDigestSinkFromEnvironment({ environment: {}, allowHosts: allowlist.runtimeHosts }) : dailyDigestSinkFromEnvironment({ allowHosts: allowlist.runtimeHosts }),
  stateRoot: digestRoot,
  roomsLink: `${baseUrl}/calendar/${weekOf}`,
  now
});
console.log(JSON.stringify({ date, status, shape: effective.shape, meetings: digest.meetings.length, bodyWordCount: digest.bodyWordCount }));
