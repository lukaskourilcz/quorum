import type { ArticlePackage, SocialVariantPack } from "../contracts/mma-files.js";
import { SocialVariantPackSchema } from "../contracts/mma-files.js";
import {
  articleSlideSlot,
  buildArticleDeck,
  deriveRecipe,
  recipeTemplate,
  recipeTemplateId,
  reviewDeck,
  type CarouselRecipe
} from "@boardlessai/carousel-studio";
import { articleRef } from "./hash.js";

export const MMA_FILES_ASSIGNMENT_PROTOCOL = "state/ventures/mma-files/social/ASSIGNMENT.md";

/** What actually differs between the two renderings, said in the recipe's own terms. */
function axesFor(recipe: CarouselRecipe, id: "A" | "B") {
  const swapped = id === "B" ? !recipe.accentSwap : recipe.accentSwap;
  return {
    templateFamily: recipe.family,
    colorScheme: swapped ? "secondary-inverted" : "accent-base",
    headlineFraming: id === "A" ? "fact-first" : "question-or-tension",
    captionTone: id === "A" ? "plain" : "curious"
  };
}

export function buildSocialVariantPack(
  article: ArticlePackage,
  /** The complete design for this article: derived, then whatever the owner pinned. */
  recorded?: CarouselRecipe
): SocialVariantPack | null {
  const recipe = recorded ?? deriveRecipe({
    venture: "mma-files",
    slug: article.slug,
    date: article.publishAt.slice(0, 10),
    hasHero: Boolean(article.image?.hero_bytes_base64)
  });
  if (article.status !== "published") throw new Error("Social variants require a finished article");
  /**
   * The carousel is the article, split.
   *
   * It used to be a two-slide cover-and-call-to-action, which is a poster for an article rather
   * than the article. The deck carries the piece itself — five to ten slides, none over thirty
   * words — so someone scrolling past gets the story and not only its headline.
   */
  /*
   * Whether B is a second design or a second filename.
   *
   * The queue shipped an A and a B that differed only in `content.variant`, a field the renderer
   * ignored because every deck slide declared `variants: []` — same svgHash, two names. A family
   * declares a real second rendering, so B is genuinely different; the five original styles do
   * not, and where there is no second rendering the pair collapses to one item rather than
   * pretending.
   */
  const hasSecondRendering = recipeTemplate(recipe, 5).slides.every((slide) => slide.variants.length > 1);
  const carousel = (locale: "en" | "cs", variant: "A" | "B") => {
    const copy = article.localizations[locale]!;
    const slides = buildArticleDeck({
      title: copy.title,
      coverLine: copy.altHeadline,
      dek: copy.dek,
      bodyMdx: copy.bodyMDX,
      outro: locale === "cs" ? "Celý ozdrojovaný text najdete v MMA Files." : "Read the full sourced story in MMA Files."
    });
    const review = reviewDeck(slides);
    // A piece too thin to fill five slides gets no carousel. It does not get a padded one, and
    // it does not stop the article: the writing cleared every editorial gate, and a social
    // artifact refusing to build is not a reason to withhold journalism.
    if (!review.publishable) return null;
    return {
      template_id: recipeTemplateId(recipe, slides.length),
      version: "1.0.0",
      content: {
        locale,
        ...(hasSecondRendering ? { variant } : {}),
        strings: Object.fromEntries(slides.map((slide, index) => [articleSlideSlot(index), slide.text]))
      }
    };
  };
  // Only the locales the article was written in. A carousel and caption for a locale that does
  // not exist would be built from undefined, and a queue item carries its destination to the
  // platform: once /en goes, a published post would link a page that is not there, and a post
  // cannot be edited back.
  const english = article.localizations.en;
  // Built once so a thin article is answered before any of the pack is assembled.
  if (carousel("cs", "A") === null) {
    console.warn(JSON.stringify({ event: "carousel_skipped", slug: article.slug, reason: "deck below the five-slide minimum" }));
    return null;
  }
  const perLocale = <T,>(build: (locale: "en" | "cs") => T) => ({
    ...(english ? { en: build("en") } : {}),
    cs: build("cs")
  });
  return SocialVariantPackSchema.parse({
    schemaVersion: "social-variant/1",
    articleRef: articleRef(article),
    variants: [
      {
        id: "A",
        carousel: perLocale((locale) => carousel(locale, "A")),
        captions: perLocale((locale) => locale === "cs"
          ? {
              instagram: `${article.localizations.cs.dek}\n\nPřečtěte si ozdrojovaný text v MMA Files.`,
              threads: `${article.localizations.cs.dek}\n\nCelý text najdete v MMA Files.`
            }
          : {
              instagram: `${english!.dek}\n\nRead the sourced story in MMA Files.`,
              threads: `${english!.dek}\n\nRead it in MMA Files.`
            }),
        // Populated from the recipe. It used to be four hand-written strings naming a template
        // this pack does not use and a colour scheme nothing reads — inert metadata that made a
        // pair of identical renders look like a designed experiment.
        designAxes: axesFor(recipe, "A")
      },
      {
        id: "B",
        carousel: perLocale((locale) => carousel(locale, "B")),
        captions: perLocale((locale) => locale === "cs"
          ? {
              instagram: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`,
              threads: `${article.localizations.cs.title}\n\n${article.localizations.cs.dek}`.slice(0, 500)
            }
          : {
              instagram: `${english!.title}\n\n${english!.dek}`,
              threads: `${english!.title}\n\n${english!.dek}`.slice(0, 500)
            }),
        designAxes: axesFor(recipe, "B")
      }
    ],
    assignmentProtocolRef: MMA_FILES_ASSIGNMENT_PROTOCOL,
    status: "draft"
  });
}
