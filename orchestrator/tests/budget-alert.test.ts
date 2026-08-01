import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allInBudgetStatus, assertAllInSpendAvailable, budgetWarningLine, sendBudgetAlert, threeConsecutiveExhaustions, type AllInCostEntry } from "../src/finance/budget-alert.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const costs = (amounts: Array<[string, number]>): AllInCostEntry[] => amounts.map(([ventureId, usd], index) => ({ at: "2026-08-15T10:00:00.000Z", ventureId, category: index ? "service" : "model", usd, ref: `cost-${index}` }));

describe("one all-in budget conversation", () => {
  it("warns at 80 percent with a project breakdown and blocks spend beyond the cap", () => {
    const status = allInBudgetStatus(costs([["caught-up", 20], ["mma-files", 20]]), "2026-08", 50);
    expect(status).toMatchObject({ spentUsd: 40, ratio: 0.8, warning: true, exhausted: false, byVenture: { "caught-up": 20, "mma-files": 20 } });
    expect(budgetWarningLine(status)).toContain("caught-up: $20.00");
    expect(() => assertAllInSpendAvailable(status, 10)).not.toThrow();
    expect(() => assertAllInSpendAvailable(status, 10.01)).toThrow(/Hard monthly/);
  });

  it("sends one immediate alert and opens one owner item at exhaustion", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-budget-alert-"));
    roots.push(root);
    const send = vi.fn(async () => undefined);
    const status = allInBudgetStatus(costs([["caught-up", 25], ["mma-files", 25]]), "2026-08", 50);
    const input = { root, status, dailyExhaustionDates: [], sink: { mode: "log" as const, send }, now: new Date("2026-08-15T10:00:00.000Z") };
    expect(await sendBudgetAlert(input)).toBe("sent");
    expect(await sendBudgetAlert(input)).toBe("sent");
    expect(send).toHaveBeenCalledTimes(1);
    const inbox = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(inbox.match(/BUDGET-EXHAUSTED-2026-08/g)).toHaveLength(1);
    expect(inbox).toContain("cannot raise or move the limit");
  });

  it("also stops after three consecutive daily exhaustions", () => {
    expect(threeConsecutiveExhaustions(["2026-08-01", "2026-08-02", "2026-08-03"])).toBe(true);
    expect(threeConsecutiveExhaustions(["2026-08-01", "2026-08-03", "2026-08-04"])).toBe(false);
  });
});
