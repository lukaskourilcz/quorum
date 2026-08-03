import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { KpiSet } from "../src/contracts/kpi-set.js";
import { collectQuarterlyMeasurements } from "../src/metrics/quarterly-collector.js";
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

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function fixtureRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), "boardless-quarterly-collector-"));
  const stateRoot = path.join(root, "state");
  await writeJson(path.join(root, "config/fixed-costs.json"), {
    schemaVersion: "fixed-costs/1",
    currency: "USD",
    costs: []
  });
  await writeJson(path.join(root, "config/sources.json"), { sources: [] });
  return { root, stateRoot };
}

describe("quarterly measurement collector", () => {
  it("counts only valid window outcomes and validated DNESKAi deliveries", async () => {
    const { root, stateRoot } = await fixtureRoot();
    await writeJson(path.join(stateRoot, "calendar/2026-08-03.json"), {
      schemaVersion: "calendar/1",
      weekOf: "2026-08-03",
      slots: [
        { at: "2026-08-03T04:00:00.000Z", tz: "Europe/Prague", kind: "venture-morning", status: "held" },
        { at: "2026-08-03T05:00:00.000Z", tz: "Europe/Prague", kind: "incubator-scan", status: "missed" },
        { at: "2026-08-03T06:00:00.000Z", tz: "Europe/Prague", kind: "mma-intake", status: "not-needed" }
      ]
    });
    await writeJson(path.join(stateRoot, "edition/deliveries/2026-08-03.json"), {
      schemaVersion: 1,
      date: "2026-08-03",
      packageHash: "a".repeat(64),
      status: "delivered",
      targetRepository: "lukaskourilcz/aifirst",
      targetCommit: "b".repeat(40),
      deliveredAt: "2026-08-03T07:00:00.000Z",
      tags: []
    });
    const proof = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/release-proof.valid.json"), "utf8")) as {
      startedAt: string;
      completedAt: string;
      checks: Array<{ checkedAt: string }>;
    };
    proof.startedAt = "2026-08-03T07:01:00.000Z";
    proof.completedAt = "2026-08-03T07:03:00.000Z";
    for (const check of proof.checks) check.checkedAt = "2026-08-03T07:02:00.000Z";
    await writeJson(path.join(stateRoot, "release-proofs/caught-up/2026-08-03.json"), proof);
    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-03T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    expect(result.measurements["state/meetings#valid_result_rate"]).toBeCloseTo(2 / 3);
    expect(result.measurements["receipts/caught-up#editions_delivered"]).toBe(1);
    expect(result.measurements["receipts/caught-up#bilingual_hero_rate"]).toBe(1);
    expect(result.measurements["receipts/delivery#pass_within_one_retry_rate"]).toBe(1);
  });

  it("never lets a missing ledger or an unconfirmed roster read better than it is", async () => {
    const { root, stateRoot } = await fixtureRoot();
    const fighter = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/fighter-record.valid.json"), "utf8")) as unknown;
    await writeJson(path.join(stateRoot, "mma/fighters/ufc:alex-example.json"), fighter);
    await writeJson(path.join(stateRoot, "mma/roster/status.json"), {
      schemaVersion: "mma-roster-status/1",
      generatedAt: "2026-08-03T06:00:00.000Z",
      organizations: {
        ufc: { active: 1, former: 0, unknown: 1 },
        oktagon: { active: 0, former: 0, unknown: 0 }
      },
      confirmedUpcomingBouts: 0,
      queuedForEnrichment: 1,
      priorityFighters: 0,
      note: "One identity is unconfirmed."
    });
    const missing = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-03T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    expect(missing.measurements["state/metrics/quarterly#maximum_monthly_api_usd"]).toBeNull();
    expect(missing.measurements["state/metrics/quarterly#maximum_monthly_all_in_usd"]).toBeNull();
    // One fighter file against a roster of one active plus one unclassified. The old
    // denominator excluded unknowns, so this exact fixture would have reported 1/1 = 100%
    // coverage with half the roster unclassified; reporting null was the guard against that.
    // Counting unknowns in the denominator removes the inflation at the source, so the
    // number can be shown without flattering anyone: 1 of 2 known fighters.
    expect(missing.measurements["state/mma/fighters#active_roster_coverage_rate"]).toBe(0.5);
    expect(
      missing.measurements["state/mma/fighters#active_roster_coverage_rate"],
      "an unconfirmed roster must never report full coverage"
    ).toBeLessThan(1);
    expect(missing.measurements["state/mma/fighters#average_completeness"]).not.toBeNull();

    await writeJson(path.join(stateRoot, "budget/ledger.json"), { schemaVersion: 1, entries: [] });
    const verifiedEmpty = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-03T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    expect(verifiedEmpty.measurements["state/metrics/quarterly#maximum_monthly_api_usd"]).toBe(0);
  });

  it("counts a template-compliant founding receipt toward the alternative company KPI", async () => {
    const { root, stateRoot } = await fixtureRoot();
    await writeJson(path.join(stateRoot, "ventures/new-brief/founding.json"), {
      schemaVersion: "template-founding-receipt/1",
      venture: "new-brief",
      proposalRef: "proposal-1",
      templateId: "content-venture-default",
      foundedAt: "2026-08-03T08:00:00.000Z",
      compliance: "passed"
    });
    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-03T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    expect(result.measurements["state/metrics/quarterly#founding_or_two_rated_proposals"]).toBe(1);
  });

  it("measures upcoming-event coverage from known bouts and rendered event cards", async () => {
    const { root, stateRoot } = await fixtureRoot();
    const event = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/event-card.valid.json"), "utf8")) as {
      id: string;
      startsAtLocal: string;
      startsAtUtc: string;
      updatedAt: string;
    };
    event.startsAtLocal = "2026-08-20T18:00:00.000Z";
    event.startsAtUtc = "2026-08-20T18:00:00.000Z";
    event.updatedAt = "2026-08-03T06:00:00.000Z";
    await writeJson(path.join(stateRoot, "mma/events/ufc/covered.json"), event);

    const boutFixture = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/bout-record.valid.json"), "utf8")) as {
      id: string;
      event: { ref: string; startsAtUtc: string };
      status: string;
      statusHistory: Array<{ status: string }>;
    };
    boutFixture.id = "ufc:bout:covered-event";
    boutFixture.event.ref = event.id;
    boutFixture.event.startsAtUtc = event.startsAtUtc;
    boutFixture.status = "announced";
    boutFixture.statusHistory.at(-1)!.status = "announced";
    await writeJson(path.join(stateRoot, "mma/bouts/ufc/covered-event.json"), boutFixture);

    const missedBout = structuredClone(boutFixture);
    missedBout.id = "ufc:bout:missing-event";
    missedBout.event.ref = "ufc:event:not-rendered";
    await writeJson(path.join(stateRoot, "mma/bouts/ufc/missing-event.json"), missedBout);

    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-21T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    expect(result.measurements["state/mma/events#announced_event_coverage_rate"]).toBe(0.5);
  });
});
