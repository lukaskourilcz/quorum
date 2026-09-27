import { copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CostReportSchema } from "../src/contracts/cost-report.js";
import { buildCostReport, newestLedgerMonth, RECONCILIATION_TOLERANCE_USD } from "../src/finance/cost-report.js";
import { writeCostReport, COST_REPORT_RELATIVE_PATH } from "../src/finance/cost-report-cli.js";
import { repoRoot } from "../src/paths.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";
import type { BudgetLedgerEntry } from "../src/budget.js";

const registry = await loadVentureRegistry();

function row(over: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    ts: "2026-09-13T03:00:38.000Z",
    cycleId: "20260913030038-cu-edition",
    requestHash: "abcdef0123456789",
    phase: "cu-edition",
    ventureId: "caught-up",
    agent: "HERALD",
    provider: "anthropic",
    model: "claude-sonnet-5",
    serviceTier: "default",
    tokensIn: 100,
    cachedTokensIn: 0,
    tokensOut: 50,
    toolUses: 0,
    usd: 0.18,
    kind: "text",
    ...over
  };
}

function report(over: Partial<Parameters<typeof buildCostReport>[0]> = {}) {
  return buildCostReport({
    generatedAt: "2026-09-16T12:00:00.000Z",
    month: "2026-09",
    budgetEntries: [row()],
    decisions: [{ cycleId: "20260913030038-cu-edition", phase: "cu-edition", outcome: "EDITION", generatedAt: "2026-09-13T03:01:00.000Z" }],
    deliveries: [{ date: "2026-09-13", status: "delivered", articleUrl: "https://example.invalid/a", packageHash: "0".repeat(64) }],
    envelopes: [{ cycleId: "20260913030038-cu-edition", estimatedWorstCaseUsd: 0.58 }],
    registry,
    billed: null,
    billingDetail: "PROVIDER_BILLING_ENABLED is not set, so no billing request was made.",
    unreadable: { decisions: 0, deliveries: 0, envelopes: 0, ledgerRows: 0 },
    ...over
  });
}

describe("cost report", () => {
  it("publishes the month's join and satisfies its own contract", () => {
    const built = report();
    expect(CostReportSchema.safeParse(built).success).toBe(true);
    expect(built.metered.total).toEqual({ totalUsd: 0.18, modelUsd: 0.18, mediaUsd: 0, calls: 1 });
    expect(built.metered.editions[0]!.cost!.totalUsd).toBe(0.18);
    expect(built.metered.decisions[0]!.cost!.totalUsd).toBe(0.18);
    expect(built.metered.envelopes[0]!.comparable!.envelopeUsd).toBe(0.58);
  });

  it("ships the billed figure as unavailable rather than as a confident zero", () => {
    // A $0.00 billed figure beside a $0.18 metered one is a number nobody can act on. The finance
    // page already draws this line for revenue; the billed column follows the same rule.
    const built = report();
    expect(built.billed).toBeNull();
    expect(built.reconciliation).toEqual({
      status: "unavailable",
      meteredUsd: 0.18,
      billedUsd: null,
      differenceUsd: null,
      toleranceUsd: RECONCILIATION_TOLERANCE_USD,
      note: "PROVIDER_BILLING_ENABLED is not set, so no billing request was made."
    });
  });

  it("refuses a reconciliation that claims a billed figure it does not hold", () => {
    const built = report();
    expect(CostReportSchema.safeParse({
      ...built,
      reconciliation: { ...built.reconciliation, status: "reconciled" }
    }).success).toBe(false);
    expect(CostReportSchema.safeParse({
      ...built,
      reconciliation: { ...built.reconciliation, billedUsd: 0 }
    }).success).toBe(false);
  });

  it("reconciles inside the recorded tolerance and calls anything beyond it a mismatch", () => {
    const billed = (totalUsd: number) => ({
      source: "anthropic-cost-report" as const,
      fetchedAt: "2026-09-16T12:00:00.000Z",
      month: "2026-09",
      currency: "USD" as const,
      totalUsd,
      days: [{ date: "2026-09-13", usd: totalUsd }]
    });
    expect(report({ billed: billed(0.185) }).reconciliation.status).toBe("reconciled");
    const mismatch = report({ billed: billed(0.5) }).reconciliation;
    expect(mismatch.status).toBe("mismatch");
    expect(mismatch.differenceUsd).toBe(-0.32);
  });

  it("refuses a billed record for a month the report does not cover", () => {
    const built = report();
    expect(CostReportSchema.safeParse({
      ...built,
      billed: { source: "anthropic-cost-report", fetchedAt: "2026-09-16T12:00:00.000Z", month: "2026-08", currency: "USD", totalUsd: 1, days: [] },
      reconciliation: { ...built.reconciliation, status: "mismatch", billedUsd: 1, differenceUsd: -0.82 }
    }).success).toBe(false);
  });

  it("carries the unreadable counts through instead of quietly shrinking a total", () => {
    expect(report({ unreadable: { decisions: 2, deliveries: 1, envelopes: 3, ledgerRows: 4 } }).unreadable)
      .toEqual({ decisions: 2, deliveries: 1, envelopes: 3, ledgerRows: 4 });
  });

  it("leaves another month's records out of this month's report", () => {
    const built = report({
      budgetEntries: [row({ cycleId: "20260813030038-cu-edition", ts: "2026-08-13T03:00:38.000Z" })],
      decisions: [{ cycleId: "20260813030038-cu-edition", phase: "cu-edition", outcome: "EDITION", generatedAt: "2026-08-13T03:01:00.000Z" }],
      deliveries: [{ date: "2026-08-13", status: "delivered" }]
    });
    expect(built.metered.total).toEqual({ totalUsd: 0, modelUsd: 0, mediaUsd: 0, calls: 0 });
    expect(built.metered.decisions).toEqual([]);
    expect(built.metered.editions).toEqual([]);
    expect(built.metered.envelopes).toEqual([]);
  });

  it("reports the newest month the ledger carries, not the calendar's", () => {
    // A report generated at 00:03 on the first would otherwise publish an empty page about a
    // month nothing has happened in yet, over a full month that had just closed.
    expect(newestLedgerMonth([row({ cycleId: "20260813030038-cu-edition" }), row()])).toBe("2026-09");
    expect(newestLedgerMonth([row({ cycleId: "fixture-cu-edition" })])).toBeNull();
  });
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "cost-report-"));
  await mkdir(path.join(root, "state", "budget"), { recursive: true });
  await mkdir(path.join(root, "state", "decisions"), { recursive: true });
  await mkdir(path.join(root, "state", "edition", "deliveries"), { recursive: true });
  await mkdir(path.join(root, "state", "scorecards"), { recursive: true });
  await mkdir(path.join(root, "config"), { recursive: true });
  await copyFile(path.join(repoRoot, "config", "ventures.json"), path.join(root, "config", "ventures.json"));
  const write = (relative: string, value: unknown) =>
    writeFile(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
  await write("state/budget/ledger.json", {
    schemaVersion: 1,
    entries: [
      row(),
      row({ cycleId: "20260913030038-cu-edition", usd: 0.01, kind: "image", phase: "image_gate", agent: "FRAME" }),
      // A row the contract cannot parse: counted, never guessed at.
      { cycleId: "20260913030038-cu-edition", usd: 5 }
    ]
  });
  await write("state/decisions/20260913030038-cu-edition.json", {
    schemaVersion: 1,
    cycleId: "20260913030038-cu-edition",
    phase: "cu-edition",
    outcome: "EDITION",
    generatedAt: "2026-09-13T03:01:00.000Z"
  });
  await write("state/decisions/20260913040044-morning.json", { schemaVersion: 1, cycleId: "" });
  await write("state/edition/deliveries/2026-09-13.json", {
    schemaVersion: 1,
    date: "2026-09-13",
    status: "delivered",
    packageHash: "0".repeat(64),
    articleUrl: "https://example.invalid/a"
  });
  await write("state/scorecards/20260913030038-cu-edition.json", {
    schemaVersion: 1,
    fixture: false,
    cycleId: "20260913030038-cu-edition",
    phase: "cu-edition",
    estimatedWorstCaseUsd: 0.58,
    actualUsd: 0.18
  });
  // A dry rehearsal costs $0 and must not enter a month's comparison.
  await write("state/scorecards/20260914030038-cu-edition.json", {
    schemaVersion: 1,
    fixture: true,
    cycleId: "20260914030038-cu-edition",
    phase: "cu-edition",
    estimatedWorstCaseUsd: 0.58
  });
  return root;
}

