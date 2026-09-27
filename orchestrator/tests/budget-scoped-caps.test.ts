import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertImageReservation,
  assertTextReservation,
  budgetStopCode,
  budgetStopReason,
  estimateImageCall,
  officeReadOnlyReason,
  type BudgetErrorCode,
  type BudgetLedgerEntry,
  type CostEstimate,
  type ReserveContext
} from "../src/budget.js";
import { MeetingSkipSchema, MeetingStopReasonSchema } from "../src/contracts/meeting-skip.js";
import { deskMonthlyCapUsd } from "../src/portfolio/limits.js";
import { resolveEffectivePortfolioSchedule } from "../src/portfolio/schedule.js";
import { isPortfolioPhase } from "../src/meetings/clock.js";
import { stateRoot } from "../src/paths.js";
import { RunnablePhaseSchema } from "../src/types.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

const NOW = new Date("2026-09-16T08:00:00.000Z");

function estimate(usd: number): CostEstimate {
  return {
    estimatedInputTokens: 1_000,
    estimatedOutputTokens: 200,
    estimatedUsd: usd,
    toolUsd: 0,
    priceVerifiedAt: "2026-08-01",
    priceSourceUrl: "https://example.com/pricing"
  };
}

function entry(input: {
  usd: number;
  cycleId?: string;
  ventureId?: string;
  ts?: string;
  index?: number;
}): BudgetLedgerEntry {
  return {
    ts: input.ts ?? NOW.toISOString(),
    cycleId: input.cycleId ?? "20260916080000-mag-desk",
    requestHash: `hash${String(input.index ?? 0).padStart(4, "0")}`,
    phase: "mag-desk",
    ...(input.ventureId === undefined ? {} : { ventureId: input.ventureId }),
    agent: "FORGE",
    provider: "anthropic" as const,
    model: "claude-haiku-4-5-20251001",
    serviceTier: "default" as const,
    tokensIn: 1_000,
    cachedTokensIn: 0,
    tokensOut: 200,
    toolUses: 0,
    usd: input.usd,
    kind: "text" as const
  };
}

function context(
  ledger: BudgetLedgerEntry[],
  overrides: Partial<ReserveContext> = {}
): ReserveContext {
  return {
    now: NOW,
    cycleId: "20260916080000-mag-desk",
    stage: "VALIDATION",
    ledger,
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    // Above 1 the pacing rung can refuse a reservation these rungs would have allowed, and
    // these assertions are about the new rungs only.
    remainingScheduledCycles: 1,
    ...overrides
  };
}

describe("a room cannot spend past its own declared envelope", () => {
  it("refuses the seat that would take the run past the room cap", () => {
    // $0.04 already billed by this run's earlier seats against a $0.05 envelope. The company's
    // day, month and cycle caps would all take the next seat; the room's own will not.
    const ledger = [entry({ usd: 0.04 })];
    expect(() => assertTextReservation(estimate(0.02), context(ledger, { roomCapUsd: 0.05 })))
      .toThrowError(expect.objectContaining({ code: "ROOM_CAP" }));
    expect(() => assertTextReservation(estimate(0.009), context(ledger, { roomCapUsd: 0.05 })))
      .not.toThrow();
  });

  it("is a no-op for every caller that declares no envelope", () => {
    // The field is optional and roughly twenty modules build a ReserveContext. An absent
    // envelope has to mean "this rung does not apply", never "this rung applies at zero".
    const ledger = [entry({ usd: 0.04 })];
    expect(() => assertTextReservation(estimate(0.02), context(ledger))).not.toThrow();
  });

  it("counts only this run, so another room's spend cannot close it", () => {
    const ledger = [entry({ usd: 0.04, cycleId: "20260916070000-mma-intake", index: 1 })];
    expect(() => assertTextReservation(estimate(0.02), context(ledger, { roomCapUsd: 0.05 })))
      .not.toThrow();
  });
});

