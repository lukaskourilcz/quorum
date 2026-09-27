import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFICE_MODE_PATH,
  allInBudgetStatus,
  officeIsReadOnly,
  sendBudgetAlert,
  sendBudgetPaceWarning,
  writeOfficeMode,
  type AllInCostEntry,
  type OfficeMode
} from "../src/finance/budget-alert.js";

const NOW = new Date("2026-09-16T08:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const created = await mkdtemp(path.join(tmpdir(), "boardless-office-mode-"));
  roots.push(created);
  return created;
}

function status(spentUsd: number, month = "2026-09") {
  const costs: AllInCostEntry[] = [{
    at: `${month}-05T10:00:00.000Z`,
    ventureId: "caught-up",
    category: "model",
    usd: spentUsd,
    ref: "cost-1"
  }];
  return allInBudgetStatus(costs, month, 50);
}

async function officeMode(stateDir: string): Promise<OfficeMode> {
  return JSON.parse(await readFile(path.join(stateDir, OFFICE_MODE_PATH), "utf8")) as OfficeMode;
}

describe("the office goes read-only when the month's limit is spent", () => {
  it("writes read-only at the cap and open below it", async () => {
    const stateDir = await root();
    expect(await writeOfficeMode({ root: stateDir, status: status(50), now: NOW })).toBe("read-only");
    expect(await officeMode(stateDir)).toMatchObject({
      schemaVersion: 1,
      mode: "read-only",
      month: "2026-09",
      spentUsd: 50,
      capUsd: 50
    });
    expect(await writeOfficeMode({ root: stateDir, status: status(41), now: NOW })).toBe("open");
    expect((await officeMode(stateDir)).mode).toBe("open");
  });

  it("keeps the timestamp of the transition, not of the last look", async () => {
    const stateDir = await root();
    await writeOfficeMode({ root: stateDir, status: status(50), now: NOW });
    await writeOfficeMode({
      root: stateDir,
      status: status(50),
      now: new Date("2026-09-17T08:00:00.000Z")
    });
    expect((await officeMode(stateDir)).since).toBe(NOW.toISOString());
  });

  it("closes the office for its own month only", async () => {
    const closed = { schemaVersion: 1, mode: "read-only", month: "2026-09" };
    expect(officeIsReadOnly(closed, "2026-09")).toBe(true);
    // The next month opens the office with no manual step and no second decision.
    expect(officeIsReadOnly(closed, "2026-10")).toBe(false);
    expect(officeIsReadOnly({ ...closed, mode: "open" }, "2026-09")).toBe(false);
  });

  it("reads every unusable shape as open", async () => {
    // A malformed flag must not be able to halt the company. The rungs that actually refuse
    // spending are untouched either way, so a strict read here could only buy an outage.
    for (const record of [null, undefined, "read-only", 3, [], {}, { mode: "read-only" }]) {
      expect(officeIsReadOnly(record, "2026-09")).toBe(false);
    }
  });

  it("is written by the daily alert on both sides of the limit", async () => {
    const stateDir = await root();
    const send = vi.fn(async () => undefined);
    const sink = { mode: "log" as const, send };
    expect(await sendBudgetAlert({
      root: stateDir,
      status: status(20),
      dailyExhaustionDates: [],
      sink,
      now: NOW
    })).toBe("not-needed");
    expect((await officeMode(stateDir)).mode).toBe("open");
    expect(await sendBudgetAlert({
      root: stateDir,
      status: status(50),
      dailyExhaustionDates: [],
      sink,
      now: NOW
    })).toBe("sent");
    expect((await officeMode(stateDir)).mode).toBe("read-only");
  });

  it("does not let the accumulating three-day history close the office forever", async () => {
    // budget/exhaustions.json keeps every exhausted date for the life of the repository, so
    // threeConsecutiveExhaustions stays true once any three consecutive days have ever hit the
    // pace. That rule still sends the alert; it must never be what makes the office read-only.
    const stateDir = await root();
    await sendBudgetAlert({
      root: stateDir,
      status: status(20),
      dailyExhaustionDates: ["2026-08-01", "2026-08-02", "2026-08-03"],
      sink: { mode: "log" as const, send: vi.fn(async () => undefined) },
      now: NOW
    });
    expect((await officeMode(stateDir)).mode).toBe("open");
  });
});

describe("the owner hears about the month at 80 percent, not only at the limit", () => {
  it("opens one notice between 80 percent and the limit, and only one", async () => {
    const stateDir = await root();
    const input = { root: stateDir, status: status(40), now: NOW };
    expect(await sendBudgetPaceWarning(input)).toBe("opened");
    expect(await sendBudgetPaceWarning(input)).toBe("already-open");
    const inbox = await readFile(path.join(stateDir, "INBOX.md"), "utf8");
    expect(inbox.match(/BUDGET-PACE-2026-09/gu)).toHaveLength(1);
    expect(inbox).toContain("caught-up: $40.00");
    expect(inbox).toContain("no approval is needed");
  });

  it("says nothing below 80 percent", async () => {
    const stateDir = await root();
    expect(await sendBudgetPaceWarning({ root: stateDir, status: status(39.9), now: NOW }))
      .toBe("not-needed");
    await expect(readFile(path.join(stateDir, "INBOX.md"), "utf8")).rejects.toThrow();
  });

  it("stands down at the limit so the owner gets one item, not two", async () => {
    const stateDir = await root();
    expect(await sendBudgetPaceWarning({ root: stateDir, status: status(50), now: NOW }))
      .toBe("not-needed");
    await sendBudgetAlert({
      root: stateDir,
      status: status(50),
      dailyExhaustionDates: [],
      sink: { mode: "log" as const, send: vi.fn(async () => undefined) },
      now: NOW
    });
    const inbox = await readFile(path.join(stateDir, "INBOX.md"), "utf8");
    expect(inbox).not.toContain("BUDGET-PACE-");
    expect(inbox.match(/BUDGET-EXHAUSTED-2026-09/gu)).toHaveLength(1);
  });
});
