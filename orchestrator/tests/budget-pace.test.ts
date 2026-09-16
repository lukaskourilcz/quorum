import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_LIMITS, type BudgetLedgerEntry } from "../src/budget.js";
import {
  DAILY_PACE_NOTICE_RATIO,
  addInboxOnce,
  dailyPaceNoticeId,
  dailyPaceReached,
  recordDailyPaceNotice
} from "../src/finance/budget-alert.js";
import { guardedJsonCall } from "../src/llm/call.js";
import { atomicWriteJson } from "../src/state.js";

/**
 * The 80 percent notice: one owner item per calendar day, written the moment the ledger crosses
 * the share, and never a second time that day. It is a notice, so it carries the INBOX kind the
 * digest uses for informational items rather than HUMAN_APPROVAL.
 */

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const now = new Date("2026-09-16T13:05:00.000Z");
const limits = { ...DEFAULT_BUDGET_LIMITS, dailyUsd: 0.7 };

function entry(usd: number, index: number, ts = now.toISOString()): BudgetLedgerEntry {
  return {
    ts,
    cycleId: `cycle-${index}`,
    requestHash: `hash-${index}-00000000`,
    phase: "gv-brief",
    agent: "ANGLE",
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

async function inbox(root: string): Promise<string> {
  return readFile(path.join(root, "INBOX.md"), "utf8").catch(() => "");
}

describe("the daily pace threshold", () => {
  it("is exactly 80 percent, and survives the cap being a binary fraction", () => {
    expect(DAILY_PACE_NOTICE_RATIO).toBe(0.8);
    expect(dailyPaceReached({ spentUsd: 0.553, capUsd: 0.7 })).toBe(false);
    // 0.7 × 0.8 is 0.5599999999999999 in binary; $0.56 on the ledger still reaches it.
    expect(dailyPaceReached({ spentUsd: 0.56, capUsd: 0.7 })).toBe(true);
    expect(dailyPaceReached({ spentUsd: 0.8, capUsd: 1 })).toBe(true);
    expect(dailyPaceReached({ spentUsd: 0.79, capUsd: 1 })).toBe(false);
    // A cap of nothing is not a cap that is always reached.
    expect(dailyPaceReached({ spentUsd: 0.5, capUsd: 0 })).toBe(false);
  });
});

describe("the once-a-day notice", () => {
  it("writes nothing at 79 percent, one item at 80, and nothing on a repeat", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-pace-"));
    roots.push(root);
    const ledger = [entry(0.3, 1), entry(0.253, 2)];
    expect(await recordDailyPaceNotice({ root, ledger, now, limits })).toBe("not-reached");
    expect(await inbox(root)).toBe("");

    const reached = [...ledger, entry(0.007, 3)];
    expect(await recordDailyPaceNotice({ root, ledger: reached, now, limits })).toBe("recorded");
    const written = await inbox(root);
    expect(written).toContain(`- [ ] INBOX ${dailyPaceNoticeId("2026-09-16")} — `);
    expect(written).toContain("80 % of the $0.70 daily cap");
    expect(written).toContain("A notice, not an approval");
    expect(written).not.toContain("HUMAN_APPROVAL BUDGET-PACE");

    const later = new Date("2026-09-16T18:40:00.000Z");
    expect(await recordDailyPaceNotice({ root, ledger: [...reached, entry(0.1, 4, later.toISOString())], now: later, limits })).toBe("already-recorded");
    expect((await inbox(root)).match(/BUDGET-PACE-2026-09-16/g)).toHaveLength(1);
  });

  it("keys the notice on the cap's own day, so the next UTC day gets its own", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-pace-days-"));
    roots.push(root);
    const nextDay = new Date("2026-09-17T09:00:00.000Z");
    expect(await recordDailyPaceNotice({ root, ledger: [entry(0.6, 1)], now, limits })).toBe("recorded");
    // Yesterday's spend is not today's: today has to reach the share on its own entries.
    expect(await recordDailyPaceNotice({ root, ledger: [entry(0.6, 1)], now: nextDay, limits })).toBe("not-reached");
    expect(await recordDailyPaceNotice({ root, ledger: [entry(0.6, 1), entry(0.6, 2, nextDay.toISOString())], now: nextDay, limits })).toBe("recorded");
    const written = await inbox(root);
    expect(written).toContain("BUDGET-PACE-2026-09-16");
    expect(written).toContain("BUDGET-PACE-2026-09-17");
  });

  it("leaves the approval writer's kind alone", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-pace-kind-"));
    roots.push(root);
    expect(await addInboxOnce(root, "SOMETHING-001", "needs a signature")).toBe(true);
    expect(await addInboxOnce(root, "SOMETHING-001", "needs a signature")).toBe(false);
    expect(await inbox(root)).toContain("- [ ] HUMAN_APPROVAL SOMETHING-001 — needs a signature");
  });
});

describe("the guarded call that crosses the line", () => {
  it("records the notice in the same write that makes the crossing entry durable", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-pace-call-"));
    roots.push(root);
    const ledger = [entry(0.3, 1), entry(0.2595, 2)];
    await atomicWriteJson(root, "budget/ledger.json", { schemaVersion: 1, entries: ledger });
    const result = await guardedJsonCall({
      stateRoot: root,
      cycleId: "20260916130500-gv-brief",
      phase: "gv-brief",
      ventureId: "goviral",
      agent: "ANGLE",
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      system: "Return JSON.",
      input: "{}",
      maxOutputTokens: 400,
      budgetContext: { now, cycleId: "20260916130500-gv-brief", stage: "VALIDATION", ledger, allInNonApiSpentUsd: 0, allInCommittedUsd: 0, knownMonthlyForecastUsd: 0, remainingScheduledCycles: 60, limits },
      parse: (text) => JSON.parse(text) as Record<string, unknown>,
      cacheResponse: false
    }, {
      generate: async () => ({ text: "{}", model: "claude-haiku-4-5-20251001", tokensIn: 300, cachedTokensIn: 0, cacheWriteTokensIn: 0, tokensOut: 60, toolUses: 0 })
    });
    expect(result.usd).toBeGreaterThan(0.0005);
    expect(await inbox(root)).toContain("BUDGET-PACE-2026-09-16");
  });
});
