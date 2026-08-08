/**
 * The carousel summary: what an article sends to the Design Lab.
 *
 * A delivered article is 1,000–1,200 Czech words. A carousel is a handful of frames. Sending the
 * whole article to the studio would mean the renderer decides what the piece is about, which is a
 * decision the desk already made and wrote down. So delivery hands over a *summary* — the
 * headline, the standfirst, a small ordered set of passages and the sources — and the templates
 * parse that into slides.
 *
 * The function is deterministic and free: splitting prose at a sentence boundary is arithmetic,
 * and a model call here would add cost, latency and a way for a slide to say something the article
 * does not. Same article in, same summary out, so a replayed cycle renders identical bytes.
 *
 * This lives beside `slides.ts` and reuses its splitter rather than re-implementing sentence
 * detection — the Czech boundary rules there (ordinals, "vs.", abbreviations) were found by
 * looking at rendered slides, and a second copy would drift away from them.
 */

import { MAX_SLIDE_WORDS, packIntoSlides, proseFromMdx, wordCount } from "./slides.js";

/** Fewer than this and no template has enough passages for its slide plan. */
export const MIN_SUMMARY_PASSAGES = 3;

/**
 * The ceiling. Template 07 (Stack) has the longest plan at 3–6 passage slides, and the loud
 * templates open one extra slide when a passage will not fit, so eight leaves headroom without
 * turning the carousel back into the article.
 */
export const MAX_SUMMARY_PASSAGES = 8;

export type CarouselSummaryVenture = "caught-up" | "mma-files";

export interface CarouselSummarySource {
  /** How the desk classified it: primary document, record, or an internal verified file. */
  kind: string;
  /** A human label. Never a repository path — those are internal and stay internal. */
  label: string;
}

export interface CarouselSummary {
  schemaVersion: "carousel-summary/1";
  venture: CarouselSummaryVenture;
  /** The article's own slug, which is also how the studio addresses it. */
  slug: string;
  /** Publication date, `YYYY-MM-DD`. */
  date: string;
  /** Czech, because that is what both magazines publish. */
  locale: "cs";
  /** The small mono line every template prints above the headline. */
  kicker: string;
  headline: string;
  standfirst: string;
  /** The body of the carousel, in the order the article makes its argument. */
  passages: string[];
  closing: string;
  sources: CarouselSummarySource[];
  hasHero: boolean;
  /** The photograph's credit, as plain text. A carousel without it is a licence breach. */
  heroCredit: string | null;
}

export interface CarouselSummaryInput {
  venture: CarouselSummaryVenture;
  slug: string;
  date: string;
  title: string;
  dek: string;
  /** A Caught Up edition arrives already structured; those points are the passages. */
  points?: readonly string[];
  /** An MMA Files article arrives as MDX; its middle is cut out of the body. */
  bodyMdx?: string;
  sources?: readonly CarouselSummarySource[];
  hasHero?: boolean;
  heroCredit?: string | null;
}

const KICKER: Record<CarouselSummaryVenture, string> = {
  "caught-up": "DNESKAi",
  "mma-files": "MMA Files"
};

const CLOSING: Record<CarouselSummaryVenture, string> = {
  "caught-up": "Jedno vydání a máte přehled.",
  "mma-files": "Celý ozdrojovaný text najdete v MMA Files."
};

const MONTHS_CS = [
  "led", "úno", "bře", "dub", "kvě", "čvn",
  "čvc", "srp", "zář", "říj", "lis", "pro"
];

/** `MMA Files · 6. srp` — the kicker every template prints, in the language the magazine publishes. */
export function summaryKicker(venture: CarouselSummaryVenture, date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) return KICKER[venture];
  const month = MONTHS_CS[Number(match[2]) - 1];
  return month ? `${KICKER[venture]} · ${Number(match[3])}. ${month}` : KICKER[venture];
}

/** One line, never longer than a slide holds, cut at a sentence boundary rather than mid-clause. */
function oneLine(value: string): string {
  const [first] = packIntoSlides(value.trim());
  return first ?? value.trim().split(/\s+/u).slice(0, MAX_SLIDE_WORDS).join(" ");
}

/**
 * Choose the passages.
 *
 * The article's own order is kept — an argument reordered is an argument changed — and the
 * selection is a prefix, not a sample, so a reader who swipes the carousel reads the beginning of
 * the piece rather than a shuffle of its middle. Anything past the ceiling is simply not sent;
 * the article is where the rest lives, and the closing slide says so.
 */
function choosePassages(input: CarouselSummaryInput): string[] {
  const raw = input.points && input.points.length > 0
    ? input.points.flatMap((point) => packIntoSlides(point))
    : packIntoSlides(proseFromMdx(input.bodyMdx ?? ""));
  return raw
    .map((passage) => passage.trim())
    .filter((passage) => wordCount(passage) > 0)
    .slice(0, MAX_SUMMARY_PASSAGES);
}

/**
 * Build the summary an article sends to the Design Lab.
 *
 * A short article yields few passages and the summary says so rather than padding: a template
 * that needs four passage slides and is given two renders two, because inventing a third is how a
 * carousel starts making claims the article never made. `summaryIsRenderable` is the check a
 * caller runs before queueing one.
 */
export function buildCarouselSummary(input: CarouselSummaryInput): CarouselSummary {
  return {
    schemaVersion: "carousel-summary/1",
    venture: input.venture,
    slug: input.slug,
    date: input.date,
    locale: "cs",
    kicker: summaryKicker(input.venture, input.date),
    headline: oneLine(input.title),
    standfirst: oneLine(input.dek),
    passages: choosePassages(input),
    closing: CLOSING[input.venture],
    sources: [...(input.sources ?? [])],
    hasHero: Boolean(input.hasHero),
    heroCredit: input.heroCredit ?? null
  };
}

export interface CarouselSummaryReview {
  renderable: boolean;
  problems: string[];
}

/** Check a summary against the rules rather than trusting the builder that made it. */
export function reviewCarouselSummary(summary: CarouselSummary): CarouselSummaryReview {
  const problems: string[] = [];
  if (summary.headline.trim().length === 0) problems.push("The summary has no headline.");
  if (summary.standfirst.trim().length === 0) problems.push("The summary has no standfirst.");
  if (summary.passages.length < MIN_SUMMARY_PASSAGES) {
    problems.push(`A summary needs at least ${MIN_SUMMARY_PASSAGES} passages; this one has ${summary.passages.length}.`);
  }
  if (summary.passages.length > MAX_SUMMARY_PASSAGES) {
    problems.push(`A summary may not exceed ${MAX_SUMMARY_PASSAGES} passages; this one has ${summary.passages.length}.`);
  }
  summary.passages.forEach((passage, index) => {
    if (wordCount(passage) > MAX_SLIDE_WORDS) {
      problems.push(`Passage ${index + 1} has ${wordCount(passage)} words, over the ${MAX_SLIDE_WORDS}-word limit.`);
    }
  });
  if (summary.hasHero && !summary.heroCredit) {
    problems.push("The summary carries a hero with no credit, which a carousel cannot print.");
  }
  return { renderable: problems.length === 0, problems };
}

/**
 * The passage-length band a piece of text falls in.
 *
 * The three bands are the studio's own switch — Short ≤ 90 characters, Medium 90–190, Long 190+ —
 * and every template declares a headline size for each. Deriving the band from the text rather
 * than from a slider is what keeps the render deterministic.
 */
export type PassageLength = "short" | "medium" | "long";

export function passageLength(value: string): PassageLength {
  const length = value.trim().length;
  if (length <= 90) return "short";
  return length <= 190 ? "medium" : "long";
}
