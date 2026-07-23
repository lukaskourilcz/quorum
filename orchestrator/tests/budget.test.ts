import { describe, expect, it } from "vitest";
import {
  assertImageReservation,
  assertTextReservation,
  BudgetError,
  estimateImageCall,
  estimateTextCall,
  type BudgetLedgerEntry,
  type ReserveContext
} from "../src/budget.js";

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

