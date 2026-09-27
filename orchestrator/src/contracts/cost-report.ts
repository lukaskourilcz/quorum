import { z } from "zod";
import { DateSchema, DateTimeSchema, VentureIdSchema, openObject } from "./common.js";

/**
 * What one month of work cost, joined to the things the work produced.
 *
 * `state/budget/ledger.json` already records every model call with its `cycleId`, and
 * `state/FINANCE.md` already sums that ledger by venture. Neither answers the two questions the
 * owner keeps asking: what did *this edition* cost, and what did *this decision* cost. The join
 * is `cycleId` — the same key the ledger, `state/decisions/*.json` and `state/scorecards/*.json`
 * all carry — so this contract derives nothing the ledger does not already record.
 *
 * Two deliberate absences:
 *
 * - `billed` is nullable and null is the shipped state. It is what the provider invoiced, and
 *   reading it needs an Anthropic Admin API key that only an organization owner can create. A
 *   confident `$0.00` beside a metered `$18.24` is a number nobody can act on, which is the rule
 *   `orchestrator/src/finance/finance-page.ts` already follows for revenue.
 * - An edition or a decision whose cycle cannot be resolved carries `meteredUsd: null`, not `0`.
 *   Engineering rule 7: a period nothing was measured over is an absence.
 */

export const CostCurrencySchema = z.literal("USD");

/** A money figure as this repository stores it: eight decimals, because one call costs a fraction of a cent. */
const UsdSchema = z.number().finite().nonnegative();
const SignedUsdSchema = z.number().finite();

export const CostBreakdownSchema = openObject({
  totalUsd: UsdSchema,
  modelUsd: UsdSchema,
  mediaUsd: UsdSchema,
  calls: z.number().int().nonnegative()
});
export type CostBreakdown = z.infer<typeof CostBreakdownSchema>;

const LedgerVentureIdSchema = z.union([VentureIdSchema, z.literal("global")]);

/**
 * One delivered edition and what the room that produced it metered.
 *
 * `cycleIds` is a list because a day can open the same room twice: the scheduled run that writes
 * the edition and the backstop retry that finds the day already settled and bills nothing. Both
 * are that edition's cost, and one of them is usually $0. When the list is empty no cycle of that
 * room billed on that date, so `cost` is null rather than zero and `note` says so. The row still
 * ships: a delivery whose cost cannot be attributed is a fact about the records, not a row to drop.
 */
export const EditionCostSchema = openObject({
  date: DateSchema,
  ventureId: LedgerVentureIdSchema,
  phase: z.string().min(1).max(80),
  cycleIds: z.array(z.string().min(1).max(160)).max(24),
  status: z.string().min(1).max(40),
  articleUrl: z.string().url().nullable(),
  packageHash: z.string().min(8).max(64).nullable(),
  cost: CostBreakdownSchema.nullable(),
  note: z.string().min(1).max(240).nullable()
});
export type EditionCost = z.infer<typeof EditionCostSchema>;

export const DecisionCostSchema = openObject({
  cycleId: z.string().min(1).max(160),
  phase: z.string().min(1).max(80),
  ventureId: LedgerVentureIdSchema,
  outcome: z.string().min(1).max(60),
  decidedAt: DateTimeSchema,
  cost: CostBreakdownSchema.nullable(),
  note: z.string().min(1).max(240).nullable()
});
export type DecisionCost = z.infer<typeof DecisionCostSchema>;

/**
 * A room's month against the envelopes its own meeting records declared.
 *
 * `comparable` is nullable because not every cycle leaves a record that survives the day — the
 * room's records are keyed by date, so a second run of the same room overwrites the first. A
 * cycle with no recorded envelope is counted in `cycles` and its spend in `meteredUsd`, but it is
 * kept out of the comparison rather than measured against a guess.
 *
 * `comparable.envelopeUsd` is the sum of the recorded envelopes, not one of them: a room that
 * opened nine times had nine envelopes' worth of permission, and comparing one cycle's envelope
 * against nine cycles of spend is the mistake this shape exists to prevent.
 */
