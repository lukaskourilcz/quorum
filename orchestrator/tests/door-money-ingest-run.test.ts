import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  BudgetLedgerEntrySchema,
  DEFAULT_BUDGET_LIMITS,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../src/budget.js";
import { atomicWriteJson, readJson } from "../src/state.js";
import { dryBookIngestCall } from "../src/ventures/door-money/ingest/dry-fixture.js";
import {
  BOOK_INGEST_DAY_CAP_USD,
  BOOK_INGEST_PROGRAM_CAP_USD
} from "../src/ventures/door-money/ingest/envelope.js";
import {
  MemoryBookIngestPrivateStore,
  runBookIngest
} from "../src/ventures/door-money/ingest/run.js";

const fixturePath = path.join(process.cwd(), "tests/fixtures/door-money/synthetic-diary.md");
let fixture = "";

beforeAll(async () => {
  fixture = await readFile(fixturePath, "utf8");
});

async function roots(): Promise<{ state: string; private: string; cleanup: () => Promise<void> }> {
  const root = await mkdtemp(path.join(tmpdir(), "door-money-ingest-run-"));
  return {
    state: path.join(root, "state"),
    private: path.join(root, "private"),
    cleanup: () => rm(root, { recursive: true, force: true })
  };
}

function reserveContext(now: Date) {
  return async (entries: readonly BudgetLedgerEntry[], cycleId: string): Promise<ReserveContext> => ({
    now,
    cycleId,
    stage: "DISCOVERY",
    ledger: entries,
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: 1,
    limits: { ...DEFAULT_BUDGET_LIMITS, dailyUsd: 1, monthlyApiUsd: 25, monthlyOperatingUsd: 30 }
  });
}

function ledgerEntry(input: { ts: string; usd: number; requestHash: string }): BudgetLedgerEntry {
  return BudgetLedgerEntrySchema.parse({
    ts: input.ts,
    cycleId: "prior-book-ingest",
    requestHash: input.requestHash,
    phase: "book-ingest",
    ventureId: "door-money",
    agent: "BOOK_INGEST",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    serviceTier: "default",
    tokensIn: 1,
    cachedTokensIn: 0,
    tokensOut: 1,
    toolUses: 0,
    usd: input.usd,
    kind: "text"
  });
}

describe("Door Money ingestion runner", () => {
  it("runs the complete synthetic fixture at zero dollars and keeps private artifacts in its sink", async () => {
    const root = await roots();
    try {
      const now = new Date("2026-08-12T10:00:00.000Z");
      const store = new MemoryBookIngestPrivateStore();
      const report = await runBookIngest({
        source: fixture,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: store,
        approved: false,
        dry: true,
        now,
        reserveContext: reserveContext(now)
      });

      expect(report).toMatchObject({
        status: "complete",
        reason: null,
        dry: true,
        reused: false,
        actualUsd: 0,
        dayUsd: 0,
        programUsd: 0,
        calls: 15,
        coverage: {
          chapters: 2,
          chunks: 8,
          annotations: 8,
          embeddings: 8,
          styleExemplars: 8
        }
      });
      expect(report.manuscriptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      const stored = store.versions.get(report.manuscriptHash!);
      expect(stored?.artifacts.chunked.chunks).toHaveLength(8);
      expect(stored?.artifacts.embeddings).toHaveLength(8);
      expect(await readJson(root.state, "budget/ledger.json", null)).toBeNull();

      const replay = await runBookIngest({
        source: fixture,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: store,
        approved: false,
        dry: true,
        now,
        reserveContext: reserveContext(now)
      });
      expect(replay).toEqual({ ...report, reused: true });
      expect(store.versions).toHaveLength(1);
    } finally {
      await root.cleanup();
    }
  });

  it("refuses at the daily sub-envelope before the first fixture call", async () => {
    const root = await roots();
    try {
      const now = new Date("2026-08-12T10:00:00.000Z");
      await atomicWriteJson(root.state, "budget/ledger.json", {
        schemaVersion: 1,
        entries: [ledgerEntry({
          ts: now.toISOString(),
          usd: BOOK_INGEST_DAY_CAP_USD,
          requestHash: "prior-day-cap"
        })]
      });
      let calls = 0;
      const report = await runBookIngest({
        source: fixture,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: new MemoryBookIngestPrivateStore(),
        approved: false,
        dry: true,
        now,
        reserveContext: reserveContext(now),
        call: async (request) => {
          calls += 1;
          return dryBookIngestCall(request);
        }
      });
      expect(report).toMatchObject({
        status: "refused",
        actualUsd: 0,
        calls: 0,
        dayUsd: BOOK_INGEST_DAY_CAP_USD
      });
      expect(report.reason).toMatch(/day cap.*cursor is preserved/u);
      expect(calls).toBe(0);
    } finally {
      await root.cleanup();
    }
  });

  it("refuses a spent program envelope and missing live approvals without calling a model", async () => {
    const root = await roots();
    try {
      const now = new Date("2026-08-12T10:00:00.000Z");
      await atomicWriteJson(root.state, "budget/ledger.json", {
        schemaVersion: 1,
        entries: [ledgerEntry({
          ts: "2026-08-11T10:00:00.000Z",
          usd: BOOK_INGEST_PROGRAM_CAP_USD + 0.01,
          requestHash: "prior-program-cap"
        })]
      });
      const store = new MemoryBookIngestPrivateStore();
      const programRefusal = await runBookIngest({
        source: fixture,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: store,
        approved: true,
        dry: false,
        now,
        reserveContext: reserveContext(now)
      });
      expect(programRefusal).toMatchObject({ status: "refused", actualUsd: 0, calls: 0 });
      expect(programRefusal.reason).toMatch(/program cap.*nothing was spent/u);

      await atomicWriteJson(root.state, "budget/ledger.json", { schemaVersion: 1, entries: [] });
      const approvalRefusal = await runBookIngest({
        source: fixture,
        stateRoot: root.state,
        privateRoot: root.private,
        privateStore: store,
        approved: false,
        dry: false,
        now,
        reserveContext: reserveContext(now)
      });
      expect(approvalRefusal).toMatchObject({ status: "refused", actualUsd: 0, calls: 0 });
      expect(approvalRefusal.reason).toContain("not both countersigned");
    } finally {
      await root.cleanup();
    }
  });
});
