import { verifyBasicAuthorization } from "@/lib/admin-auth";
import { DiscrepancyPersistenceError, parseDiscrepancyResolution, saveDiscrepancyResolution } from "@/lib/fightaiq-discrepancy-store";

export const dynamic = "force-dynamic";
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyBasicAuthorization(request.headers.get("authorization"), process.env.ADMIN_USER, process.env.ADMIN_PASSWORD);
  if (authorization === "missing_config") return json({ error: "Admin authentication is not configured." }, 503);
  if (authorization !== "ok") return new Response(JSON.stringify({ error: "Authentication required." }), { status: 401, headers: { "Cache-Control": "no-store, private", "Content-Type": "application/json", "WWW-Authenticate": 'Basic realm="BoardlessAI Admin", charset="UTF-8"' } });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin fighter writes are not allowed." }, 403);
  if (Number(request.headers.get("content-length") ?? "0") > 4_096) return json({ error: "Resolution payload exceeds 4096 bytes." }, 413);
  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ error: "Resolution payload must be valid JSON." }, 400); }
  const resolution = parseDiscrepancyResolution(payload);
  if (!resolution) return json({ error: "Choose a stored source value and add a short reason." }, 422);
  try {
    const persistence = await saveDiscrepancyResolution(resolution);
    return json({ fighterRef: resolution.fighterRef, field: resolution.field, persistence }, 200);
  } catch (error) {
    return json({ error: error instanceof DiscrepancyPersistenceError ? error.message : "The fighter disagreement was not saved." }, 503);
  }
}
