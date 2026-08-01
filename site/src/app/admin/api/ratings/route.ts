import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { parseRatingRecord } from "@/lib/rating-model";
import {
  appendRating,
  RatingPersistenceError
} from "@/lib/rating-store";

export const dynamic = "force-dynamic";

function json(value: unknown, status: number): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store, private" }
  });
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin rating writes are not allowed." }, 403);
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > 4_096) {
    return json({ error: "Rating payload exceeds 4096 bytes." }, 413);
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Rating payload must be valid JSON." }, 400);
  }
  const rating = parseRatingRecord(payload);
  if (!rating) {
    return json({ error: "Rating payload does not satisfy rating/1." }, 422);
  }
  try {
    const result = await appendRating(rating);
    return json(result, result.idempotent ? 200 : 201);
  } catch (error) {
    if (error instanceof RatingPersistenceError) {
      const status = error.code === "CONFLICT" ? 409 : error.code === "CORRUPT" ? 500 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The rating write failed before it was committed." }, 500);
  }
}
