import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  CarouselRecipeSchema,
  DECK_FAMILIES,
  MAX_SLIDE_WORDS,
  SocialCopyPackSchema,
  buildArticleDeck,
  derivedCopyPack,
  deriveRecipe,
  encodeRecipe,
  renderCaption,
  reviewDeck,
  wordCount,
  type CarouselRecipe,
  type SocialCopyPack
} from "@boardlessai/carousel-studio";
import { readStudioArticles, type StudioArticle } from "@/lib/carousel-summaries";
import {
  readCarouselPresets,
  readDeckStyleOverrides,
  readSlideTextOverrides,
  slideTextFor
} from "@/lib/carousel-studio-admin-store";
import type { CarouselPreset } from "@boardlessai/carousel-studio";

/** A saved design, as the picker shows it. */
export type LabPreset = Pick<CarouselPreset, "id" | "name" | "family" | "variant" | "accentSwap" | "treatment" | "typeScale" | "status">;

export async function readDesignLabPresets(venture?: "caught-up" | "mma-files"): Promise<LabPreset[]> {
  const presets = await readCarouselPresets();
  return presets
    .filter((preset) => !venture || preset.ventureScope.length === 0 || preset.ventureScope.includes(venture))
    .map(({ id, name, family, variant, accentSwap, treatment, typeScale, status }) =>
      ({ id, name, family, variant, accentSwap, treatment, typeScale, status }));
}

/**
 * Everything the Design Lab workspace needs about one article, resolved on the server.
 *
 * The two tabs it replaces each knew half of this. `templates` had summaries and rendered them as
 * CSS that never reached the engine; `decks` had real renders and no words, no recipe and no way
 * to change anything but a five-way style chip. The workspace needs both halves at once, so they
 * are resolved together and handed across as plain JSON — the same sanitising boundary the office
 * walkthrough uses.
 */

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

export interface LabSlide {
  index: number;
  text: string;
  words: number;
  /** Whether these are the owner's words rather than the article's. */
  edited: boolean;
}

export interface LabArticle {
  id: string;
  venture: "caught-up" | "mma-files";
  ventureLabel: string;
  slug: string;
  date: string;
  headline: string;
  coverLine: string | null;
  origin: "recorded" | "derived";
  slides: LabSlide[];
  hasHero: boolean;
  heroCredit: string | null;
  /** Problems that would stop this deck rendering, from `reviewDeck` — shown verbatim. */
  problems: string[];
  renderable: boolean;
  recipe: CarouselRecipe;
  /** Whether the recipe was pinned by the owner or derived from the article's own identity. */
  recipePinned: boolean;
  copy: SocialCopyPack;
  /** The caption as it ships: the desk's words with the licence credit appended by code. */
  caption: string;
}

async function readJsonFile(relative: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(repositoryRoot(), relative), "utf8")) as unknown;
  } catch {
    return null;
  }
}

