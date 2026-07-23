import type { BudgetLedgerEntry } from "../budget.js";
import type { FinanceLedgerEntry } from "./ledger.js";

export interface DailyCost {
  date: string;
  apiUsd: number;
  nonApiUsd: number;
  allInUsd: number;
}

export function dailyCost(
  date: string,
  budgetEntries: readonly BudgetLedgerEntry[],
  financeEntries: readonly FinanceLedgerEntry[]
): DailyCost {
  const apiUsd = budgetEntries
    .filter((entry) => entry.ts.slice(0, 10) === date)
    .reduce((sum, entry) => sum + entry.usd, 0);
  const nonApiUsd = financeEntries
    .filter(
      (entry) =>
        entry.verified &&
        entry.ts.slice(0, 10) === date &&
        entry.type !== "api_cost"
    )
    .reduce((sum, entry) => sum + entry.amountUsd, 0);
  return {
    date,
    apiUsd: Number(apiUsd.toFixed(8)),
    nonApiUsd: Number(nonApiUsd.toFixed(8)),
    allInUsd: Number((apiUsd + nonApiUsd).toFixed(8))
  };
}
