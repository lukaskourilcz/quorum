import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  applyKvorumRecommendationAction,
  KvorumRecommendationPersistenceError,
  parseKvorumRecommendationAction
} from "@/lib/kvorum-recommendation-store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 32_768;

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

function persistenceStatus(error: KvorumRecommendationPersistenceError): number {
  if (error.code === "CONFLICT") return 409;
  if (error.code === "INVALID") return 422;
  if (error.code === "CORRUPT") return 500;
  return 503;
}

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin Kvórum writes are not allowed." }, 403);
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json({ error: `Kvórum payload exceeds ${MAX_BODY_BYTES} bytes.` }, 413);
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Kvórum payload must be valid JSON." }, 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return json({ error: "Kvórum payload must be an object." }, 400);
  }
  const action = parseKvorumRecommendationAction(value);
  if (!action) {
    return json({ error: "Check the action, recommendation ref, owner edits, rejection reason or HTTPS posted URL." }, 422);
  }

  try {
    const result = await applyKvorumRecommendationAction(action);
    return json({
      ok: true,
      id: result.recommendation.id,
      status: result.recommendation.status,
      idempotent: result.idempotent,
      persistence: result.persistence,
      commits: result.commits,
      designLabQueued: result.summary !== null
    }, 200);
  } catch (error) {
    if (error instanceof KvorumRecommendationPersistenceError) {
      return json({ error: error.message, cause: error.code.toLowerCase() }, persistenceStatus(error));
    }
    console.error("Kvórum recommendation write failed:", error);
    return json({ error: "The Kvórum owner action was not saved.", cause: "unknown" }, 503);
  }
}
