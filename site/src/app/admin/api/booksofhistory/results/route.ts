import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  BhResultPersistenceError,
  parseBhOwnerResultRequest,
  recordBhOwnerResult
} from "@/lib/booksofhistory-results-store";

export const dynamic = "force-dynamic";

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin result writes are not allowed." }, 403);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 65_536) {
    return json({ error: "Result payload exceeds 65536 bytes." }, 413);
  }

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return json({ error: "Result payload must be valid JSON." }, 400); }
  const input = parseBhOwnerResultRequest(payload);
  if (!input) return json({ error: "Owner result is invalid or incomplete." }, 422);

  try {
    const result = await recordBhOwnerResult(input);
    return json(result, result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof BhResultPersistenceError) {
      const status = error.code === "CONFLICT" ? 409 : error.code === "CORRUPT" ? 500 : error.code === "UNAVAILABLE" ? 404 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The owner result failed before it was committed." }, 500);
  }
}
