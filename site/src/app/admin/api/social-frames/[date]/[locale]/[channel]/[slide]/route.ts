import { readFile } from "node:fs/promises";
import path from "node:path";
import { CAROUSEL_BRANDS, liveTemplateByReference, renderCarouselSvg } from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";
const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Re-render a private review frame from the visual payload committed in its social pack. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string; locale: string; channel: string; slide: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { date, locale, channel, slide } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !["en", "cs"].includes(locale) || channel !== "instagram") {
    return new Response("Frame not found.", { status: 404 });
  }
  const packLocale = locale as "en" | "cs";
  const index = Number(slide) - 1;
  if (!Number.isInteger(index) || index < 0 || index > 9) return new Response("Frame not found.", { status: 404 });
  try {
    const pack = record(JSON.parse(await readFile(path.join(repositoryRoot, "state", "social", "packs", `${date}.json`), "utf8")));
    const localized = record(record(pack?.byLocale)?.[packLocale]);
    const visual = record(record(localized?.instagram)?.visual);
    const templateId = typeof visual?.template_id === "string" ? visual.template_id : null;
    const version = typeof visual?.version === "string" ? visual.version : null;
    const content = record(visual?.content);
    const strings = record(content?.strings);
    if (!templateId || !version || content?.locale !== packLocale || !strings || !Object.values(strings).every((value) => typeof value === "string")) {
      return new Response("Frame not found.", { status: 404 });
    }
    const template = liveTemplateByReference(templateId, version);
    const render = renderCarouselSvg({
      template,
      payload: { locale: packLocale, strings: strings as Record<string, string> },
      brand: CAROUSEL_BRANDS["caught-up"],
      format: "instagram-portrait"
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
