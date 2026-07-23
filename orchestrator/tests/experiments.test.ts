import { describe, expect, it } from "vitest";
import { evaluateExperiment } from "../src/experiments/evaluate.js";
import {
  assertActivatableExperiment,
  assertExperimentUpdate,
  type Experiment
} from "../src/experiments/validate.js";

const experiment: Experiment = {
  id: "EXP-001",
  fixture: false,
  status: "active",
  stage: "VALIDATION",
  segment: "small teams",
  hypothesis: "A qualified visitor completes the value action.",
  offer: "bounded prototype",
  channel: "owned page",
  primaryMetric: "qualifiedActionRate",
  baseline: 0.01,
  target: 0.05,
  startedAtCycle: 3,
  reviewCycle: 8,
  maxCostUsd: 2,
  maxLossUsd: 0,
  stopCondition: "Stop at cap",
  evidenceRefs: ["E-001"],
  decision: null,
  result: null
};

describe("experiment contracts", () => {
  it("rejects target rewriting after start", () => {
    expect(() =>
      assertExperimentUpdate(experiment, { ...experiment, target: 0.02 })
    ).toThrow(/immutable: target/);
  });

  it("rejects fixture activation", () => {
    expect(() =>
      assertActivatableExperiment({ ...experiment, fixture: true })
    ).toThrow(/Fixture/);
  });

  it("uses the preregistered review cycle and target", () => {
    expect(evaluateExperiment(experiment, 7, 0.1, 0.2, 0).decision).toBe(
      "not_due"
    );
    expect(evaluateExperiment(experiment, 8, 0.06, 0.2, 0).decision).toBe(
      "continue"
    );
    expect(evaluateExperiment(experiment, 8, 0.02, 0.2, 0).decision).toBe(
      "pivot"
    );
  });
});
