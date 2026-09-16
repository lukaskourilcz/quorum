import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_BUDGET_LIMITS, estimateTextCall } from "../src/budget.js";
import { guardedJsonCall } from "../src/llm/call.js";
import { findTextPrice } from "../src/llm/prices.js";
import { readJson } from "../src/state.js";
import { composeMeetingRouteDefinition, loadVentureRegistry } from "../src/ventures/registry.js";

/**
 * The batch tier is a price, not a new call: the same room makes the same calls and the ledger
 * records them at half the token rate. What has to hold: the price table has a batch row for
 * every Anthropic model with a default row, the guarded call reserves and records at the tier
 * it was asked for, and only the Monday room asks for it.
 */

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

const now = new Date("2026-09-14T13:05:00.000Z");

describe("the batch price rows", () => {
  it("halve every Anthropic default row and carry their own source", () => {
    for (const model of ["claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-4-7", "claude-sonnet-4-6"]) {
      const standard = findTextPrice("anthropic", model, "default", now);
      const batch = findTextPrice("anthropic", model, "batch", now);
      expect(standard, model).not.toBeNull();
      expect(batch, model).not.toBeNull();
      expect(batch!.inputUsdPerMillion).toBe(standard!.inputUsdPerMillion / 2);
      expect(batch!.outputUsdPerMillion).toBe(standard!.outputUsdPerMillion / 2);
      expect(batch!.cachedInputUsdPerMillion).toBe(standard!.cachedInputUsdPerMillion! / 2);
      expect(batch!.sourceUrl).toContain("batch-processing");
    }
    // The pre-September Sonnet 5 row is halved on its own dates, not the current one's.
    const early = findTextPrice("anthropic", "claude-sonnet-5", "batch", new Date("2026-08-01T00:00:00.000Z"));
    expect(early?.inputUsdPerMillion).toBe(1);
    // OpenAI has no batch adapter here, so it has no batch row either: asking is a refusal.
    expect(findTextPrice("openai", "gpt-5.6-luna", "batch", now)).toBeNull();
  });

  it("prices an estimate at half the default for the same tokens", () => {
    const input = { provider: "anthropic" as const, model: "claude-haiku-4-5-20251001", promptChars: 3_500, maxOutputTokens: 1_000, at: now };
    expect(estimateTextCall({ ...input, serviceTier: "batch" }).estimatedUsd).toBeCloseTo(estimateTextCall(input).estimatedUsd / 2, 8);
  });
});

describe("the guarded call at the batch tier", () => {
  const request = {
    cycleId: "20260914130500-gv-brief",
    phase: "gv-brief",
    ventureId: "goviral" as const,
    agent: "ANGLE",
    provider: "anthropic" as const,
    model: "claude-haiku-4-5-20251001",
    system: "Return JSON.",
    input: "{}",
    maxOutputTokens: 400,
    budgetContext: { now, cycleId: "20260914130500-gv-brief", stage: "VALIDATION" as const, ledger: [], allInNonApiSpentUsd: 0, allInCommittedUsd: 0, knownMonthlyForecastUsd: 0, remainingScheduledCycles: 60, limits: DEFAULT_BUDGET_LIMITS },
    parse: (text: string) => JSON.parse(text) as Record<string, unknown>,
    cacheResponse: false
  };
  const reply = { text: "{}", model: "claude-haiku-4-5-20251001", tokensIn: 300, cachedTokensIn: 0, cacheWriteTokensIn: 0, tokensOut: 60, toolUses: 0 };

  it("records the ledger row at the batch tier and the batch price", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-batch-tier-"));
    roots.push(root);
    const seen: string[] = [];
    const batched = await guardedJsonCall(
      { ...request, stateRoot: root, serviceTier: "batch", batch: { deadlineAt: new Date(now.getTime() + 50 * 60_000) } },
      { generate: async (call) => { seen.push(call.serviceTier ?? "unset"); return reply; } }
    );
    const standard = await guardedJsonCall(
      { ...request, stateRoot: root, attempt: 2 },
      { generate: async (call) => { seen.push(call.serviceTier ?? "unset"); return reply; } }
    );
    expect(seen).toEqual(["batch", "default"]);
    expect(batched.usd).toBeCloseTo(standard.usd / 2, 8);
    const ledger = await readJson<{ entries: Array<{ serviceTier: string; usd: number }> }>(root, "budget/ledger.json", { entries: [] });
    expect(ledger.entries.map((entry) => entry.serviceTier)).toEqual(["batch", "default"]);
  });

  it("refuses the tier for a provider without a batch adapter before anything is reserved", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-batch-tier-openai-"));
    roots.push(root);
    await expect(guardedJsonCall(
      { ...request, stateRoot: root, provider: "openai", model: "gpt-5.6-luna", serviceTier: "batch" },
      { generate: async () => reply }
    )).rejects.toThrow(/only through the registered Anthropic adapter/u);
  });
});

describe("which room asks for the batch tier", () => {
  it("is the Monday GoVIRAL room and nothing else", async () => {
    const registry = await loadVentureRegistry();
    const rooms = registry.ventures.flatMap((venture) => venture.meetings.map((meeting) => meeting.kind));
    expect(rooms).toContain("gv-brief");
    expect(rooms).toContain("cu-edition");
    for (const kind of rooms) {
      const definition = composeMeetingRouteDefinition(registry, kind, "live");
      if (kind === "gv-brief") {
        expect(definition.serviceTier).toBe("batch");
        // Under cycle.yml's 65-minute job limit, with room for the scout and the record.
        expect(definition.batchDeadlineMinutes).toBe(50);
      } else {
        expect(definition.serviceTier, kind).toBe("default");
      }
    }
  });
});
