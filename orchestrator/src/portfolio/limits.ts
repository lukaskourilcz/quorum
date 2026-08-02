import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_BUDGET_LIMITS, type BudgetLimits } from "../budget.js";
import { stateRoot } from "../paths.js";
import { loadVentureRegistry } from "../ventures/registry.js";
import { resolveEffectivePortfolioSchedule } from "./schedule.js";

/**
 * The caps the runtime actually enforces, from the countersigned decision and the workflow env.
 *
 * Every phase has to reach the same numbers. Article production carried its own literal —
 * $2.20 a day, $42 a month API, $50 all-in — which are the figures of budget-2026-08d, a
 * decision superseded on 2 August by budget-2026-08e at $1.00, $25 and $30. A phase-local
 * copy of a cap silently keeps spending against a decision the owner has replaced, so there
 * is one resolver and the phases tighten it rather than restating it.
 */
export function environmentBudgetLimits(schedule: {
  monthlyBudgetUsd: number;
  dailyBudgetUsd: number;
  monthlyOperatingUsd: number;
}): BudgetLimits {
  const number = (name: string, fallback: number) => {
    const parsed = Number(process.env[name]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };
  return {
    ...DEFAULT_BUDGET_LIMITS,
    maxCycleUsd: number("MAX_CYCLE_BUDGET_USD", DEFAULT_BUDGET_LIMITS.maxCycleUsd),
    dailyUsd: number("DAILY_BUDGET_USD", schedule.dailyBudgetUsd),
    monthlyApiUsd: number("MONTHLY_BUDGET_USD", schedule.monthlyBudgetUsd),
    monthlyOperatingUsd: number("MONTHLY_OPERATING_CAP_USD", schedule.monthlyOperatingUsd)
  };
}

/**
 * Resolve the enforced caps from disk, for a caller that does not already hold the schedule.
 *
 * The amounts a schedule reports depend only on its shape flags, never on remaining headroom
 * — headroom decides which phases stay active, not what the caps are — so any headroom reads
 * the same figures and zero is passed to say the caller does not have one yet. That invariant
 * is pinned in orchestrator/tests/budget.test.ts. Callers that already resolved a schedule
 * should pass it to environmentBudgetLimits directly rather than paying for these reads again.
 */
export async function loadRuntimeBudgetLimits(): Promise<BudgetLimits> {
  const decision = (name: string) => readFile(path.join(stateRoot, "decisions", name), "utf8");
  const [registry, budgetDecisionRaw, budgetMmaRaw, budgetFiftyRaw, fightAiQFoundingRaw] = await Promise.all([
    loadVentureRegistry(),
    decision("2026-08-01-budget-raise.md"),
    decision("2026-08-02-budget-mma.md"),
    decision("2026-08-04-budget-fifty.md"),
    decision("2026-08-02-fightaiq-founding.md")
  ]);
  return environmentBudgetLimits(resolveEffectivePortfolioSchedule({
    registry,
    budgetDecisionRaw,
    budgetMmaRaw,
    budgetFiftyRaw,
    fightAiQFoundingRaw,
    monthlyApiHeadroomUsd: 0
  }));
}

/** Tighten resolved caps for a phase. A phase may lower a cap; it may never raise one. */
export function tightenedBy(limits: BudgetLimits, phase: Partial<BudgetLimits>): BudgetLimits {
  const tightened = { ...limits };
  for (const [key, value] of Object.entries(phase) as Array<[keyof BudgetLimits, number | undefined]>) {
    if (typeof value === "number" && typeof tightened[key] === "number") {
      (tightened[key] as number) = Math.min(tightened[key] as number, value);
    }
  }
  return tightened;
}
