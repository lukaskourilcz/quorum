import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { ImplementationRefreshError, requestImplementationProgressRefresh } from "@/lib/admin-implementation-refresh";

export const dynamic = "force-dynamic";

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin refresh requests are not allowed." }, 403);
  if (request.body !== null || (request.headers.get("content-length") && request.headers.get("content-length") !== "0")) {
    return json({ error: "The refresh request does not accept a body." }, 413);
  }
  try {
    const receipt = await requestImplementationProgressRefresh({ requestedBy: process.env.ADMIN_USER?.trim() || "owner" });
    return json({ ok: true, receipt }, 202);
  } catch (error) {
    if (error instanceof ImplementationRefreshError) {
      const status = error.code === "COOLDOWN" ? 429 : error.code === "CONFLICT" ? 409 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The progress refresh request was not recorded." }, 500);
  }
}
