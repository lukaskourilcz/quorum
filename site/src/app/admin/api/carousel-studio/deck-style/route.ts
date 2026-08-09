import { DECK_STYLES } from "@boardlessai/carousel-studio";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  CarouselStudioPersistenceError,
  setDeckStyleOverride,
  type CarouselStudioPersistenceCode
} from "@/lib/carousel-studio-admin-store";

export const dynamic = "force-dynamic";

/**
 * The machine-readable half of a failed save.
 *
 * The panel shows the message; it decides *which* warning to show from this. A save that failed
 * because the deployment has no token and a save that failed because GitHub stopped accepting
 * the token are the same sentence to a reader and completely different problems to fix, so the
 * body has to carry the difference rather than leaving the panel to parse prose.
 */
const CAUSES: Record<CarouselStudioPersistenceCode, string> = {
  UNCONFIGURED: "no-token",
  REFUSED: "token-refused",
  REMOTE: "github",
  CONFLICT: "rejected",
  CORRUPT: "corrupt",
  UNAVAILABLE: "missing"
};

/**
 * Bind the deck design the owner picked to one article.
 *
 * The switcher used to re-render a preview and stop there. What it writes here is what the
 * render path reads, so the choice reaches the shipped deck.
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "Request must be valid JSON." }, { status: 400 }); }
  const candidate = value as { venture?: unknown; slug?: unknown; style?: unknown };
  if (
    !value || typeof value !== "object" ||
    (candidate.venture !== "caught-up" && candidate.venture !== "mma-files") ||
    typeof candidate.slug !== "string" ||
    typeof candidate.style !== "string"
  ) {
    return Response.json({ error: "Deck design request is incomplete." }, { status: 422 });
  }
  try {
    const { overrides, commit } = await setDeckStyleOverride({
      venture: candidate.venture,
      slug: candidate.slug,
      style: candidate.style,
      styles: DECK_STYLES
    });
    return Response.json({ ok: true, overrides, commit }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    if (!(error instanceof CarouselStudioPersistenceError)) {
      console.error("Deck design save failed:", error);
      return Response.json({ error: "The deck design was not saved.", cause: "unknown" }, { status: 503 });
    }
    return Response.json(
      { error: error.message, cause: CAUSES[error.code] },
      { status: error.code === "CONFLICT" ? 422 : 503 }
    );
  }
}
