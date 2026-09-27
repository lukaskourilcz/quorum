import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  applyMarketingCalendarAction,
  MarketingCalendarPersistenceError,
  parseMarketingCalendarAction
} from "@/lib/admin-marketing-calendar-store";

export const dynamic = "force-dynamic";

/** One status, one note or one checkbox: 16 KB is far above any honest request. */
const MAX_BODY_BYTES = 16_384;

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

function persistenceStatus(error: MarketingCalendarPersistenceError): number {
  if (error.code === "NOT_FOUND") return 404;
  if (error.code === "INVALID") return 422;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "CORRUPT") return 500;
  return 503;
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin writes are not allowed." }, 403);
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json({ error: `The request is larger than ${MAX_BODY_BYTES} bytes.` }, 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return json({ error: `The request is larger than ${MAX_BODY_BYTES} bytes.` }, 413);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return json({ error: "Request must be valid JSON." }, 400);
  }
  const action = parseMarketingCalendarAction(value);
  if (!action) {
    return json({ error: "Send a venture, an entry or pre-launch id, and a status the owner may set (planned, drafted, skipped, blocked), a note of at most 500 characters, or done." }, 422);
  }
  try {
    return json({ ok: true, ...await applyMarketingCalendarAction(action) }, 200);
  } catch (error) {
    if (error instanceof MarketingCalendarPersistenceError) {
      return json({ error: error.message, code: error.code }, persistenceStatus(error));
    }
    console.error("Marketing calendar write failed:", error);
    return json({ error: "The calendar change was not saved." }, 500);
  }
}
