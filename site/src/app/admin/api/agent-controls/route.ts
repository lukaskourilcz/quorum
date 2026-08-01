import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { AgentControlPersistenceError, updateAgentControl } from "@/lib/admin-agent-controls";

export const dynamic = "force-dynamic";

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin writes are not allowed." }, 403);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Request must be valid JSON." }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "Invalid agent-switch request." }, 422);
  const value = payload as Record<string, unknown>;
  if (typeof value.ventureId !== "string" || typeof value.agentId !== "string" || typeof value.enabled !== "boolean") return json({ error: "Invalid agent-switch request." }, 422);
  try {
    await updateAgentControl({ ventureId: value.ventureId, agentId: value.agentId, enabled: value.enabled });
    return json({ ok: true, enabled: value.enabled }, 200);
  } catch (error) {
    if (error instanceof AgentControlPersistenceError) {
      return json({ error: error.message, code: error.code }, error.code === "CONFLICT" ? 409 : error.code === "CORRUPT" ? 500 : 503);
    }
    return json({ error: "The agent switch was not saved." }, 500);
  }
}
