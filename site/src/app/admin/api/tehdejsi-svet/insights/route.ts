import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { parseTehdejsiProductInsightAction } from "@/lib/tehdejsi-product-insight-model";
import { updateTehdejsiProductInsight } from "@/lib/tehdejsi-product-insights-store";
import { TehdejsiStateError } from "@/lib/tehdejsi-state-store";

export const dynamic = "force-dynamic";
export const MAX_INSIGHT_ACTION_BYTES = 2_048;
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin insight writes are not allowed." }, 403);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_INSIGHT_ACTION_BYTES) return json({ error: `Insight action exceeds ${MAX_INSIGHT_ACTION_BYTES} bytes.` }, 413);
  let raw: string;
  try { raw = await request.text(); } catch { return json({ error: "Insight action could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_INSIGHT_ACTION_BYTES) return json({ error: `Insight action exceeds ${MAX_INSIGHT_ACTION_BYTES} bytes.` }, 413);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return json({ error: "Insight action must be valid JSON." }, 400); }
  const action = parseTehdejsiProductInsightAction(value);
  if (!action) return json({ error: "Insight id, allowed status and owner note are required." }, 422);
  try {
    const result = await updateTehdejsiProductInsight(action);
    return json(result, result.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof TehdejsiStateError) {
      const status = error.code === "CONFLICT" ? 409 : error.code === "UNAVAILABLE" ? 404 : error.code === "CORRUPT" ? 500 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The product insight status was not saved." }, 500);
  }
}