export const EnvelopeVarianceSchema = openObject({
  phase: z.string().min(1).max(80),
  ventureId: LedgerVentureIdSchema,
  cycles: z.number().int().nonnegative(),
  meteredUsd: UsdSchema,
  comparable: openObject({
    cycles: z.number().int().positive(),
    envelopeUsd: UsdSchema,
    meteredUsd: UsdSchema,
    varianceUsd: SignedUsdSchema,
    /** Cycles of this room that individually spent past their own recorded envelope. */
    overspentCycles: z.number().int().nonnegative()
  }).nullable()
});
export type EnvelopeVariance = z.infer<typeof EnvelopeVarianceSchema>;

/**
 * What the provider says it billed, when a key exists to ask.
 *
 * `source` names the endpoint the figure came from so a reader can tell a fetched number from a
 * hand-entered one. There is no hand-entered path: this object is only ever written by the
 * adapter in `orchestrator/src/finance/provider-billing.ts`.
 */
export const ProviderBillingSchema = openObject({
  source: z.literal("anthropic-cost-report"),
  fetchedAt: DateTimeSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  currency: CostCurrencySchema,
  totalUsd: UsdSchema,
  days: z.array(openObject({ date: DateSchema, usd: UsdSchema })).max(62)
});
export type ProviderBilling = z.infer<typeof ProviderBillingSchema>;

export const CostReconciliationStatusSchema = z.enum(["unavailable", "reconciled", "mismatch"]);

/**
 * Metered against billed.
 *
 * `unavailable` is the state that ships, and it is not a failure: the owner has not created the
 * admin key, so there is no second number to compare against. `mismatch` is any difference above
 * the tolerance, which is deliberately a recorded number rather than a constant in a component —
 * a threshold nobody can see is a threshold nobody can argue with.
 */
export const CostReconciliationSchema = openObject({
  status: CostReconciliationStatusSchema,
  meteredUsd: UsdSchema,
  billedUsd: UsdSchema.nullable(),
  differenceUsd: SignedUsdSchema.nullable(),
  toleranceUsd: UsdSchema,
  note: z.string().min(1).max(400)
});
export type CostReconciliation = z.infer<typeof CostReconciliationSchema>;

/** Records the reader could not parse. Counted and shown, never silently dropped. */
export const CostReportDroppedSchema = openObject({
  decisions: z.number().int().nonnegative(),
  deliveries: z.number().int().nonnegative(),
  /** Meeting records whose envelope could not be read, so their cycles have nothing to compare against. */
  envelopes: z.number().int().nonnegative(),
  ledgerRows: z.number().int().nonnegative()
});

export const CostReportSchema = openObject({
  schemaVersion: z.literal("cost-report/1"),
  generatedAt: DateTimeSchema,
  month: z.string().regex(/^\d{4}-\d{2}$/),
  currency: CostCurrencySchema,
  metered: openObject({
    total: CostBreakdownSchema,
    editions: z.array(EditionCostSchema).max(400),
    decisions: z.array(DecisionCostSchema).max(1000),
    envelopes: z.array(EnvelopeVarianceSchema).max(200)
  }),
  billed: ProviderBillingSchema.nullable(),
  reconciliation: CostReconciliationSchema,
  unreadable: CostReportDroppedSchema
}).superRefine((report, context) => {
  // A reconciliation that claims a billed figure without one beside it is the exact shape of the
  // fiction this report exists to refuse.
  if (report.billed === null && report.reconciliation.status !== "unavailable") {
    context.addIssue({
      code: "custom",
      message: "Reconciliation cannot be resolved without a billed figure.",
      path: ["reconciliation", "status"]
    });
  }
  if (report.billed === null && report.reconciliation.billedUsd !== null) {
    context.addIssue({
      code: "custom",
      message: "A billed amount without a billing record is not a recorded fact.",
      path: ["reconciliation", "billedUsd"]
    });
  }
  if (report.billed && report.billed.month !== report.month) {
    context.addIssue({
      code: "custom",
      message: "The billed month must be the month the report covers.",
      path: ["billed", "month"]
    });
  }
});
export type CostReport = z.infer<typeof CostReportSchema>;
