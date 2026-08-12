import { DECK_DESIGNS } from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  CarouselStudioPersistenceError,
  saveCarouselPreset,
  setRecipeOverride,
  setSlideTextOverride,
  type CarouselStudioPersistenceCode
} from "@/lib/carousel-studio-admin-store";

export const dynamic = "force-dynamic";

/**
 * What the workspace saves: a recipe, or one slide's words.
 *
 * One route for both, because they are one action from the owner's side — a change to how this
 * article's carousel looks — and because they share the persistence path, and therefore the same
 * truth-telling about whether the write reached GitHub.
 */
const CAUSES: Record<CarouselStudioPersistenceCode, string> = {
  UNCONFIGURED: "no-token",
  REFUSED: "token-refused",
  REMOTE: "github",
  CONFLICT: "rejected",
  CORRUPT: "corrupt",
  UNAVAILABLE: "missing"
};

function failure(error: unknown): Response {
  if (!(error instanceof CarouselStudioPersistenceError)) {
    console.error("Design Lab save failed:", error);
    return Response.json({ error: "Změna se neuložila.", cause: "unknown" }, { status: 503 });
  }
  return Response.json(
    { error: error.message, cause: CAUSES[error.code] },
    { status: error.code === "CONFLICT" ? 422 : 503 }
  );
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "Request must be valid JSON." }, { status: 400 }); }
  const body = value as {
    venture?: unknown;
    slug?: unknown;
    date?: unknown;
    family?: unknown;
    variant?: unknown;
    accentSwap?: unknown;
    treatment?: unknown;
    typeScale?: unknown;
    slide?: unknown;
    text?: unknown;
    presetName?: unknown;
    presetStatus?: unknown;
  };
  if (
    !value || typeof value !== "object"
    || (body.venture !== "caught-up" && body.venture !== "mma-files" && body.venture !== "kvorum")
    || typeof body.slug !== "string"
    || typeof body.date !== "string"
  ) {
    return Response.json({ error: "Design Lab request is incomplete.", cause: "rejected" }, { status: 422 });
  }
  const article = { venture: body.venture as "caught-up" | "mma-files" | "kvorum", slug: body.slug, date: body.date };

  // A slide edit names a slide; a recipe change names a family. Nothing sends both.
  if (typeof body.slide === "number") {
    if (typeof body.text !== "string") {
      return Response.json({ error: "Slide edit is incomplete.", cause: "rejected" }, { status: 422 });
    }
    try {
      const { commit } = await setSlideTextOverride({ ...article, slide: body.slide, text: body.text });
      return Response.json({ ok: true, commit }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
    } catch (error) {
      return failure(error);
    }
  }

  if (typeof body.family !== "string") {
    return Response.json({ error: "Design Lab request is incomplete.", cause: "rejected" }, { status: 422 });
  }

  // A preset is the current design saved for reuse. It goes live only by the owner saying so —
  // the same explicit action a template's lifecycle takes, and for the same reason: the pipeline
  // will apply it unattended to work nobody has looked at yet.
  if (typeof body.presetName === "string") {
    try {
      const { presets, commit } = await saveCarouselPreset({
        name: body.presetName,
        ventureScope: [article.venture],
        formats: ["instagram-portrait", "instagram-square", "instagram-story", "threads"],
        family: body.family,
        variant: body.variant === "B" ? "B" : "A",
        accentSwap: body.accentSwap === true,
        treatment: body.treatment === "mono" || body.treatment === "duotone" ? body.treatment : "none",
        typeScale: body.typeScale === 0.9 || body.typeScale === 1.1 ? body.typeScale : 1,
        status: body.presetStatus === "live" ? "live" : "draft"
      });
      return Response.json({ ok: true, commit, presets }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
    } catch (error) {
      return failure(error);
    }
  }
  try {
    const { commit } = await setRecipeOverride({
      ...article,
      family: body.family,
      ...(body.variant === "A" || body.variant === "B" ? { variant: body.variant } : {}),
      ...(typeof body.accentSwap === "boolean" ? { accentSwap: body.accentSwap } : {}),
      ...(body.treatment === "none" || body.treatment === "mono" || body.treatment === "duotone"
        ? { treatment: body.treatment }
        : {}),
      ...(body.typeScale === 0.9 || body.typeScale === 1 || body.typeScale === 1.1 ? { typeScale: body.typeScale } : {}),
      designs: DECK_DESIGNS
    });
    return Response.json({ ok: true, commit }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    return failure(error);
  }
}
