import { createHash } from "node:crypto";
import { z } from "zod";
import { familyDeckTemplate } from "./families.js";
import { articleDeckTemplate } from "./library.js";
import { DECK_DESIGNS, DECK_FAMILIES, isDeckStyle, type DeckDesign, type DeckFamily } from "./designs.js";
import type { CarouselTemplate } from "./schema.js";

/**
 * The complete design decision for one article's social set.
 *
 * Everything that used to be implicit, decided in three different places, or not decided at all:
 * `deckStyleFor` picked one of five wallpapers from a seed, the A/B pair differed in a field the
 * renderer ignores, and the photo treatment and type scale did not exist. A recipe is one small
 * document that says what a deck looks like, is derived from the article's own identity plus what
 * the venture has recently shipped, and replays byte-identical.
 */

export const TYPE_SCALES = [0.9, 1, 1.1] as const;
export type TypeScale = (typeof TYPE_SCALES)[number];

export const CarouselRecipeSchema = z.object({
  schemaVersion: z.literal("carousel-recipe/1"),
  venture: z.enum(["caught-up", "mma-files"]),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  family: z.enum(DECK_DESIGNS),
  variant: z.enum(["A", "B"]),
  accentSwap: z.boolean(),
  treatment: z.enum(["none", "mono", "duotone"]),
  typeScale: z.union([z.literal(0.9), z.literal(1), z.literal(1.1)]),
  /** Rotates the family's rhythm, so two articles in one family still open differently. */
  phaseSeed: z.number().int().min(0).max(3)
});

export type CarouselRecipe = z.infer<typeof CarouselRecipeSchema>;

/** A recorded render, as the anti-repeat memory reads it. Newest first. */
export interface RecipeHistoryEntry {
  date: string;
  family: string;
}

/**
 * The seed, from the article's own identity and nothing else.
 *
 * The same shape as the hook picker's: a hash of what the thing *is*, never a clock and never a
 * die. Replaying a delivery from its recorded inputs has to produce the same design, or the
 * receipt beside it proves nothing.
 */
export function recipeSeed(input: { venture: string; slug: string; date: string }): string {
  return createHash("sha256").update(`${input.venture} ${input.slug} ${input.date}`).digest("hex");
}

/** An index into `length`, taken from a slice of the seed. */
function seededIndex(seed: string, offset: number, length: number): number {
  return Number(BigInt(`0x${seed.slice(offset, offset + 8)}`) % BigInt(length));
}

/**
 * Which family this article gets.
 *
 * Seeded, then adjusted against what the venture actually shipped: never one of the last two
 * families, and preferring the third of the library that has gone longest unused. The memory is
 * the venture's own receipts — recorded state, not a clock — so a replay of last Tuesday reads
 * last Tuesday's history and lands on last Tuesday's family.
 */
export function chooseFamily(seed: string, history: readonly RecipeHistoryEntry[]): DeckFamily {
  const recent = new Set(history.slice(0, 2).map((entry) => entry.family));
  const eligible = DECK_FAMILIES.filter((family) => !recent.has(family));
  const pool = eligible.length > 0 ? eligible : [...DECK_FAMILIES];
  // How long ago each family was last used: absent from the history is longest of all. Ties break
  // on the name, so the order is total and the choice is reproducible.
  const lastUsed = new Map<string, number>();
  history.forEach((entry, position) => {
    if (!lastUsed.has(entry.family)) lastUsed.set(entry.family, position);
  });
  const ranked = [...pool].sort((left, right) => {
    const leftAge = lastUsed.get(left) ?? Number.POSITIVE_INFINITY;
    const rightAge = lastUsed.get(right) ?? Number.POSITIVE_INFINITY;
    if (leftAge !== rightAge) return rightAge - leftAge;
    return left.localeCompare(right);
  });
  const leastRecent = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
  return leastRecent[seededIndex(seed, 0, leastRecent.length)]!;
}

