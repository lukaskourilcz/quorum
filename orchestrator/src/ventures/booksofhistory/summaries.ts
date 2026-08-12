import {
  booksofhistoryCarouselSummaryPath,
  buildBooksofhistoryCarouselSummary,
  reviewCarouselSummary,
  type CarouselSummary,
  type CarouselSummaryLocale
} from "@boardlessai/carousel-studio";
import {
  VentureRecommendationSchema,
  type VentureRecommendation
} from "../../contracts/venture-recommendation.js";
import { atomicWriteJson } from "../../state.js";

export interface StoredBhCarouselSummary {
  path: string;
  summary: CarouselSummary;
}

export interface StoredBhCarouselSummaries {
  cs: StoredBhCarouselSummary;
  en: StoredBhCarouselSummary;
}

export function bhCarouselSummaryPath(summary: CarouselSummary): string {
  return booksofhistoryCarouselSummaryPath(summary);
}

function buildOneSummary(
  recommendation: VentureRecommendation,
  locale: CarouselSummaryLocale
): CarouselSummary {
  const feature = recommendation.payloads[locale];
  const summary = buildBooksofhistoryCarouselSummary({
    recommendationId: recommendation.recommendationId,
    createdAt: recommendation.createdAt,
    locale,
    feature
  });
  const review = reviewCarouselSummary(summary);
  if (!review.renderable) {
    throw new Error(`BOOKSOFHISTORY ${locale} summary is not renderable: ${review.problems.join(" ")}`);
  }
  return summary;
}

/** Build both independently authored lanes without translating or crossing their payloads. */
export function buildBhCarouselSummaries(
  recommendation: VentureRecommendation
): Pick<StoredBhCarouselSummaries, "cs" | "en"> {
  const parsed = VentureRecommendationSchema.parse(recommendation);
  if (parsed.ventureId !== "booksofhistory" || parsed.evidence.kind !== "dossier-story") {
    throw new Error("Only dossier-story BOOKSOFHISTORY recommendations have twin summaries");
  }
  const cs = buildOneSummary(parsed, "cs");
  const en = buildOneSummary(parsed, "en");
  return {
    cs: { path: bhCarouselSummaryPath(cs), summary: cs },
    en: { path: bhCarouselSummaryPath(en), summary: en }
  };
}

/** Called by approval: one recorded Studio summary per lane, and no render or post side effect. */
export async function storeApprovedBhCarouselSummaries(
  root: string,
  recommendation: VentureRecommendation
): Promise<StoredBhCarouselSummaries> {
  const parsed = VentureRecommendationSchema.parse(recommendation);
  if (parsed.status !== "approved") {
    throw new Error("Only an owner-approved BOOKSOFHISTORY recommendation enters the Design Lab");
  }
  const summaries = buildBhCarouselSummaries(parsed);
  await atomicWriteJson(root, summaries.cs.path, summaries.cs.summary);
  await atomicWriteJson(root, summaries.en.path, summaries.en.summary);
  return summaries;
}
