import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BudgetError,
  assertTextReservation,
  budgetStopReason,
  dailyBudgetStatus,
  estimateTextCall,
  exceedsDailyCap,
  type BudgetLedgerEntry,
  type BudgetLimits
} from "../src/budget.js";
import { MeetingSkipSchema } from "../src/contracts/meeting-skip.js";
import { quietWhenBudgetStops } from "../src/cycle.js";
import { buildCalendarFeed, mondayOfWeek } from "../src/meetings/calendar.js";
import { loadRuntimeBudgetLimits } from "../src/portfolio/limits.js";
import { atomicWriteJson } from "../src/state.js";

const NOW = new Date("2026-08-05T06:00:00.000Z");
const DATE = "2026-08-05";

/** The thirteen phases of a full day that call a model, in the order the clock fires them. */
const MODEL_PHASES = [
  "cu-edition",
  "morning",
  "incubator-scan",
  "mma-intake",
  "mag-editorial",
  "article-am",
  "tt-marketing",
  "studio",
  "cu-product",
  "article-pm",
  "mma-analysis",
  "mag-desk",
  "incubator-synthesis"
] as const;

function entry(usd: number, index: number): BudgetLedgerEntry {
  return {
    ts: new Date(NOW.getTime() + index * 1_000).toISOString(),
    cycleId: `20260805-cycle-${index}`,
    requestHash: `hash${String(index).padStart(4, "0")}`,
    phase: "mma-intake",
    agent: "FORGE",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    serviceTier: "default",
    tokensIn: 1_000,
    cachedTokensIn: 0,
    tokensOut: 200,
    toolUses: 0,
    usd,
    kind: "text"
  };
}

function reserveContext(ledger: readonly BudgetLedgerEntry[], limits: BudgetLimits) {
  return {
    now: NOW,
    cycleId: "20260805-probe",
    stage: "VALIDATION" as const,
    ledger,
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    // Above 1, the pacing rung can refuse a reservation the daily cap would have allowed, and
    // this comparison is only about the daily cap.
    remainingScheduledCycles: 1,
    limits
  };
}

let limits: BudgetLimits;

beforeAll(async () => {
  limits = await loadRuntimeBudgetLimits();
});

describe("the daily cap is asked before a room opens, not discovered inside one", () => {
  it("gives the same verdict the reservation itself would give", () => {
    // The pre-check exists so a room can be refused before it spends. If it ever disagreed
    // with assertTextReservation, a room would either open on a day it cannot pay for or be
    // refused on a day it can. Walk the boundary: exactly at the cap, and one cent past it.
    const spent = Number((limits.dailyUsd - 0.05).toFixed(8));
    const ledger = [entry(spent, 1)];
    // Every reservation stays under the per-call and stage caps, which are checked first, so
    // the only cap that can decide these cases is the daily one.
    for (const reservation of [0.01, 0.049, 0.05, 0.051, 0.09]) {
      const estimate = {
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedUsd: reservation,
        toolUsd: 0,
        priceVerifiedAt: "2026-08-01",
        priceSourceUrl: "https://example.invalid/prices"
      };
      let thrownCode: string | null = null;
      try {
        assertTextReservation(estimate, reserveContext(ledger, limits));
      } catch (error) {
        thrownCode = error instanceof BudgetError ? error.code : "OTHER";
      }
      expect(exceedsDailyCap(reservation, ledger, NOW, limits)).toBe(thrownCode === "DAILY_CAP");
    }
  });

  it("still lets a reservation that exactly fills the cap through", () => {
    // The change must not tighten the cap by a cent. Spending the last $0.05 of the day is
    // allowed; asking for $0.0500001 is not.
    const ledger = [entry(Number((limits.dailyUsd - 0.05).toFixed(8)), 1)];
    expect(exceedsDailyCap(0.05, ledger, NOW, limits)).toBe(false);
    expect(exceedsDailyCap(0.0500001, ledger, NOW, limits)).toBe(true);
    expect(dailyBudgetStatus(ledger, NOW, limits)).toEqual({
      spentUsd: Number((limits.dailyUsd - 0.05).toFixed(8)),
      capUsd: limits.dailyUsd,
      remainingUsd: 0.05
    });
  });

  it("refuses the later rooms of an over-subscribed day before they spend anything", () => {
    // Thirteen model-calling phases reserving $0.134 each want $1.74 against a $1.00 cap. The
    // day has to end somewhere; the question this pins is whether it ends by refusing rooms
    // before they spend, or by overspending, or by a room dying mid-meeting.
    const reservationUsd = 0.134;
    const ledger: BudgetLedgerEntry[] = [];
    const refused: string[] = [];
    MODEL_PHASES.forEach((phase, index) => {
      if (exceedsDailyCap(reservationUsd, ledger, NOW, limits)) {
        refused.push(phase);
        return;
      }
      ledger.push(entry(reservationUsd, index));
    });
    expect(MODEL_PHASES.length * reservationUsd).toBeGreaterThan(limits.dailyUsd);
    expect(refused.length).toBeGreaterThan(0);
    expect(dailyBudgetStatus(ledger, NOW, limits).spentUsd).toBeLessThanOrEqual(limits.dailyUsd);
  });
});

