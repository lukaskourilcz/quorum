import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { KvorumRecommendationPersistenceError } from "@/lib/kvorum-admin-persistence";
import { applyKvorumClaimAction, parseKvorumClaimAction } from "@/lib/kvorum-claim-store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8_192;
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
    return json({ error: `Kvórum claim payload exceeds ${MAX_BODY_BYTES} bytes.` }, 413);
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Kvórum claim payload must be valid JSON." }, 400);
  }
  const action = parseKvorumClaimAction(value);
  if (!action) {
    return json({ error: "Check the correction action, claim ref and corrected or retracted resolution." }, 422);
  }
  try {
    const result = await applyKvorumClaimAction(action);
    return json({
      ok: true,
      claimId: result.claim.id,
      status: result.claim.status,
      correctionId: result.correction.id,
      correctionRef: result.correctionRef,
      correctionStatus: result.correction.status,
      idempotent: result.idempotent,
      persistence: result.persistence,
      commits: result.commits,
      published: false
    }, 200);
  } catch (error) {
    if (error instanceof KvorumRecommendationPersistenceError) {
      return json({ error: error.message, cause: error.code.toLowerCase() }, persistenceStatus(error));
    }
    console.error("Kvórum claim write failed:", error);
    return json({ error: "The Kvórum correction draft was not saved.", cause: "unknown" }, 503);
  }
}