export interface RecipeInputs {
  venture: CarouselRecipe["venture"];
  slug: string;
  date: string;
  /** Whether the article carries a photograph. A treatment on nothing is not a design choice. */
  hasHero?: boolean;
  /** Families the engine may draw from, when the venture has live presets. Empty means all ten. */
  pool?: readonly DeckFamily[];
}

/**
 * A complete recipe, from the article and the venture's memory. Pure, and total.
 */
export function deriveRecipe(inputs: RecipeInputs, history: readonly RecipeHistoryEntry[] = []): CarouselRecipe {
  const seed = recipeSeed(inputs);
  const pool = inputs.pool && inputs.pool.length > 0 ? inputs.pool : undefined;
  const family = pool
    ? pool[seededIndex(seed, 0, pool.length)]!
    : chooseFamily(seed, history);
  const treatments = inputs.hasHero === false ? (["none"] as const) : (["none", "none", "mono", "duotone"] as const);
  return CarouselRecipeSchema.parse({
    schemaVersion: "carousel-recipe/1",
    venture: inputs.venture,
    slug: inputs.slug,
    date: inputs.date,
    family,
    variant: "A",
    accentSwap: seededIndex(seed, 8, 2) === 1,
    treatment: treatments[seededIndex(seed, 16, treatments.length)]!,
    typeScale: TYPE_SCALES[seededIndex(seed, 24, TYPE_SCALES.length)]!,
    phaseSeed: seededIndex(seed, 32, 4)
  });
}

/**
 * The template id a recipe resolves to.
 *
 * The canonical family template — scale 1, phase 0 — keeps the plain `deck-<family>-<count>` id
 * the eager library and every stored pack already name. Anything else carries its two axes in the
 * id, so a reference still names exactly one byte stream and `templateByReference` can rebuild it
 * without a lookup table that would have to hold seven hundred entries.
 */
export function recipeTemplateId(recipe: Pick<CarouselRecipe, "family" | "typeScale" | "phaseSeed">, slideCount: number): string {
  if (isDeckStyle(recipe.family)) return `deck-${recipe.family}-${slideCount}`;
  if (recipe.typeScale === 1 && recipe.phaseSeed === 0) return `deck-${recipe.family}-${slideCount}`;
  return `deck-${recipe.family}-${slideCount}-s${Math.round(recipe.typeScale * 10)}p${recipe.phaseSeed}`;
}

/** The reverse: an id back into the axes that built it, or null when it is not one of ours. */
export function parseRecipeTemplateId(id: string): { design: DeckDesign; slideCount: number; typeScale: TypeScale; phaseSeed: number } | null {
  const match = /^deck-([a-z-]+)-(\d+)(?:-s(\d+)p(\d))?$/u.exec(id);
  if (!match) return null;
  const [, design, count, scale, phase] = match;
  if (!design || !count) return null;
  if (!(DECK_DESIGNS as readonly string[]).includes(design)) return null;
  const typeScale = scale === undefined ? 1 : Number(scale) / 10;
  if (!(TYPE_SCALES as readonly number[]).includes(typeScale)) return null;
  return {
    design: design as DeckDesign,
    slideCount: Number(count),
    typeScale: typeScale as TypeScale,
    phaseSeed: phase === undefined ? 0 : Number(phase)
  };
}

/** The template a recipe describes, built rather than looked up. */
export function recipeTemplate(recipe: Pick<CarouselRecipe, "family" | "typeScale" | "phaseSeed" | "treatment">, slideCount: number): CarouselTemplate {
  if (isDeckStyle(recipe.family)) return articleDeckTemplate(slideCount, recipe.family);
  return familyDeckTemplate(recipe.family, slideCount, {
    typeScale: recipe.typeScale,
    phaseSeed: recipe.phaseSeed,
    treatment: recipe.treatment
  });
}

/** The variant string the renderer takes, or none where the design declares no second rendering. */
export function recipeVariant(recipe: Pick<CarouselRecipe, "family" | "variant" | "accentSwap">): "A" | "B" | undefined {
  if (isDeckStyle(recipe.family)) return undefined;
  return recipe.accentSwap ? "B" : recipe.variant;
}
