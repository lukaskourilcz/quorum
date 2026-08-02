import { describe, expect, it } from "vitest";
import { computeAutonomySnapshot } from "../src/autonomy/signals.js";
import { repoRoot, stateRoot } from "../src/paths.js";
import { loadVentureRegistry } from "../src/ventures/registry.js";

describe("every declared growth component has a signal behind it", () => {
  it("implements a metric for each component the registry permits", async () => {
    // Carousel Studio declared live-template-library in config/ventures.json and the schema
    // accepted it, but no metric implemented it, so the venture reported an empty signal
    // list while every other venture reported. Config could declare, code could ignore.
    const registry = await loadVentureRegistry();
    const snapshot = await computeAutonomySnapshot({ repoRoot, stateRoot, now: new Date("2026-08-03T06:00:00.000Z") });
    const declared = registry.ventures.filter((venture) => (venture.growth_objective?.components ?? []).length > 0);
    expect(declared.length).toBeGreaterThan(0);
    for (const venture of declared) {
      const entry = snapshot.growth.find((candidate) => candidate.venture === venture.id);
      expect(entry, `${venture.id} missing from the snapshot`).toBeDefined();
      expect(entry!.signals.length, `${venture.id} declares components but reports no signal`).toBeGreaterThan(0);
    }
  });
});
