import { verifyBasicAuthorization } from "@/lib/admin-auth";
import { AgentControlPersistenceError, updateAgentControl } from "@/lib/admin-agent-controls";

export const dynamic = "force-dynamic";

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyBasicAuthorization(request.headers.get("authorization"), process.env.ADMIN_USER, process.env.ADMIN_PASSWORD);
  if (authorization === "missing_config") return json({ error: "Admin login is not configured." }, 503);
  if (authorization !== "ok") return new Response(JSON.stringify({ error: "Authentication required." }), {
    status: 401,
    headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json", "WWW-Authenticate": 'Basic realm="BoardlessAI Admin", charset="UTF-8"' }
  });
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
