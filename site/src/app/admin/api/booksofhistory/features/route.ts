import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  applyBhFeatureAction,
  BhFeaturePersistenceError,
  parseBhFeatureAction
} from "@/lib/booksofhistory-features-store";

export const dynamic = "force-dynamic";

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin feature writes are not allowed." }, 403);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 524_288) {
    return json({ error: "Feature payload exceeds 524288 bytes." }, 413);
  }

  let payload: unknown;
  try { payload = await request.json(); }
  catch { return json({ error: "Feature payload must be valid JSON." }, 400); }
  const action = parseBhFeatureAction(payload);
  if (!action) return json({ error: "Feature action is invalid or incomplete." }, 422);

  try {
    const result = await applyBhFeatureAction(action);
    return json(result, result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof BhFeaturePersistenceError) {
      const status = error.code === "CONFLICT" ? 409 : error.code === "CORRUPT" ? 500 : error.code === "UNAVAILABLE" ? 404 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The feature action failed before it was committed." }, 500);
  }
}
