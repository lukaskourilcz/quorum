import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  DECK_STYLES,
  buildArticleDeck,
  deckStyleFor,
  reviewDeck,
  wordCount,
  type DeckStyle,
  type Slide
} from "@boardlessai/carousel-studio";

/**
 * The carousels, read out of the packages that already shipped.
 *
 * Nothing is stored for this. A deck is a pure function of an article the desk already wrote, so
 * admin rebuilds it on request rather than committing ten PNGs a day into a git-as-state
 * repository — the same reason the previews directory is ignored. What admin shows is therefore
 * always what today's engine would produce, not what some earlier engine happened to render.
 */

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export interface AdminDeck {
  venture: "caught-up" | "mma-files";
  slug: string;
  title: string;
  date: string;
  style: DeckStyle;
  slides: Slide[];
  longestSlideWords: number;
  publishable: boolean;
  problems: string[];
  /** Whether the article carries a hero for the opening slide. */
  hasHero: boolean;
  /**
   * The credit the opening slide's photograph carries, as plain text.
   *
   * Shown because the slide itself has nowhere to put it. Most of these heroes are CC BY or
   * CC BY-SA, and a carousel that reaches a feed without the credit is a licence breach rather
   * than a formatting slip, so the owner should be able to read it next to the deck.
   */
  heroCredit: string | null;
}

const OUTRO = {
  "mma-files": "Celý ozdrojovaný text najdete v MMA Files.",
  "caught-up": "Jedno vydání a máte přehled."
} as const;

/** The attribution line, flattened the way the delivery verifier flattens it. */
function creditOf(image: { license?: { attribution_html?: string } } | undefined): string | null {
  const attribution = image?.license?.attribution_html;
  if (typeof attribution !== "string") return null;
  const credit = attribution.replaceAll(/<[^>]+>/gu, " ").replaceAll(/\s+/gu, " ").trim();
  return credit.length > 0 ? credit : null;
}

function reviewed(input: {
  venture: AdminDeck["venture"];
  slug: string;
  title: string;
  date: string;
  seed: string;
  slides: Slide[];
  hasHero: boolean;
  heroCredit: string | null;
}): AdminDeck {
  const review = reviewDeck(input.slides);
  return {
    venture: input.venture,
    slug: input.slug,
    title: input.title,
    date: input.date,
    style: deckStyleFor(input.seed, DECK_STYLES) as DeckStyle,
    slides: review.slides,
    longestSlideWords: review.slides.reduce((longest, slide) => Math.max(longest, wordCount(slide.text)), 0),
    publishable: review.publishable,
    problems: review.problems,
    hasHero: input.hasHero,
    heroCredit: input.heroCredit
  };
}

async function readJsonFiles(directory: string): Promise<unknown[]> {
  try {
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort().reverse();
    return await Promise.all(names.map(async (name) =>
      JSON.parse(await readFile(path.join(directory, name), "utf8")) as unknown
    ));
  } catch {
    return [];
  }
}

export async function readAdminDecks(limit = 12): Promise<AdminDeck[]> {
  const articles = await readJsonFiles(path.join(repositoryRoot, "state/ventures/mma-files/articles"));
  const decks: AdminDeck[] = [];

  for (const raw of articles) {
    const article = raw as {
      slug?: string;
      publishAt?: string;
      status?: string;
      image?: { hero_bytes_base64?: string; license?: { attribution_html?: string } };
      localizations?: { cs?: { title?: string; dek?: string; bodyMDX?: string } };
    };
    const cs = article.localizations?.cs;
    if (!article.slug || !cs?.title || !cs.dek || !cs.bodyMDX) continue;
    decks.push(reviewed({
      venture: "mma-files",
      slug: article.slug,
      title: cs.title,
      date: (article.publishAt ?? "").slice(0, 10),
      seed: article.slug,
      hasHero: Boolean(article.image?.hero_bytes_base64),
      heroCredit: creditOf(article.image),
      slides: buildArticleDeck({
        title: cs.title,
        dek: cs.dek,
        bodyMdx: cs.bodyMDX,
        outro: OUTRO["mma-files"]
      })
    }));
  }

  for (const raw of await readJsonFiles(path.join(repositoryRoot, "state/edition/outbox"))) {
    const pkg = raw as {
      date?: string;
      status?: string;
      image?: { hero_bytes_base64?: string; license?: { attribution_html?: string } };
      article?: { cs?: { frontmatter?: Record<string, unknown> } };
    };
    const frontmatter = pkg.article?.cs?.frontmatter as
      | { slug?: string; title?: string; dek?: string; what_changed?: string[]; why_it_matters?: string[]; uncertainty?: string[] }
      | undefined;
    if (pkg.status !== "edition" || !frontmatter?.slug || !frontmatter.title || !frontmatter.dek) continue;
    decks.push(reviewed({
      venture: "caught-up",
      slug: frontmatter.slug,
      title: frontmatter.title,
      date: pkg.date ?? "",
      seed: pkg.date ?? frontmatter.slug,
      hasHero: Boolean(pkg.image?.hero_bytes_base64),
      heroCredit: creditOf(pkg.image),
      slides: buildArticleDeck({
        title: frontmatter.title,
        dek: frontmatter.dek,
        points: [
          ...(frontmatter.what_changed ?? []).slice(0, 3),
          ...(frontmatter.why_it_matters ?? []).slice(0, 3),
          ...(frontmatter.uncertainty ?? []).slice(0, 1)
        ],
        outro: OUTRO["caught-up"]
      })
    }));
  }

  return decks.sort((left, right) => right.date.localeCompare(left.date)).slice(0, limit);
}
