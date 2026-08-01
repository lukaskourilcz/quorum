import { describe, expect, it } from "vitest";
import { bridgeCrossoverRating, calibration, deVig, loadMmaModelConfig, modelVersion, runMmaModel, seedRatings, sha256, type FighterModelInput } from "../src/fightaiq/engine.js";

const fighter = (ref: string, overrides: Partial<FighterModelInput> = {}): FighterModelInput => ({
  ref, org: "ufc", rating: 1500, deviation: 120, age: 30, reachCm: 180, layoffDays: 100,
  shortNotice: false, missedWeight: false, recentKoLoss: false, homeRegion: false,
  methodWins: { koTko: 4, submission: 2, decision: 4 }, modelEligible: true, ...overrides
});

describe("FightAIQ deterministic model", () => {
  it("couples the release version to the full config and stays byte-identical", async () => {
    const config = await loadMmaModelConfig();
    expect(modelVersion(config)).toMatch(/^mma-1\.0\.0\+[a-f0-9]{8}$/);
    const input = { config, bouts: [{ boutRef: "bout-1", red: fighter("red", { rating: 1570 }), blue: fighter("blue"), marketDecimal: { red: 1.75, blue: 2.1 }, eventStartsAt: "2026-08-08T18:00:00Z" }], createdAt: "2026-08-01T10:00:00Z" };
    expect(JSON.stringify(runMmaModel(input))).toBe(JSON.stringify(runMmaModel(input)));
    expect(runMmaModel(input).configHash).toBe(sha256(config));
    expect(Object.values(runMmaModel(input).bouts[0]!.probabilities.round as Record<string, number>).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 7);
    expect(modelVersion({ ...config, marketBlendWeight: 0.2 })).not.toBe(modelVersion(config));
  });

  it("de-vigs proportionally and removes expired adjustments", async () => {
    const market = deVig(1.8, 2.1);
    expect(market.red + market.blue).toBeCloseTo(1, 10);
    const run = runMmaModel({ config: await loadMmaModelConfig(), bouts: [{ boutRef: "bout-1", red: fighter("red"), blue: fighter("blue"), eventStartsAt: "2026-08-08T18:00:00Z", adjustments: [{ schemaVersion: "adjustment-entry/1", boutRef: "bout-1", author: "TAPE", deltaPct: 3, direction: "red", evidenceRef: "meeting:old", expiresAt: "2026-07-31T18:00:00Z" }] }], createdAt: "2026-08-01T10:00:00Z" });
    expect(run.bouts[0]?.adjustmentsApplied).toHaveLength(0);
    expect(run.bouts[0]?.excludedInputs).toEqual(["expired:meeting:old"]);
  });

  it("rejects ineligible and cross-organization inputs", async () => {
    const config = await loadMmaModelConfig();
    expect(() => runMmaModel({ config, bouts: [{ boutRef: "bad", red: fighter("red", { modelEligible: false }), blue: fighter("blue"), eventStartsAt: "2026-08-08T18:00:00Z" }], createdAt: "2026-08-01T10:00:00Z" })).toThrow(/without corroborated/);
    expect(() => runMmaModel({ config, bouts: [{ boutRef: "bad", red: fighter("red"), blue: fighter("blue", { org: "oktagon" }), eventStartsAt: "2026-08-08T18:00:00Z" }], createdAt: "2026-08-01T10:00:00Z" })).toThrow(/Cross-organization/);
  });

  it("reproduces calibration and keeps rating pools separate", () => {
    expect(calibration([{ probability: 0.7, outcome: 1 }, { probability: 0.4, outcome: 0 }])).toEqual({ sampleSize: 2, brier: 0.125, logLoss: 0.43375028 });
    const ratings = seedRatings([{ org: "ufc", red: "alex", blue: "sam", outcome: "red", happenedAt: "2026-01-01" }, { org: "oktagon", red: "alex", blue: "sam", outcome: "blue", happenedAt: "2026-01-02" }]);
    expect(ratings["ufc:alex"]?.rating).toBeGreaterThan(1500);
    expect(ratings["oktagon:alex"]?.rating).toBeLessThan(1500);
    expect(ratings["ufc:alex"]?.deviation).toBeLessThan(350);
    expect(bridgeCrossoverRating({ rating: 1700, deviation: 90 })).toEqual({ rating: 1600, deviation: 250 });
  });
});
