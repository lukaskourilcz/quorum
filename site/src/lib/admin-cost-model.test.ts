import { describe, expect, it } from "vitest";
import { parseAdminCostSnapshot } from "./admin-cost-model";

function report(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: "cost-report/1",
    generatedAt: "2026-09-16T12:00:00.000Z",
    month: "2026-09",
    currency: "USD",
    metered: {
      total: { totalUsd: 0.19, modelUsd: 0.18, mediaUsd: 0.01, calls: 2 },
      editions: [{
        date: "2026-09-13",
        ventureId: "caught-up",
        phase: "cu-edition",
        cycleIds: ["20260913030038-cu-edition"],
        status: "delivered",
        articleUrl: "https://example.invalid/a",
        packageHash: "0".repeat(64),
        cost: { totalUsd: 0.19, modelUsd: 0.18, mediaUsd: 0.01, calls: 2 },
        note: null
      }],
      decisions: [{
        cycleId: "20260913030038-cu-edition",
        phase: "cu-edition",
        ventureId: "caught-up",
        outcome: "EDITION",
        decidedAt: "2026-09-13T03:01:00.000Z",
        cost: { totalUsd: 0.19, modelUsd: 0.18, mediaUsd: 0.01, calls: 2 },
        note: null
      }],
      envelopes: [{
        phase: "cu-edition",
        ventureId: "caught-up",
        cycles: 2,
        meteredUsd: 0.19,
        comparable: { cycles: 1, envelopeUsd: 0.58, meteredUsd: 0.19, varianceUsd: -0.39, overspentCycles: 0 }
      }]
    },
    billed: null,
    reconciliation: {
      status: "unavailable",
      meteredUsd: 0.19,
      billedUsd: null,
      differenceUsd: null,
      toleranceUsd: 0.01,
      note: "PROVIDER_BILLING_ENABLED is not set, so no billing request was made."
    },
    unreadable: { decisions: 1, deliveries: 0, envelopes: 0, ledgerRows: 2 },
    ...over
  };
}

describe("admin cost snapshot", () => {
  it("reads a well-formed report into the panel's view model", () => {
    const snapshot = parseAdminCostSnapshot(report())!;
    expect(snapshot.month).toBe("2026-09");
    expect(snapshot.total.totalUsd).toBe(0.19);
    expect(snapshot.editions[0]!.cost!.totalUsd).toBe(0.19);
    expect(snapshot.decisions[0]!.outcome).toBe("EDITION");
    expect(snapshot.envelopes[0]!.comparable!.envelopeUsd).toBe(0.58);
    expect(snapshot.unreadable).toEqual({ decisions: 1, deliveries: 0, envelopes: 0, ledgerRows: 2 });
  });

  it("keeps the billed figure null so the panel prints unavailable rather than $0.00", () => {
    const snapshot = parseAdminCostSnapshot(report())!;
    expect(snapshot.billedUsd).toBeNull();
    expect(snapshot.reconciliation.status).toBe("unavailable");
    expect(snapshot.reconciliation.differenceUsd).toBeNull();
  });

  it("refuses half a reconciliation: a resolved status with no readable billed figure", () => {
    const snapshot = parseAdminCostSnapshot(report({
      billed: { source: "anthropic-cost-report", totalUsd: "not a number" },
      reconciliation: { status: "reconciled", meteredUsd: 0.19, billedUsd: 0.19, differenceUsd: 0, toleranceUsd: 0.01, note: "agreed" }
    }))!;
    expect(snapshot.billedUsd).toBeNull();
    expect(snapshot.reconciliation.status).toBe("unavailable");
  });

  it("carries a real billed figure and its difference through", () => {
    const snapshot = parseAdminCostSnapshot(report({
      billed: { source: "anthropic-cost-report", fetchedAt: "2026-09-16T12:00:00.000Z", month: "2026-09", currency: "USD", totalUsd: 0.5, days: [] },
      reconciliation: { status: "mismatch", meteredUsd: 0.19, billedUsd: 0.5, differenceUsd: -0.31, toleranceUsd: 0.01, note: "disagree" }
    }))!;
    expect(snapshot.billedUsd).toBe(0.5);
    expect(snapshot.reconciliation.status).toBe("mismatch");
    expect(snapshot.reconciliation.differenceUsd).toBe(-0.31);
  });

  it("returns null for anything it cannot recognise instead of guessing", () => {
    expect(parseAdminCostSnapshot(null)).toBeNull();
    expect(parseAdminCostSnapshot("{}")).toBeNull();
    expect(parseAdminCostSnapshot({ ...report(), schemaVersion: "cost-report/2" })).toBeNull();
    expect(parseAdminCostSnapshot({ ...report(), month: "September" })).toBeNull();
    expect(parseAdminCostSnapshot({ ...report(), metered: { total: null, editions: [], decisions: [], envelopes: [] } })).toBeNull();
  });

  it("drops a malformed row without losing the rows around it", () => {
    const base = report();
    const snapshot = parseAdminCostSnapshot({
      ...base,
      metered: { ...base.metered, decisions: [{ nothing: true }, ...base.metered.decisions] }
    })!;
    expect(snapshot.decisions).toHaveLength(1);
  });

  it("keeps an unattributable edition as unavailable rather than as free", () => {
    const base = report();
    const snapshot = parseAdminCostSnapshot({
      ...base,
      metered: { ...base.metered, editions: [{ ...base.metered.editions[0], cost: null, note: "not recorded" }] }
    })!;
    expect(snapshot.editions[0]!.cost).toBeNull();
  });

  it("caps a long report and says how many rows it did not show", () => {
    const base = report();
    const many = Array.from({ length: 200 }, (_, index) => ({
      ...base.metered.decisions[0],
      cycleId: `2026091303${String(index).padStart(4, "0")}-cu-edition`
    }));
    const snapshot = parseAdminCostSnapshot({ ...base, metered: { ...base.metered, decisions: many } })!;
    expect(snapshot.decisions).toHaveLength(120);
    expect(snapshot.truncated.decisions).toBe(80);
  });
});
