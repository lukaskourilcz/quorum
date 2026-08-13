import {
  ARTICLE_HERO_SLOT,
  CAROUSEL_BRANDS,
  CarouselFormatSchema,
  articleSlideSlot,
  decodeRecipe,
  recipeTemplate,
  recipeVariant,
  renderCarouselSlidePng
} from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { readDesignLab } from "@/lib/design-lab";
import { readArticleHeroPng } from "@/lib/admin-deck-hero";
import { tehdejsiRenderInput } from "@/lib/tehdejsi-render";
import { TehdejsiRenderRefusal } from "@/lib/tehdejsi-render";

export const dynamic = "force-dynamic";

/**
 * One slide of one article's carousel, rendered on request.
 *
 * PNG rather than SVG, because the slide carries the article's own photograph and an SVG
 * referencing a data URI is exactly the thing that renders differently in a browser than it does
 * in the pipeline. What admin shows here is the bytes the pipeline would produce.
 *
 * The path segment is a whole recipe, not a style name. A design is six fields now, and a preview
 * that shows any fewer of them is showing the owner a picture the pipeline would not ship. The
 * article's identity is its venture, slug *and* date: three MMA redeliveries share a slug and each
 * has to render as itself.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ venture: string; slug: string; date: string; recipe: string; slide: string }> }
): Promise<Response> {
  // Behind the admin session. These are articles that have not been published yet — the
  // edition outbox holds tomorrow's — and the public template preview next door is
  // deliberately open because it renders fixture copy, not the desk's unpublished work.
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { venture, slug, date, recipe: token, slide } = await params;
  const slideIndex = Number(slide) - 1;
  const brand = CAROUSEL_BRANDS[venture as keyof typeof CAROUSEL_BRANDS];
  const recipe = decodeRecipe(decodeURIComponent(token));
  const format = CarouselFormatSchema.safeParse(new URL(request.url).searchParams.get("format") ?? "instagram-portrait");
  if (
    !brand || !recipe || !format.success
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isInteger(slideIndex) || slideIndex < 0
  ) {
    return Response.json({ error: "Slide not found." }, { status: 404 });
  }

  const deck = (await readDesignLab(60)).find(
    (entry) => entry.venture === venture && entry.slug === slug && entry.date === date
  );
  if (!deck) return Response.json({ error: "Slide not found." }, { status: 404 });
  if (!deck.renderable) return Response.json({ error: "Deck is incomplete and cannot be rendered." }, { status: 422 });

  const hero = await readArticleHeroPng(deck.venture, deck.slug, deck.date);

  try {
    // This slide, not the deck it belongs to. The whole-deck renderer next door rasterises every
    // slide, so serving ten of them one request at a time rasterised a hundred images and threw
    // ninety away — a page of thumbnails that took ten seconds to fill. Same renderer, same
    // checks, same bytes: the index is all a slide borrows from its neighbours.
    const render = deck.dualLanguage
      ? await renderCarouselSlidePng({ ...tehdejsiRenderInput(deck.dualLanguage, format.data, hero), index: slideIndex })
      : await renderCarouselSlidePng({
          template: recipeTemplate(recipe, deck.slides.length),
          payload: {
            locale: deck.locale,
            strings: Object.fromEntries(deck.slides.map((entry, index) => [articleSlideSlot(index), entry.text])),
            ...(recipeVariant(recipe) ? { variant: recipeVariant(recipe)! } : {})
          },
          brand,
          format: format.data,
          index: slideIndex,
          ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {})
        });
    if (!render) return Response.json({ error: "Slide not found." }, { status: 404 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(render.png), {
      headers: {
        // Keyed by the rendered bytes, so a re-rendered deck invalidates on its own.
        "Cache-Control": "private, max-age=300",
        "Content-Type": "image/png",
        ETag: `"${render.pngHash}"`,
        "X-Content-Type-Options": "nosniff",
        ...(download
          ? { "Content-Disposition": `attachment; filename="${venture}-${date}-slide-${String(slideIndex + 1).padStart(2, "0")}.png"` }
          : {})
      }
    });
  } catch (error) {
    if (error instanceof TehdejsiRenderRefusal) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    // Said out loud, because the silent version of this line is why a deployed renderer that
    // could not load its image library went unexplained: every slide answered 500 and the only
    // record anywhere was the status code.
    console.error(`Carousel slide render failed for ${venture}/${slug}/${date}/${token}/${slide}:`, error);
    return Response.json({ error: "Slide could not be rendered." }, { status: 500 });
  }
}
