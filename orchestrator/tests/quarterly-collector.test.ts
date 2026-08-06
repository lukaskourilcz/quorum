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

function ledgerEntry(ts: string, phase: string, usd: number) {
  return {
    ts,
    cycleId: `cycle-${ts}`,
    requestHash: "a".repeat(64),
    phase,
    agent: "JAB",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    serviceTier: "default",
    tokensIn: 100,
    cachedTokensIn: 0,
    tokensOut: 50,
    toolUses: 0,
    usd,
    kind: "text"
  };
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
  it("counts only valid window outcomes and validated Caught Up deliveries", async () => {
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
    expect(result.measurements["receipts/caught-up#published_hero_rate"]).toBe(1);
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

describe("the published-hero measure counts what the desk promises", () => {
  it("does not read a synthetic english-absent pass as a delivery", async () => {
    // The measure counted english-route among its passing checks. A Czech-only package records
    // english-absent instead, so the old measure would have gone on reporting success for a
    // locale nobody was served — a check that passes because nothing was asked of it is not a
    // delivery. It now counts the Czech page and the hero image, and nothing else.
    const { root, stateRoot } = await fixtureRoot();
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
      checks: Array<{ name: string; checkedAt: string; detail: string }>;
    };
    proof.startedAt = "2026-08-03T07:01:00.000Z";
    proof.completedAt = "2026-08-03T07:03:00.000Z";
    for (const check of proof.checks) check.checkedAt = "2026-08-03T07:02:00.000Z";
    const english = proof.checks.find((check) => check.name === "english-route");
    if (english) {
      english.name = "english-absent";
      english.detail = "This package has no English locale";
    }
    await writeJson(path.join(stateRoot, "release-proofs/caught-up/2026-08-03.json"), proof);
    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-03T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });
    expect(proof.checks.some((check) => check.name === "english-route")).toBe(false);
    expect(result.measurements["receipts/caught-up#published_hero_rate"]).toBe(1);
  });
});

/**
 * The seven measures added for the magazines and Titty Tuesdays had no test, which is how
 * `article-am`/`article-pm` — calendar slot names that have never appeared in the budget ledger
 * — sat in the cost-per-article numerator through a green suite, reporting an article at
 * $0.0302 when it cost $0.0724.
 */
describe("the per-magazine measures read what the runtime actually writes", () => {
  it("costs an article from the phase the article run bills under", async () => {
    const { root, stateRoot } = await fixtureRoot();
    const article = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/article.valid.json"), "utf8")) as Record<string, unknown>;
    article.publishAt = "2026-08-04T08:00:00.000Z";
    article.status = "published";
    await writeJson(path.join(stateRoot, "ventures/mma-files/articles/2026-08-04-am-x.json"), article);
    await writeJson(path.join(stateRoot, "budget/ledger.json"), {
      schemaVersion: 1,
      entries: [
        ledgerEntry("2026-08-04T08:00:00.000Z", "article-production", 0.05),
        ledgerEntry("2026-08-04T09:00:00.000Z", "mag-editorial", 0.01),
        ledgerEntry("2026-08-04T20:00:00.000Z", "mag-desk", 0.01),
        // Never the calendar slot name: nothing bills under it.
        ledgerEntry("2026-08-04T10:00:00.000Z", "article-am", 9.99)
      ]
    });

    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-05T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });

    expect(result.measurements["state/budget#mma_files_cost_per_article_usd"]).toBeCloseTo(0.07, 5);
  });

  it("does not count a delivered no-edition notice as an edition", async () => {
    const { root, stateRoot } = await fixtureRoot();
    const receipt = (date: string, editionStatus: string, hash: string) => ({
      schemaVersion: 1,
      date,
      packageHash: hash.repeat(64).slice(0, 64),
      status: "delivered",
      editionStatus,
      targetRepository: "lukaskourilcz/aifirst",
      targetCommit: "b".repeat(40),
      deliveredAt: `${date}T07:00:00.000Z`,
      tags: []
    });
    await writeJson(path.join(stateRoot, "edition/deliveries/2026-08-03.json"), receipt("2026-08-03", "edition", "a"));
    await writeJson(path.join(stateRoot, "edition/deliveries/2026-08-04.json"), receipt("2026-08-04", "no_edition", "c"));
    await writeJson(path.join(stateRoot, "budget/ledger.json"), {
      schemaVersion: 1,
      entries: [ledgerEntry("2026-08-03T05:00:00.000Z", "cu-edition", 0.2)]
    });

    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-05T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });

    // A gated $0 outcome is a success and it is not an edition.
    expect(result.measurements["receipts/caught-up#editions_delivered"]).toBe(1);
    expect(result.measurements["state/budget#caught_up_cost_per_edition_usd"]).toBeCloseTo(0.2, 5);
  });

  it("counts Titty Tuesdays ideas, not ledger lines", async () => {
    const { root, stateRoot } = await fixtureRoot();
    const line = (id: string, status: string, at: string) => JSON.stringify({
      id, status, createdAt: at, statusHistory: [{ status: "proposed", at }]
    });
    await mkdir(path.join(stateRoot, "ideas/titty-tuesdays"), { recursive: true });
    await writeFile(
      path.join(stateRoot, "ideas/titty-tuesdays/ledger.jsonl"),
      [
        line("idea-1", "proposed", "2026-08-04T10:00:00.000Z"),
        // The same idea advancing appends a second line; it is one idea.
        line("idea-1", "accepted", "2026-08-04T11:00:00.000Z"),
        line("idea-2", "proposed", "2026-08-05T10:00:00.000Z")
      ].join("\n") + "\n"
    );

    const result = await collectQuarterlyMeasurements({
      repoRoot: root,
      stateRoot,
      kpiSet,
      now: new Date("2026-08-06T12:00:00.000Z"),
      metricsIngestionEnabled: false,
      mmaFilesIndexingEnabled: false
    });

    expect(result.measurements["state/ideas/titty-tuesdays#advanced_count"]).toBe(1);
  });
});
