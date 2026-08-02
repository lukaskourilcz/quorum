import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadRuntimeBudgetLimits, tightenedBy } from "../src/portfolio/limits.js";
import { resolveEffectivePortfolioSchedule } from "../src/portfolio/schedule.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";
import { repoRoot, stateRoot } from "../src/paths.js";

const decisionText = (name: string) => readFile(path.join(stateRoot, "decisions", name), "utf8");
import {
  assertImageReservation,
  assertTextReservation,
  BudgetError,
  DEFAULT_BUDGET_LIMITS,
  estimateImageCall,
  estimateTextCall,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../src/budget.js";
import { PRODUCT_ROOM_RESERVE_USD } from "../src/ideas/live.js";

function context(
  ledger: BudgetLedgerEntry[] = [],
  overrides: Partial<ReserveContext> = {}
): ReserveContext {
  return {
    now: new Date("2026-07-23T10:00:00.000Z"),
    cycleId: "cycle-001",
    stage: "DISCOVERY",
    ledger,
    allInNonApiSpentUsd: 0,
    allInCommittedUsd: 0,
    knownMonthlyForecastUsd: 0,
    remainingScheduledCycles: 1,
    ...overrides
  };
}

describe("budget guard", () => {
  it("counts fixed subscriptions against the hard all-in cap", () => {
    const estimate = {
      estimatedInputTokens: 1,
      estimatedOutputTokens: 1,
      estimatedUsd: 0.02,
      toolUsd: 0,
      priceVerifiedAt: "2026-08-01",
      priceSourceUrl: "https://example.com/pricing"
    };
    const ledger = [{
      ts: "2026-07-23T09:00:00.000Z",
      cycleId: "previous-cycle",
      requestHash: "request-hash-1",
      phase: "morning",
      agent: "AUDIT",
      provider: "openai" as const,
      model: "gpt-5.6-luna",
      serviceTier: "default" as const,
      tokensIn: 1,
      cachedTokensIn: 0,
      tokensOut: 1,
      toolUses: 0,
      usd: 42,
      kind: "text" as const
    }];
    expect(() => assertTextReservation(estimate, context(ledger, {
      allInNonApiSpentUsd: 8,
      limits: { ...DEFAULT_BUDGET_LIMITS, monthlyApiUsd: 50, monthlyOperatingUsd: 50, dailyUsd: 50 }
    }))).toThrowError(expect.objectContaining({ code: "MONTHLY_OPERATING_CAP" }));
  });

  it("keeps the adopted Caught Up envelopes inside the operating cap", () => {
    expect(DEFAULT_BUDGET_LIMITS).toMatchObject({
      maxCycleUsd: 0.2,
      caughtUpMeetingUsd: 0.08,
      editionProductionUsd: 0.35,
      dailyUsd: 0.7,
      monthlyApiUsd: 15,
      monthlyMediaUsd: 2,
      monthlyOperatingUsd: 20
    });
    expect(
      DEFAULT_BUDGET_LIMITS.monthlyApiUsd + DEFAULT_BUDGET_LIMITS.monthlyMediaUsd
    ).toBeLessThanOrEqual(DEFAULT_BUDGET_LIMITS.monthlyOperatingUsd);
    expect(PRODUCT_ROOM_RESERVE_USD).toBe(0.03);
    expect(PRODUCT_ROOM_RESERVE_USD).toBeLessThanOrEqual(
      DEFAULT_BUDGET_LIMITS.caughtUpMeetingUsd
    );
  });

  it("uses the dated promotional Sonnet price before September", () => {
    const promo = estimateTextCall({
      provider: "anthropic",
      model: "claude-sonnet-5",
      promptChars: 28_000,
      maxOutputTokens: 800,
      at: new Date("2026-07-23T00:00:00.000Z")
    });
    const standard = estimateTextCall({
      provider: "anthropic",
      model: "claude-sonnet-5",
      promptChars: 28_000,
      maxOutputTokens: 800,
      at: new Date("2026-09-02T00:00:00.000Z")
    });
    expect(promo.estimatedUsd).toBeCloseTo(0.024, 6);
    expect(standard.estimatedUsd).toBeCloseTo(0.036, 6);
  });

  it("fails closed for an unknown model or service tier", () => {
    expect(() =>
      estimateTextCall({
        provider: "openai",
        model: "invented-model",
        promptChars: 100,
        maxOutputTokens: 100
      })
    ).toThrowError(BudgetError);
    expect(() =>
      estimateTextCall({
        provider: "openai",
        model: "gpt-5.6-luna",
        serviceTier: "priority",
        promptChars: 100,
        maxOutputTokens: 100
      })
    ).toThrowError(/No dated priority price/);
  });

  it("reserves search request and search-content token costs", () => {
    const estimate = estimateTextCall({
      provider: "openai",
      model: "gpt-5.6-luna",
      promptChars: 7_000,
      maxOutputTokens: 200,
      webSearchUses: 2,
      maxSearchContentTokens: 4_000
    });
    expect(estimate.toolUsd).toBe(0.02);
    expect(estimate.estimatedUsd).toBeGreaterThan(0.02);
  });

  it("rejects per-call, daily and all-in cap overruns", () => {
    const oversized = estimateTextCall({
      provider: "openai",
      model: "gpt-5.6-sol",
      promptChars: 28_000,
      maxOutputTokens: 3_000
    });
    expect(() => assertTextReservation(oversized, context())).toThrowError(
      /Estimated call/
    );

    const small = estimateTextCall({
      provider: "openai",
      model: "gpt-5.6-luna",
      promptChars: 3_500,
      maxOutputTokens: 100
    });
    expect(() =>
      assertTextReservation(
        small,
        context([], {
          allInNonApiSpentUsd: 19.99,
          allInCommittedUsd: 0.01
        })
      )
    ).toThrowError(/all-in/);
  });

  it("allows avatar-quality output but blocks it as recurring social media", () => {
    const avatar = estimateImageCall({
      model: "gpt-image-2",
      quality: "high",
      size: "1024x1024",
      promptChars: 900
    });
    expect(avatar.estimatedUsd).toBeGreaterThan(0.2);
    expect(() => assertImageReservation(avatar, context(), true)).not.toThrow();
    expect(() => assertImageReservation(avatar, context(), false)).toThrowError(
      /exceeds/
    );
  });
});

describe("every phase reaches the countersigned caps", () => {
  it("resolves the amounts of the newest countersigned budget decision, not a phase literal", async () => {
    // Article production carried its own $2.20 / $42 / $50, the figures of budget-2026-08d.
    // budget-2026-08e superseded them on 2 August with $1.00 / $25 / $30, and that phase
    // went on enforcing the replaced decision because it never read the resolver.
    const previous = { ...process.env };
    for (const name of ["DAILY_BUDGET_USD", "MONTHLY_BUDGET_USD", "MONTHLY_OPERATING_CAP_USD", "MAX_CYCLE_BUDGET_USD"]) {
      delete process.env[name];
    }
    try {
      const limits = await loadRuntimeBudgetLimits();
      expect(limits.dailyUsd).toBe(1);
      expect(limits.monthlyApiUsd).toBe(25);
      expect(limits.monthlyOperatingUsd).toBe(30);

      // loadRuntimeBudgetLimits reads the amounts at zero headroom, which is only sound
      // because headroom decides which phases stay active and never what the caps are.
      const registry = await loadVentureRegistry();
      const shape = {
        registry,
        budgetDecisionRaw: await decisionText("2026-08-01-budget-raise.md"),
        budgetMmaRaw: await decisionText("2026-08-02-budget-mma.md"),
        budgetFiftyRaw: await decisionText("2026-08-04-budget-fifty.md"),
        fightAiQFoundingRaw: await decisionText("2026-08-02-fightaiq-founding.md")
      };
      const amountsAt = (monthlyApiHeadroomUsd: number) => {
        const resolved = resolveEffectivePortfolioSchedule({ ...shape, monthlyApiHeadroomUsd });
        return [resolved.monthlyBudgetUsd, resolved.dailyBudgetUsd, resolved.monthlyOperatingUsd];
      };
      expect(amountsAt(0)).toEqual(amountsAt(999));

      // A phase may lower a cap and may never raise one, whichever direction it asks for.
      const phase = tightenedBy(limits, { maxCycleUsd: 0.16, dailyUsd: 99, monthlyApiUsd: 42, monthlyOperatingUsd: 50 });
      expect(phase.maxCycleUsd).toBe(0.16);
      expect(phase.dailyUsd).toBe(1);
      expect(phase.monthlyApiUsd).toBe(25);
      expect(phase.monthlyOperatingUsd).toBe(30);
    } finally {
      Object.assign(process.env, previous);
    }
  });

  it("lets the workflow env tighten the resolved caps", async () => {
    const previous = process.env.MONTHLY_BUDGET_USD;
    process.env.MONTHLY_BUDGET_USD = "12";
    try {
      expect((await loadRuntimeBudgetLimits()).monthlyApiUsd).toBe(12);
    } finally {
      if (previous === undefined) delete process.env.MONTHLY_BUDGET_USD;
      else process.env.MONTHLY_BUDGET_USD = previous;
    }
  });
});

describe("the site quotes the caps the runtime enforces", () => {
  it("keeps the published operating and API limits equal to the resolved ones", async () => {
    // The site read $50 all-in and $42 API for a week after budget-2026-08e replaced them
    // with $30 and $25, and it published that against a standup reporting $0.00 spent.
    const source = await readFile(path.join(repoRoot, "site", "src", "data", "operating-policy.ts"), "utf8");
    const constant = (name: string) => Number(source.match(new RegExp(`${name} = (\\d+(?:\\.\\d+)?)`, "u"))?.[1]);
    const previous = { ...process.env };
    for (const name of ["DAILY_BUDGET_USD", "MONTHLY_BUDGET_USD", "MONTHLY_OPERATING_CAP_USD"]) delete process.env[name];
    try {
      const limits = await loadRuntimeBudgetLimits();
      expect(constant("CURRENT_MONTHLY_OPERATING_LIMIT_USD")).toBe(limits.monthlyOperatingUsd);
      expect(constant("CURRENT_MONTHLY_API_LIMIT_USD")).toBe(limits.monthlyApiUsd);
    } finally {
      Object.assign(process.env, previous);
    }
  });
});
