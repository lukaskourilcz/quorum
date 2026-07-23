import { describe, expect, it } from "vitest";
import {
  evaluateKpi,
  targetWasLoosened,
  type KpiDefinition
} from "../src/metrics/kpi.js";

const definition: KpiDefinition = {
  id: "pulse.action",
  owner: "PULSE",
  metric: "qualifiedActionRate",
  target: 0.05,
  dir: "up",
  requires: "analytics"
};

describe("KPI semantics", () => {
  it("uses n/a for unavailable instrumentation and zero for observed zero", () => {
    const unavailable = evaluateKpi(definition, 0, {
      stage: "VALIDATION",
      cycleNumber: 20,
      capabilities: new Set()
    });
    expect(unavailable.status).toBe("n/a");
    expect(unavailable.value).toBeNull();

    const observed = evaluateKpi(definition, 0, {
      stage: "VALIDATION",
      cycleNumber: 20,
      capabilities: new Set(["analytics"])
    });
    expect(observed.status).toBe("fail");
    expect(observed.value).toBe(0);
  });

  it("detects anti-Goodhart target loosening", () => {
    expect(
      targetWasLoosened(definition, { ...definition, target: 0.02 })
    ).toBe(true);
    expect(
      targetWasLoosened(definition, { ...definition, target: 0.08 })
    ).toBe(false);
  });
});
