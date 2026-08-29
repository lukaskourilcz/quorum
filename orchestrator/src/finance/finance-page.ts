import type { FinanceLedgerEntry } from "./ledger.js";
import { calculateProfit } from "./profit.js";

/**
 * The generated half of `state/FINANCE.md`, written from the ledgers rather than by hand.
 *
 * The page has told its reader since 6 August to "regenerate the block above from the ledger
 * rather than editing it", and nothing regenerated it. So the block said $3.12 while
 * `state/budget/ledger.json` held $13.55 — the exact drift the header warns about, in the file
 * that warns about it. This is the generator that sentence promises.
 *
 * Two ledgers, deliberately, because they answer different questions. `state/budget/ledger.json`
 * is every model call the council has made and is the only source for API spend; the finance
 * ledger carries revenue, refunds, fees and the non-API costs a human verified. Costs are stated
 * as facts because they are recorded. Revenue, refunds, fees and therefore gross profit are
 * `unavailable` until a payment source exists — `calculateProfit` already draws that line and this
 * does not draw a second one. A confident $0.00 revenue beside an unavailable fee is a number
 * nobody can act on.
 */

export const GENERATED_BEGIN = "<!-- BEGIN GENERATED: read from state/budget/ledger.json. Do not edit by hand. -->";
export const GENERATED_END = "<!-- END GENERATED -->";

export interface BudgetLedgerEntry {
  usd: number;
  ventureId?: string | null;
  kind?: string | null;
}

/**
 * Display names for the ids the budget ledger actually carries.
 *
 * `global` and `company` are both written by company-level phases and mean the same thing to a
 * reader, so they add together. An id absent here prints as itself rather than being dropped: a
 * new venture must show up as spend on the first cycle that spends, not on the cycle someone
 * remembers to update this map.
 */
const VENTURE_NAMES: Readonly<Record<string, string>> = {
  "caught-up": "DNESKAi (`caught-up`)",
  "mma-files": "MMA Files",
  marketingshark: "marketingShark",
  fightaiq: "FightAIQ",
  "titty-tuesdays": "Titty Tuesdays",
  booksofhistory: "BOOKSOFHISTORY",
  "door-money": "Door Money",
  "tehdejsi-svet": "Tehdejší svět",
  kvorum: "Kvórum",
  goviral: "GoVIRAL",
  "carousel-studio": "Design Lab",
  "personal-growth": "Lukáš Growth Desk",
  "webdev-signal": "WebDev Signal",
  incubator: "Magazine Incubator",
  global: "Company-wide",
  company: "Company-wide"
};

function round(value: number): number {
  return Number(value.toFixed(8));
}

function usd(value: number | null): string {
  if (value === null) return "unavailable";
  // A negative zero reads as "-$0.00", which looks like a defect rather than an empty ledger.
  const amount = Object.is(value, -0) ? 0 : value;
  // A single model call costs a fraction of a cent, so a venture that has spent can round to
  // $0.00 and read as a venture that has not. Those are different facts and print differently.
  if (amount !== 0 && Math.abs(amount) < 0.005) return `${amount < 0 ? "-" : ""}<$0.01`;
  return `${amount < 0 ? "-$" : "$"}${Math.abs(amount).toFixed(2)}`;
}

export interface BudgetSummary {
  totalUsd: number;
  byVenture: Array<{ name: string; usd: number }>;
}

export function summariseBudgetLedger(entries: readonly BudgetLedgerEntry[]): BudgetSummary {
  const byName = new Map<string, number>();
  let totalUsd = 0;
  for (const entry of entries) {
    if (typeof entry.usd !== "number" || !Number.isFinite(entry.usd)) continue;
    totalUsd += entry.usd;
    const id = entry.ventureId ?? "company";
    const name = VENTURE_NAMES[id] ?? id;
    byName.set(name, (byName.get(name) ?? 0) + entry.usd);
  }
  return {
    totalUsd: round(totalUsd),
    byVenture: [...byName]
      .map(([name, value]) => ({ name, usd: round(value) }))
      // Largest first, then by name, so a redeploy of the same ledger produces the same file.
      .sort((left, right) => right.usd - left.usd || left.name.localeCompare(right.name))
  };
}

export interface FinanceBlockInput {
  asOf: string;
  budget: readonly BudgetLedgerEntry[];
  finance: readonly FinanceLedgerEntry[];
  revenueSourceConnected: boolean;
}

export function renderFinanceBlock(input: FinanceBlockInput): string {
  const budget = summariseBudgetLedger(input.budget);
  const profit = calculateProfit(input.finance, input.revenueSourceConnected);
  // API spend comes off the budget ledger, which records every call. The finance ledger's own
  // `api_cost` rows would double-count it and are not read here.
  const verifiedCost = round(budget.totalUsd + profit.treasuryCostUsd + profit.otherCostUsd);

  const lines = [
    GENERATED_BEGIN,
    "",
    `As of ${input.asOf}.`,
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| Recognized revenue | ${usd(profit.recognizedRevenueUsd)} |`,
    `| Refunds | ${usd(profit.refundsUsd)} |`,
    `| Payment fees | ${usd(profit.paymentFeesUsd)} |`,
    `| Text and image API spend | ${usd(budget.totalUsd)} |`,
    `| Treasury spend | ${usd(profit.treasuryCostUsd)} |`,
    `| Other verified operating cost | ${usd(profit.otherCostUsd)} |`,
    `| Total verified operating cost | ${usd(verifiedCost)} |`,
    `| Gross profit | ${usd(profit.grossProfitUsd)} |`,
    ""
  ];

  if (budget.byVenture.length > 0) {
    lines.push("By project:", "", "| Project | API spend |", "| --- | ---: |");
    for (const venture of budget.byVenture) lines.push(`| ${venture.name} | ${usd(venture.usd)} |`);
    lines.push("");
  } else {
    lines.push("No model call has been recorded yet.", "");
  }

  lines.push(GENERATED_END);
  return lines.join("\n");
}

/**
 * Swap the generated block into the page, leaving every hand-written word around it alone.
 *
 * A missing marker throws rather than appending. The prose above the block is the countersigned
 * cap and the rules about who may spend; a generator that could append past a damaged marker would
 * eventually write a second table under the first and let a reader pick.
 */
export function replaceGeneratedBlock(page: string, block: string): string {
  const start = page.indexOf(GENERATED_BEGIN);
  const end = page.indexOf(GENERATED_END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error("state/FINANCE.md is missing its generated block markers; refusing to guess where the table goes.");
  }
  return `${page.slice(0, start)}${block}${page.slice(end + GENERATED_END.length)}`;
}
