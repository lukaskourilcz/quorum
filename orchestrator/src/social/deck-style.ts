import { readFile } from "node:fs/promises";
import path from "node:path";
import { DECK_STYLES, deckStyleFor, type DeckStyle } from "@boardlessai/carousel-studio";

const OVERRIDES_PATH = "ventures/carousel-studio/deck-style-overrides.json";

/**
 * The deck design one article ships with.
 *
 * By default the date or the slug picks it, so a replay renders identical bytes. The /admin
 * switcher used to change a preview and nothing else — the shipped deck kept the derived style
 * — so an owner choosing a design changed a picture on a screen and no bytes anywhere. An entry
 * in the override file wins; everything else is unchanged, and the deck carries the same text
 * and the same photograph either way.
 *
 * An article is identified by venture, slug *and* date: three redeliveries of one MMA event
 * share a slug, and the owner picking a design for one of them must not silently repaint the
 * other two. An exact `venture+slug+date` record wins; a record written before dates existed
 * still answers for every redelivery of its slug, so nothing already chosen comes unbound.
 */
export async function effectiveDeckStyle(input: {
  root: string;
  venture: "caught-up" | "mma-files";
  slug: string;
  date: string;
  seed: string;
}): Promise<DeckStyle> {
  const derived = deckStyleFor(input.seed, DECK_STYLES) as DeckStyle;
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(input.root, OVERRIDES_PATH), "utf8"));
  } catch {
    return derived;
  }
  const overrides = (raw as { overrides?: unknown }).overrides;
  if (!Array.isArray(overrides)) return derived;
  const forArticle = overrides.filter((entry) => {
    const override = entry as { venture?: unknown; slug?: unknown };
    return override?.venture === input.venture && override.slug === input.slug;
  }) as Array<{ date?: unknown; style?: unknown }>;
  const match = forArticle.find((entry) => entry.date === input.date)
    ?? forArticle.find((entry) => entry.date === undefined);
  return typeof match?.style === "string" && (DECK_STYLES as readonly string[]).includes(match.style)
    ? match.style as DeckStyle
    : derived;
}
