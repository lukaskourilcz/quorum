import type { BudgetLedgerEntry } from "../budget.js";
import type { FinanceLedgerEntry } from "./ledger.js";

export interface ReconciliationResult {
  coveredApiUsd: number;
  missingRequestHashes: string[];
  duplicateRequestHashes: string[];
  coverage: number | null;
}

export function reconcileApiCosts(
  budget: readonly BudgetLedgerEntry[],
  finance: readonly FinanceLedgerEntry[]
): ReconciliationResult {
  const apiEntries = finance.filter(
    (entry) => entry.type === "api_cost" && entry.verified
  );
  const counts = new Map<string, number>();
  for (const entry of apiEntries) {
    counts.set(
      entry.reconciliationKey,
      (counts.get(entry.reconciliationKey) ?? 0) + 1
    );
  }
  const missingRequestHashes = budget
    .filter((entry) => !counts.has(entry.requestHash))
    .map((entry) => entry.requestHash);
  const duplicateRequestHashes = [...counts]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  const coveredApiUsd = Number(
    budget
      .filter((entry) => counts.has(entry.requestHash))
      .reduce((sum, entry) => sum + entry.usd, 0)
      .toFixed(8)
  );
  return {
    coveredApiUsd,
    missingRequestHashes,
    duplicateRequestHashes,
    coverage:
      budget.length === 0
        ? null
        : Number(((budget.length - missingRequestHashes.length) / budget.length).toFixed(4))
  };
}
