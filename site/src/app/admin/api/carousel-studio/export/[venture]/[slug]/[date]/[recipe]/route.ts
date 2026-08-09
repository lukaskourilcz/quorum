import { zipSync } from "fflate";
import {
  ARTICLE_HERO_SLOT,
  CAROUSEL_BRANDS,
  CarouselFormatSchema,
  articleSlideSlot,
  decodeRecipe,
  recipeTemplate,
  recipeTemplateId,
  recipeVariant,
  renderCaption,
  renderCarouselPng
} from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { readDesignLab } from "@/lib/design-lab";
import { readArticleHeroPng } from "@/lib/admin-deck-hero";

export const dynamic = "force-dynamic";

/**
 * A whole deck, as a file the owner can hand to a phone.
 *
 * The admin stated "no download action" as policy, which was true of a tool that could only show
 * a picture. It is not a policy for a tool the owner is meant to work in: a carousel is posted
 * from a phone, and a deck that cannot leave the browser is a deck nobody can post.
 *
 * Rendered on demand and never written down. Decks are a pure function of an article the desk
 * already wrote — the same reason the previews directory is ignored and `admin-decks` rebuilds
 * rather than reads. What the ZIP carries beyond the slides is the paperwork a post needs and a
 * reader of the record would want: the caption with its licence credit, the Threads text, and a
 * manifest naming the template reference, the recipe, every hash and the attribution.
 *
 * Store mode, via fflate. The payload is already-compressed PNG, so deflating it again would cost
 * CPU on a serverless function to save nothing; fflate is 8 kB, has no dependencies and is the
 * only zip writer this repository needs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ venture: string; slug: string; date: string; recipe: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { venture, slug, date, recipe: token } = await params;
  const brand = CAROUSEL_BRANDS[venture as keyof typeof CAROUSEL_BRANDS];
  const recipe = decodeRecipe(decodeURIComponent(token));
  const format = CarouselFormatSchema.safeParse(new URL(request.url).searchParams.get("format") ?? "instagram-portrait");
  if (!brand || !recipe || !format.success || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "Deck not found." }, { status: 404 });
  }

  const deck = (await readDesignLab(60)).find(
    (entry) => entry.venture === venture && entry.slug === slug && entry.date === date
  );
  if (!deck) return Response.json({ error: "Deck not found." }, { status: 404 });

  const template = recipeTemplate(recipe, deck.slides.length);
  // The owner's edits, exactly as the preview shows them. An export that disagreed with the
  // screen would be worse than no export.
  const strings = Object.fromEntries(deck.slides.map((entry, index) => [articleSlideSlot(index), entry.text]));
  const hero = await readArticleHeroPng(deck.venture, deck.slug, deck.date);

  try {
    const slides = await renderCarouselPng({
      template,
      payload: {
        locale: "cs",
        strings,
        ...(recipeVariant(recipe) ? { variant: recipeVariant(recipe)! } : {})
      },
      brand,
      format: format.data,
      ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {})
    });

    const encoder = new TextEncoder();
    const caption = renderCaption(deck.copy.copy.igCaption, deck.copy.heroCredit);
    const hashtags = deck.copy.copy.hashtags.map((tag) => `#${tag}`).join(" ");
    const entries: Record<string, Uint8Array> = {
      "caption.txt": encoder.encode(`${caption}\n\n${hashtags}\n`),
      "threads.txt": encoder.encode(`${deck.copy.copy.threadsText}\n`),
      "manifest.json": encoder.encode(`${JSON.stringify({
        schemaVersion: "carousel-export/1",
        venture,
        slug,
        date,
        format: format.data,
        template: { template_id: recipeTemplateId(recipe, deck.slides.length), version: template.version },
        recipe,
        storyLine: deck.copy.copy.storyLine,
        attribution: deck.heroCredit,
        slides: slides.map((slide) => ({
          index: slide.index + 1,
          file: `${venture}-${date}-slide-${String(slide.index + 1).padStart(2, "0")}.png`,
          svgHash: slide.svgHash,
          pngHash: slide.pngHash,
          text: strings[articleSlideSlot(slide.index)] ?? ""
        }))
      }, null, 2)}\n`)
    };
    for (const slide of slides) {
      entries[`${venture}-${date}-slide-${String(slide.index + 1).padStart(2, "0")}.png`] = new Uint8Array(slide.png);
    }

    // level 0 is store mode. mtime is fixed rather than `Date.now()`: the same deck exported twice
    // should be the same bytes, which is the promise the whole render path makes.
    const zip = zipSync(entries, { level: 0, mtime: new Date("2026-01-01T00:00:00.000Z") });
    return new Response(new Uint8Array(zip), {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${venture}-${date}-${slug}-${format.data}.zip"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(`Carousel export failed for ${venture}/${slug}/${date}/${token}:`, error);
    return Response.json({ error: "Deck could not be exported." }, { status: 500 });
  }
}
