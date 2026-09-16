import type { CarouselFormat } from "./schema.js";

/**
 * What the platforms accept, checked against a whole rendered deck rather than a slide.
 *
 * The template checks in `validation.ts` look at one slide's geometry, colour and copy. None of
 * them can say that a deck has too many slides, mixes two canvases, or would not upload as a
 * LinkedIn document, because each of those is a property of the deck. This is the deck-level
 * gate, run where a deck is assembled for export, and its failing detail is the refusal text.
 */

/** Instagram carousels carry at most twenty items. */
export const INSTAGRAM_MAX_SLIDES = 20;
/** A LinkedIn document post is at most 300 pages. */
export const LINKEDIN_MAX_PAGES = 300;
/** ... and at most 100 MB. */
export const LINKEDIN_MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;

export interface DeckLimitCheck {
  id: "slide-count" | "single-format" | "linkedin-pages" | "linkedin-size";
  /** `not-measured` says the check could not run; it is neither a pass nor a failure. */
  status: "pass" | "fail" | "not-measured";
  detail: string;
}

export interface DeckPlanSlide {
  format: CarouselFormat;
  /** The rendered PNG's length, when the deck has been rasterised. */
  pngBytes?: number;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateDeckLimits(slides: readonly DeckPlanSlide[]): DeckLimitCheck[] {
  const count = slides.length;
  const formats = [...new Set(slides.map((slide) => slide.format))];
  // Instagram applies one orientation to every item, so a deck is one canvas or it is not a deck.
  const singleFormat: DeckLimitCheck = count === 0
    ? { id: "single-format", status: "fail", detail: "The deck has no slides, so it has no canvas." }
    : formats.length === 1
      ? { id: "single-format", status: "pass", detail: `Every slide is ${formats[0]}.` }
      : { id: "single-format", status: "fail", detail: `Instagram applies one canvas to every item; this deck mixes ${formats.join(", ")}.` };
  const slideCount: DeckLimitCheck = count >= 1 && count <= INSTAGRAM_MAX_SLIDES
    ? { id: "slide-count", status: "pass", detail: `${count} slide${count === 1 ? "" : "s"}, within Instagram's ${INSTAGRAM_MAX_SLIDES}.` }
    : { id: "slide-count", status: "fail", detail: count === 0 ? "The deck has no slides." : `${count} slides; Instagram carries at most ${INSTAGRAM_MAX_SLIDES}.` };
  const pages: DeckLimitCheck = count >= 1 && count <= LINKEDIN_MAX_PAGES
    ? { id: "linkedin-pages", status: "pass", detail: `${count} page${count === 1 ? "" : "s"} as a LinkedIn document, within ${LINKEDIN_MAX_PAGES}.` }
    : { id: "linkedin-pages", status: "fail", detail: count === 0 ? "The deck has no pages." : `${count} pages; a LinkedIn document carries at most ${LINKEDIN_MAX_PAGES}.` };
  // The size is the sum of the rendered bytes, so it exists only once the deck is rendered. A
  // plan without them is reported as unmeasured rather than passed on an estimate of nothing.
  const measured = count > 0 && slides.every((slide) => typeof slide.pngBytes === "number" && Number.isFinite(slide.pngBytes) && slide.pngBytes >= 0);
  const bytes = measured ? slides.reduce((sum, slide) => sum + (slide.pngBytes ?? 0), 0) : null;
  const size: DeckLimitCheck = bytes === null
    ? { id: "linkedin-size", status: "not-measured", detail: "LinkedIn document size not measured: the deck has not been rendered to PNG." }
    : bytes <= LINKEDIN_MAX_DOCUMENT_BYTES
      ? { id: "linkedin-size", status: "pass", detail: `${megabytes(bytes)} as a LinkedIn document, within ${megabytes(LINKEDIN_MAX_DOCUMENT_BYTES)}.` }
      : { id: "linkedin-size", status: "fail", detail: `${megabytes(bytes)}; a LinkedIn document is at most ${megabytes(LINKEDIN_MAX_DOCUMENT_BYTES)}.` };
  return [slideCount, singleFormat, pages, size];
}

/** The checks that refuse an export. An unmeasured size is not a refusal; a failure is. */
export function deckLimitFailures(checks: readonly DeckLimitCheck[]): DeckLimitCheck[] {
  return checks.filter((check) => check.status === "fail");
}
