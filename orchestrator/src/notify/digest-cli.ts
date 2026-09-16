import { readFile } from "node:fs/promises";
import path from "node:path";
import { budgetLedgerCostCategory, BudgetLedgerEntrySchema } from "../budget.js";
import { previousPragueDate } from "../cycle/ledger.js";
import { loadArticleSlotOutcomes, loadMeetingRecords, mondayOfWeek } from "../meetings/calendar.js";
import { pragueClockParts } from "../meetings/clock.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import {
  budgetDecisionStatus,
  resolveEffectivePortfolioSchedule,
  signedOwnerDecision
} from "../portfolio/schedule.js";
import { loadVentureRegistry, resolveScheduledClock } from "../ventures/registry.js";
import { allInBudgetStatus, sendBudgetAlert, sendBudgetPaceWarning, type AllInCostEntry } from "../finance/budget-alert.js";
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
const today = pragueClockParts(now).date;
/*
 * The day the digest is about, which is no longer the day it runs on.
 *
 * `operations-2026-08c` retired the night shift and moved its duties into the 06:00 morning,
 * which reconciles a day that has finished. The digest was one of those duties and its workflow
 * step still asked for `night`, so it stopped being invoked on 2026-08-29 — the date of the last
 * committed receipt under state/notify/digest. A 06:00 run digesting its own date would summarise
 * a day six hours old, so the caller says which day it means instead.
 *
 * previousPragueDate is the one that already answers this for the reconciler, anchored at noon so
 * the arithmetic survives a daylight-saving switch.
 */
const date = args.includes("--previous-day")
  ? previousPragueDate(today)
  : valueAfter(args, "--date") ?? today;
const dry = args.includes("--dry");
const digestRoot = dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot;
const [registry, decisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw, kvorumFoundingRaw, kvorumBudgetCapacityRaw, ideaRoomHoldRaw, ledgerRaw, nonModelRaw, allowlist, records] = await Promise.all([
  loadVentureRegistry(),
  readFile(path.join(stateRoot, "decisions", "2026-08-01-budget-raise.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-02-budget-mma.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-02-fightaiq-founding.md"), "utf8"),
  readFile(path.join(stateRoot, "decisions", "2026-08-12-kvorum-founding.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  }),
  readFile(path.join(stateRoot, "decisions", "2026-08-12-kvorum-budget-capacity.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  }),
  readFile(path.join(stateRoot, "decisions", "2026-08-29-launch-idea-room-hold.md"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
    }),
  readFile(path.join(stateRoot, "budget", "ledger.json"), "utf8"),
  readText(stateRoot, "budget/all-in.jsonl"),
  readFile(path.join(configRoot, "network-allowlist.json"), "utf8").then((raw) => JSON.parse(raw) as { runtimeHosts: string[] }),
  loadMeetingRecords(digestRoot)
]);
const entries = ((JSON.parse(ledgerRaw) as { entries?: unknown[] }).entries ?? [])
  .map((entry) => BudgetLedgerEntrySchema.parse(entry));
/*
 * The month the caps are read against: the one the run is in, not the one the digested day is in.
 *
 * They are the same date on 30 or 31 days out of 31. On the first of a month they are not, and
 * everything downstream of this line is about the present rather than about the digested day:
 * `allIn` decides the headroom the schedule is resolved with, and sendBudgetAlert writes
 * state/autonomy/office-mode.json from it. A closed month that ended exhausted would have shut
 * the office on the first morning of the new one.
 */
const month = today.slice(0, 7);
const spent = entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0);
const provisionalCap = signedOwnerDecision(budgetFiftyRaw) === "countersigned" ? 25 : budgetDecisionStatus(decisionRaw) === "countersigned-shape-a" ? 18 : 15;
const effective = resolveEffectivePortfolioSchedule({
  registry,
  budgetDecisionRaw: decisionRaw,
  budgetMmaRaw,
  budgetFiftyRaw,
  fightAiQFoundingRaw,
  kvorumFoundingRaw,
  kvorumBudgetCapacityRaw,
  ideaRoomHoldRaw,
  monthlyApiHeadroomUsd: Math.max(0, provisionalCap - spent)
});
const schedule = resolveScheduledClock(registry).filter((slot) => effective.activePhases.includes(slot.phase));
const allInEntries: AllInCostEntry[] = [
  ...entries.map((entry) => ({ at: entry.ts, ventureId: entry.ventureId ?? "global", category: budgetLedgerCostCategory(entry.kind), usd: entry.usd, ref: entry.requestHash })),
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
  articleSlots: await loadArticleSlotOutcomes(digestRoot),
  spentUsd: Number(entries.filter((entry) => entry.ts.slice(0, 10) === date).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8)),
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
const paceStatus = await sendBudgetPaceWarning({ root: digestRoot, status: allIn, now });
console.log(JSON.stringify({ date, status, alertStatus, paceStatus, shape: effective.shape, meetings: digest.meetings.length, bodyWordCount: digest.bodyWordCount }));
