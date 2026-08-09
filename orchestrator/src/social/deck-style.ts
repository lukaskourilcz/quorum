import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  CarouselRecipeSchema,
  DECK_DESIGNS,
  DECK_STYLES,
  deriveRecipe,
  isDeckStyle,
  type CarouselRecipe,
  type DeckStyle,
  type RecipeHistoryEntry
} from "@boardlessai/carousel-studio";

const OVERRIDES_PATH = "ventures/carousel-studio/deck-style-overrides.json";
const RECEIPTS_PATH = "ventures/carousel-studio/deck-receipts";

/**
 * What the venture has recently shipped, newest first.
 *
 * Recorded state, not a clock. The receipts are already one per article and already carry the
 * design they rendered, so the anti-repeat memory reads the same file the engine KPI counts —
 * which is what makes a replay of last Tuesday land on last Tuesday's family instead of on
 * today's.
 */
export async function readRecipeHistory(root: string, venture: "caught-up" | "mma-files"): Promise<RecipeHistoryEntry[]> {
  let names: string[];
  try {
    names = await readdir(path.join(root, RECEIPTS_PATH));
  } catch {
    return [];
  }
  const entries: RecipeHistoryEntry[] = [];
  for (const name of names.filter((entry) => entry.startsWith(`${venture}-`) && entry.endsWith(".json")).sort().reverse()) {
    try {
      const raw = JSON.parse(await readFile(path.join(root, RECEIPTS_PATH, name), "utf8")) as {
        date?: unknown;
        style?: unknown;
        recipe?: { family?: unknown };
      };
      const family = typeof raw.recipe?.family === "string" ? raw.recipe.family : raw.style;
      if (typeof raw.date === "string" && typeof family === "string") entries.push({ date: raw.date, family });
    } catch {
      // A receipt that will not parse is a gap in the memory, not a reason to stop deriving.
    }
  }
  return entries.sort((left, right) => right.date.localeCompare(left.date));
}

/** Whatever the owner pinned for one article: any subset of the recipe's fields. */
export interface RecipeOverride {
  venture: "caught-up" | "mma-files";
  slug: string;
  date?: string;
  family?: string;
  variant?: "A" | "B";
  accentSwap?: boolean;
  treatment?: "none" | "mono" | "duotone";
  typeScale?: number;
}

/**
 * The owner's recorded choice for one article, as a partial recipe.
 *
 * The file predates recipes and its entries carry a bare `style`, so that is read as the family
 * it names — which is exactly what the old field meant. An exact `venture+slug+date` wins over a
 * record written before dates were part of an article's identity; the older record still answers
 * for every redelivery of its slug, so nothing already chosen comes unbound.
 */
export function matchRecipeOverride(
  overrides: readonly unknown[],
  venture: "caught-up" | "mma-files",
  slug: string,
  date: string
): RecipeOverride | undefined {
  const forArticle = overrides.filter((entry): entry is Record<string, unknown> => {
    const candidate = entry as { venture?: unknown; slug?: unknown } | null;
    return Boolean(candidate) && candidate!.venture === venture && candidate!.slug === slug;
  });
  const chosen = forArticle.find((entry) => entry.date === date) ?? forArticle.find((entry) => entry.date === undefined);
  if (!chosen) return undefined;
  const family = typeof chosen.family === "string" ? chosen.family : typeof chosen.style === "string" ? chosen.style : undefined;
  return {
    venture,
    slug,
    ...(typeof chosen.date === "string" ? { date: chosen.date } : {}),
    ...(family !== undefined && (DECK_DESIGNS as readonly string[]).includes(family) ? { family } : {}),
    ...(chosen.variant === "A" || chosen.variant === "B" ? { variant: chosen.variant } : {}),
    ...(typeof chosen.accentSwap === "boolean" ? { accentSwap: chosen.accentSwap } : {}),
    ...(chosen.treatment === "none" || chosen.treatment === "mono" || chosen.treatment === "duotone"
      ? { treatment: chosen.treatment }
      : {}),
    ...(chosen.typeScale === 0.9 || chosen.typeScale === 1 || chosen.typeScale === 1.1
      ? { typeScale: chosen.typeScale }
      : {})
  };
}

async function readOverrides(root: string): Promise<unknown[]> {
  try {
    const raw = JSON.parse(await readFile(path.join(root, OVERRIDES_PATH), "utf8")) as { overrides?: unknown };
    return Array.isArray(raw.overrides) ? raw.overrides : [];
  } catch {
    return [];
  }
}

/**
 * The complete design one article ships with.
 *
 * Derived from the article's own identity and the venture's recent receipts, then overridden
 * field by field by whatever the owner pinned. Unset fields derive, so choosing a family does not
 * silently freeze the treatment and the type scale with it.
 */
export async function effectiveRecipe(input: {
  root: string;
  venture: "caught-up" | "mma-files";
  slug: string;
  date: string;
  hasHero?: boolean;
}): Promise<CarouselRecipe> {
  const [overrides, history] = await Promise.all([
    readOverrides(input.root),
    readRecipeHistory(input.root, input.venture)
  ]);
  const derived = deriveRecipe(
    { venture: input.venture, slug: input.slug, date: input.date, ...(input.hasHero === undefined ? {} : { hasHero: input.hasHero }) },
    history
  );
  const pinned = matchRecipeOverride(overrides, input.venture, input.slug, input.date);
  if (!pinned) return derived;
  return CarouselRecipeSchema.parse({
    ...derived,
    ...(pinned.family !== undefined ? { family: pinned.family } : {}),
    ...(pinned.variant !== undefined ? { variant: pinned.variant } : {}),
    ...(pinned.accentSwap !== undefined ? { accentSwap: pinned.accentSwap } : {}),
    ...(pinned.treatment !== undefined ? { treatment: pinned.treatment } : {}),
    ...(pinned.typeScale !== undefined ? { typeScale: pinned.typeScale } : {})
  });
}

/**
 * The old answer, for the one caller that still asks the old question.
 *
 * `deckStyleFor` is gone from the derivation — nothing new picks one of five wallpapers — so this
 * reports a recorded style where the owner pinned one and the recipe's family otherwise. Kept
 * narrow deliberately: it exists so a legacy reference keeps resolving, not so the engine keeps
 * two ideas of what a deck looks like.
 */
export async function effectiveDeckStyle(input: {
  root: string;
  venture: "caught-up" | "mma-files";
  slug: string;
  date: string;
}): Promise<DeckStyle | string> {
  const recipe = await effectiveRecipe(input);
  return isDeckStyle(recipe.family) ? (recipe.family as DeckStyle) : recipe.family;
}

export { DECK_STYLES };
