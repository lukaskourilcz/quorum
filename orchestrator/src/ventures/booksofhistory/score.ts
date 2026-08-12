import type { BhSeedRecord } from "../../contracts/bh-seed.js";

export const BH_ANNIVERSARY_MILESTONES = [25, 50, 75, 100, 150] as const;
export const BH_ANNIVERSARY_RADAR_DAYS = 60;
export const BH_SHELF_STORY_THRESHOLD = 70;

export const BH_PRIOR_WEIGHTS = {
  czechRelevance: 0.14,
  internationalRelevance: 0.16,
  recognition: 0.2,
  significance: 0.18,
  storytellingPotential: 0.2,
  audienceFamiliarity: 0.12
} as const;

export interface BhTrendSignal {
  id: string;
  /** All keywords must occur in the seed's authored title/author/tag vocabulary. */
  keywords: readonly string[];
  /** Recorded GoVIRAL signal strength, bounded to 0–1 by the scorer. */
  strength: number;
}

export interface BhRecentFeature {
  genres: readonly string[];
  geographies: readonly string[];
  period: BhSeedRecord["scoringMetadata"]["period"];
  angleTypes: readonly string[];
}

export interface BhLaneDimensionWeights {
  categories?: Readonly<Record<string, number>>;
  eras?: Readonly<Record<string, number>>;
  geographies?: Readonly<Record<string, number>>;
}

export interface BhLanePerformanceWeights {
  cs?: BhLaneDimensionWeights;
  en?: BhLaneDimensionWeights;
}

export interface BhShelfStory {
  storyId: string;
  score: number;
  used: boolean;
}

export interface BhOpportunityContext {
  asOf: Date;
  trendSignals: readonly BhTrendSignal[];
  recentFeatures: readonly BhRecentFeature[];
  lanePerformance: BhLanePerformanceWeights;
  shelfStoriesByBookId: Readonly<Record<string, readonly BhShelfStory[] | undefined>>;
}

export interface BhOpportunityScore {
  bookId: string;
  totalScore: number;
  factors: {
    priors: {
      score: number;
      weights: typeof BH_PRIOR_WEIGHTS;
      values: Record<keyof typeof BH_PRIOR_WEIGHTS, number>;
    };
    anniversary: {
      multiplier: number;
      strength: number;
      events: Array<{
        kind: "publication" | "author-born" | "author-died";
        milestone: (typeof BH_ANNIVERSARY_MILESTONES)[number];
        daysAway: number | null;
      }>;
    };
    trendCrossover: { multiplier: number; strength: number; matchedSignalIds: string[] };
    diversityPressure: {
      multiplier: number;
      pressure: number;
      byDimension: { genres: number; geographies: number; period: number; angleTypes: number };
    };
    lanePerformance: { multiplier: number; lanes: { cs: number; en: number } };
    shelfBonus: { multiplier: number; eligibleStoryIds: string[]; highestScore: number | null };
  };
}

