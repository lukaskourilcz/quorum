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
  type CarouselSummaryLocale,
  type CarouselSummaryVenture,
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

/**
 * Presets a venture may use: the ones scoped to it, plus every preset scoped to nobody.
 *
 * The parameter is any brand the renderer knows rather than only the two magazines. A venture
 * that publishes no articles still has a Design Lab section, and the honest answer for it is the
 * unscoped presets — `ventureScope` can only name a magazine, so `includes` is false for the rest
 * and they see exactly the designs that are not tied to somebody else's identity.
 */
export async function readDesignLabPresets(venture?: string): Promise<LabPreset[]> {
  const presets = await readCarouselPresets();
  return presets
    .filter((preset) => !venture
      || preset.ventureScope.length === 0
      || (preset.ventureScope as readonly string[]).includes(venture))
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
  venture: CarouselSummaryVenture;
  locale: CarouselSummaryLocale;
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

function deckFor(article: StudioArticle): string[] {
  const summary = article.summary;
  if (summary.deckMode === "single-image") return [summary.coverLine ?? summary.headline];
  return buildArticleDeck({
    title: summary.headline,
    ...(summary.coverLine ? { coverLine: summary.coverLine } : {}),
    dek: summary.standfirst,
    points: summary.passages,
    outro: summary.closing
  }).map((slide) => slide.text);
}

  /**
 * Every delivered article, as the workspace sees it. Newest first.
 *
 * `venture` narrows to one magazine's articles, which is what a Design Lab section asks for. The
 * limit then applies per venture rather than across both: filtering after slicing would let a busy
 * week on one magazine push the other's newest article off the end of its own section.
 */
export async function readDesignLab(limit = 40, venture?: string): Promise<LabArticle[]> {
  const [all, pinned, slideOverrides] = await Promise.all([
    readStudioArticles(),
    readDeckStyleOverrides(),
    readSlideTextOverrides()
  ]);
  const articles = venture ? all.filter((article) => article.venture === venture) : all;
  const histories = new Map<string, Array<{ date: string; family: string }>>();
  const lab: LabArticle[] = [];

  for (const article of articles.slice(0, limit)) {
    const venture = article.venture;
    const date = article.summary.date;
    // Summary records share the feature slug by design. The locale-qualified Studio address
    // keeps recipes, edits, previews and exports from treating the twins as one deck.
    const slug = venture === "booksofhistory"
      ? `${article.summary.slug}-${article.summary.locale}`
      : article.summary.slug;
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
    })), article.summary.deckMode === "single-image" ? "single-image" : "carousel");
    const forArticle = pinned.filter((entry) => entry.venture === venture && entry.slug === slug);
    const override = (forArticle.find((entry) => entry.date === date)
      ?? forArticle.find((entry) => entry.date === undefined)) as (Record<string, unknown> | undefined);
    const recorded = await recordedRecipe(venture, slug, date);
    const derivedBase = recorded
      ?? deriveRecipe({ venture, slug, date, hasHero: article.summary.hasHero }, histories.get(venture) ?? []);
    // A single image is a poster, not the first frame of a random multi-slide family. The owner
    // can still pin another family afterward through the ordinary Studio override.
    const derived = !recorded && article.summary.deckMode === "single-image"
      ? { ...derivedBase, family: "billboard" as const }
      : derivedBase;
    const recipe = CarouselRecipeSchema.parse({
      ...derived,
      ...(typeof override?.style === "string" && DESIGNS.includes(override.style) ? { family: override.style } : {}),
      ...(typeof override?.treatment === "string" ? { treatment: override.treatment } : {}),
      ...(typeof override?.typeScale === "number" ? { typeScale: override.typeScale } : {}),
      ...(typeof override?.accentSwap === "boolean" ? { accentSwap: override.accentSwap } : {})
    });
    const copy = await recordedCopy(venture, slug, date) ?? derivedCopyPack({
      venture,
      locale: article.summary.locale,
      slug,
      date,
      headline: article.summary.headline,
      standfirst: article.summary.standfirst,
      closing: article.summary.closing,
      heroCredit: article.summary.heroCredit
    });
    lab.push({
      id: article.id,
      venture,
      locale: article.summary.locale,
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
