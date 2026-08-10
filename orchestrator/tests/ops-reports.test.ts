import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { BudgetLedgerEntry } from "../src/budget.js";
import { OpsReportSchema } from "../src/contracts/ops-report.js";
import {
  buildOpsReport,
  daysOfMonth,
  daysOfWeek,
  isoWeek,
  writeMonthlyReportIfDue,
  writeWeeklyReportIfDue
} from "../src/reports/writers.js";

const NOW = new Date("2026-08-10T22:00:00.000Z");

async function json(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function text(file: string, value: string) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, value);
}

const ledger: BudgetLedgerEntry[] = [
  { ts: "2026-08-03T04:00:00.000Z", usd: 0.12 },
  { ts: "2026-08-05T04:00:00.000Z", usd: 0.31 },
  // Outside the week under review.
  { ts: "2026-08-11T04:00:00.000Z", usd: 9.99 }
] as BudgetLedgerEntry[];

/** The week of 2026-08-03, with one held slot, one skip and one silent day. */
async function operatingWeek(): Promise<string> {
  const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-reports-"));
  await json(path.join(stateRoot, "calendar", "2026-08-03.json"), {
    schemaVersion: "calendar/1",
    weekOf: "2026-08-03",
    slots: [
      { at: "2026-08-03T03:00:00.000Z", kind: "cu-edition", status: "held" },
      { at: "2026-08-03T09:00:00.000Z", kind: "tt-marketing", status: "skipped" },
      { at: "2026-08-05T03:00:00.000Z", kind: "cu-edition", status: "held" }
    ]
  });
  await json(path.join(stateRoot, "meetings", "skips", "2026-08-03-tt-marketing.json"), {
    schemaVersion: "meeting-skip/1",
    date: "2026-08-03",
    phase: "tt-marketing",
    reason: "The checks on the code behind this meeting did not pass."
  });
  await json(path.join(stateRoot, "ventures", "caught-up", "content-scores", "2026-08-05.json"), {
    schemaVersion: "content-score/1",
    ventureId: "caught-up",
    date: "2026-08-05",
    items: [{ fit: 8 }, { fit: 6 }]
  });
  await text(path.join(stateRoot, "decisions", "2026-08-04-operations.md"),
    "# Operations review\n\n- [ ] Open one\n- [ ] Open two\n- [x] Closed one\n");
  await json(path.join(stateRoot, "standups", "2026-08-04-morning.json"), {
    droppedSeats: [{ agent: "FORGE", reason: "Unparsable on both attempts." }],
    operationsReview: {
      perVentureVerdicts: [{ ventureId: "caught-up", verdict: "on-track", evidence: "Delivered twice." }]
    }
  });
  return stateRoot;
}

describe("the ISO week key", () => {
  it("names the week a date belongs to and the Monday that starts it", () => {
    expect(isoWeek("2026-08-05")).toEqual({ key: "2026-W32", monday: "2026-08-03" });
    expect(isoWeek("2026-08-03")).toEqual({ key: "2026-W32", monday: "2026-08-03" });
    expect(isoWeek("2026-08-09")).toEqual({ key: "2026-W32", monday: "2026-08-03" });
    expect(isoWeek("2026-08-10").key).toBe("2026-W33");
    expect(daysOfWeek("2026-08-03")).toHaveLength(7);
    expect(daysOfMonth("2026-02")).toHaveLength(28);
  });
});

describe("a weekly report", () => {
  it("matches the ledger to the cent and names every skipped slot with its reason", async () => {
    const stateRoot = await operatingWeek();
    const report = await buildOpsReport({
      stateRoot,
      days: daysOfWeek("2026-08-03"),
      periodKey: "2026-W32",
      period: "weekly",
      now: NOW,
      capUsd: 30,
      ledger
    });

    expect(OpsReportSchema.parse(report)).toBeTruthy();
    expect(report.spend.periodUsd).toBe(0.43);
    expect(report.meetings.scheduled).toBe(3);
    expect(report.meetings.held).toBe(2);
    expect(report.meetings.skipped).toEqual([
      { date: "2026-08-03", phase: "tt-marketing", reason: "The checks on the code behind this meeting did not pass." }
    ]);
    expect(report.content.scores).toEqual({ avg: 7, worst: 6, best: 8 });
    expect(report.fixTasks).toEqual({ opened: 2, closed: 1 });
    expect(report.incidents).toEqual([
      { kind: "dropped-seat", date: "2026-08-04", note: "FORGE: Unparsable on both attempts." }
    ]);
    expect(report.perVenture).toEqual([
      { ventureId: "caught-up", verdictSummary: "on-track", outputs: 2, spendUsd: 0 }
    ]);
    // The retro room is the only writer of this field, and it has not run.
    expect(report.narrative).toBeNull();
  });

  it("names a gap week's days instead of averaging them into zero", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-reports-gap-"));
    const report = await buildOpsReport({
      stateRoot,
      days: daysOfWeek("2026-08-03"),
      periodKey: "2026-W32",
      period: "weekly",
      now: NOW,
      capUsd: 30,
      ledger: []
    });
    expect(report.meetings.missingDays).toHaveLength(7);
    expect(report.meetings.scheduled).toBe(0);
    // No content gate ran, so there is no average — not an average of zero.
    expect(report.content.scores).toBeNull();
    expect(report.quality).toBeNull();
    expect(report.perVenture).toEqual([]);
  });
});

describe("when a report is written", () => {
  it("writes the finished week on a Monday, and nothing on any other night", async () => {
    const stateRoot = await operatingWeek();
    expect(await writeWeeklyReportIfDue({
      stateRoot, today: "2026-08-09", now: NOW, ledger, capUsd: 30
    })).toBeNull();

    const monday = await writeWeeklyReportIfDue({
      stateRoot, today: "2026-08-10", now: NOW, ledger, capUsd: 30
    });
    expect(monday?.path).toBe("reports/weekly/2026-W32.json");
    // The week that finished, not the one starting.
    expect(monday?.report.periodKey).toBe("2026-W32");
    const written = JSON.parse(await readFile(path.join(stateRoot, monday!.path), "utf8"));
    expect(written.schemaVersion).toBe("ops-report/1");
  });

  it("writes the finished month on the first, and nothing on any other night", async () => {
    const stateRoot = await operatingWeek();
    expect(await writeMonthlyReportIfDue({
      stateRoot, today: "2026-09-02", now: NOW, ledger, capUsd: 30
    })).toBeNull();

    const first = await writeMonthlyReportIfDue({
      stateRoot, today: "2026-09-01", now: NOW, ledger, capUsd: 30
    });
    expect(first?.path).toBe("reports/monthly/2026-08.json");
    expect(first?.report.period).toBe("monthly");
  });
});

describe("the writer path costs nothing", () => {
  it("calls no model, the way the dataset path calls no model", async () => {
    // The same assertion the dataset producer carries: this whole path is deterministic, so it
    // sits outside the model share entirely. A future edit that reaches for a model fails here.
    const call = await import("../src/llm/call.js");
    const guarded = vi.spyOn(call, "guardedJsonCall");
    const stateRoot = await operatingWeek();
    await writeWeeklyReportIfDue({ stateRoot, today: "2026-08-10", now: NOW, ledger, capUsd: 30 });
    expect(guarded).not.toHaveBeenCalled();
    guarded.mockRestore();

    const source = await readFile(
      new URL("../src/reports/writers.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/guardedJsonCall|guardedVisionCall|anthropic|openai/i);
  });
});
