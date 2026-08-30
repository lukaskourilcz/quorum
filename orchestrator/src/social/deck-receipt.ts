import type { CarouselSummaryVenture } from "@boardlessai/carousel-studio";
import { atomicWriteJson } from "../state.js";

/**
 * What was rendered from a released article, written where the engine KPI can count it.
 *
 * The renderer costs nothing and is deterministic, so "every released article has a deck" is a
 * claim about whether the pipeline ran, not about a budget. Nothing wrote these receipts, so
 * `released_deck_rate` had nothing to read and reported zero on days the decks were rendered.
 */
export async function writeDeckReceipt(input: {
  root: string;
  /**
   * Any venture that records a bounded summary.
   *
   * Two magazines wrote receipts because only two had a render path. The four newer desks now
   * produce decks through the same module, and a receipt they cannot be written into is a deck
   * whose design and hashes nothing remembers.
   */
  venture: CarouselSummaryVenture;
  date: string;
  slug: string;
  templateId: string;
  style: string;
  /**
   * The complete design this render used.
   *
   * The receipt is also the venture's memory: `deriveRecipe` reads the last families shipped so a
   * week of articles never repeats one back to back. A style string alone could not answer that
   * once a design became five fields.
   */
  recipe?: unknown;
  slideCount: number;
  hashes: readonly string[];
}): Promise<string> {
  const relative = `ventures/carousel-studio/deck-receipts/${input.venture}-${input.date}-${input.slug}.json`;
  await atomicWriteJson(input.root, relative, {
    schemaVersion: "deck-render-receipt/1",
    venture: input.venture,
    date: input.date,
    slug: input.slug,
    templateId: input.templateId,
    style: input.style,
    ...(input.recipe === undefined ? {} : { recipe: input.recipe }),
    slideCount: input.slideCount,
    hashes: [...input.hashes]
  });
  return relative;
}
