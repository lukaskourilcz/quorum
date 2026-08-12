import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BhSeedLibrarySchema, type BhSeedRecord } from "../src/contracts/bh-seed.js";
import {
  BH_ANNIVERSARY_MILESTONES,
  BH_PRIOR_WEIGHTS,
  BH_SHELF_STORY_THRESHOLD,
  scoreBhOpportunities,
  scoreBhOpportunity,
  type BhOpportunityContext
} from "../src/ventures/booksofhistory/score.js";
import { repoRoot } from "../src/paths.js";

async function seedSlice(): Promise<BhSeedRecord[]> {
  const library = BhSeedLibrarySchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "state", "ventures", "booksofhistory", "seed", "library.json"),
    "utf8"
  )) as unknown);
  return ["rur", "frankenstein", "dune"].map((id) => library.books.find(({ bookId }) => bookId === id)!);
}

function context(overrides: Partial<BhOpportunityContext> = {}): BhOpportunityContext {
  return {
    asOf: new Date("2026-08-12T10:00:00.000Z"),
    trendSignals: [],
    recentFeatures: [],
    lanePerformance: {},
    shelfStoriesByBookId: {},
    ...overrides
  };
}

describe("the deterministic BOOKSOFHISTORY opportunity scorer", () => {
  it("blends every prior with the recorded weights", async () => {
    const [book] = await seedSlice();
    const result = scoreBhOpportunity(book!, context());
    const expected = book!.czechRelevance.score * BH_PRIOR_WEIGHTS.czechRelevance
      + book!.internationalRelevance.score * BH_PRIOR_WEIGHTS.internationalRelevance
      + book!.recognition.score * BH_PRIOR_WEIGHTS.recognition
      + book!.significance.score * BH_PRIOR_WEIGHTS.significance
      + book!.storytellingPotential.score * BH_PRIOR_WEIGHTS.storytellingPotential
      + ((book!.audienceFamiliarity.cs.score + book!.audienceFamiliarity.en.score) / 2)
        * BH_PRIOR_WEIGHTS.audienceFamiliarity;
    expect(result.factors.priors.score).toBeCloseTo(expected, 4);
    expect(Object.values(BH_PRIOR_WEIGHTS).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10);
  });

  it.each(BH_ANNIVERSARY_MILESTONES)("recognises a %i-year publication milestone", async (years) => {
    const [source] = await seedSlice();
    const book = { ...source!, year: 2026 - years };
    const anniversary = scoreBhOpportunity(book, context()).factors.anniversary;
    expect(anniversary.events).toContainEqual({ kind: "publication", milestone: years, daysAway: null });
    expect(anniversary.strength).toBeCloseTo(years / 150, 4);
  });

  it("boosts a milestone author anniversary inside the 60-day radar without inventing a publication day", async () => {
    const [source] = await seedSlice();
    const book = {
      ...source!,
      year: 1937,
      authorDates: { born: "1926-09-01", died: "1976-09-15" }
    };
    const anniversary = scoreBhOpportunity(book, context()).factors.anniversary;
    expect(anniversary.events).toEqual([
      { kind: "author-born", milestone: 100, daysAway: 20 },
      { kind: "author-died", milestone: 50, daysAway: 34 }
    ]);
    expect(anniversary.multiplier).toBeGreaterThan(1);
  });

  it("matches recorded trend keywords, caps their strength and records the signal ids", async () => {
    const [book] = await seedSlice();
    const trend = scoreBhOpportunity(book!, context({
      trendSignals: [
        { id: "z-signal", keywords: ["science fiction"], strength: 0.7 },
        { id: "a-signal", keywords: ["czechia"], strength: 0.8 },
        { id: "no-match", keywords: ["cookbook"], strength: 1 }
      ]
    })).factors.trendCrossover;
    expect(trend).toEqual({ multiplier: 1.2, strength: 1, matchedSignalIds: ["a-signal", "z-signal"] });
  });

  it("penalises repeated genres, geography, period and angle without falling below its floor", async () => {
    const [book] = await seedSlice();
    const same = {
      genres: book!.genres,
      geographies: book!.scoringMetadata.geographies,
      period: book!.scoringMetadata.period,
      angleTypes: book!.scoringMetadata.angleTypes
    };
    const neutral = scoreBhOpportunity(book!, context()).factors.diversityPressure;
    const repeated = scoreBhOpportunity(book!, context({ recentFeatures: [same, same] })).factors.diversityPressure;
    expect(neutral).toMatchObject({ multiplier: 1, pressure: 0 });
    expect(repeated).toMatchObject({ multiplier: 0.65, pressure: 1 });
  });

  it("applies bounded owner-entered weights per lane and keeps missing dimensions neutral", async () => {
    const [book] = await seedSlice();
    const performance = scoreBhOpportunity(book!, context({
      lanePerformance: {
        cs: { categories: { "genre-invention": 9 }, eras: { "20th": 0.1 } },
        en: { geographies: { czechia: 1.2 } }
      }
    })).factors.lanePerformance;
    expect(performance.lanes.cs).toBeGreaterThanOrEqual(0.75);
    expect(performance.lanes.cs).toBeLessThanOrEqual(1.25);
    expect(performance.lanes.en).toBeGreaterThan(1);
  });

  it("makes an unused above-threshold dossier story the strongest positive factor", async () => {
    const [book] = await seedSlice();
    const score = scoreBhOpportunity(book!, context({
      shelfStoriesByBookId: {
        [book!.bookId]: [
          { storyId: "used", score: 99, used: true },
          { storyId: "below", score: BH_SHELF_STORY_THRESHOLD - 1, used: false },
          { storyId: "ready", score: BH_SHELF_STORY_THRESHOLD, used: false }
        ]
      }
    }));
    expect(score.factors.shelfBonus).toEqual({
      multiplier: 1.6,
      eligibleStoryIds: ["ready"],
      highestScore: BH_SHELF_STORY_THRESHOLD
    });
    expect(score.factors.shelfBonus.multiplier).toBeGreaterThan(score.factors.anniversary.multiplier);
    expect(score.factors.shelfBonus.multiplier).toBeGreaterThan(score.factors.trendCrossover.multiplier);
  });

  it("is byte-stable, sorted and does not mutate the fixture library slice", async () => {
    const books = await seedSlice();
    const before = JSON.stringify(books);
    const scoringContext = context({
      trendSignals: [{ id: "publishing", keywords: ["publishing"], strength: 0.5 }],
      shelfStoriesByBookId: { dune: [{ storyId: "dune-shelf", score: 91, used: false }] }
    });
    const first = scoreBhOpportunities(books, scoringContext);
    const second = scoreBhOpportunities(books, scoringContext);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.map(({ totalScore }) => totalScore)).toEqual(
      [...first.map(({ totalScore }) => totalScore)].sort((left, right) => right - left)
    );
    expect(first[0]?.bookId).toBe("dune");
    expect(JSON.stringify(books)).toBe(before);
  });
});
