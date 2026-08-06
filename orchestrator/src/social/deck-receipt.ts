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
  venture: "caught-up" | "mma-files";
  date: string;
  slug: string;
  templateId: string;
  style: string;
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
    slideCount: input.slideCount,
    hashes: [...input.hashes]
  });
  return relative;
}
