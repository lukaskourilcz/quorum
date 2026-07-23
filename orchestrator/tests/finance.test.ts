import { describe, expect, it } from "vitest";
import type { BudgetLedgerEntry } from "../src/budget.js";
import {
  appendFinanceEntry,
  normalizeFinanceLedger,
  type FinanceLedgerEntry
} from "../src/finance/ledger.js";
import { calculateProfit } from "../src/finance/profit.js";
import { reconcileApiCosts } from "../src/finance/reconcile.js";
import { validateZeroBasedPlan } from "../src/finance/budget-plan.js";
import { assertSpendAllowed, treasuryPosition } from "../src/treasury.js";

const revenue: FinanceLedgerEntry = {
  id: "FIN-001",
  ts: "2026-07-23T00:00:00.000Z",
  type: "revenue",
  amountUsd: 10,
  verified: true,
  sourceRef: "stripe:pi_1",
  reconciliationKey: "stripe:pi_1"
};

describe("finance and treasury", () => {
  it("distinguishes unavailable revenue from verified zero", () => {
    expect(calculateProfit([], false).recognizedRevenueUsd).toBeNull();
    expect(calculateProfit([], true).recognizedRevenueUsd).toBe(0);
    expect(calculateProfit([revenue], true).grossProfitUsd).toBe(10);
  });

  it("is idempotent by reconciliation key", () => {
    const empty = normalizeFinanceLedger({
      schemaVersion: 1,
      currency: "USD",
      entries: []
    });
    const once = appendFinanceEntry(empty, revenue);
    const twice = appendFinanceEntry(once, revenue);
    expect(twice.entries).toHaveLength(1);
  });

  it("reconciles API usage without double counting", () => {
    const budget: BudgetLedgerEntry[] = [
      {
        ts: "2026-07-23T00:00:00.000Z",
        cycleId: "C-1",
        requestHash: "request-hash-0001",
        phase: "am",
        agent: "VIZE",
        provider: "openai",
        model: "gpt-5.6-luna",
        serviceTier: "default",
        tokensIn: 10,
        cachedTokensIn: 0,
        tokensOut: 10,
        toolUses: 0,
        usd: 0.01,
        kind: "text"
      }
    ];
    const finance: FinanceLedgerEntry[] = [
      {
        ...revenue,
        id: "FIN-API-001",
        type: "api_cost",
        amountUsd: 0.01,
        sourceRef: "budget:request-hash-0001",
        reconciliationKey: "request-hash-0001"
      }
    ];
    expect(reconcileApiCosts(budget, finance).coverage).toBe(1);
  });

  it("holds a 20% pre-profit reserve and requires approval", () => {
    const position = treasuryPosition([]);
    expect(position.reserveUsd).toBe(4);
    expect(position.availableUsd).toBe(16);
    expect(() => assertSpendAllowed(1, position, null)).toThrow(/approval/);
    expect(() => assertSpendAllowed(1, position, "APPROVAL-1")).not.toThrow();
  });

  it("enforces the all-in zero-based cap", () => {
    expect(() =>
      validateZeroBasedPlan([
        {
          id: "api",
          purpose: "API",
          maxUsd: 12,
          committedUsd: 0,
          owner: "LEDGER"
        },
        {
          id: "ops",
          purpose: "Operations",
          maxUsd: 9,
          committedUsd: 0,
          owner: "LEDGER"
        }
      ])
    ).toThrow(/exceeds/);
  });
});
