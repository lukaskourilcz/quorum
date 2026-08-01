import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { PriorityPersistenceError, updatePriorityQueue } from "@/lib/admin-autonomy";

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
  if (!value || typeof value !== "object" || Array.isArray(value)) return json({ error: "Invalid priority request." }, 422);
  const payload = value as Record<string, unknown>;
  try {
    const priorities = payload.action === "archive" && typeof payload.itemId === "string"
      ? await updatePriorityQueue({ action: "archive", itemId: payload.itemId })
      : payload.action === "add" && typeof payload.venture === "string" && typeof payload.question === "string" && typeof payload.decisionAtStake === "string" && Array.isArray(payload.evidenceNeeded) && payload.evidenceNeeded.every((entry) => typeof entry === "string")
        ? await updatePriorityQueue({ action: "add", venture: payload.venture, question: payload.question, decisionAtStake: payload.decisionAtStake, evidenceNeeded: payload.evidenceNeeded })
        : null;
    return priorities ? json({ ok: true, priorities }, 200) : json({ error: "Invalid priority request." }, 422);
  } catch (error) {
    if (error instanceof PriorityPersistenceError) {
      return json({ error: error.message, code: error.code }, error.code === "CONFLICT" ? 409 : error.code === "CORRUPT" ? 500 : 503);
    }
    return json({ error: "The priority queue was not saved." }, 500);
  }
}
