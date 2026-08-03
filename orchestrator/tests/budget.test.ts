import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KpiSetSchema } from "../src/contracts/kpi-set.js";
import { runLiveEdition } from "../src/edition/live.js";
import { loadRuntimeBudgetLimits, tightenedBy } from "../src/portfolio/limits.js";
import { resolveEffectivePortfolioSchedule } from "../src/portfolio/schedule.js";
import { loadSourceRegistry } from "../src/sources/registry.js";
import { atomicWriteJson } from "../src/state.js";
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

  it("publishes and falls back to the same caps the resolver reaches", async () => {
    // Two more copies of the superseded budget-2026-08d figures. config/kpis/2026-Q1.json is read
    // by the public money page, so it was telling readers the company runs to $50 all-in and $42
    // of API — $20 and $17 above what the owner countersigned — and grading itself against those
    // numbers. edition/live.ts held its own $15 / $0.70 / $50 fallbacks for a run whose env sets
    // nothing. Neither is allowed to restate a cap; both must reach the resolver's answer.
    const previous = { ...process.env };
    for (const name of ["DAILY_BUDGET_USD", "MONTHLY_BUDGET_USD", "MONTHLY_OPERATING_CAP_USD", "EDITION_PRODUCTION_BUDGET_USD"]) {
      delete process.env[name];
    }
    try {
      const limits = await loadRuntimeBudgetLimits();
      const kpis = KpiSetSchema.parse(JSON.parse(await readFile(path.join(repoRoot, "config/kpis/2026-Q1.json"), "utf8")));
      const target = (id: string) => kpis.kpis.find((kpi) => kpi.id === id);
      expect(target("company.monthly-all-in-usd")).toMatchObject({ target: limits.monthlyOperatingUsd, direction: "at-most" });
      expect(target("company.monthly-api-usd")).toMatchObject({ target: limits.monthlyApiUsd, direction: "at-most" });

      // And the API share the live edition enforces with nothing in the environment, read through
      // the gate rather than off the source. The scrape returns nothing, so a run the budget lets
      // through stops at the source gate instead — which is how "the budget did not stop this"
      // shows up. Spend is dated to the 1st so only the monthly figure is in play, not the daily.
      const registry = await loadSourceRegistry();
      const reasonAfterSpending = async (usd: number) => {
        const root = await mkdtemp(path.join(os.tmpdir(), "edition-caps-"));
        await atomicWriteJson(root, "budget/ledger.json", {
          schemaVersion: 1,
          entries: [{
            ts: "2026-08-01T04:00:00.000Z",
            cycleId: "cycle-prior",
            requestHash: "prior",
            phase: "cu-edition",
            ventureId: "caught-up",
            agent: "HERALD",
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            serviceTier: "default",
            tokensIn: 1,
            cachedTokensIn: 0,
            tokensOut: 1,
            toolUses: 1,
            usd,
            kind: "text"
          }]
        });
        const result = await runLiveEdition({
          cycleId: "20260804030000-cu-edition",
          date: "2026-08-04",
          now: new Date("2026-08-04T03:55:00.000Z"),
          meetingRef: "meetings/2026-08-04-cu-edition",
          roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
          root,
          dependencies: {
            loadRegistry: async () => registry,
            scrape: async () => ({ items: [], sources: [] }),
            gateway: { invoke: async () => { throw new Error("provider must not be called"); } } as never
          }
        });
        await rm(root, { recursive: true, force: true });
        return result.package.board.noEditionReason;
      };
      // $5 of headroom is inside the countersigned $25 share and outside the superseded $15 one.
      expect(await reasonAfterSpending(limits.monthlyApiUsd - 5)).toMatch(/^source_gate:/u);
      expect(await reasonAfterSpending(limits.monthlyApiUsd - 0.1)).toBe("budget_exhausted");
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

describe("prompt caching is priced, not assumed away", () => {
  // A room sends the same system prompt once per seat. The first seat writes the cache and the
  // rest read it, and the provider bills those three counts at three different rates while
  // reporting them as disjoint numbers. Getting the arithmetic wrong here does not fail a test
  // somewhere else — it quietly moves the daily and monthly caps.
  const call = (over: Partial<Parameters<typeof estimateTextCall>[0]>) => estimateTextCall({
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    promptChars: 1_000_000 * 3.5,
    maxOutputTokens: 0,
    at: new Date("2026-08-03T00:00:00.000Z"),
    ...over
  });

  it("charges a cache read below the input rate and a write above it", () => {
    const plain = call({}).estimatedUsd;
    const read = call({ cachedInputTokens: 1_000_000 }).estimatedUsd;
    const write = call({ cacheWriteInputTokens: 1_000_000 }).estimatedUsd;
    expect(read).toBeLessThan(plain);
    expect(write).toBeGreaterThan(plain);
    expect(write / plain).toBeCloseTo(1.25, 5);
  });

  it("never lets the cached share be subtracted twice", () => {
    // The three counts partition the prompt, so a prompt that is entirely a cache read must
    // cost the cached rate for all of it, not zero.
    const all = call({ promptChars: 1_000_000 * 3.5, cachedInputTokens: 1_000_000 });
    expect(all.estimatedUsd).toBeGreaterThan(0);
    expect(all.estimatedInputTokens).toBe(1_000_000);
  });
});
