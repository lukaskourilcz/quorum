import { describe, expect, it } from "vitest";
import type { BudgetLedgerEntry } from "../src/budget.js";
import {
  costByCycle,
  cycleDate,
  cycleMonth,
  cyclePhase,
  decisionCosts,
  editionCosts,
  envelopeVariance,
  sumBreakdowns
} from "../src/finance/cost-attribution.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

const registry = await loadVentureRegistry();

function row(over: Partial<BudgetLedgerEntry> = {}): BudgetLedgerEntry {
  return {
    ts: "2026-09-13T03:00:38.000Z",
    cycleId: "20260913030038-cu-edition",
    requestHash: "abcdef0123456789",
    phase: "cu-edition",
    ventureId: "caught-up",
    agent: "HERALD",
    provider: "anthropic",
    model: "claude-sonnet-5",
    serviceTier: "default",
    tokensIn: 100,
    cachedTokensIn: 0,
    tokensOut: 50,
    toolUses: 0,
    usd: 0.1,
    kind: "text",
    ...over
  };
}

describe("cycle id arithmetic", () => {
  it("reads the date and phase out of a cycle id", () => {
    expect(cycleDate("20260913030038-cu-edition")).toBe("2026-09-13");
    expect(cycleMonth("20260913030038-cu-edition")).toBe("2026-09");
    expect(cyclePhase("20260913030038-cu-edition")).toBe("cu-edition");
  });

  it("returns null rather than a wrong day for an id that carries no date", () => {
    // A fixture or hand-made id must stay out of a month, not land in the wrong one.
    expect(cycleDate("fixture-cu-edition")).toBeNull();
    expect(cycleDate("20260231030038-cu-edition")).toBeNull();
    expect(cyclePhase("not-a-cycle")).toBeNull();
  });
});

describe("cost by cycle", () => {
  it("splits model from media and keeps both in the total", () => {
    const byCycle = costByCycle([
      row({ usd: 0.17, kind: "text" }),
      row({ usd: 0.01, kind: "image", phase: "image_gate", agent: "FRAME" }),
      row({ usd: 0.002, kind: "embedding", agent: "VAULT" })
    ], registry);
    const cycle = byCycle.get("20260913030038-cu-edition")!;
    expect(cycle.totalUsd).toBe(0.182);
    expect(cycle.mediaUsd).toBe(0.01);
    expect(cycle.modelUsd).toBe(0.172);
    expect(cycle.calls).toBe(3);
  });

  it("keeps an image_gate call on the edition cycle that paid for it", () => {
    // Grouping by phase would bill the picture to a room nobody opened: `image_gate` rows carry
    // the edition room's cycle id, which is the whole reason the key is the cycle.
    const byCycle = costByCycle([row({ usd: 0.17 }), row({ usd: 0.01, phase: "image_gate" })], registry);
    expect([...byCycle.keys()]).toEqual(["20260913030038-cu-edition"]);
    expect(byCycle.get("20260913030038-cu-edition")!.phases).toEqual(["cu-edition", "image_gate"]);
  });

  it("attributes each venture in a cycle that spent for two", () => {
    const byCycle = costByCycle([
      row({ cycleId: "20260913040044-morning", phase: "morning", ventureId: "global" }),
      row({ cycleId: "20260913040044-morning", phase: "morning", ventureId: "mma-files" })
    ], registry);
    expect(byCycle.get("20260913040044-morning")!.ventureIds).toEqual(["global", "mma-files"]);
  });

  it("skips a row whose amount is not a usable number instead of summing NaN", () => {
    const byCycle = costByCycle([
      row({ usd: 1 }),
      row({ usd: Number.NaN }),
      row({ usd: "0.5" as unknown as number }),
      row({ usd: -1 })
    ], registry);
    expect(byCycle.get("20260913030038-cu-edition")!.totalUsd).toBe(1);
    expect(byCycle.get("20260913030038-cu-edition")!.calls).toBe(1);
  });

  it("rounds to eight decimals, the way every other money path here does", () => {
    const byCycle = costByCycle([row({ usd: 0.1 }), row({ usd: 0.2 })], registry);
    expect(byCycle.get("20260913030038-cu-edition")!.totalUsd).toBe(0.3);
    expect(sumBreakdowns([
      { totalUsd: 0.1, modelUsd: 0.1, mediaUsd: 0, calls: 1 },
      { totalUsd: 0.2, modelUsd: 0.2, mediaUsd: 0, calls: 1 }
    ]).totalUsd).toBe(0.3);
  });
});