function rounded(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function priorScore(book: BhSeedRecord): BhOpportunityScore["factors"]["priors"] {
  const values = {
    czechRelevance: book.czechRelevance.score,
    internationalRelevance: book.internationalRelevance.score,
    recognition: book.recognition.score,
    significance: book.significance.score,
    storytellingPotential: book.storytellingPotential.score,
    audienceFamiliarity: (book.audienceFamiliarity.cs.score + book.audienceFamiliarity.en.score) / 2
  };
  const score = Object.entries(BH_PRIOR_WEIGHTS).reduce(
    (sum, [name, weight]) => sum + values[name as keyof typeof values] * weight,
    0
  );
  return { score: rounded(score), weights: BH_PRIOR_WEIGHTS, values };
}

function startOfUtcDay(value: Date): Date {
  if (!Number.isFinite(value.getTime())) throw new Error("BOOKSOFHISTORY scoring requires a valid asOf date");
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function milestone(value: number): value is (typeof BH_ANNIVERSARY_MILESTONES)[number] {
  return (BH_ANNIVERSARY_MILESTONES as readonly number[]).includes(value);
}

function anniversaryFactor(book: BhSeedRecord, asOfInput: Date): BhOpportunityScore["factors"]["anniversary"] {
  const asOf = startOfUtcDay(asOfInput);
  const events: BhOpportunityScore["factors"]["anniversary"]["events"] = [];
  const publicationAge = asOf.getUTCFullYear() - book.year;
  // A seed deliberately stores only publication year. A milestone publication therefore carries
  // a year-wide flag; inventing a day would create false precision in the later 60-day radar.
  if (milestone(publicationAge)) {
    events.push({ kind: "publication", milestone: publicationAge, daysAway: null });
  }

  for (const [kind, date] of [
    ["author-born", book.authorDates?.born],
    ["author-died", book.authorDates?.died]
  ] as const) {
    if (!date) continue;
    const source = new Date(`${date}T00:00:00.000Z`);
    for (const year of [asOf.getUTCFullYear(), asOf.getUTCFullYear() + 1]) {
      const occurrence = new Date(Date.UTC(year, source.getUTCMonth(), source.getUTCDate()));
      if (occurrence.getUTCMonth() !== source.getUTCMonth() || occurrence.getUTCDate() !== source.getUTCDate()) continue;
      const daysAway = Math.round((occurrence.getTime() - asOf.getTime()) / 86_400_000);
      const age = year - source.getUTCFullYear();
      if (daysAway >= 0 && daysAway <= BH_ANNIVERSARY_RADAR_DAYS && milestone(age)) {
        events.push({ kind, milestone: age, daysAway });
      }
    }
  }

  const strength = events.reduce((best, event) => {
    const milestoneStrength = event.milestone / BH_ANNIVERSARY_MILESTONES.at(-1)!;
    const proximity = event.daysAway === null ? 1 : 1 - event.daysAway / (BH_ANNIVERSARY_RADAR_DAYS + 1);
    return Math.max(best, milestoneStrength * proximity);
  }, 0);
  return { multiplier: rounded(1 + 0.25 * strength), strength: rounded(strength), events };
}

function normalizedTokens(values: readonly string[]): Set<string> {
  const tokens = values.flatMap((value) => value
    .normalize("NFKD")
    .replaceAll(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en")
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 2));
  return new Set(tokens);
}

function trendFactor(book: BhSeedRecord, signals: readonly BhTrendSignal[]): BhOpportunityScore["factors"]["trendCrossover"] {
  const vocabulary = normalizedTokens([
    book.title,
    book.originalTitle ?? "",
    book.author,
    ...book.genres,
    ...book.contentCategories,
    ...book.scoringMetadata.geographies,
    ...book.scoringMetadata.angleTypes
  ]);
  const matched = signals.filter((signal) => {
    const keywords = normalizedTokens(signal.keywords);
    return keywords.size > 0 && [...keywords].every((keyword) => vocabulary.has(keyword));
  });
  const strength = clamp(matched.reduce((sum, signal) => sum + clamp(signal.strength, 0, 1), 0), 0, 1);
  return {
    multiplier: rounded(1 + 0.2 * strength),
    strength: rounded(strength),
    matchedSignalIds: matched.map(({ id }) => id).sort((left, right) => left.localeCompare(right, "en"))
  };
}

function overlap(candidate: readonly string[], recent: readonly string[]): number {
  if (candidate.length === 0) return 0;
  const seen = new Set(recent);
  return candidate.filter((value) => seen.has(value)).length / candidate.length;
}

function diversityFactor(
  book: BhSeedRecord,
  recent: readonly BhRecentFeature[]
): BhOpportunityScore["factors"]["diversityPressure"] {
  const dimensions = recent.length === 0
    ? { genres: 0, geographies: 0, period: 0, angleTypes: 0 }
    : recent.reduce((sum, feature) => ({
        genres: sum.genres + overlap(book.genres, feature.genres),
        geographies: sum.geographies + overlap(book.scoringMetadata.geographies, feature.geographies),
        period: sum.period + Number(book.scoringMetadata.period === feature.period),
        angleTypes: sum.angleTypes + overlap(book.scoringMetadata.angleTypes, feature.angleTypes)
      }), { genres: 0, geographies: 0, period: 0, angleTypes: 0 });
  const byDimension = Object.fromEntries(Object.entries(dimensions).map(([key, value]) =>
    [key, rounded(value / Math.max(1, recent.length))]
  )) as BhOpportunityScore["factors"]["diversityPressure"]["byDimension"];
  const pressure = Object.values(byDimension).reduce((sum, value) => sum + value, 0) / 4;
  return { multiplier: rounded(Math.max(0.65, 1 - 0.35 * pressure)), pressure: rounded(pressure), byDimension };
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 1 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function laneFactor(book: BhSeedRecord, weights: BhLaneDimensionWeights | undefined): number {
  if (!weights) return 1;
  const values = [
    ...book.contentCategories.map((key) => weights.categories?.[key] ?? 1),
    weights.eras?.[book.scoringMetadata.period] ?? 1,
    ...book.scoringMetadata.geographies.map((key) => weights.geographies?.[key] ?? 1)
  ].map((value) => clamp(value, 0.75, 1.25));
  return rounded(average(values));
}

function performanceFactor(
  book: BhSeedRecord,
  weights: BhLanePerformanceWeights
): BhOpportunityScore["factors"]["lanePerformance"] {
  const lanes = { cs: laneFactor(book, weights.cs), en: laneFactor(book, weights.en) };
  return { multiplier: rounded((lanes.cs + lanes.en) / 2), lanes };
}

function shelfFactor(stories: readonly BhShelfStory[] | undefined): BhOpportunityScore["factors"]["shelfBonus"] {
  const eligible = (stories ?? [])
    .filter(({ score, used }) => !used && score >= BH_SHELF_STORY_THRESHOLD)
    .sort((left, right) => right.score - left.score || left.storyId.localeCompare(right.storyId, "en"));
  return {
    // The +60% shelf factor is deliberately larger than any single other positive factor: paid
    // knowledge should post before another research call is commissioned.
    multiplier: eligible.length > 0 ? 1.6 : 1,
    eligibleStoryIds: eligible.map(({ storyId }) => storyId),
    highestScore: eligible[0]?.score ?? null
  };
}

export function scoreBhOpportunity(book: BhSeedRecord, context: BhOpportunityContext): BhOpportunityScore {
  const factors = {
    priors: priorScore(book),
    anniversary: anniversaryFactor(book, context.asOf),
    trendCrossover: trendFactor(book, context.trendSignals),
    diversityPressure: diversityFactor(book, context.recentFeatures),
    lanePerformance: performanceFactor(book, context.lanePerformance),
    shelfBonus: shelfFactor(context.shelfStoriesByBookId[book.bookId])
  };
  const totalScore = factors.priors.score
    * factors.anniversary.multiplier
    * factors.trendCrossover.multiplier
    * factors.diversityPressure.multiplier
    * factors.lanePerformance.multiplier
    * factors.shelfBonus.multiplier;
  return { bookId: book.bookId, totalScore: rounded(totalScore), factors };
}

export function scoreBhOpportunities(
  books: readonly BhSeedRecord[],
  context: BhOpportunityContext
): BhOpportunityScore[] {
  return books
    .map((book) => scoreBhOpportunity(book, context))
    .sort((left, right) => right.totalScore - left.totalScore || left.bookId.localeCompare(right.bookId, "en"));
}