describe("a desk cannot spend past an allowance the owner allocated it", () => {
  const monthLedger = [
    entry({ usd: 0.9, ventureId: "caught-up", ts: "2026-09-02T08:00:00.000Z", cycleId: "a", index: 1 }),
    entry({ usd: 0.9, ventureId: "caught-up", ts: "2026-09-09T08:00:00.000Z", cycleId: "b", index: 2 })
  ];

  it("refuses the call that would take the venture past its monthly allowance", () => {
    expect(() => assertTextReservation(estimate(0.05), context(monthLedger, {
      ventureId: "caught-up",
      deskMonthlyUsd: 1.8
    }))).toThrowError(expect.objectContaining({ code: "DESK_MONTHLY_CAP" }));
    expect(() => assertTextReservation(estimate(0.05), context(monthLedger, {
      ventureId: "caught-up",
      deskMonthlyUsd: 2
    }))).not.toThrow();
  });

  it("bills each desk only for its own rows and its own month", () => {
    // The same ledger, asked about a different venture, and about a venture whose spend is all
    // in the previous month. A desk rung that summed either would be a company cap wearing a
    // venture's name.
    expect(() => assertTextReservation(estimate(0.05), context(monthLedger, {
      ventureId: "mma-files",
      deskMonthlyUsd: 1.8
    }))).not.toThrow();
    expect(() => assertTextReservation(estimate(0.05), context(monthLedger, {
      now: new Date("2026-10-01T08:00:00.000Z"),
      ventureId: "caught-up",
      deskMonthlyUsd: 1.8
    }))).not.toThrow();
  });

  it("asks the same two rungs on the avatar path, which returns before the shared ones", () => {
    const image = estimateImageCall({
      model: "gpt-image-2",
      quality: "low",
      size: "1024x1024",
      promptChars: 400
    });
    expect(image.estimatedUsd).toBeLessThanOrEqual(0.3);
    expect(() => assertImageReservation(image, context(monthLedger, {
      ventureId: "caught-up",
      deskMonthlyUsd: 1.8
    }), true)).toThrowError(expect.objectContaining({ code: "DESK_MONTHLY_CAP" }));
    expect(() => assertImageReservation(image, context([entry({ usd: 0.0499 })], {
      roomCapUsd: 0.05
    }), true)).toThrowError(expect.objectContaining({ code: "ROOM_CAP" }));
  });

  it("applies to no venture until the owner allocates one", async () => {
    // The registry is the only source of a desk allowance and today it declares none. This is
    // the assertion that fails the moment a number appears without a decision beside it.
    const registry = await loadVentureRegistry();
    const schedule = resolveEffectivePortfolioSchedule({
      registry,
      budgetDecisionRaw: "",
      monthlyApiHeadroomUsd: 0
    });
    expect(Object.keys(schedule.deskMonthlyUsdByVenture)).toEqual([]);
    for (const venture of registry.ventures) {
      expect(deskMonthlyCapUsd(schedule, venture.id)).toBeUndefined();
    }
  });

  it("reads a declared allowance straight through to the resolver", async () => {
    const registry = await loadVentureRegistry();
    const first = registry.ventures[0];
    expect(first).toBeDefined();
    const schedule = resolveEffectivePortfolioSchedule({
      registry: {
        ...registry,
        ventures: registry.ventures.map((venture) =>
          venture.id === first?.id ? { ...venture, budget: { monthlyDeskUsd: 4 } } : venture
        )
      },
      budgetDecisionRaw: "",
      monthlyApiHeadroomUsd: 0
    });
    expect(deskMonthlyCapUsd(schedule, first?.id ?? "")).toBe(4);
  });
});

describe("the room rung refuses nothing that has already happened", () => {
  it("finds no committed run that billed past the envelope its record publishes", async () => {
    /*
     * The one question a new cap has to answer before it ships: would it have refused work the
     * owner paid for? Every cycle id on the committed ledger is one run of one room, so this is
     * the cap applied to the whole history of the rooms it now guards. It is scoped to the six
     * phases that run through runPortfolioCycle — the edition pipeline bills its own cycle id
     * against its own $0.50 cap and declares no room envelope, which is why the envelope is not
     * armed there.
     */
    const [ledgerRaw, registry] = await Promise.all([
      readFile(path.join(stateRoot, "budget", "ledger.json"), "utf8"),
      loadVentureRegistry()
    ]);
    const schedule = resolveEffectivePortfolioSchedule({
      registry,
      budgetDecisionRaw: "",
      monthlyApiHeadroomUsd: 0
    });
    const { entries } = JSON.parse(ledgerRaw) as { entries: BudgetLedgerEntry[] };
    const spentByCycle = new Map<string, number>();
    for (const row of entries) {
      spentByCycle.set(row.cycleId, (spentByCycle.get(row.cycleId) ?? 0) + row.usd);
    }
    const guarded = [...spentByCycle].flatMap(([cycleId, usd]) => {
      const phase = cycleId.slice(cycleId.indexOf("-") + 1);
      const parsed = RunnablePhaseSchema.safeParse(phase);
      if (!parsed.success || !isPortfolioPhase(parsed.data)) return [];
      const envelopeUsd = schedule.envelopeByPhase[parsed.data];
      return envelopeUsd === undefined ? [] : [{ cycleId, usd, envelopeUsd }];
    });
    expect(guarded.length).toBeGreaterThan(0);
    expect(guarded.filter(({ usd, envelopeUsd }) => usd > envelopeUsd)).toEqual([]);
  });
});

