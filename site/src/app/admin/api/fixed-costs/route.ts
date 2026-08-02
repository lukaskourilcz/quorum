import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { FixedCostPersistenceError, updateAdminFixedCosts } from "@/lib/admin-fixed-costs";
import type { FixedCostEntry } from "@/lib/fixed-cost-model";

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
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray((value as { costs?: unknown }).costs)) {
    return json({ error: "Invalid fixed-cost request." }, 422);
  }
  try {
    const snapshot = await updateAdminFixedCosts((value as { costs: FixedCostEntry[] }).costs);
    return json({ ok: true, snapshot }, 200);
  } catch (error) {
    if (error instanceof FixedCostPersistenceError) {
      return json({ error: error.message, code: error.code }, error.code === "CONFLICT" ? 422 : error.code === "CORRUPT" ? 500 : 503);
    }
    return json({ error: "The fixed-cost list was not saved." }, 500);
  }
}
