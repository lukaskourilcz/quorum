import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { CarouselStudioPersistenceError, type CarouselStudioPersistenceCode } from "@/lib/carousel-studio-admin-store";
import { PACKAGE_BRAND, designLabPackagesAllowed, readQuizPackage, reviewPackageSlides, slidesWithEdits } from "@/lib/devshark-package";
import { PackageSlideRefusal, packageSlideText, setPackageSlideOverride } from "@/lib/package-slide-overrides";

export const dynamic = "force-dynamic";

/** A slide's three fields and the envelope, with room for multi-byte characters. */
const MAX_BYTES = 8_000;

const CAUSES: Readonly<Record<CarouselStudioPersistenceCode, string>> = {
  UNCONFIGURED: "no-token",
  REFUSED: "token-refused",
  REMOTE: "github",
  CONFLICT: "rejected",
  CORRUPT: "corrupt",
  UNAVAILABLE: "missing"
};

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

/**
 * Save one slide of a devShark package: its headline, body and alt text (quorum#575).
 *
 * The whole deck, as it will read after this edit, goes through the room's caps and the clip gate
 * first. A refusal names every problem, and the slot that would clip, and writes nothing. An
 * accepted edit lands in `slide-overrides.json`; the package itself is never changed.
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin writes are not allowed." }, 403);
  const raw = await request.text().catch(() => null);
  if (raw === null || new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ error: "A slide edit is at most 8,000 bytes.", cause: "rejected" }, 413);
  let body: Record<string, unknown>;
  try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return json({ error: "Request must be valid JSON.", cause: "rejected" }, 400); }
  const fields = ["venture", "slug", "date", "slide", "headline", "body", "alt"];
  if (!body || typeof body !== "object" || Object.keys(body).some((key) => !fields.includes(key))
    || body.venture !== PACKAGE_BRAND || typeof body.slug !== "string" || typeof body.date !== "string" || typeof body.slide !== "number"
    || typeof body.headline !== "string" || typeof body.body !== "string" || typeof body.alt !== "string") {
    return json({ error: "The slide edit is incomplete.", cause: "rejected" }, 422);
  }
  if (!(await designLabPackagesAllowed())) return json({ error: "marketingShark has no Design Lab edge, so its packages cannot be edited.", cause: "rejected" }, 403);
  const record = await readQuizPackage(body.date);
  if (!record || record.slug !== body.slug) return json({ error: "No devShark package has that address.", cause: "missing" }, 404);
  const index = body.slide;
  const original = record.slides[index];
  if (!Number.isInteger(index) || !original) return json({ error: "A package has five slides.", cause: "rejected" }, 422);
  try {
    const result = await setPackageSlideOverride({
      slug: record.slug,
      date: record.date,
      slide: index,
      copy: { headline: body.headline, body: body.body, alt: body.alt },
      original: { headline: original.headline, body: original.body, alt: original.alt },
      review: (edits) => reviewPackageSlides(record, slidesWithEdits(record, edits))
    });
    return json({
      ok: true,
      commit: result.commit,
      edited: result.edited,
      slide: { headline: packageSlideText(body.headline), body: packageSlideText(body.body), alt: packageSlideText(body.alt) }
    }, 200);
  } catch (error) {
    if (error instanceof PackageSlideRefusal) return json({ error: "The edit was not saved.", cause: "refused", problems: error.problems }, 422);
    if (error instanceof CarouselStudioPersistenceError) return json({ error: error.message, cause: CAUSES[error.code] }, error.code === "CONFLICT" ? 422 : 503);
    console.error("Package slide save failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "The edit was not saved.", cause: "unknown" }, 503);
  }
}
