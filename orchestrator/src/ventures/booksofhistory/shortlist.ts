import { BhShortlistSchema, type BhShortlist } from "../../contracts/bh-shortlist.js";
import type { BhSeedRecord } from "../../contracts/bh-seed.js";
import { atomicWriteJson } from "../../state.js";
import { BOOKSOFHISTORY_SEED_PATH } from "./seed.js";
import {
  scoreBhOpportunities,
  type BhOpportunityContext
} from "./score.js";

export const bhShortlistPath = (date: string) => `ventures/booksofhistory/shortlists/${date}.json`;

export function buildBhShortlist(input: {
  date: string;
  cycleId: string;
  asOf: Date;
  books: readonly BhSeedRecord[];
  context: BhOpportunityContext;
  contextRefs?: Partial<BhShortlist["contextRefs"]>;
}): BhShortlist {
  const byId = new Map(input.books.map((book) => [book.bookId, book]));
  const entries = scoreBhOpportunities(input.books, input.context).slice(0, 10).map((score, index) => {
    const book = byId.get(score.bookId)!;
    return {
      rank: index + 1,
      bookId: book.bookId,
      bookRef: `${BOOKSOFHISTORY_SEED_PATH}#${book.bookId}`,
      title: book.title,
      author: book.author,
      totalScore: score.totalScore,
      culturalMoment: score.factors.trendCrossover.strength > 0,
      factors: score.factors
    };
  });
  return BhShortlistSchema.parse({
    schemaVersion: "bh-shortlist/1",
    date: input.date,
    cycleId: input.cycleId,
    asOf: input.asOf.toISOString(),
    seedRef: BOOKSOFHISTORY_SEED_PATH,
    contextRefs: {
      trendPlan: input.contextRefs?.trendPlan ?? null,
      recentFeatures: input.contextRefs?.recentFeatures ?? [],
      lanePerformance: input.contextRefs?.lanePerformance ?? [],
      shelfDossiers: input.contextRefs?.shelfDossiers ?? []
    },
    entries,
    recordedAt: input.asOf.toISOString()
  });
}

export async function writeBhShortlist(root: string, shortlist: BhShortlist): Promise<string> {
  const relative = bhShortlistPath(shortlist.date);
  await atomicWriteJson(root, relative, BhShortlistSchema.parse(shortlist));
  return relative;
}
