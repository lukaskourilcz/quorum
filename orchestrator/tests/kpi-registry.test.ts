import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KpiSetSchema } from "../src/contracts/kpi-set.js";
import {
  countOwnedKpis,
  declaredWithoutSource,
  loadKpiRegistry,
  parseKpiRegistry,
  wiredMetricSources
} from "../src/metrics/collect.js";
import { targetWasLoosened, type KpiDefinition } from "../src/metrics/kpi.js";
import { collectQuarterlyMeasurements } from "../src/metrics/quarterly-collector.js";
import { evaluateQuarterlyKpis } from "../src/metrics/quarterly.js";
import { repoRoot } from "../src/paths.js";

const configRoot = path.join(repoRoot, "config");

async function quarterlySet() {
  return KpiSetSchema.parse(
    JSON.parse(await readFile(path.join(configRoot, "kpis/2026-Q1.json"), "utf8")) as unknown
  );
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe("the KPI ownership registry states its own measurement", () => {
  it("gives every declared KPI an explicit measurement, and no bare metric string", async () => {
    // The whole point of the field. Before it existed, every entry carried a `metric` name and a
    // target and produced no number anywhere, which read as a measurement config while
    // functioning as an ownership record. Six entries left with SPLIT, EASEL and MOTIF: an
    // outcome nobody owns is not an outcome the company is answering for.
    const registry = await loadKpiRegistry(configRoot);
    expect(registry.kpis).toHaveLength(98);
    expect(registry.kpis.filter((kpi) => kpi.measurement === undefined)).toEqual([]);
  });

  it("makes a declared-without-a-source entry say what is missing", async () => {
    const registry = await loadKpiRegistry(configRoot);
    const unsourced = declaredWithoutSource(registry);
    expect(unsourced.length).toBeGreaterThan(0);
    // "There is no source for this" is a correct answer; "n/a" is not.
    for (const kpi of unsourced) {
      const reason = kpi.measurement.kind === "none" ? kpi.measurement.reason : "";
      expect(reason.length, `${kpi.id} reason`).toBeGreaterThanOrEqual(20);
    }
  });

  it("rejects a declaration that claims no source without giving a reason", () => {
    const bare = {
      meta: {},
      kpis: [{
        id: "x.y",
        owner: "AUDIT",
        metric: "someMetric",
        target: 1,
        dir: "up",
        measurement: { kind: "none", reason: "n/a" }
      }]
    };
    expect(() => parseKpiRegistry(bare)).toThrow();
  });

  it("keeps the org-maintenance ownership count working over the real registry", async () => {
    // org/maintenance.ts checks a role still clears its declared KPI floor. This is the
    // only runtime read of the file, so it must survive the schema.
    const registry = await loadKpiRegistry(configRoot);
    expect(countOwnedKpis(registry, "AUDIT")).toBe(7);
    expect(countOwnedKpis(registry, "HACEK")).toBe(3);
    expect(countOwnedKpis(registry, "NOBODY")).toBe(0);
  });
});

describe("a wired KPI is wired to something that actually runs", () => {
  it("names a metric source the current quarterly set evaluates under the same id", async () => {
    const registry = await loadKpiRegistry(configRoot);
    const set = await quarterlySet();
    const quarterly = new Map(set.kpis.map((kpi) => [kpi.id, kpi]));
    const drift: string[] = [];
    for (const [id, metricSource] of wiredMetricSources(registry)) {
      const entry = quarterly.get(id);
      if (!entry) {
        drift.push(`${id} claims metric source ${metricSource} but is not in the quarterly set`);
        continue;
      }
      if (entry.metric_source !== metricSource) {
        drift.push(`${id} claims ${metricSource}, quarterly set reads ${entry.metric_source}`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("produces a real number for every wired metric source from committed state", async () => {
    // Without this, a wired declaration could point at a metric source no collector writes,
    // which is the same lie as an unwired metric wearing a target.
    const registry = await loadKpiRegistry(configRoot);
    const set = await quarterlySet();
    const collected = await collectQuarterlyMeasurements({
      repoRoot,
      stateRoot: path.join(repoRoot, "state"),
      kpiSet: set,
      now: new Date("2026-08-04T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    const missing: string[] = [];
    for (const [id, metricSource] of wiredMetricSources(registry)) {
      const value = collected.measurements[metricSource];
      if (typeof value !== "number") missing.push(`${id} -> ${metricSource} = ${String(value)}`);
    }
    expect(missing).toEqual([]);
  });

  it("does not let a wired target be loosened away from the registry bar", async () => {
    // The registry holds the bar the owning role signed up to. The quarterly set is what
    // grades it. If the two drift, whichever is looser wins in practice, so a loosened
    // quarterly target must fail here rather than quietly lowering the bar.
    const registry = await loadKpiRegistry(configRoot);
    const set = await quarterlySet();
    const quarterly = new Map(set.kpis.map((kpi) => [kpi.id, kpi]));
    const loosened: string[] = [];
    for (const kpi of registry.kpis) {
      if (kpi.measurement.kind !== "quarterly") continue;
      const entry = quarterly.get(kpi.id);
      if (!entry) continue;
      const asDefinition: KpiDefinition = {
        ...kpi,
        target: entry.target,
        dir: entry.direction === "at-least" ? "up" : "down"
      };
      if (kpi.dir !== asDefinition.dir) {
        loosened.push(`${kpi.id} direction differs between the two files`);
        continue;
      }
      if (targetWasLoosened(kpi, asDefinition)) {
        loosened.push(`${kpi.id} quarterly target ${entry.target} is looser than ${kpi.target}`);
      }
    }
    expect(loosened).toEqual([]);
  });
});

describe("Door Money quarterly seeds", () => {
  it("keeps the agreed bars and preserves unavailable measurements as null", async () => {
    const set = await quarterlySet();
    const doorMoney = set.kpis.filter((kpi) => kpi.venture === "door-money");

    expect(doorMoney.map(({ id, target, direction, unit, ramp_days }) => ({
      id,
      target,
      direction,
      unit,
      ramp_days
    }))).toEqual([
      { id: "door-money.desk-reliability", target: 0.9, direction: "at-least", unit: "ratio", ramp_days: 0 },
      { id: "door-money.approved-packages-weekly", target: 5, direction: "at-least", unit: "count", ramp_days: 14 },
      { id: "door-money.approval-rate-trending-up", target: 1, direction: "at-least", unit: "boolean", ramp_days: 14 },
      { id: "door-money.owner-actions-weekly", target: 3, direction: "at-least", unit: "count", ramp_days: 0 },
      { id: "door-money.passage-depletion-watch", target: 0.8, direction: "at-most", unit: "ratio", ramp_days: 0 },
      { id: "door-money.cash-spend", target: 0, direction: "at-most", unit: "usd", ramp_days: 0 },
      { id: "door-money.monthly-model-spend", target: 3, direction: "at-most", unit: "usd", ramp_days: 0 }
    ]);
    expect(doorMoney.some((kpi) => /followers|sales/iu.test(`${kpi.id} ${kpi.name}`))).toBe(false);

    const snapshot = evaluateQuarterlyKpis({
      kpiSet: set,
      measurements: Object.fromEntries(doorMoney.map((kpi) => [kpi.metric_source, null])),
      now: new Date("2026-08-12T12:00:00.000Z")
    });
    const statuses = snapshot.statuses.filter((status) => status.venture === "door-money");
    expect(statuses).toHaveLength(7);
    expect(statuses.every((status) => status.actual === null && status.status === "unavailable")).toBe(true);
  });
});

describe("rates are computed over runs that reached the stage being measured", () => {
  async function fixtureRoot() {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-kpi-registry-"));
    const stateRoot = path.join(root, "state");
    await writeJson(path.join(root, "config/fixed-costs.json"), {
      schemaVersion: "fixed-costs/1",
      currency: "USD",
      costs: []
    });
    await writeJson(path.join(root, "config/sources.json"), { sources: [] });
    return { root, stateRoot };
  }

  const kpiSet = KpiSetSchema.parse({
    schemaVersion: "kpi-set/1",
    quarter_id: "2026-Q1",
    quarter_start: "2026-08-03",
    quarter_days: 90,
    kpis: [{
      id: "localization.register_pass_rate",
      venture: "caught-up",
      name: "Czech register",
      metric_source: "receipts/caught-up#czech_register_pass_rate",
      target: 1,
      direction: "at-least",
      unit: "ratio",
      critical: false,
      ramp_days: 0,
      pace: "level"
    }]
  });

  function run(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      schemaVersion: 1,
      runId: "r",
      date: "2026-08-03",
      mode: "production",
      startedAt: "2026-08-03T08:00:00.000Z",
      completedAt: "2026-08-03T08:05:00.000Z",
      stages: [],
      regenerationAttempts: 0,
      stetBlocks: 0,
      hacekBlocks: 0,
      usage: [],
      warnings: [],
      ...overrides
    };
  }

  async function collect(stateRoot: string, root: string) {
    return collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-04T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
  }

  it("counts every review performed, not the verdict left behind on the run", async () => {
    // The trap. EditionRunReporter.stet is one mutable field that every attempt overwrites,
    // and build() emits whichever attempt wrote it last. A run whose attempt 0 cleared the
    // review and whose rewrites then all failed still carries `stet.passed: true` next to
    // status "no_edition" - state/edition/runs/2026-08-02-a7b2d656....json is that record.
    //
    // Below: the first run had one review and it passed; the second had two, the first of
    // which blocked. Three reviews, one block, so the register pass rate is 2/3. Reading the
    // surviving verdict instead scores each run once and finds both "passed" - 2 of 2 = 1,
    // a clean sweep reported for copy that was in fact sent back.
    //
    // Scoring delivered editions is not the fix either: production.ts cannot assemble a
    // package on an attempt whose review failed, so every delivered run passes by
    // construction and that denominator can only ever return 1.
    const { root, stateRoot } = await fixtureRoot();
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-abandoned.json"), run({
      status: "no_edition",
      stages: [
        { name: "write", status: "success", startedAt: "2026-08-03T08:00:00.000Z", completedAt: "2026-08-03T08:01:00.000Z", durationMs: 60000 },
        { name: "stet_0", status: "success", startedAt: "2026-08-03T08:01:00.000Z", completedAt: "2026-08-03T08:02:00.000Z", durationMs: 60000 },
        { name: "rewrite_1", status: "failed", startedAt: "2026-08-03T08:02:00.000Z", completedAt: "2026-08-03T08:03:00.000Z", durationMs: 60000 }
      ],
      stetBlocks: 0,
      stet: { passed: true, score: 50, violations: [] }
    }));
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-shipped.json"), run({
      status: "edition",
      stages: [
        { name: "write", status: "success", startedAt: "2026-08-03T09:00:00.000Z", completedAt: "2026-08-03T09:01:00.000Z", durationMs: 60000 },
        { name: "stet_0", status: "success", startedAt: "2026-08-03T09:01:00.000Z", completedAt: "2026-08-03T09:02:00.000Z", durationMs: 60000 },
        { name: "rewrite_1", status: "success", startedAt: "2026-08-03T09:02:00.000Z", completedAt: "2026-08-03T09:03:00.000Z", durationMs: 60000 },
        { name: "stet_1", status: "success", startedAt: "2026-08-03T09:03:00.000Z", completedAt: "2026-08-03T09:04:00.000Z", durationMs: 60000 },
        { name: "assemble_package", status: "success", startedAt: "2026-08-03T09:04:00.000Z", completedAt: "2026-08-03T09:05:00.000Z", durationMs: 60000 }
      ],
      stetBlocks: 1,
      quality: { metrics: { signalStrength: 80 }, result: { passed: true } },
      stet: { passed: true, score: 50, violations: [] }
    }));

    const collected = await collect(stateRoot, root);
    expect(collected.measurements["receipts/caught-up#czech_register_pass_rate"]).toBeCloseTo(2 / 3, 6);
    expect(collected.measurements["receipts/caught-up#copy_block_rate"]).toBeCloseTo(1 / 3, 6);
    expect(collected.measurements["state/edition/runs#unreadable_count"]).toBe(0);
  });

  it("refuses to read a run whose block count exceeds the reviews it recorded", async () => {
    const { root, stateRoot } = await fixtureRoot();
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-sane.json"), run({
      status: "no_edition",
      stages: [{ name: "stet_0", status: "success", startedAt: "2026-08-03T08:00:00.000Z", completedAt: "2026-08-03T08:01:00.000Z", durationMs: 60000 }],
      stetBlocks: 1
    }));
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-impossible.json"), run({
      runId: "i",
      status: "no_edition",
      stages: [{ name: "stet_0", status: "success", startedAt: "2026-08-03T09:00:00.000Z", completedAt: "2026-08-03T09:01:00.000Z", durationMs: 60000 }],
      stetBlocks: 9
    }));
    const collected = await collect(stateRoot, root);
    // One sane run: one review, one block. The impossible run is excluded and reported.
    expect(collected.measurements["receipts/caught-up#czech_register_pass_rate"]).toBe(0);
    expect(collected.measurements["state/edition/runs#unreadable_count"]).toBe(1);
  });

  it("reports the inputs it could not read instead of shrinking the denominator", async () => {
    const { root, stateRoot } = await fixtureRoot();
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-shipped.json"), run({
      status: "edition",
      stages: [{ name: "assemble_package", status: "success", startedAt: "2026-08-03T09:00:00.000Z", completedAt: "2026-08-03T09:01:00.000Z", durationMs: 60000 }],
      stet: { passed: true, score: 50, violations: [] }
    }));
    // A run file that exists and will not parse.
    await mkdir(path.join(stateRoot, "edition/runs"), { recursive: true });
    await writeFile(path.join(stateRoot, "edition/runs/2026-08-03-corrupt.json"), "{ not json");
    // And one that parses but is not a run report.
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-alien.json"), { hello: "world" });
    // And a delivered run with no reviewer verdict at all: not a pass, not a fail.
    await writeJson(path.join(stateRoot, "edition/runs/2026-08-03-verdictless.json"), run({
      runId: "v",
      status: "edition",
      stages: [{ name: "assemble_package", status: "success", startedAt: "2026-08-03T10:00:00.000Z", completedAt: "2026-08-03T10:01:00.000Z", durationMs: 60000 }]
    }));

    const collected = await collect(stateRoot, root);
    // Neither delivered run carries a quality block, so the signal-strength average has no
    // input at all and says so rather than averaging over what happens to be present.
    expect(collected.measurements["receipts/caught-up#edition_signal_strength_average"]).toBeNull();
    // Counted, not absorbed: one corrupt file, one alien file, and two delivered runs whose
    // missing quality block dropped them out of the average above.
    expect(collected.measurements["state/edition/runs#unreadable_count"]).toBe(4);
  });

  it("does not count a dry run or a run from before the quarter", async () => {
    const { root, stateRoot } = await fixtureRoot();
    await writeJson(path.join(stateRoot, "edition/runs/dry.json"), run({
      mode: "dry_run",
      status: "edition",
      stet: { passed: false, score: 0, violations: [] }
    }));
    await writeJson(path.join(stateRoot, "edition/runs/old.json"), run({
      date: "2026-07-30",
      status: "edition",
      stet: { passed: false, score: 0, violations: [] }
    }));
    const collected = await collect(stateRoot, root);
    expect(collected.measurements["receipts/caught-up#czech_register_pass_rate"]).toBeNull();
  });
});

