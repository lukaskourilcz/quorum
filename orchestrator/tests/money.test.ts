import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BudgetLedgerEntry } from "../src/budget.js";
import type { KpiSet } from "../src/contracts/kpi-set.js";
import { evaluateQuarterlyKpis } from "../src/metrics/quarterly.js";
import {
  FixedCostRegistrySchema,
  fixedCostTotals,
  normalizeFixedCostRegistry
} from "../src/money/fixed-costs.js";
import {
  advanceMonetizationStatus,
  evaluateMonetizationMethods
} from "../src/money/monetization.js";
import { buildPublicMoneySnapshot, writePublicMoneySnapshot } from "../src/money/public.js";
import { repoRoot } from "../src/paths.js";

const kpiSet: KpiSet = {
  schemaVersion: "kpi-set/1",
  quarter_id: "2026-Q1",
  quarter_start: "2026-08-03",
  quarter_days: 90,
  kpis: [{
    id: "company.valid-window-rate",
    venture: "company",
    name: "Valid windows",
    metric_source: "state/meetings#valid_result_rate",
    target: 0.95,
    direction: "at-least",
    unit: "ratio",
    critical: true,
    ramp_days: 0
  }]
};

describe("fixed-cost registry", () => {
  it("keeps the committed seed empty and excludes comment metadata from burn", async () => {
    const raw = JSON.parse(await readFile(path.join(repoRoot, "config/fixed-costs.json"), "utf8")) as unknown;
    const registry = normalizeFixedCostRegistry(raw);
    expect(registry.costs).toEqual([]);
    expect(fixedCostTotals(raw, new Date("2026-08-15T12:00:00.000Z"))).toEqual({
      monthlyUsd: 0,
      cumulativeUsd: 0,
      byCategory: []
    });
  });

  it("requires real positive amounts and rejects unrecognized active fields", () => {
    const base = { schemaVersion: "fixed-costs/1", currency: "USD", costs: [] };
    expect(FixedCostRegistrySchema.safeParse({
      ...base,
      costs: [{ name: "Hosting", monthly_usd: 0, category: "hosting", since: "2026-08-01" }]
    }).success).toBe(false);
    expect(FixedCostRegistrySchema.safeParse({ ...base, examples: [{ monthly_usd: 20 }] }).success).toBe(false);
  });
});

describe("monetization state machine", () => {
  it("keeps every method locked under the information-only posture", () => {
    expect(advanceMonetizationStatus({ current: "locked", activationReady: true, proposalPrepared: false })).toBe("locked");
    expect(advanceMonetizationStatus({ current: "ready", activationReady: true, proposalPrepared: true })).toBe("locked");
    expect(advanceMonetizationStatus({ current: "proposed", activationReady: true, proposalPrepared: true })).toBe("locked");
    expect(advanceMonetizationStatus({
      current: "proposed",
      activationReady: true,
      proposalPrepared: true,
      ownerApproval: { approvedBy: "owner", decisionRef: "D10" }
    })).toBe("locked");
  });

  it("measures readiness without preparing or activating a proposal", () => {
    const methods = evaluateMonetizationMethods({
      measurements: {
        caughtUpFollowers: 1_000,
        mmaFilesIndexingEnabled: false,
        tittyTuesdaysCampaigns: 8,
        tittyTuesdaysFollowers: 500
      }
    });
    expect(methods.find((method) => method.id === "caught-up-sponsorship")).toMatchObject({
      status: "locked",
      readiness: { met: true },
      ownerGateRequired: true,
      proposal: null
    });
    expect(methods.find((method) => method.id === "fightaiq-none")).toMatchObject({ status: "locked", proposal: null });
    expect(methods.find((method) => method.id === "carousel-studio-internal")).toMatchObject({ status: "locked", venture: "carousel-studio", proposal: null });
  });
});

