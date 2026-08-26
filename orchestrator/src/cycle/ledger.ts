import { access } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BUDGET_LIMITS, type BudgetLedgerEntry, type BudgetLimits } from "../budget.js";
import { pragueClockParts } from "../meetings/clock.js";
import { environmentBudgetLimits, loadRuntimeBudgetLimits } from "../portfolio/limits.js";
import { loadFixedMonthlyUsd } from "../money/fixed-costs.js";
import { readJson } from "../state.js";
import { configRoot, stateRoot } from "../paths.js";

/**
 * The arithmetic `runCycle` does about money and days, moved verbatim out of `cycle.ts`.
 *
 * None of it is about running a cycle: it reads the ledger, resolves the enforced caps, counts the
 * cycles left in a month and names yesterday. They sat in the middle of the file because that is
 * where they were first needed, and every one of them is called from three or four places.
 *
 * Nothing changed in the move; the names are exported so `runCycle` calls exactly what it did.
 */

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

export function budgetLimitsFromEnvironment(): BudgetLimits {
  return {
    ...DEFAULT_BUDGET_LIMITS,
    maxCycleUsd: envNumber(
      "MAX_CYCLE_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.maxCycleUsd
    ),
    caughtUpMeetingUsd: envNumber(
      "CU_MEETING_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.caughtUpMeetingUsd
    ),
    editionProductionUsd: envNumber(
      "EDITION_PRODUCTION_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.editionProductionUsd
    ),
    dailyUsd: envNumber("DAILY_BUDGET_USD", DEFAULT_BUDGET_LIMITS.dailyUsd),
    monthlyApiUsd: envNumber(
      "MONTHLY_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.monthlyApiUsd
    ),
    monthlyOperatingUsd: envNumber(
      "MONTHLY_OPERATING_CAP_USD",
      DEFAULT_BUDGET_LIMITS.monthlyOperatingUsd
    )
  };
}

export function remainingScheduledCycles(now: Date): number {
  const endOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((endOfMonth - now.getTime()) / (8 * 60 * 60 * 1_000)));
}

export function ledgerSpend(
  entries: readonly BudgetLedgerEntry[],
  predicate: (entry: BudgetLedgerEntry) => boolean
): number {
  return Number(entries.filter(predicate).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8));
}

/**
 * Month-to-date all-in spend and the cap in force, for a record that has no council to ask.
 *
 * The deterministic afternoon and night shifts write the newest standup of any day, and the
 * site reads the newest standup for its headline running cost. A literal here is therefore
 * published as fact: the site showed "$0.00 of $50" on a day the ledger held $1.18 against a
 * countersigned $50 cap.
 */
export async function monthToDateLedger(root: string, now: Date): Promise<{ monthAllInUsd: number; monthCapUsd: number }> {
  const [entries, limits, fixedMonthlyUsd] = await Promise.all([
    currentBudgetLedger(root),
    loadRuntimeBudgetLimits(),
    loadFixedMonthlyUsd(configRoot, now)
  ]);
  const month = pragueClockParts(now).date.slice(0, 7);
  const apiUsd = Number(entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8));
  return {
    monthAllInUsd: Number((apiUsd + fixedMonthlyUsd).toFixed(8)),
    monthCapUsd: limits.monthlyOperatingUsd
  };
}

export async function currentBudgetLedger(root: string): Promise<BudgetLedgerEntry[]> {
  return (await readJson<{ entries: BudgetLedgerEntry[] }>(
    root,
    "budget/ledger.json",
    { entries: [] }
  )).entries;
}

export function previousPragueDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
}

export async function yesterdayEditionOutcome(root: string, date: string): Promise<string> {
  const yesterday = previousPragueDate(date);
  const delivery = await readJson<{
    status?: string;
    packageHash?: string;
  } | null>(root, `edition/deliveries/${yesterday}.json`, null);
  if (delivery?.status === "delivered") {
    return "Yesterday's edition has a reconciled delivery receipt; no sentinel flag is recorded in Quorum state.";
  }
  const meeting = await readJson<{ status?: string; decision?: { outcome?: string } } | null>(
    root,
    `meetings/${yesterday}-cu-edition.json`,
    null
  );
  if (meeting?.status === "NEEDS_RECONCILIATION") {
    return "Yesterday's edition needs delivery reconciliation; no sentinel flag is recorded in Quorum state.";
  }
  if (meeting?.decision?.outcome === "NO_EDITION") {
    return "Yesterday closed as an honest no-edition outcome; no sentinel flag is recorded in Quorum state.";
  }
  return "Yesterday's delivery outcome is unavailable in committed Quorum state; no sentinel flag is recorded here.";
}