describe("cost report cli", () => {
  it("writes state/money/cost-report.json from the committed records", async () => {
    const root = await fixtureRoot();
    const written = await writeCostReport({ root, now: new Date("2026-09-16T12:00:00.000Z") });
    const onDisk = JSON.parse(await readFile(path.join(root, "state", COST_REPORT_RELATIVE_PATH), "utf8")) as unknown;
    expect(onDisk).toEqual(written);
    expect(CostReportSchema.safeParse(onDisk).success).toBe(true);
    expect(written.month).toBe("2026-09");
    expect(written.metered.total).toEqual({ totalUsd: 0.19, modelUsd: 0.18, mediaUsd: 0.01, calls: 2 });
    expect(written.metered.editions[0]!.cost!.totalUsd).toBe(0.19);
    expect(written.metered.envelopes[0]!.comparable).toEqual({
      cycles: 1,
      envelopeUsd: 0.58,
      meteredUsd: 0.19,
      varianceUsd: -0.39,
      overspentCycles: 0
    });
  });

  it("counts every record it could not read instead of dropping it silently", async () => {
    const root = await fixtureRoot();
    const written = await writeCostReport({ root, now: new Date("2026-09-16T12:00:00.000Z") });
    expect(written.unreadable).toEqual({ decisions: 1, deliveries: 0, envelopes: 0, ledgerRows: 1 });
    expect(written.metered.decisions).toHaveLength(1);
  });

  it("makes no billing request and publishes no billed figure by default", async () => {
    const root = await fixtureRoot();
    const written = await writeCostReport({ root, now: new Date("2026-09-16T12:00:00.000Z") });
    expect(written.billed).toBeNull();
    expect(written.reconciliation.status).toBe("unavailable");
    expect(written.reconciliation.note).toContain("PROVIDER_BILLING_ENABLED");
  });

  it("produces the same file twice from the same records", async () => {
    const root = await fixtureRoot();
    const now = new Date("2026-09-16T12:00:00.000Z");
    expect(await writeCostReport({ root, now })).toEqual(await writeCostReport({ root, now }));
  });
});
