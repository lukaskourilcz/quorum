import path from "node:path";
import { CAROUSEL_BRANDS, liveTemplateByReference, renderCarouselSvg } from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { readSocialPackVisual } from "@/lib/social-pack-visual";

export const dynamic = "force-dynamic";
const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

/** Re-render a private review frame from the visual payload committed in its social pack. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string; locale: string; channel: string; slide: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { date, locale, channel, slide } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !["en", "cs"].includes(locale) || !["instagram", "threads"].includes(channel)) {
    return new Response("Frame not found.", { status: 404 });
  }
  const index = Number(slide) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 9) return new Response("Frame not found.", { status: 404 });
  try {
    const visual = await readSocialPackVisual(repositoryRoot, { date, locale, channel });
    if (!visual) return new Response("Frame not found.", { status: 404 });
    const template = liveTemplateByReference(visual.templateId, visual.version);
    const render = renderCarouselSvg({
      template,
      payload: { locale: visual.locale, strings: visual.strings },
      brand: CAROUSEL_BRANDS["caught-up"],
      format: channel === "instagram" ? "instagram-portrait" : "threads"
    })[index];
    if (!render) return new Response("Frame not found.", { status: 404 });
    return new Response(render.svg, {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Type": "image/svg+xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Frame could not be rendered.", { status: 422 });
  }
}