describe("a budget stop says which limit stopped it, in prose and in a code", () => {
  const codes: BudgetErrorCode[] = [
    "UNKNOWN_PRICE",
    "PER_CALL_CAP",
    "STAGE_CAP",
    "CYCLE_CAP",
    "ROOM_CAP",
    "DESK_MONTHLY_CAP",
    "DAILY_CAP",
    "MONTHLY_API_CAP",
    "MONTHLY_OPERATING_CAP",
    "MEDIA_ASSET_CAP",
    "DAILY_MEDIA_CAP",
    "MONTHLY_MEDIA_CAP",
    "PACING"
  ];

  it("maps each code to a stop reason the contract accepts, or to none at all", () => {
    expect(budgetStopCode("ROOM_CAP")).toBe("room_cap");
    expect(budgetStopCode("CYCLE_CAP")).toBe("room_cap");
    expect(budgetStopCode("DAILY_CAP")).toBe("daily_pace");
    expect(budgetStopCode("PACING")).toBe("pacing");
    expect(budgetStopCode("DESK_MONTHLY_CAP")).toBe("budget_reached");
    expect(budgetStopCode("MONTHLY_OPERATING_CAP")).toBe("budget_reached");
    // A price we cannot read is a refusal, not a budget that is reached. Labelling it as one
    // would hide real breakage inside the count of days the money ran out.
    expect(budgetStopCode("UNKNOWN_PRICE")).toBeUndefined();
    for (const code of codes) {
      const stopReason = budgetStopCode(code);
      if (stopReason === undefined) continue;
      expect(MeetingStopReasonSchema.parse(stopReason)).toBe(stopReason);
    }
  });

  it("keeps every sentence inside the skip contract and the week board's 180 characters", () => {
    for (const code of [...codes, undefined]) {
      for (const reservationUsd of [0.134, null]) {
        const reason = budgetStopReason({
          phase: "mag-desk",
          status: { spentUsd: 0.98, capUsd: 1, remainingUsd: 0.02 },
          reservationUsd,
          ...(code === undefined ? {} : { code })
        });
        expect(reason.length).toBeLessThanOrEqual(180);
        expect(MeetingSkipSchema.parse({
          schemaVersion: "meeting-skip/1",
          date: "2026-09-16",
          phase: "mag-desk",
          reason,
          ...(budgetStopCode(code ?? "DAILY_CAP") ? { stopReason: budgetStopCode(code ?? "DAILY_CAP") } : {}),
          decidedAt: NOW.toISOString()
        }).reason).toBe(reason);
      }
    }
    expect(officeReadOnlyReason().length).toBeLessThanOrEqual(180);
  });

  it("never quotes the day's figures for a limit that is not the day's", () => {
    const monthly = budgetStopReason({
      phase: "mag-desk",
      status: { spentUsd: 0.02, capUsd: 1, remainingUsd: 0.98 },
      reservationUsd: null,
      code: "MONTHLY_OPERATING_CAP"
    });
    expect(monthly).toContain("month's spending limit");
    expect(monthly).not.toContain("$");
    const room = budgetStopReason({
      phase: "mag-desk",
      status: { spentUsd: 0.02, capUsd: 1, remainingUsd: 0.98 },
      reservationUsd: 0.05,
      code: "ROOM_CAP"
    });
    expect(room).toContain("own spending limit");
    expect(room).toContain("$0.05");
    expect(room).not.toContain("day's $1.00");
  });
});
