import { describe, expect, it } from "vitest";
import { parsePublicMoneySnapshot } from "./money-records";

function validSnapshot() {
  return {
    schemaVersion: "money-public/1",
    generatedAt: "2026-08-02T12:00:00.000Z",
    quarter: {
      id: "2026-Q1",
      start: "2026-08-03",
      end: "2026-10-31",
      daysRemaining: 90,
      statuses: [{
        id: "caught-up.editions",
        venture: "caught-up",
        name: "Editions delivered",
        unit: "count",
        actual: null,
        target: 65,
        direction: "at-least",
        critical: false,
        status: "unavailable",
        paceTarget: null,
        attainmentRatio: null,
        rampActive: false,
        reason: "No verified measurement is connected.",
        privateMetricSource: "do-not-project"
      }]
    },
    monetization: [{
      id: "caught-up-sponsorship",
      venture: "caught-up",
      method: "Sponsorship",
      status: "locked",
      activationKpi: "Four weeks at the approved threshold.",
      readiness: { met: false, unavailable: true, detail: "Measurements are unavailable." },
      proposal: null,
      ownerGateRequired: true,
      note: "Owner approval is required.",
      secretAccount: "do-not-project"
    }],
    costs: {
      currency: "USD",
      api: { month: "2026-08", monthlyUsd: 0, cumulativeUsd: 0, receiptDetail: "private" },
      fixed: { monthlyUsd: 0, cumulativeUsd: 0, byCategory: [], invoices: ["private"] },
      totalMonthlyBurnUsd: 0,
      cumulativeSpendUsd: 0
    },
    revenue: { recognizedUsd: 0, customerNames: ["private"] },
    credentials: "private"
  };
}

describe("public Money snapshot", () => {
  it("projects only the approved public fields and keeps confirmed revenue at zero", () => {
    const parsed = parsePublicMoneySnapshot(validSnapshot());
    expect(parsed?.revenue.recognizedUsd).toBe(0);
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("credentials");
    expect(serialized).not.toContain("privateMetricSource");
  });

  it("rejects malformed and negative money values", () => {
    expect(parsePublicMoneySnapshot({})).toBeNull();
    expect(parsePublicMoneySnapshot({ ...validSnapshot(), revenue: { recognizedUsd: -1 } })).toBeNull();
  });
});
