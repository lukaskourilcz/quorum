import { z } from "zod";

export const BudgetLineSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().min(1),
  maxUsd: z.number().nonnegative(),
  committedUsd: z.number().nonnegative(),
  owner: z.string().min(1)
});
export type BudgetLine = z.infer<typeof BudgetLineSchema>;

export function validateZeroBasedPlan(
  lines: readonly BudgetLine[],
  capUsd = 20
): number {
  const parsed = lines.map((line) => BudgetLineSchema.parse(line));
  const ids = new Set(parsed.map((line) => line.id));
  if (ids.size !== parsed.length) {
    throw new Error("Budget line ids must be unique");
  }
  for (const line of parsed) {
    if (line.committedUsd > line.maxUsd) {
      throw new Error(`Commitment exceeds line cap: ${line.id}`);
    }
  }
  const total = parsed.reduce((sum, line) => sum + line.maxUsd, 0);
  if (total > capUsd) {
    throw new Error(`Zero-based plan ${total} exceeds all-in cap ${capUsd}`);
  }
  return Number(total.toFixed(8));
}

export type CaughtUpBudgetMode =
  | "full"
  | "minimal_transcript"
  | "no_edition";

/**
 * The edition outranks meeting theatre as the monthly API allowance tightens.
 * These thresholds are owner-approved operating policy, not forecasts.
 */
export function caughtUpBudgetMode(monthlyApiHeadroomUsd: number): CaughtUpBudgetMode {
  if (!Number.isFinite(monthlyApiHeadroomUsd) || monthlyApiHeadroomUsd < 0) {
    throw new Error("Monthly API headroom must be a non-negative finite number");
  }
  if (monthlyApiHeadroomUsd < 0.5) return "no_edition";
  if (monthlyApiHeadroomUsd < 2.5) return "minimal_transcript";
  return "full";
}
