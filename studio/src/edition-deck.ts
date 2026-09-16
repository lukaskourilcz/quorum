/**
 * The DNESKAi promotion deck: one edition, five slides, one ask.
 *
 * A second builder rather than a flag on `buildArticleDeck`, because the two answer different
 * questions. That one turns an article into as many slides as its argument needs — five to seven,
 * closing on the magazine's standing line — and it is the edition, split. This one is a repost: it
 * meets a reader who has never opened DNESKAi, on somebody else's feed, and it has five fixed
 * beats to say what happened, why it matters, what changed, what else is in the edition, and where
 * to go next. The count is fixed because the last slide is the only one that asks for anything,
 * and a deck whose length varies day to day puts that ask somewhere different every day.
 *
 * Every word on it is the editor's own. The frontmatter already carries four of the five beats as
 * named fields — `title`, `why_it_matters`, `what_changed`, `dispatches` — so nothing here
 * summarises, rewrites or invents. It selects, in the order the editor wrote, and it reports what
 * did not fit rather than dropping it quietly: `PromotionBeat.carried` against `.available` is how
 * a reader of the record sees that a three-point argument reached the deck as two. The fifth beat,
 * the call to action, is the caller's, because what a reader is being asked to do is configuration
 * and not something a deck builder may decide.
 *
 * No model call, no clock and no die. The same edition renders the same deck forever.
 */

import { MAX_SLIDE_WORDS, packIntoSlides, wordCount, type Slide } from "./slides.js";

/**
 * Two Briefs on the fourth slide.
 *
 * Enough to show the edition holds more than its lead story, few enough that both titles are read
 * rather than scanned. Every edition on file carries four; the deck shows the first two and the
 * record says how many there were.
 */
export const PROMOTION_BRIEF_COUNT = 2;

/** Lead, why it matters, what changed, two Briefs, call to action. In that order, always. */
export const PROMOTION_SLIDE_COUNT = 5;

/** Between two Brief titles on one slide. The same middot the kicker and the source line use. */
const BRIEF_SEPARATOR = " · ";

/** Between two of the editor's points on one slide. They are whole sentences; a space is enough. */
const POINT_SEPARATOR = " ";

export interface EditionPromotionInput {
  title: string;
  /** The desk's cover line, when it wrote one. A title is written for a page, a cover for a feed. */
  coverLine?: string | undefined;
  whyItMatters: readonly string[];
  whatChanged: readonly string[];
  /** The Briefs' own titles. A Brief's body is a paragraph; a slide holds the headline. */
  briefTitles: readonly string[];
  /** The one ask, already resolved by the caller, and the only slide that points anywhere. */
  cta: string;
}

/** What one beat carries, and what it had to leave behind. */
export interface PromotionBeat {
  text: string;
  /** How many of the editor's points this slide carries whole. */
  carried: number;
  /** How many they wrote. Equal to `carried` when the whole beat fitted on the slide. */
  available: number;
}

export interface EditionPromotionDeck {
  built: true;
  slides: Slide[];
  beats: {
    whyItMatters: PromotionBeat;
    whatChanged: PromotionBeat;
    briefs: PromotionBeat;
  };
}

export interface EditionPromotionRefusal {
  built: false;
  /** Why there is no deck, in the words a record would use. */
  reason: string;
}

export type EditionPromotionResult = EditionPromotionDeck | EditionPromotionRefusal;

/** One slide's worth of a single string, cut at a sentence boundary rather than mid-clause. */
function oneSlide(value: string): string | null {
  const [first] = packIntoSlides(value.trim());
  return first ?? null;
}

/**
 * Pack the editor's points onto one slide, in their order, and say how many made it.
 *
 * A prefix rather than a sample, for the same reason `choosePassages` takes one: a reader who
 * stops after the first point has read the beginning of the argument and not a shuffle of its
 * middle. `available` is the count the editor wrote, which for the Briefs is the whole set rather
 * than the two this deck shows.
 */
function packBeat(
  points: readonly string[],
  separator: string,
  available?: number
): PromotionBeat | null {
  const usable = points.map((point) => point.trim()).filter(Boolean);
  if (usable.length === 0) return null;
  const text = oneSlide(usable.join(separator));
  if (text === null) return null;
  return {
    text,
    carried: usable.filter((point) => text.includes(point)).length,
    available: available ?? usable.length
  };
}

/**
 * Build the deck, or say why there is none.
 *
 * Refusal is a real outcome and not an error: an edition with no Briefs has no fourth slide, and
 * padding it with a line the editor did not write is how a carousel starts making claims the
 * edition does not. The caller records the reason and ships nothing.
 */
export function buildEditionPromotionDeck(input: EditionPromotionInput): EditionPromotionResult {
  const lead = oneSlide(input.coverLine?.trim() || input.title);
  if (lead === null) return { built: false, reason: "The edition has no headline to lead on." };

  const whyItMatters = packBeat(input.whyItMatters, POINT_SEPARATOR);
  if (!whyItMatters) return { built: false, reason: "The edition records no why-it-matters point." };

  const whatChanged = packBeat(input.whatChanged, POINT_SEPARATOR);
  if (!whatChanged) return { built: false, reason: "The edition records no what-changed point." };

  const briefs = packBeat(
    input.briefTitles.slice(0, PROMOTION_BRIEF_COUNT),
    BRIEF_SEPARATOR,
    input.briefTitles.filter((title) => title.trim()).length
  );
  if (!briefs) return { built: false, reason: "The edition carries no Briefs, so the deck has no fourth slide." };

  // The one beat that is configuration rather than editorial copy, so an over-long one is refused
  // instead of trimmed: a call to action cut in half is a call to action nobody can act on, and
  // the owner can fix the line they wrote.
  const cta = input.cta.trim();
  if (cta.length === 0) return { built: false, reason: "The deck has no call to action to close on." };
  if (wordCount(cta) > MAX_SLIDE_WORDS) {
    return {
      built: false,
      reason: `The call to action is ${wordCount(cta)} words, over the ${MAX_SLIDE_WORDS}-word slide limit.`
    };
  }

  return {
    built: true,
    slides: [
      { kind: "cover", text: lead },
      // The second slide is where a returning reader starts, because the platform re-serves a
      // carousel on a slide they have not seen. Why it matters is the beat that earns the swipe.
      { kind: "hook", text: whyItMatters.text },
      { kind: "body", text: whatChanged.text },
      { kind: "body", text: briefs.text },
      { kind: "outro", text: cta }
    ],
    beats: { whyItMatters, whatChanged, briefs }
  };
}
