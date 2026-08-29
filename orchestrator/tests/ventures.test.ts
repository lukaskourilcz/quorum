import path from "node:path";
import { describe, expect, it } from "vitest";
import legacy from "./fixtures/ventures/caught-up-pre-registry.json" with { type: "json" };
import type { BudgetLedgerEntry } from "../src/budget.js";
import { loadRoutingConfig, routeBoardroom } from "../src/boardroom/router.js";
import { configRoot } from "../src/paths.js";
import { summarizeVentureSpend } from "../src/ventures/accounting.js";
import {
  composeMeetingRouteDefinition,
  cronPayloads,
  dayDispatchedKinds,
  loadVentureRegistry,
  resolveMeetingClock,
  ventureIdForPhase
} from "../src/ventures/registry.js";
import { RunnablePhaseSchema, type ScheduledPhase } from "../src/types.js";

describe("venture registry migration", () => {
  /*
   * The registry migration's promise, as it stands after `operations-2026-08c`.
   *
   * It used to be "Caught Up meets at 05, 06, 14, 17 and 22 Prague, exactly as it did before the
   * venture registry existed" — a byte-equal clock. The owner consolidated that clock on
   * 2026-08-29: DNESKAi keeps one slot at 05:00 and runs both its rooms inside it, and two of the
   * three company shifts were retired. What the migration still may never do is lose a room, so
   * that is what this proves now: every phase the legacy fixture named still has its definition,
   * and each one that left the clock left it because a venture day dispatches it.
   */
  it("keeps every legacy room defined, and only loses a slot to the day that dispatches it", async () => {
    const registry = await loadVentureRegistry();
    const clockPhases = new Set(resolveMeetingClock(registry).map(({ phase }) => phase));
    const dispatched = dayDispatchedKinds(registry);
    const defined = new Set(registry.ventures.flatMap((venture) => venture.meetings.map(({ kind }) => kind)));
    const shifts = new Set(["morning", "afternoon", "night"]);
    for (const { phase } of legacy.clock as ReadonlyArray<{ phase: ScheduledPhase }>) {
      if (shifts.has(phase)) continue;
      expect(defined.has(phase), `${phase} lost its definition`).toBe(true);
      if (clockPhases.has(phase)) continue;
      expect(dispatched.has(phase), `${phase} left the clock without a day to run it`).toBe(true);
    }
    // The retired shifts are a schedule decision, not a deletion: they stay runnable by hand.
    expect(RunnablePhaseSchema.options).toEqual(expect.arrayContaining(["afternoon", "night"]));
    expect(clockPhases.has("morning")).toBe(true);
  });

  it.each([
    { kind: "cu-edition", mode: "dry" },
    { kind: "cu-edition", mode: "live" },
    { kind: "cu-product", mode: "dry" },
    { kind: "cu-product", mode: "live" }
  ] as const)("keeps the $kind $mode room packet byte-equivalent", async ({ kind, mode }) => {
    const [registry, routing] = await Promise.all([
      loadVentureRegistry(),
      loadRoutingConfig(path.join(configRoot, "agent-routing.json"))
    ]);
    const definition = composeMeetingRouteDefinition(registry, kind, mode);
    const common = {
      roomId: `ROOM-${kind.toUpperCase()}-${mode.toUpperCase()}`,
      topicType: definition.topicType,
      objective: definition.objective,
      evidenceRefs: [],
      decisionNeeded: definition.decisionNeeded,
      riskTags: [],
      budgetImpactUsd: definition.envelopeUsd,
      preset: definition.preset,
      now: new Date("2026-08-04T03:00:00.000Z")
    };
    const before = routeBoardroom(routing, common);
    const after = routeBoardroom(routing, {
      ...common,
      requiredParticipants: definition.requiredParticipants
    });
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
  });

  it("attributes legacy and tagged ledger entries through the registry", async () => {
    const registry = await loadVentureRegistry();
    const entries = [
      {
        ts: "2026-08-04T03:00:00.000Z",
        cycleId: "edition",
        requestHash: "edition-request",
        phase: "cu-edition",
        agent: "HERALD",
        provider: "anthropic",
        model: "fixture",
        serviceTier: "default",
        tokensIn: 1,
        cachedTokensIn: 0,
        tokensOut: 1,
        toolUses: 0,
        usd: 0.04,
        kind: "text"
      },
      {
        ts: "2026-08-04T15:00:00.000Z",
        cycleId: "product",
        requestHash: "product-request",
        phase: "cu-product",
        ventureId: "caught-up",
        agent: "VAULT",
        provider: "anthropic",
        model: "fixture",
        serviceTier: "default",
        tokensIn: 1,
        cachedTokensIn: 0,
        tokensOut: 1,
        toolUses: 0,
        usd: 0.03,
        kind: "text"
      }
    ] satisfies BudgetLedgerEntry[];
    expect(summarizeVentureSpend(entries, registry, "2026-08")).toEqual([
      { ventureId: "caught-up", usd: 0.07 }
    ]);
  });

  it("attributes every new paid room to its venture", async () => {
    const registry = await loadVentureRegistry();
    expect(["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"].map((phase) => [phase, ventureIdForPhase(registry, phase)])).toEqual([
      ["bh-desk", "booksofhistory"],
      ["dm-desk", "door-money"],
      ["dm-growth", "door-money"],
      ["ts-desk", "tehdejsi-svet"],
      ["kv-desk", "kvorum"]
    ]);
    const entries = ["bh-desk", "dm-desk", "dm-growth", "ts-desk", "kv-desk"].map((phase, index) => ({
      ts: "2026-08-13T12:00:00.000Z",
      cycleId: `cycle-${phase}`,
      requestHash: `${phase}-request`,
      phase,
      agent: "FIXTURE",
      provider: "openai",
      model: "fixture",
      serviceTier: "default" as const,
      tokensIn: 1,
      cachedTokensIn: 0,
      tokensOut: 1,
      toolUses: 0,
      usd: (index + 1) / 100,
      kind: "text" as const
    })) satisfies BudgetLedgerEntry[];
    expect(summarizeVentureSpend(entries, registry, "2026-08")).toEqual([
      { ventureId: "booksofhistory", usd: 0.01 },
      { ventureId: "door-money", usd: 0.05 },
      { ventureId: "kvorum", usd: 0.05 },
      { ventureId: "tehdejsi-svet", usd: 0.04 }
    ]);
  });

  it("pins Kvórum to the Design Lab with no image-model or freeform rendering path", async () => {
    const registry = await loadVentureRegistry();
    expect(registry.ventures.find((venture) => venture.id === "kvorum")?.rendering).toEqual({
      path: "design-lab",
      imageGeneration: false,
      freeformSocialImages: false
    });
  });
});
