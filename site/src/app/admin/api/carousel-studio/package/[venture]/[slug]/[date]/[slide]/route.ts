import { CAROUSEL_BRANDS, QUIZ_SLIDE_LIMITS, quizSlideRenderInput, renderCarouselSlidePng } from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { PACKAGE_BRAND, designLabPackagesAllowed, quizSlideCopies, readQuizPackage, slidesWithEdits } from "@/lib/devshark-package";
import { packageSlideEdits, packageSlideText, readPackageSlideOverrides } from "@/lib/package-slide-overrides";

export const dynamic = "force-dynamic";

/**
 * One slide of a devShark package, rendered through marketingShark's quiz templates (quorum#575).
 *
 * The slide carries the owner's saved words by default. `headline` and `body` in the query render
 * a draft instead, so the editor previews an edit, clipping included, before it is saved; nothing
 * is written here. Alt text is not drawn on a slide, so it has no bearing on the picture.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ venture: string; slug: string; date: string; slide: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { venture, slug, date, slide } = await params;
  const index = Number(slide) - 1;
  if (venture !== PACKAGE_BRAND || !Number.isInteger(index) || index < 0 || index > 4 || !(await designLabPackagesAllowed())) {
    return Response.json({ error: "Slide not found." }, { status: 404 });
  }
  const record = await readQuizPackage(date);
  if (!record || record.slug !== slug) return Response.json({ error: "Slide not found." }, { status: 404 });
  if (!record.facts) return Response.json({ error: record.problems[0] ?? "This package cannot be rendered again." }, { status: 422 });

  const query = new URL(request.url).searchParams;
  const saved = slidesWithEdits(record, packageSlideEdits(await readPackageSlideOverrides(), record.slug, record.date))[index]!;
  const headline = query.has("headline") ? packageSlideText(query.get("headline") ?? "") : saved.headline;
  const body = query.has("body") ? packageSlideText(query.get("body") ?? "") : saved.body;
  if (headline.length > QUIZ_SLIDE_LIMITS.headlineChars || body.length > QUIZ_SLIDE_LIMITS.bodyChars) {
    return Response.json({ error: "A draft longer than a slide holds is not rendered." }, { status: 422 });
  }
  try {
    const [copy] = quizSlideCopies([{ ...saved, headline, body }]);
    const render = await renderCarouselSlidePng(quizSlideRenderInput({
      ...copy!,
      facts: record.facts,
      locale: "en",
      brand: CAROUSEL_BRANDS.devshark,
      format: record.format
    }));
    if (!render) return Response.json({ error: "Slide not found." }, { status: 404 });
    const download = query.get("download") === "1";
    return new Response(new Uint8Array(render.png), {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Type": "image/png",
        ETag: `"${render.pngHash}"`,
        "X-Content-Type-Options": "nosniff",
        // The editor reads this to say which slot would clip before the owner saves.
        "X-Truncated-Slots": render.truncatedSlots.join(","),
        ...(download ? { "Content-Disposition": `attachment; filename="devshark-${record.date}-slide-${String(index + 1).padStart(2, "0")}.png"` } : {})
      }
    });
  } catch (error) {
    console.error(`Package slide render failed for ${venture}/${slug}/${date}/${slide}:`, error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Slide could not be rendered." }, { status: 500 });
  }
}
