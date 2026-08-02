import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { CarouselStudioPersistenceError, setCarouselTemplateStatus } from "@/lib/carousel-studio-admin-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  let value: unknown;
  try { value = await request.json(); } catch { return Response.json({ error: "Request must be valid JSON." }, { status: 400 }); }
  const candidate = value as { templateId?: unknown; version?: unknown; status?: unknown; reason?: unknown };
  if (!value || typeof value !== "object" || typeof candidate.templateId !== "string" || typeof candidate.version !== "string" || !["draft", "live", "deprecated"].includes(String(candidate.status)) || typeof candidate.reason !== "string") {
    return Response.json({ error: "Template status request is incomplete." }, { status: 422 });
  }
  try {
    const status = await setCarouselTemplateStatus(candidate as { templateId: string; version: string; status: "draft" | "live" | "deprecated"; reason: string });
    return Response.json({ ok: true, status }, { status: 200, headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof CarouselStudioPersistenceError ? error.message : "The template status was not saved.";
    return Response.json({ error: message }, { status: error instanceof CarouselStudioPersistenceError && error.code === "CONFLICT" ? 422 : 503 });
  }
}