describe("a level target is not sliced by elapsed quarter time", () => {
  it("keeps an average inside its cap on-track two days into the quarter", async () => {
    // Pro-rata scoring turned a 3-minute average turnaround into "off-track" against a
    // 60-minute cap on day 2, and would have called a 30% pass rate "on-track" against a
    // target of 100%. The second is the one that hides a miss.
    const { evaluateQuarterlyKpis } = await import("../src/metrics/quarterly.js");
    const base = {
      venture: "caught-up",
      unit: "ratio" as const,
      critical: false,
      ramp_days: 0
    };
    const set = KpiSetSchema.parse({
      schemaVersion: "kpi-set/1",
      quarter_id: "2026-Q1",
      quarter_start: "2026-08-03",
      quarter_days: 90,
      kpis: [
        { ...base, id: "level.turnaround", name: "Turnaround", metric_source: "receipts/caught-up#a", target: 60, direction: "at-most", unit: "count", pace: "level" },
        { ...base, id: "level.pass-rate", name: "Pass rate", metric_source: "receipts/caught-up#b", target: 1, direction: "at-least", pace: "level" },
        { ...base, id: "cumulative.pass-rate", name: "Paced pass rate", metric_source: "receipts/caught-up#b", target: 1, direction: "at-least" }
      ]
    });
    const snapshot = evaluateQuarterlyKpis({
      kpiSet: set,
      measurements: { "receipts/caught-up#a": 3.12, "receipts/caught-up#b": 0.3 },
      now: new Date("2026-08-04T12:00:00.000Z")
    });
    const status = (id: string) => snapshot.statuses.find((entry) => entry.id === id);
    expect(status("level.turnaround")?.status).toBe("on-track");
    expect(status("level.pass-rate")?.status).toBe("off-track");
    // The default is unchanged, so no KPI written before this field moves.
    expect(status("cumulative.pass-rate")?.status).toBe("on-track");
  });

  it("refuses a misspelled pace mode rather than silently restoring pro-rata scoring", async () => {
    const { evaluateQuarterlyKpis } = await import("../src/metrics/quarterly.js");
    const set = KpiSetSchema.parse({
      schemaVersion: "kpi-set/1",
      quarter_id: "2026-Q1",
      quarter_start: "2026-08-03",
      quarter_days: 90,
      kpis: [{
        id: "typo.pace",
        venture: "caught-up",
        name: "Typo",
        metric_source: "receipts/caught-up#a",
        target: 1,
        direction: "at-least",
        unit: "ratio",
        critical: false,
        ramp_days: 0,
        pace: "levl"
      }]
    });
    expect(() => evaluateQuarterlyKpis({
      kpiSet: set,
      measurements: { "receipts/caught-up#a": 0.1 },
      now: new Date("2026-08-04T12:00:00.000Z")
    })).toThrow(/pace mode/i);
  });
});
