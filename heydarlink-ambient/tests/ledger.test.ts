import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Budget, emptyLedger, ledgerPath, readLedger, shiftDate, writeLedger } from "../src/ledger.js";

const charge = (usd: number, dryRun = false) => ({
  persona: "nina" as const,
  shotId: "nina-cafe-latte",
  aspect: "4:5" as const,
  kind: "render" as const,
  provider: "fal",
  model: "fal-ai/flux/dev",
  usd,
  dryRun
});

describe("the daily cap", () => {
  it("records a charge that fits and refuses one that would cross the cap, recording nothing", () => {
    const ledger = emptyLedger();
    const budget = new Budget(ledger, "2026-11-08", 0.12);
    expect(budget.reserve(charge(0.05))).toBe(true);
    expect(budget.reserve(charge(0.05))).toBe(true);
    expect(budget.reserve(charge(0.05))).toBe(false);
    expect(ledger.spend).toHaveLength(2);
    expect(budget.spentToday()).toBeCloseTo(0.1, 6);
    expect(budget.remaining()).toBeCloseTo(0.02, 6);
  });

  it("counts dry runs, because the renderer bills a rehearsal the same as a real run", () => {
    const ledger = emptyLedger();
    const budget = new Budget(ledger, "2026-11-08", 0.1);
    expect(budget.reserve(charge(0.075, true))).toBe(true);
    expect(budget.reserve(charge(0.05))).toBe(false);
  });

  it("starts each UTC day fresh and lets a charge land exactly on the cap", () => {
    const ledger = emptyLedger();
    expect(new Budget(ledger, "2026-11-07", 1).reserve(charge(1))).toBe(true);
    const today = new Budget(ledger, "2026-11-08", 1);
    expect(today.spentToday()).toBe(0);
    expect(today.reserve(charge(1))).toBe(true);
    expect(today.reserve(charge(0.000001))).toBe(false);
  });
});

describe("the ledger file", () => {
  it("round-trips, prunes records past the retention window, and treats a missing file as a first run", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ambient-ledger-"));
    expect(await readLedger(dir)).toEqual(emptyLedger());
    const ledger = emptyLedger();
    new Budget(ledger, "2026-07-01", 1).reserve(charge(0.05));
    new Budget(ledger, "2026-11-08", 1).reserve(charge(0.05));
    ledger.rotation.nina = { used: ["nina-cafe-latte"] };
    await writeLedger(dir, ledger, "2026-11-08");
    const back = await readLedger(dir);
    expect(back.spend.map((entry) => entry.date)).toEqual(["2026-11-08"]);
    expect(back.rotation.nina!.used).toEqual(["nina-cafe-latte"]);
  });

  it("stops on a malformed file instead of forgetting the day's spend", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ambient-ledger-"));
    await writeFile(ledgerPath(dir), JSON.stringify({ schemaVersion: 1, spend: "lots" }));
    await expect(readLedger(dir)).rejects.toThrow();
    expect(JSON.parse(await readFile(ledgerPath(dir), "utf8")).spend).toBe("lots");
  });

  it("shifts dates across month ends", () => {
    expect(shiftDate("2026-11-08", -90)).toBe("2026-08-10");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
  });
});
