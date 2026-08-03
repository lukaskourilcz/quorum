import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { KpiSet, QuarterlyKpi } from "../src/contracts/kpi-set.js";
import {
  evaluateQuarterlyKpis,
  runQuarterEndProtocol,
  writeQuarterlyKpiSnapshot
} from "../src/metrics/quarterly.js";

function definition(overrides: Partial<QuarterlyKpi> = {}): QuarterlyKpi {
  return {
    id: "caught-up.editions",
    venture: "caught-up",
    name: "Editions delivered",
    metric_source: "receipts/caught-up#editions_delivered",
    target: 76,
    direction: "at-least",
    unit: "count",
    critical: false,
    ramp_days: 14,
    ...overrides
  };
}

function set(kpis: QuarterlyKpi[]): KpiSet {
  return {
    schemaVersion: "kpi-set/1",
    quarter_id: "2026-Q1",
    quarter_start: "2026-08-03",
    quarter_days: 90,
    kpis
  };
}

describe("quarterly KPI evaluator", () => {
  it("excludes the Q1 spin-up window from content pace", () => {
    const kpi = definition();
    const ramp = evaluateQuarterlyKpis({
      kpiSet: set([kpi]),
      measurements: { [kpi.metric_source]: 0 },
      now: new Date("2026-08-10T12:00:00.000Z")
    }).statuses[0]!;
    expect(ramp).toMatchObject({ status: "on-track", paceTarget: 0, rampActive: true, actual: 0 });

    const firstActiveDay = evaluateQuarterlyKpis({
      kpiSet: set([kpi]),
      measurements: { [kpi.metric_source]: 1 },
      now: new Date("2026-08-17T12:00:00.000Z")
    }).statuses[0]!;
    expect(firstActiveDay).toMatchObject({ status: "on-track", paceTarget: 1, rampActive: false });
  });

  it("uses an 80 percent pace band for at-risk status in both directions", () => {
    const outputKpi = definition({ target: 90, ramp_days: 0 });
    const spendKpi = definition({
      id: "company.monthly-api-usd",
      venture: "company",
      name: "API cost",
      metric_source: "state/budget/ledger.json#monthly_api_usd",
      target: 90,
      direction: "at-most",
      unit: "usd",
      ramp_days: 0
    });
    const snapshot = evaluateQuarterlyKpis({
      kpiSet: set([outputKpi, spendKpi]),
      measurements: {
        [outputKpi.metric_source]: 8,
        [spendKpi.metric_source]: 12
      },
      now: new Date("2026-08-12T12:00:00.000Z")
    });
    expect(snapshot.statuses.map((status) => status.status)).toEqual(["at-risk", "at-risk"]);

    const offTrack = evaluateQuarterlyKpis({
      kpiSet: set([outputKpi, spendKpi]),
      measurements: {
        [outputKpi.metric_source]: 7.9,
        [spendKpi.metric_source]: 12.6
      },
      now: new Date("2026-08-12T12:00:00.000Z")
    });
    expect(offTrack.statuses.map((status) => status.status)).toEqual(["off-track", "off-track"]);
  });

  it("keeps unavailable Phase 3 metrics distinct from a measured zero", () => {
    const kpi = definition({
      id: "caught-up.followers",
      metric_source: "state/metrics/phase-3/caught-up#combined_followers",
      target: 250
    });
    const unavailable = evaluateQuarterlyKpis({
      kpiSet: set([kpi]),
      measurements: {},
      now: new Date("2026-09-01T12:00:00.000Z")
    }).statuses[0]!;
    expect(unavailable).toMatchObject({ status: "unavailable", actual: null });
    expect(unavailable.reason).toContain("Phase 3");

    const zero = evaluateQuarterlyKpis({
      kpiSet: set([kpi]),
      measurements: { [kpi.metric_source]: 0 },
      now: new Date("2026-09-01T12:00:00.000Z")
    }).statuses[0]!;
    expect(zero.status).toBe("off-track");
    expect(zero.actual).toBe(0);
  });

  it("materializes the daily snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-kpi-daily-"));
    const kpi = definition();
    const snapshot = evaluateQuarterlyKpis({
      kpiSet: set([kpi]),
      measurements: { [kpi.metric_source]: 2 },
      now: new Date("2026-08-18T12:00:00.000Z")
    });
    await expect(writeQuarterlyKpiSnapshot(root, snapshot)).resolves.toBe("kpis/latest.json");
    const saved = JSON.parse(await readFile(path.join(root, "kpis/latest.json"), "utf8")) as { quarterId: string };
    expect(saved.quarterId).toBe("2026-Q1");
  });
});

describe("quarter-end KPI protocol", () => {
  it("queues mandatory reassessment for a critical miss above the 70 percent completion floor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-kpi-quarter-"));
    const kpis = [
      definition({ id: "caught-up.one", metric_source: "state/metrics/test#one", critical: true, ramp_days: 0, target: 1 }),
      definition({ id: "caught-up.two", metric_source: "state/metrics/test#two", ramp_days: 0, target: 1 }),
      definition({ id: "caught-up.three", metric_source: "state/metrics/test#three", ramp_days: 0, target: 1 }),
      definition({ id: "caught-up.four", metric_source: "state/metrics/test#four", ramp_days: 0, target: 1 }),
      definition({
        id: "company.valid-window-rate",
        venture: "company",
        name: "Valid windows",
        metric_source: "state/metrics/test#company",
        critical: true,
        ramp_days: 0,
        target: 0.95,
        unit: "ratio"
      })
    ];
    const input = {
      root,
      kpiSet: set(kpis),
      measurements: {
        "state/metrics/test#one": 0,
        "state/metrics/test#two": 1,
        "state/metrics/test#three": 1,
        "state/metrics/test#four": 1,
        "state/metrics/test#company": 0.5
      },
      now: new Date("2026-11-01T06:00:00.000Z")
    };
    const result = await runQuarterEndProtocol(input);
    expect(result.reassessmentPaths).toEqual(["kpis/reassessments/2026-Q1-caught-up.json"]);
    const queue = JSON.parse(await readFile(path.join(root, "priority-queue.json"), "utf8")) as {
      items: Array<{ question: string; decision_at_stake: string }>;
    };
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      question: "Strategy reassessment: DNESKAi",
      decision_at_stake: "continue / pivot / stop"
    });
    const packet = JSON.parse(await readFile(path.join(root, result.ownerDigestPath), "utf8")) as {
      companyStrategyReassessment: boolean;
      boardStrategyPacket: unknown;
    };
    expect(packet.companyStrategyReassessment).toBe(true);
    expect(packet.boardStrategyPacket).not.toBeNull();

    await runQuarterEndProtocol(input);
    const rerun = JSON.parse(await readFile(path.join(root, "priority-queue.json"), "utf8")) as { items: unknown[] };
    expect(rerun.items).toHaveLength(1);
  });

  it("refuses to create reassessment artifacts before the quarter ends", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-kpi-early-"));
    const kpi = definition({ ramp_days: 0 });
    await expect(runQuarterEndProtocol({
      root,
      kpiSet: set([kpi]),
      measurements: { [kpi.metric_source]: 76 },
      now: new Date("2026-10-31T12:00:00.000Z")
    })).rejects.toThrow("has not ended");
  });
});