/** The recipe recorded at delivery, when delivery recorded one. */
async function recordedRecipe(venture: string, slug: string, date: string): Promise<CarouselRecipe | null> {
  const raw = await readJsonFile(`state/ventures/carousel-studio/recipes/${venture}/${date}-${slug}.json`);
  const parsed = CarouselRecipeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

async function recordedCopy(venture: string, slug: string, date: string): Promise<SocialCopyPack | null> {
  const raw = await readJsonFile(`state/ventures/carousel-studio/social-copy/${venture}/${date}-${slug}.json`);
  const parsed = SocialCopyPackSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What the venture has shipped, newest first, so a derivation here matches the pipeline's. */
async function recipeHistory(venture: string): Promise<Array<{ date: string; family: string }>> {
  const directory = path.join(repositoryRoot(), "state/ventures/carousel-studio/deck-receipts");
  try {
    const names = (await readdir(directory)).filter((name) => name.startsWith(`${venture}-`) && name.endsWith(".json"));
    const entries: Array<{ date: string; family: string }> = [];
    for (const name of names) {
      const raw = JSON.parse(await readFile(path.join(directory, name), "utf8")) as { date?: unknown; style?: unknown; recipe?: { family?: unknown } };
      const family = typeof raw.recipe?.family === "string" ? raw.recipe.family : raw.style;
      if (typeof raw.date === "string" && typeof family === "string") entries.push({ date: raw.date, family });
    }
    return entries.sort((left, right) => right.date.localeCompare(left.date));
  } catch {
    return [];
  }
}

/** Everything a recorded override may name: every family, and the five original styles. */
const DESIGNS: readonly string[] = [...DECK_FAMILIES, "mesh", "editorial", "spotlight", "contrast", "aurora"];

const CLOSING: Record<"caught-up" | "mma-files", string> = {
  "caught-up": "Jedno vydání a máte přehled.",
  "mma-files": "Celý ozdrojovaný text najdete v MMA Files."
};

function deckFor(article: StudioArticle): string[] {
  const summary = article.summary;
  return buildArticleDeck({
    title: summary.headline,
    ...(summary.coverLine ? { coverLine: summary.coverLine } : {}),
    dek: summary.standfirst,
    points: summary.passages,
    outro: summary.closing
  }).map((slide) => slide.text);
}

/**
 * Every delivered article, as the workspace sees it. Newest first, both magazines.
 */
export async function readDesignLab(limit = 40): Promise<LabArticle[]> {
  const [articles, pinned, slideOverrides] = await Promise.all([
    readStudioArticles(),
    readDeckStyleOverrides(),
    readSlideTextOverrides()
  ]);
  const histories = new Map<string, Array<{ date: string; family: string }>>();
  const lab: LabArticle[] = [];

  for (const article of articles.slice(0, limit)) {
    const { venture, slug, date } = { venture: article.venture, slug: article.summary.slug, date: article.summary.date };
    if (!histories.has(venture)) histories.set(venture, await recipeHistory(venture));
    const edits = slideTextFor(slideOverrides, venture, slug, date);
    const slides: LabSlide[] = deckFor(article).map((text, index) => {
      const edited = edits.get(index);
      const value = edited ?? text;
      return { index, text: value, words: wordCount(value), edited: edited !== undefined };
    });
    const review = reviewDeck(slides.map((slide, index) => ({
      kind: index === 0 ? "cover" as const : index === slides.length - 1 ? "outro" as const : "body" as const,
      text: slide.text
    })));
    const forArticle = pinned.filter((entry) => entry.venture === venture && entry.slug === slug);
    const override = (forArticle.find((entry) => entry.date === date)
      ?? forArticle.find((entry) => entry.date === undefined)) as (Record<string, unknown> | undefined);
    const derived = await recordedRecipe(venture, slug, date)
      ?? deriveRecipe({ venture, slug, date, hasHero: article.summary.hasHero }, histories.get(venture) ?? []);
    const recipe = CarouselRecipeSchema.parse({
      ...derived,
      ...(typeof override?.style === "string" && DESIGNS.includes(override.style) ? { family: override.style } : {}),
      ...(typeof override?.treatment === "string" ? { treatment: override.treatment } : {}),
      ...(typeof override?.typeScale === "number" ? { typeScale: override.typeScale } : {}),
      ...(typeof override?.accentSwap === "boolean" ? { accentSwap: override.accentSwap } : {})
    });
    const copy = await recordedCopy(venture, slug, date) ?? derivedCopyPack({
      venture,
      slug,
      date,
      headline: article.summary.headline,
      standfirst: article.summary.standfirst,
      closing: CLOSING[venture],
      heroCredit: article.summary.heroCredit
    });
    lab.push({
      id: article.id,
      venture,
      ventureLabel: article.ventureLabel,
      slug,
      date,
      headline: article.summary.headline,
      coverLine: article.summary.coverLine ?? null,
      origin: article.origin,
      slides,
      hasHero: article.summary.hasHero,
      heroCredit: article.summary.heroCredit,
      problems: [...article.problems, ...review.problems],
      renderable: review.publishable && article.problems.length === 0,
      recipe,
      recipePinned: Boolean(override),
      copy,
      // The credit is appended here, by the same function the ship path uses, and the workspace
      // shows it as part of a caption it cannot edit out. A carousel reaching a feed without it is
      // a licence breach.
      caption: renderCaption(copy.copy.igCaption, copy.heroCredit)
    });
  }
  return lab;
}

export { MAX_SLIDE_WORDS, encodeRecipe };
