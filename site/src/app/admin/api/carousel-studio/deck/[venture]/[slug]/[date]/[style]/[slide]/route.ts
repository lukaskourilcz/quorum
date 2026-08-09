import {
  ARTICLE_HERO_SLOT,
  CAROUSEL_BRANDS,
  DECK_STYLES,
  articleDeckTemplate,
  articleSlideSlot,
  renderCarouselSlidePng,
  type DeckStyle
} from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { readAdminDecks } from "@/lib/admin-decks";
import { readArticleHeroPng } from "@/lib/admin-deck-hero";

export const dynamic = "force-dynamic";

/**
 * One slide of one article's carousel, rendered on request.
 *
 * PNG rather than SVG, because the slide carries the article's own photograph and an SVG
 * referencing a data URI is exactly the thing that renders differently in a browser than it does
 * in the pipeline. What admin shows here is the bytes the pipeline would produce.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ venture: string; slug: string; date: string; style: string; slide: string }> }
): Promise<Response> {
  // Behind the admin session. These are articles that have not been published yet — the
  // edition outbox holds tomorrow's — and the public template preview next door is
  // deliberately open because it renders fixture copy, not the desk's unpublished work.
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { venture, slug, date, style, slide } = await params;
  const slideIndex = Number(slide) - 1;
  const brand = CAROUSEL_BRANDS[venture as keyof typeof CAROUSEL_BRANDS];
  if (
    !brand || !DECK_STYLES.includes(style as DeckStyle)
    || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isInteger(slideIndex) || slideIndex < 0
  ) {
    return Response.json({ error: "Slide not found." }, { status: 404 });
  }

  /*
   * Resolved by the whole identity, not the first slug that matches.
   *
   * Three redeliveries of one MMA event share a slug, so `find` by slug handed all three cards
   * the same deck: same slides, same photograph, same bytes. An article is a venture, a slug and
   * a date, and every one of the three has to be able to render as itself.
   */
  const deck = (await readAdminDecks(40)).find(
    (entry) => entry.venture === venture && entry.slug === slug && entry.date === date
  );
  if (!deck) return Response.json({ error: "Slide not found." }, { status: 404 });

  const template = articleDeckTemplate(deck.slides.length, style as DeckStyle);
  const strings = Object.fromEntries(deck.slides.map((entry, index) => [articleSlideSlot(index), entry.text]));
  const hero = await readArticleHeroPng(deck.venture, deck.slug, deck.date);

  try {
    // This slide, not the deck it belongs to. The whole-deck renderer next door rasterises every
    // slide, so serving ten of them one request at a time rasterised a hundred images and threw
    // ninety away — a page of thumbnails that took ten seconds to fill. Same renderer, same
    // checks, same bytes: the index is all a slide borrows from its neighbours.
    const render = await renderCarouselSlidePng({
      template,
      payload: { locale: "cs", strings },
      brand,
      format: "instagram-portrait",
      index: slideIndex,
      ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {})
    });
    if (!render) return Response.json({ error: "Slide not found." }, { status: 404 });
    return new Response(new Uint8Array(render.png), {
      headers: {
        // Keyed by the rendered bytes, so a re-rendered deck invalidates on its own.
        "Cache-Control": "private, max-age=300",
        "Content-Type": "image/png",
        ETag: `"${render.pngHash}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    // Said out loud, because the silent version of this line is why a deployed renderer that
    // could not load its image library went unexplained: every slide answered 500 and the only
    // record anywhere was the status code.
    console.error(`Carousel slide render failed for ${venture}/${slug}/${date}/${style}/${slide}:`, error);
    return Response.json({ error: "Slide could not be rendered." }, { status: 500 });
  }
}
