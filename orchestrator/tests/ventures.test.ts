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
  loadVentureRegistry,
  resolveMeetingClock
} from "../src/ventures/registry.js";

describe("venture registry migration", () => {
  it("keeps the Caught Up clock and cron payloads byte-equivalent", async () => {
    const registry = await loadVentureRegistry();
    const legacyPhases = new Set(legacy.clock.map(({ phase }) => phase));
    const clock = resolveMeetingClock(registry)
      .filter(({ phase }) => legacyPhases.has(phase))
      .map(({ phase, hour, label }) => ({ phase, hour, label }));
    expect(JSON.stringify(clock)).toBe(JSON.stringify(legacy.clock));
    expect(JSON.stringify(cronPayloads(registry).filter(({ phase }) => legacyPhases.has(phase)))).toBe(
      JSON.stringify(legacy.cronPayloads)
    );
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
});
