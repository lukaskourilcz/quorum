import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDailyMoneyAndKpis } from "../src/money/daily.js";
import { repoRoot as sourceRepoRoot } from "../src/paths.js";

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

describe("daily Money and KPI materialization", () => {
  it("keeps a dry artifact run from changing canonical owner notices", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-money-dry-"));
    const stateRoot = path.join(repoRoot, "tmp/dry-run/state");
    const needsPath = path.join(repoRoot, "docs/NEEDED.md");
    await mkdir(path.dirname(needsPath), { recursive: true });
    await writeFile(needsPath, "# Needs your help now\n\nCanonical text.\n");
    await writeJson(path.join(repoRoot, "config/kpis/2026-Q1.json"), {
      schemaVersion: "kpi-set/1",
      quarter_id: "2026-Q1",
      quarter_start: "2026-08-03",
      quarter_days: 90,
      kpis: [{
        id: "caught-up.followers",
        venture: "caught-up",
        name: "Combined followers",
        metric_source: "state/metrics/phase-3/caught-up#combined_followers",
        target: 250,
        direction: "at-least",
        unit: "count",
        critical: false,
        ramp_days: 14
      }]
    });
    await writeJson(path.join(repoRoot, "config/fixed-costs.json"), {
      schemaVersion: "fixed-costs/1",
      currency: "USD",
      costs: []
    });
    await writeJson(path.join(repoRoot, "config/sources.json"), { sources: [] });
    await writeJson(path.join(repoRoot, "config/ventures.json"), JSON.parse(await readFile(path.join(sourceRepoRoot, "config/ventures.json"), "utf8")));
    await writeJson(path.join(stateRoot, "budget/ledger.json"), { schemaVersion: 1, entries: [] });
    await writeJson(path.join(stateRoot, "finance/ledger.json"), { schemaVersion: 1, currency: "USD", entries: [] });
    await writeJson(path.join(stateRoot, "metrics/quarterly.json"), {
      schemaVersion: "quarterly-measurements/1",
      values: {
        "state/metrics/phase-3/caught-up#combined_followers": {
          value: 1_000,
          observedAt: "2026-08-03T06:00:00.000Z",
          verified: true
        }
      }
    });
    const result = await runDailyMoneyAndKpis({
      repoRoot,
      stateRoot,
      now: new Date("2026-08-03T06:00:00.000Z"),
      environment: { METRICS_INGESTION_ENABLED: "true" },
      writeOwnerNotices: false
    });
    expect(await readFile(needsPath, "utf8")).toBe("# Needs your help now\n\nCanonical text.\n");
    expect(result.artifacts).not.toContain("docs/NEEDED.md");
    expect(JSON.parse(await readFile(path.join(stateRoot, "money/public.json"), "utf8"))).toMatchObject({
      schemaVersion: "money-public/1",
      revenue: { recognizedUsd: 0 }
    });
    expect(await readFile(path.join(stateRoot, "money/proposals/caught-up-sponsorship.json"), "utf8")).toContain("ownerActivationRequired");
  });
});
