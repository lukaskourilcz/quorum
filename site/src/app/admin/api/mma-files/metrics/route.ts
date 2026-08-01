import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { MetricsPersistenceError, parseOwnerMetrics, saveOwnerMetrics } from "@/lib/mma-files-metrics-store";

export const dynamic = "force-dynamic";
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin metrics writes are not allowed." }, 403);
  if (Number(request.headers.get("content-length") ?? "0") > 8_192) return json({ error: "Metrics payload exceeds 8192 bytes." }, 413);
  let payload: unknown;
  try { payload = await request.json(); } catch { return json({ error: "Metrics payload must be valid JSON." }, 400); }
  const capture = parseOwnerMetrics(payload);
  if (!capture) return json({ error: "Check the post, time window and non-negative whole-number metrics." }, 422);
  try { return json({ capture, ...(await saveOwnerMetrics(capture)) }, 201); }
  catch (error) { return json({ error: error instanceof MetricsPersistenceError ? error.message : "The metrics were not saved." }, 503); }
}
