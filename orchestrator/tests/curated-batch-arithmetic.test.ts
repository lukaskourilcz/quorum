import { describe, expect, it } from "vitest";
import {
  GENERATED_GATE_ESTIMATE_USD,
  IMAGE_GATE_ARTICLE_CAP_USD,
  ImageProgramBudget
} from "../src/images/budget.js";
import { ILLUSTRATION_USD_PER_IMAGE } from "../src/images/illustration.js";
import { CURATED_GATE_ATTEMPTS } from "../src/images/ladder.js";

/**
 * Why the curated rung had to stop making three calls.
 *
 * The rungs share one two-cent article cap, and the illustration rung is last in line. Three
 * one-candidate curated looks spent enough of that cap that a render could never be reserved
 * afterwards — which is the whole reason MMA event articles kept arriving at the drawn plate with
 * budget still nominally unspent.
 *
 * The figures below are the measured ones from the incident, replayed through the real budget so
 * that a change to any cap or estimate fails here rather than quietly closing the rung again.
 */

/** Three separate one-candidate curated calls, as the rung used to make them. */
const CURATED_SEQUENTIAL_USD = 0.00537;
/** One comparative call over the same three candidates. */
const CURATED_BATCHED_USD = 0.0037;
const SEARCH_TWELVE_USD = 0.01224;
const SEARCH_EIGHT_USD = 0.00844;

/** What the illustration rung must be able to reserve: the render and the verdict that follows it. */
const ILLUSTRATION_RESERVATION_USD = ILLUSTRATION_USD_PER_IMAGE + GENERATED_GATE_ESTIMATE_USD;

function afterSearchAndCurated(searchUsd: number, curatedUsd: number): ImageProgramBudget {
  const budget = new ImageProgramBudget({ usd: 0, generatedImages: 0 });
  budget.record(searchUsd);
  budget.record(curatedUsd);
  return budget;
}

describe("what the curated rung leaves for the illustration rung", () => {
  it("refused a render after three separate curated looks, at either shortlist size", () => {
    for (const search of [SEARCH_TWELVE_USD, SEARCH_EIGHT_USD]) {
      const budget = afterSearchAndCurated(search, CURATED_SEQUENTIAL_USD);
      expect(
        budget.reserveGeneratedImage(ILLUSTRATION_USD_PER_IMAGE, GENERATED_GATE_ESTIMATE_USD),
        `search ${search}`
      ).toBe("article-cap");
    }
  });

  it("reaches the render once the curated rung is one call, at a shortlist of eight", () => {
    const budget = afterSearchAndCurated(SEARCH_EIGHT_USD, CURATED_BATCHED_USD);
    expect(budget.articleSpent()).toBeCloseTo(0.01214, 5);
    expect(budget.reserveGeneratedImage(ILLUSTRATION_USD_PER_IMAGE, GENERATED_GATE_ESTIMATE_USD)).toBeNull();
  });

  it("still cannot reach it from a twelve-candidate search, which is honest rather than a regression", () => {
    // Batching bought about $0.0017. A twelve-candidate search costs $0.0038 more than an eight,
    // so the wide search remains the expensive choice and the rung below it stays out of reach.
    const budget = afterSearchAndCurated(SEARCH_TWELVE_USD, CURATED_BATCHED_USD);
    expect(budget.reserveGeneratedImage(ILLUSTRATION_USD_PER_IMAGE, GENERATED_GATE_ESTIMATE_USD)).toBe("article-cap");
  });

  it("keeps the shortlist bounded, because every candidate on it is a thumbnail the model reads", () => {
    expect(CURATED_GATE_ATTEMPTS).toBe(3);
    // The saving is real and it is not licence to widen the shortlist: three batched candidates
    // must still leave the illustration rung reachable after an eight-candidate search.
    expect(SEARCH_EIGHT_USD + CURATED_BATCHED_USD + ILLUSTRATION_RESERVATION_USD)
      .toBeLessThanOrEqual(IMAGE_GATE_ARTICLE_CAP_USD);
  });
});
