import { verifyBasicAuthorization } from "@/lib/admin-auth";
import { OddsPersistenceError, parseOwnerOddsCapture, saveOwnerOddsCapture } from "@/lib/fightaiq-odds-store";

export const dynamic = "force-dynamic";
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyBasicAuthorization(request.headers.get("authorization"), process.env.ADMIN_USER, process.env.ADMIN_PASSWORD);
  if (authorization === "missing_config") return json({ error: "Admin authentication is not configured." }, 503);
  if (authorization !== "ok") return new Response(JSON.stringify({ error: "Authentication required." }), { status: 401, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json", "WWW-Authenticate": 'Basic realm="BoardlessAI Admin", charset="UTF-8"' } });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin price writes are not allowed." }, 403);
  if (Number(request.headers.get("content-length") ?? "0") > 4_096) return json({ error: "Price payload exceeds 4096 bytes." }, 413);
  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ error: "Price payload must be valid JSON." }, 400); }
  const capture = parseOwnerOddsCapture(payload);
  if (!capture) return json({ error: "Check the event, bout, source note and both decimal prices." }, 422);
  try {
    const persistence = await saveOwnerOddsCapture(capture);
    return json({ id: capture.id, persistence }, 201);
  } catch (error) {
    return json({ error: error instanceof OddsPersistenceError ? error.message : "The price snapshot was not saved." }, 503);
  }
}
