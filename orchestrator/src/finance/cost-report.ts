import type { BudgetLedgerEntry } from "../budget.js";
import type { VentureRegistry } from "../contracts/venture-registry.js";
import {
  CostReportSchema,
  type CostReconciliation,
  type CostReport,
  type ProviderBilling
} from "../contracts/cost-report.js";
import {
  costByCycle,
  cycleMonth,
  decisionCosts,
  editionCosts,
  envelopeVariance,
  roundUsd,
  sumBreakdowns,
  type DecisionRecordInput,
  type DeliveryRecordInput,
  type RecordedEnvelopeInput
} from "./cost-attribution.js";

/**
 * `state/money/cost-report.json`, built from records the caller has already read.
 *
 * Pure on purpose, the same split `finance-page.ts` keeps from `finance-page-cli.ts`: the join is
 * the part worth testing and the filesystem is the part worth keeping out of the test. The caller
 * counts what it could not parse and hands the counts in, so a record that failed to read is
 * visible in the report instead of quietly reducing a total.
 */

/**
 * How far metered and billed may differ before the report calls it a mismatch.
 *
 * Rounding alone can separate them by a fraction of a cent across a thousand calls, and a report
 * that cried mismatch over $0.001 would be ignored within a week. It is recorded in the file
 * rather than hidden in a component, so the owner can see the threshold they are being told
 * about.
 */
export const RECONCILIATION_TOLERANCE_USD = 0.01;

export interface CostReportInput {
  generatedAt: string;
  month: string;
  budgetEntries: readonly BudgetLedgerEntry[];
  decisions: readonly DecisionRecordInput[];
  deliveries: readonly DeliveryRecordInput[];
  envelopes: readonly RecordedEnvelopeInput[];
  registry: VentureRegistry;
  billed: ProviderBilling | null;
  /** Why `billed` is null, carried through so the report explains its own absence. */
  billingDetail: string;
  unreadable: { decisions: number; deliveries: number; envelopes: number; ledgerRows: number };
}

function reconcile(
  meteredUsd: number,
  billed: ProviderBilling | null,
  billingDetail: string
): CostReconciliation {
  if (!billed) {
    return {
      status: "unavailable",
      meteredUsd,
      billedUsd: null,
      differenceUsd: null,
      toleranceUsd: RECONCILIATION_TOLERANCE_USD,
      note: billingDetail
    };
  }
  const differenceUsd = roundUsd(meteredUsd - billed.totalUsd);
  const within = Math.abs(differenceUsd) <= RECONCILIATION_TOLERANCE_USD;
  return {
    status: within ? "reconciled" : "mismatch",
    meteredUsd,
    billedUsd: billed.totalUsd,
    differenceUsd,
    toleranceUsd: RECONCILIATION_TOLERANCE_USD,
    note: within
      ? "The metered ledger and the provider's bill agree within the recorded tolerance."
      : "The metered ledger and the provider's bill disagree. The ledger is this company's own record; the bill is the one that gets paid."
  };
}

export function buildCostReport(input: CostReportInput): CostReport {
  const byCycle = costByCycle(input.budgetEntries, input.registry);
  const monthCycles = [...byCycle.values()].filter((cycle) => cycleMonth(cycle.cycleId) === input.month);
  const total = sumBreakdowns(monthCycles.map((cycle) => ({
    totalUsd: cycle.totalUsd,
    modelUsd: cycle.modelUsd,
    mediaUsd: cycle.mediaUsd,
    calls: cycle.calls
  })));

  const decisions = decisionCosts(
    input.decisions.filter((decision) => cycleMonth(decision.cycleId) === input.month),
    byCycle,
    input.registry
  );
  const editions = editionCosts(
    input.deliveries.filter((delivery) => delivery.date.slice(0, 7) === input.month),
    byCycle,
    input.registry
  );
  const envelopes = envelopeVariance(byCycle, input.envelopes, input.registry, input.month);

  return CostReportSchema.parse({
    schemaVersion: "cost-report/1",
    generatedAt: input.generatedAt,
    month: input.month,
    currency: "USD",
    metered: { total, editions, decisions, envelopes },
    billed: input.billed,
    reconciliation: reconcile(total.totalUsd, input.billed, input.billingDetail),
    unreadable: input.unreadable
  } satisfies CostReport);
}

/**
 * The month the report covers when nobody names one.
 *
 * The newest month the ledger carries, not the current clock month: a report generated at 00:03
 * on the first of a month would otherwise be an empty page about a month nothing has happened in
 * yet, published over a full month that had just closed.
 */
export function newestLedgerMonth(entries: readonly BudgetLedgerEntry[]): string | null {
  let newest: string | null = null;
  for (const entry of entries) {
    const month = typeof entry.cycleId === "string" ? cycleMonth(entry.cycleId) : null;
    if (month && (!newest || month > newest)) newest = month;
  }
  return newest;
}
