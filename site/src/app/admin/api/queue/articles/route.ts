import { readQueueEntries } from "@/lib/admin-queue/state";
import { readEditorialQueue } from "@/lib/admin-queue/editorial";
import { applyEditorialDecision } from "@/lib/admin-queue/editorial";
import { QueueActionError } from "@/lib/admin-queue/store";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = verifyAdminRequest(request);
  if (auth !== "ok") return adminAuthorizationError(auth);
  const headers = { "Cache-Control": "no-store, private" };
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Cross-origin actions are not allowed." }, { status: 403, headers });
  if (Number(request.headers.get("content-length")) > 5000) return new Response(null, { status: 413 });
  const body = await request.text();
  if (new TextEncoder().encode(body).length > 5000) return new Response(null, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400, headers }); }
  try { return Response.json({ ok: true, ...await applyEditorialDecision(value) }, { headers }); }
  catch (error) {
    const status = error instanceof QueueActionError ? ({ INVALID: 422, NOT_FOUND: 404, REFUSED: 403, CONFLICT: 409, UNCONFIGURED: 503, REMOTE: 503, UNAVAILABLE: 501, CORRUPT: 500 } as const)[error.code] : 500;
    return Response.json({ error: error instanceof QueueActionError ? error.message : "The article decision was not saved." }, { status, headers });
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = verifyAdminRequest(request);
  if (auth !== "ok") return adminAuthorizationError(auth);
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) return new Response(null, { status: 400 });
  const [queue, editorial] = await Promise.all([readQueueEntries(), readEditorialQueue()]);
  if (queue.listing === "unavailable" || editorial.unavailable) return new Response(null, { status: 503 });
  const review = editorial.items.find(item => item.date === date && item.decision === "approve");
  const posts = queue.entries.flatMap(({ item }) => item.schemaVersion === 2 && item.sourceVentureId === "caught-up" && item.releaseId === `caught-up-${date}-cs`
    && ["draft", "approved", "queued", "failed"].includes(item.status) && Date.parse(item.publishWindow.notAfter) > Date.now()
    ? [{ id: item.id, hash: item.content.contentHash, channel: item.channel }] : []);
  return Response.json({ posts, reviewId: review?.id ?? null, images: review?.images ?? [] }, { headers: { "Cache-Control": "no-store, private" } });
}
