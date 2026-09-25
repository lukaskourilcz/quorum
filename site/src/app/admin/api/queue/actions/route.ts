import { applyQueueAction } from "@/lib/admin-queue/actions";
import { QueueActionError, type QueueActionCode } from "@/lib/admin-queue/store";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";

/** A LinkedIn caption, its alt text and the envelope, with room for multi-byte characters. */
const MAX_BYTES = 20_000;

const STATUS: Readonly<Record<QueueActionCode, number>> = {
  INVALID: 422,
  NOT_FOUND: 404,
  REFUSED: 403,
  CONFLICT: 409,
  UNCONFIGURED: 503,
  REMOTE: 503,
  UNAVAILABLE: 501,
  CORRUPT: 500
};

function json(value: unknown, status: number): Response {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow, noarchive" } });
}

/**
 * The owner's Queue actions: approve, edit, hold, reject and re-render (quorum#575). Each accepted
 * action appends one `social-queue-event/1` and updates one item. It moves an item to `queued` at
 * most and never contacts a platform. An approval then wakes the publisher workflow (quorum#574);
 * a wake-up that fails is reported in the body of a saved approval, never as a failed request,
 * because the approval stands either way. A re-render also writes the frames and the package
 * revision its new draft points at, and wakes nothing.
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin queue actions are not allowed." }, 403);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: `A queue action is at most ${MAX_BYTES} bytes.` }, 413);
  let raw: string;
  try { raw = await request.text(); } catch { return json({ error: "The queue action could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ error: `A queue action is at most ${MAX_BYTES} bytes.` }, 413);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return json({ error: "The queue action must be valid JSON." }, 400); }
  try {
    const result = await applyQueueAction(value);
    return json({ ok: true, ...result }, result.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof QueueActionError) return json({ error: error.message, code: error.code }, STATUS[error.code]);
    console.error("Queue action failed:", error instanceof Error ? error.message : "unknown error");
    return json({ error: "The queue action was not saved." }, 500);
  }
}
