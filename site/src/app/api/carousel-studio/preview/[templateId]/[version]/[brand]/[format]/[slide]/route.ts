import {
  CAROUSEL_BRANDS,
  CarouselFormatSchema,
  renderCarouselPng
} from "@boardlessai/carousel-studio";
import { findCarouselTemplate, previewPayload } from "@/lib/carousel-studio";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateId: string; version: string; brand: string; format: string; slide: string }> }
): Promise<Response> {
  const { templateId, version, brand, format, slide } = await params;
  const template = await findCarouselTemplate(templateId, version);
  const brandTokens = CAROUSEL_BRANDS[brand as keyof typeof CAROUSEL_BRANDS];
  const parsedFormat = CarouselFormatSchema.safeParse(format);
  const slideIndex = Number(slide) - 1;
  if (!template || !brandTokens || !parsedFormat.success || !Number.isInteger(slideIndex) || slideIndex < 0) {
    return Response.json({ error: "Preview not found." }, { status: 404 });
  }
  const locale = new URL(request.url).searchParams.get("locale") === "cs" ? "cs" : "en";
  try {
    const renders = await renderCarouselPng({
      template,
      payload: previewPayload(template, locale),
      brand: brandTokens,
      format: parsedFormat.data
    });
    const render = renders[slideIndex];
    if (!render) return Response.json({ error: "Slide not found." }, { status: 404 });
    return new Response(new Uint8Array(render.png), {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Type": "image/png",
        ETag: `"${render.pngHash}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "Preview failed its template checks." }, { status: 422 });
  }
}