describe("a room the cap stops ends the day quietly", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "quorum-budget-quiet-"));
    // A ledger already at the cap: the state tomorrow's last rooms will wake up to.
    await atomicWriteJson(root, "budget/ledger.json", {
      schemaVersion: 1,
      entries: [entry(limits.dailyUsd, 1)]
    });
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("returns a NO_ACTION skip instead of throwing the BudgetError out of the process", async () => {
    const result = await quietWhenBudgetStops(
      { phase: "mma-intake", cycleId: "20260805080000-mma-intake", now: NOW, root },
      () => {
        throw new BudgetError("DAILY_CAP", "Daily API cap exceeded");
      }
    );
    expect(result).toMatchObject({
      phase: "mma-intake",
      status: "paused",
      decision: "NO_ACTION",
      estimatedWorstCaseUsd: 0
    });

    const skip = MeetingSkipSchema.parse(JSON.parse(
      await readFile(path.join(root, "meetings", "skips", `${DATE}-mma-intake.json`), "utf8")
    ));
    expect(skip.reason).toContain("model-API cap");
    expect(skip.reason).toContain(`$${limits.dailyUsd.toFixed(2)}`);
    expect(skip.reason).not.toMatch(/fail/i);

    // The finance alert and the daily digest count exhausted days from this file. index.ts used
    // to write it on the way out with exit 1; catching the error must not lose the signal.
    const exhaustions = JSON.parse(
      await readFile(path.join(root, "budget", "exhaustions.json"), "utf8")
    ) as { dates: string[] };
    expect(exhaustions.dates).toContain(DATE);
  });

  it("shows the slot as a stated skip rather than a red 'Did not happen'", async () => {
    const feed = JSON.parse(
      await readFile(path.join(root, "calendar", `${mondayOfWeek(DATE)}.json`), "utf8")
    ) as { slots: Array<{ at: string; kind: string; status: string; decisionOneLiner?: string }> };
    const slot = feed.slots.find(
      (candidate) => candidate.kind === "mma-intake" && candidate.at.startsWith(DATE)
    );
    expect(slot?.status).toBe("skipped");
    expect(slot?.decisionOneLiner).toContain("model-API cap");

    // The control: the same slot on the same past day with nothing recorded. This is what the
    // calendar showed before — "missed", which the week board paints with --destructive and
    // labels "Did not happen" — and it is what a cap doing its job used to look like.
    const withoutTheRecord = buildCalendarFeed({
      weekOf: mondayOfWeek(DATE),
      records: [],
      skips: [],
      articleSlots: [],
      now: new Date("2026-08-06T00:00:00.000Z")
    });
    expect(withoutTheRecord.slots.find(
      (candidate) => candidate.kind === "mma-intake" && candidate.at.startsWith(DATE)
    )?.status).toBe("missed");
  });

  it("keeps the reason inside the limits the skip contract and the week board impose", () => {
    for (const phase of MODEL_PHASES) {
      const reason = budgetStopReason({
        phase,
        status: { spentUsd: 0.98, capUsd: limits.dailyUsd, remainingUsd: 0.02 },
        reservationUsd: 0.134
      });
      // MeetingSkipSchema rejects over 240 characters, and buildCalendarFeed publishes the
      // first 180 as the slot's one-liner. A reason that says why must survive both.
      expect(reason.length).toBeLessThanOrEqual(240);
      expect(reason.length).toBeLessThanOrEqual(180);
      expect(MeetingSkipSchema.parse({
        schemaVersion: "meeting-skip/1",
        date: DATE,
        phase,
        reason,
        decidedAt: NOW.toISOString()
      }).reason).toBe(reason);
    }
  });

  it("still lets a real failure fail", async () => {
    // Over-catching here would hide a broken run behind "the budget stopped it", which is the
    // same loss of signal in the other direction.
    await expect(quietWhenBudgetStops(
      { phase: "mma-intake", cycleId: "20260805080000-mma-intake", now: NOW, root },
      () => {
        throw new Error("the provider returned 500");
      }
    )).rejects.toThrow("the provider returned 500");
  });
});

describe("the estimator the pre-check reads is the one the reservation reads", () => {
  it("prices a room's seat once, for both the question and the answer", () => {
    // A pre-check that estimated differently from guardedJsonCall would refuse rooms the cap
    // would have taken, or open rooms it would not.
    const estimate = estimateTextCall({
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      promptChars: 20_000,
      maxOutputTokens: 900,
      at: NOW
    });
    const room = [entry(Number((limits.dailyUsd - estimate.estimatedUsd * 2).toFixed(8)), 1)];
    expect(exceedsDailyCap(estimate.estimatedUsd, room, NOW, limits)).toBe(false);
    expect(() => assertTextReservation(estimate, reserveContext(room, limits))).not.toThrow();

    const nearlySpent = [entry(Number((limits.dailyUsd - estimate.estimatedUsd / 2).toFixed(8)), 1)];
    expect(exceedsDailyCap(estimate.estimatedUsd, nearlySpent, NOW, limits)).toBe(true);
    expect(() => assertTextReservation(estimate, reserveContext(nearlySpent, limits)))
      .toThrowError(expect.objectContaining({ code: "DAILY_CAP" }));
  });
});
