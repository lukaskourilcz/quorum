import { describe, expect, it } from "vitest";
import { ModelRunSchema, type ModelRun } from "../src/contracts/mma.js";
import { buildEdgeReport, buildSlipOfTen } from "../src/fightaiq/slates.js";

function modelRun(coinFlips: number): ModelRun {
  return ModelRunSchema.parse({
    schemaVersion: "model-run/1",
    modelVersion: "mma-1.0.0+1234abcd",
    inputsHash: "a".repeat(64),
    configHash: "b".repeat(64),
    bouts: Array.from({ length: 10 }, (_, index) => {
      const flip = index < coinFlips;
      const redWin = flip ? 0.5 + index * 0.01 : 0.65;
      return {
        boutRef: `bout-${index + 1}`,
        cardSnapshotRefs: [
          `mma/fighters/ufc:red-${index + 1}.json#sha256=${"a".repeat(64)}`,
          `mma/fighters/ufc:blue-${index + 1}.json#sha256=${"b".repeat(64)}`
        ],
        probabilities: {
          redWin, blueWin: 1 - redWin,
          method: { koTko: 0.4, submission: 0.2, decision: 0.4 },
          round: { r1: 0.2, r2: 0.2, r3: 0.2, r4: 0.2, r5: 0.2 },
          uncertainty: flip ? "coin-flip" : "clear-lean",
          marketRedWin: flip ? redWin : 0.55,
          blendedRedWin: redWin
        },
        adjustmentsApplied: [], excludedInputs: []
      };
    }),
    createdAt: "2026-08-01T10:00:00.000Z"
  });
}

const candidates = Array.from({ length: 10 }, (_, index) => ({
  boutRef: `bout-${index + 1}`,
  redPick: `Red ${index + 1}`,
  bluePick: `Blue ${index + 1}`,
  primaryCorner: "red" as const,
  redBookOdds: 1.45,
  blueBookOdds: 2.5,
  note: "Source-backed moneyline candidate with uncertainty shown."
}));

describe("FightAIQ report and ticket construction", () => {
  it("builds every Edge Report line from a named model-run bout", () => {
    const run = modelRun(0);
    const report = buildEdgeReport({ eventRef: "ufc:event:fixture", modelRunRef: "model-run:fixture", modelRun: run, boutRefs: ["bout-1"], calibrationContext: "Fixture calibration has ten resolved bouts and is not conclusive.", generatedAt: "2026-08-01T12:00:00.000Z" });
    expect(report.bouts[0]).toMatchObject({ boutRef: "bout-1", modelProbability: 0.65, marketProbability: 0.55, divergence: 0.1 });
    expect(() => buildEdgeReport({ eventRef: "x", modelRunRef: "x", modelRun: run, boutRefs: ["missing"], calibrationContext: "Missing.", generatedAt: "2026-08-01T12:00:00.000Z" })).toThrow(/does not contain/);
  });

  it("expands one and two genuine coin flips into two and four complete tickets", () => {
    const one = buildSlipOfTen({ eventRefs: ["ufc:event:fixture"], modelRunRef: "model-run:fixture", modelRun: modelRun(1), candidates, stakePerTicketUsd: 2, generatedAt: "2026-08-01T12:00:00.000Z" });
    const two = buildSlipOfTen({ eventRefs: ["ufc:event:fixture"], modelRunRef: "model-run:fixture", modelRun: modelRun(2), candidates, stakePerTicketUsd: 2, generatedAt: "2026-08-01T12:00:00.000Z" });
    expect(one.tickets).toHaveLength(2);
    expect(two.tickets).toHaveLength(4);
    expect(two.tickets.every((ticket) => ticket.picks.length === 10)).toBe(true);
    expect(two.expectedLossLine).toContain("$8.00");
    expect(two.tickets[0]!.picks.slice(2)).toEqual(two.tickets[3]!.picks.slice(2));
  });

  it("never constructs a fifth ticket and keeps the stake small", () => {
    expect(() => buildSlipOfTen({ eventRefs: ["ufc:event:fixture"], modelRunRef: "model-run:fixture", modelRun: modelRun(3), candidates, stakePerTicketUsd: 2, generatedAt: "2026-08-01T12:00:00.000Z" })).toThrow(/fifth ticket/);
    expect(() => buildSlipOfTen({ eventRefs: ["ufc:event:fixture"], modelRunRef: "model-run:fixture", modelRun: modelRun(0), candidates, stakePerTicketUsd: 10, generatedAt: "2026-08-01T12:00:00.000Z" })).toThrow(/five dollars/);
  });
});
