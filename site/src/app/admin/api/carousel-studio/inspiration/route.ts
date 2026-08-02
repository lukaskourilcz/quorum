import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { addCarouselInspiration, CarouselStudioPersistenceError } from "@/lib/carousel-studio-admin-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "Request must be valid JSON." }, { status: 400 }); }
  if (!value || typeof value !== "object" || typeof (value as { url?: unknown }).url !== "string" || typeof (value as { label?: unknown }).label !== "string") {
    return Response.json({ error: "Add one URL and label." }, { status: 422 });
  }
  try {
    const links = await addCarouselInspiration(value as { url: string; label: string });
    return Response.json({ ok: true, links }, { status: 201, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof CarouselStudioPersistenceError ? error.message : "The inspiration link was not saved.";
    return Response.json({ error: message }, { status: error instanceof CarouselStudioPersistenceError && error.code === "CONFLICT" ? 422 : 503 });
  }
}