describe("decision cost", () => {
  it("records a decision that billed nothing as $0 and says why", () => {
    const [decision] = decisionCosts(
      [{ cycleId: "20260916030610-cu-product", phase: "cu-product", outcome: "defer", generatedAt: "2026-09-16T03:06:14.886Z" }],
      costByCycle([], registry),
      registry
    );
    expect(decision!.cost).toEqual({ totalUsd: 0, modelUsd: 0, mediaUsd: 0, calls: 0 });
    expect(decision!.note).toContain("without billing a call");
    // The registry, not the ledger: a free Caught Up decision stays Caught Up's.
    expect(decision!.ventureId).toBe("caught-up");
  });

  it("joins a decision to the cycle that paid for it", () => {
    const [decision] = decisionCosts(
      [{ cycleId: "20260913030038-cu-edition", phase: "cu-edition", outcome: "EDITION", generatedAt: "2026-09-13T03:01:00.000Z" }],
      costByCycle([row({ usd: 0.17 }), row({ usd: 0.01, kind: "image", phase: "image_gate" })], registry),
      registry
    );
    expect(decision!.cost).toEqual({ totalUsd: 0.18, modelUsd: 0.17, mediaUsd: 0.01, calls: 2 });
    expect(decision!.note).toBeNull();
  });
});

describe("edition cost", () => {
  const delivery = { date: "2026-09-13", status: "delivered", articleUrl: "https://example.invalid/a", packageHash: "0".repeat(64) };

  it("adds every cycle of the room that ran that day, including a free retry", () => {
    // 2026-09-13 really had two cu-edition cycles: the 03:00 run that wrote the edition and the
    // 07:00 backstop that found the day settled. The meeting record kept only the free one, so
    // joining through it reported $0.00 for three consecutive delivered editions.
    const byCycle = costByCycle([
      row({ cycleId: "20260913030038-cu-edition", usd: 0.17 }),
      row({ cycleId: "20260913030038-cu-edition", usd: 0.01, kind: "image", phase: "image_gate" })
    ], registry);
    const [edition] = editionCosts([delivery], byCycle, registry);
    expect(edition!.cycleIds).toEqual(["20260913030038-cu-edition"]);
    expect(edition!.cost).toEqual({ totalUsd: 0.18, modelUsd: 0.17, mediaUsd: 0.01, calls: 2 });

    const withRetry = costByCycle([
      row({ cycleId: "20260913030038-cu-edition", usd: 0.17 }),
      row({ cycleId: "20260913070054-cu-edition", usd: 0.01 })
    ], registry);
    const [both] = editionCosts([delivery], withRetry, registry);
    expect(both!.cycleIds).toEqual(["20260913030038-cu-edition", "20260913070054-cu-edition"]);
    expect(both!.cost!.totalUsd).toBe(0.18);
  });

  it("reports an unattributable edition as null rather than as free", () => {
    const [edition] = editionCosts([delivery], costByCycle([], registry), registry);
    expect(edition!.cost).toBeNull();
    expect(edition!.cycleIds).toEqual([]);
    expect(edition!.note).toContain("not recorded");
  });

  it("ignores a cycle of another room on the same day", () => {
    const byCycle = costByCycle([row({ cycleId: "20260913040044-morning", phase: "morning", usd: 0.13 })], registry);
    expect(editionCosts([delivery], byCycle, registry)[0]!.cost).toBeNull();
  });
});

describe("envelope variance", () => {
  const byCycle = costByCycle([
    row({ cycleId: "20260913030038-cu-edition", usd: 0.18 }),
    row({ cycleId: "20260912030033-cu-edition", usd: 0.62 }),
    row({ cycleId: "20260911030040-cu-edition", usd: 0.2 })
  ], registry);

  it("compares a cycle against the envelope its own scorecard recorded", () => {
    // The registry's cu-edition envelope is $0.08, but a cu-edition cycle reserves that plus the
    // edition-production budget. Measured against the bare $0.08 the room reads as overspending
    // almost every day it publishes.
    const [room] = envelopeVariance(byCycle, [
      { cycleId: "20260913030038-cu-edition", estimatedWorstCaseUsd: 0.58 },
      { cycleId: "20260912030033-cu-edition", estimatedWorstCaseUsd: 0.58 },
      { cycleId: "20260911030040-cu-edition", estimatedWorstCaseUsd: 0.58 }
    ], registry, "2026-09");
    expect(room!.comparable).toEqual({
      cycles: 3,
      envelopeUsd: 1.74,
      meteredUsd: 1,
      varianceUsd: -0.74,
      overspentCycles: 1
    });
  });

  it("keeps a cycle with no recorded envelope out of the comparison and still counts its spend", () => {
    const [room] = envelopeVariance(byCycle, [
      { cycleId: "20260913030038-cu-edition", estimatedWorstCaseUsd: 0.58 }
    ], registry, "2026-09");
    expect(room!.cycles).toBe(3);
    expect(room!.meteredUsd).toBe(1);
    expect(room!.comparable).toEqual({ cycles: 1, envelopeUsd: 0.58, meteredUsd: 0.18, varianceUsd: -0.4, overspentCycles: 0 });
  });

  it("reports no comparison at all rather than a zero envelope", () => {
    const [room] = envelopeVariance(byCycle, [], registry, "2026-09");
    expect(room!.comparable).toBeNull();
    expect(room!.meteredUsd).toBe(1);
  });

  it("leaves another month's cycles out", () => {
    expect(envelopeVariance(byCycle, [], registry, "2026-08")).toEqual([]);
  });
});
