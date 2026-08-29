import { describe, expect, it } from "vitest";
import { runCycle } from "../src/cycle.js";
import { PHASE_VENTURES, pausedVentureForPhase, readVentureRegistry } from "../src/ventures/registry.js";
import { RunnablePhaseSchema } from "../src/types.js";

/**
 * The owner's per-venture pause switch, end to end at the engine's side.
 *
 * A pause is the registry's own `status: "paused"`, flipped from the admin's Settings page. The
 * whole guarantee is one chokepoint: `runCycle` ends a paused venture's live phase before any
 * agenda, agent, provider or lock. Dry runs stay open on purpose — the suite rehearses room
 * mechanics against fixtures regardless of today's operational state.
 */
describe("the venture pause switch", () => {
  it("maps every pausable phase to a venture the registry actually has", () => {
    const registry = readVentureRegistry();
    const ids = new Set(registry.ventures.map((venture) => venture.id));
    for (const [phase, ventureId] of Object.entries(PHASE_VENTURES)) {
      expect(RunnablePhaseSchema.options, phase).toContain(phase);
      expect(ids.has(ventureId), `${phase} -> ${ventureId}`).toBe(true);
    }
  });

  it("never gates the shared machinery or the council", () => {
    // The Design Lab renders every venture's decks, GoVIRAL supplies the magazines and FightAIQ
    // is MMA Files' data supplier — none of them may be paused from Settings, so none of their
    // phases may resolve to a venture here. The council shifts are company-wide.
    const gatedVentures = new Set(Object.values(PHASE_VENTURES));
    for (const ventureId of ["carousel-studio", "goviral", "fightaiq", "webdev-signal"]) {
      expect(gatedVentures.has(ventureId), ventureId).toBe(false);
    }
    const registry = readVentureRegistry();
    for (const phase of ["morning", "afternoon", "night", "studio", "gv-brief", "mma-intake", "mma-analysis"] as const) {
      expect(pausedVentureForPhase(registry, phase), phase).toBeNull();
    }
  });

  it("resolves a paused venture's phases and leaves an operating venture's alone", () => {
    const registry = readVentureRegistry();
    // Door Money is paused in the committed registry — the owner's 2026-08-29 call.
    expect(pausedVentureForPhase(registry, "dm-desk")).toBe("door-money");
    expect(pausedVentureForPhase(registry, "dm-growth")).toBe("door-money");
    expect(pausedVentureForPhase(registry, "cu-edition")).toBeNull();
    expect(pausedVentureForPhase(registry, "bh-desk")).toBeNull();
  });

  it("ends a paused venture's live phase before anything runs, at zero dollars", async () => {
    for (const phase of ["dm-desk", "dm-growth"] as const) {
      const result = await runCycle({
        phase,
        dry: false,
        explainBudget: false,
        explainRouting: false,
        now: new Date("2026-12-02T13:00:00.000Z")
      });
      expect(result).toMatchObject({
        status: "paused",
        decision: "PAUSED",
        estimatedWorstCaseUsd: 0,
        selectedAgents: [],
        artifacts: []
      });
    }
  });
});
