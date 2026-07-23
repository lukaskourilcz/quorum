import type { FinanceLedgerEntry } from "./ledger.js";

export interface ProfitSummary {
  recognizedRevenueUsd: number | null;
  refundsUsd: number | null;
  paymentFeesUsd: number | null;
  apiCostUsd: number;
  treasuryCostUsd: number;
  otherCostUsd: number;
  grossProfitUsd: number | null;
}

function sum(
  entries: readonly FinanceLedgerEntry[],
  type: FinanceLedgerEntry["type"]
): number {
  return Number(
    entries
      .filter((entry) => entry.verified && entry.type === type)
      .reduce((total, entry) => total + entry.amountUsd, 0)
      .toFixed(8)
  );
}

export function calculateProfit(
  entries: readonly FinanceLedgerEntry[],
  revenueSourceConnected: boolean
): ProfitSummary {
  const recognizedRevenueUsd = revenueSourceConnected
    ? sum(entries, "revenue")
    : null;
  const refundsUsd = revenueSourceConnected ? sum(entries, "refund") : null;
  const paymentFeesUsd = revenueSourceConnected
    ? sum(entries, "payment_fee")
    : null;
  const apiCostUsd = sum(entries, "api_cost");
  const treasuryCostUsd = sum(entries, "treasury_cost");
  const otherCostUsd = sum(entries, "other_cost");
  const grossProfitUsd =
    recognizedRevenueUsd === null ||
    refundsUsd === null ||
    paymentFeesUsd === null
      ? null
      : Number(
          (
            recognizedRevenueUsd -
            refundsUsd -
            paymentFeesUsd -
            apiCostUsd -
            treasuryCostUsd -
            otherCostUsd
          ).toFixed(8)
        );
  return {
    recognizedRevenueUsd,
    refundsUsd,
    paymentFeesUsd,
    apiCostUsd,
    treasuryCostUsd,
    otherCostUsd,
    grossProfitUsd
  };
}