describe("public Money snapshot", () => {
  it("publishes honest zero revenue and strips private cost and ledger fields", async () => {
    const at = new Date("2026-08-15T12:00:00.000Z");
    const kpis = evaluateQuarterlyKpis({
      kpiSet,
      measurements: { "state/meetings#valid_result_rate": 0.96 },
      now: at
    });
    const monetization = evaluateMonetizationMethods({
      measurements: { mmaFilesIndexingEnabled: false }
    });
    const budgetEntries: BudgetLedgerEntry[] = [{
      ts: "2026-08-10T12:00:00.000Z",
      cycleId: "cycle-money-test",
      requestHash: "request-hash-money-test",
      phase: "morning",
      ventureId: "global",
      agent: "LEDGER",
      provider: "openai",
      model: "test-model",
      serviceTier: "default",
      tokensIn: 1,
      cachedTokensIn: 0,
      tokensOut: 1,
      toolUses: 0,
      usd: 1,
      kind: "text"
    }, {
      ts: "2026-08-10T13:00:00.000Z",
      cycleId: "cycle-private-money-test",
      requestHash: "request-hash-private-money-test",
      phase: "personal-growth",
      ventureId: "personal-growth",
      agent: "LEDGER",
      provider: "openai",
      model: "test-model",
      serviceTier: "default",
      tokensIn: 1,
      cachedTokensIn: 0,
      tokensOut: 1,
      toolUses: 0,
      usd: 0.5,
      kind: "text"
    }];
    const snapshot = buildPublicMoneySnapshot({
      generatedAt: at,
      kpiSnapshot: kpis,
      monetization,
      fixedCosts: {
        schemaVersion: "fixed-costs/1",
        currency: "USD",
        costs: [{
          name: "PRIVATE SERVICE NAME",
          monthly_usd: 20,
          category: "hosting",
          since: "2026-07-01"
        }]
      },
      budgetEntries,
      ventureRegistry: JSON.parse(await readFile(path.join(repoRoot, "config/ventures.json"), "utf8")),
      ventureEvidenceCosts: {
        booksofhistory: { researchUsd: 0.25 },
        kvorum: { sourceUsd: 0.4, sourceNote: "Recorded source allocation." }
      },
      financeLedger: {
        schemaVersion: 1,
        currency: "USD",
        entries: [{
          id: "unverified-revenue",
          ts: "2026-08-10T12:00:00.000Z",
          type: "revenue",
          amountUsd: 999,
          verified: false,
          sourceRef: "invoice/private-customer",
          reconciliationKey: "unverified-revenue-1",
          note: "SECRET CUSTOMER DATA"
        }]
      }
    });
    expect(snapshot.revenue.recognizedUsd).toBe(0);
    expect(snapshot.costs).toMatchObject({
      api: { monthlyUsd: 1.5, cumulativeUsd: 1.5 },
      fixed: { monthlyUsd: 20, cumulativeUsd: 40 },
      totalMonthlyBurnUsd: 21.5,
      cumulativeSpendUsd: 41.5
    });
    expect(snapshot.costs.byVenture.find((entry) => entry.ventureId === "booksofhistory"))
      .toMatchObject({ modelUsd: 0, researchUsd: 0.25, sourceUsd: null });
    expect(snapshot.costs.byVenture.find((entry) => entry.ventureId === "kvorum"))
      .toMatchObject({ modelUsd: 0, sourceUsd: 0.4 });
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("PRIVATE SERVICE NAME");
    expect(serialized).not.toContain("invoice/private-customer");
    expect(serialized).not.toContain("SECRET CUSTOMER DATA");
    expect(serialized).not.toContain("personal-growth");
    expect(serialized).not.toContain("Lukáš Growth Desk");

    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-money-public-"));
    await expect(writePublicMoneySnapshot(root, snapshot)).resolves.toBe("money/public.json");
    const saved = JSON.parse(await readFile(path.join(root, "money/public.json"), "utf8")) as { revenue: { recognizedUsd: number } };
    expect(saved.revenue.recognizedUsd).toBe(0);
  });
});
