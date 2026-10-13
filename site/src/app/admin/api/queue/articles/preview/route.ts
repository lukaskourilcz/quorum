import { applyEditorialPreviewSelection, readEditorialPreview } from "@/lib/admin-queue/editorial-preview";
import { QueueActionError } from "@/lib/admin-queue/store";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" };

function failure(error: unknown): Response {
  const status = error instanceof QueueActionError ? ({ INVALID: 422, NOT_FOUND: 404, REFUSED: 403, CONFLICT: 409, UNCONFIGURED: 503, REMOTE: 503, UNAVAILABLE: 501, CORRUPT: 500 } as const)[error.code] : 500;
  return Response.json({ error: error instanceof QueueActionError ? error.message : "The preview selection is unavailable." }, { status, headers });
}

export async function GET(request: Request): Promise<Response> {
  const auth = verifyAdminRequest(request);
  if (auth !== "ok") return adminAuthorizationError(auth);
  try { return Response.json(await readEditorialPreview(new URL(request.url).searchParams.get("id") ?? ""), { headers }); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request): Promise<Response> {
  const auth = verifyAdminRequest(request);
  if (auth !== "ok") return adminAuthorizationError(auth);
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "A same-origin owner action is required." }, { status: 403, headers });
  if (Number(request.headers.get("content-length")) > 5000) return new Response(null, { status: 413, headers });
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 5000) return new Response(null, { status: 413, headers });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400, headers }); }
  try { return Response.json({ ok: true, ...await applyEditorialPreviewSelection(value) }, { headers }); }
  catch (error) { return failure(error); }
}
