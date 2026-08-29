import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { VentureSettingsPersistenceError, setVenturePaused } from "@/lib/admin-venture-settings";

export const dynamic = "force-dynamic";

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin writes are not allowed." }, 403);
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Request must be valid JSON." }, 400);
  }
  const body = value && typeof value === "object" && !Array.isArray(value) ? value as { ventureId?: unknown; paused?: unknown } : null;
  if (typeof body?.ventureId !== "string" || typeof body.paused !== "boolean") {
    return json({ error: "Send a project id and whether it is paused." }, 422);
  }
  try {
    const settings = await setVenturePaused(body.ventureId, body.paused);
    return json({ ok: true, settings }, 200);
  } catch (error) {
    if (error instanceof VentureSettingsPersistenceError) {
      return json({ error: error.message, code: error.code }, error.code === "CONFLICT" ? 422 : error.code === "CORRUPT" ? 500 : 503);
    }
    return json({ error: "The switch was not saved." }, 500);
  }
}
