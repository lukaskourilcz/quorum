import {
  CAROUSEL_BRANDS,
  CarouselFormatSchema,
  renderCarouselSvg
} from "@boardlessai/carousel-studio";
import { findPublicCarouselTemplate, previewPayloadForBrand } from "@/lib/carousel-studio";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string; version: string; brand: string; format: string; slide: string }> }
): Promise<Response> {
  const { templateId, version, brand, format, slide } = await params;
  const template = findPublicCarouselTemplate(templateId, version);
  const brandTokens = CAROUSEL_BRANDS[brand as keyof typeof CAROUSEL_BRANDS];
  const parsedFormat = CarouselFormatSchema.safeParse(format);
  const slideIndex = Number(slide) - 1;
  if (!template || !brandTokens || !parsedFormat.success || !Number.isInteger(slideIndex) || slideIndex < 0) {
    return Response.json({ error: "Preview not found." }, { status: 404 });
  }
  const locale = new URL(request.url).searchParams.get("locale") === "cs" ? "cs" : "en";
  try {
    const renders = renderCarouselSvg({
      template,
      payload: await previewPayloadForBrand(template, locale, brandTokens.id),
      brand: brandTokens,
      format: parsedFormat.data
    });
    const render = renders[slideIndex];
    if (!render) return Response.json({ error: "Slide not found." }, { status: 404 });
    return new Response(render.svg, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Type": "image/svg+xml; charset=utf-8",
        ETag: `"${render.svgHash}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "Preview failed its template checks." }, { status: 422 });
  }
}
