import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  KvorumRecommendationPersistenceError,
  parseKvorumResultInput,
  writeKvorumOwnerResult
} from "@/lib/kvorum-result-store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

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
    return json({ error: "Cross-origin Kvórum result writes are not allowed." }, 403);
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) {
    return json({ error: `Kvórum result payload exceeds ${MAX_BODY_BYTES} bytes.` }, 413);
  }

  let value: unknown;
  try {
    value = await request.json();
  } catch {
    return json({ error: "Kvórum result payload must be valid JSON." }, 400);
  }
  const input = parseKvorumResultInput(value);
  if (!input) {
    return json({
      error: "Enter an exact posted recommendation, one intended platform, a capture time and at least one nonnegative number."
    }, 422);
  }

  try {
    const written = await writeKvorumOwnerResult(input);
    const entry = written.result;
    const result = {
      schemaVersion: entry.schemaVersion,
      id: entry.id,
      ventureId: entry.ventureId,
      recommendationId: entry.recommendationId,
      platform: entry.platform,
      postUrl: entry.postUrl,
      postedAt: entry.postedAt,
      capturedAt: entry.capturedAt,
      enteredAt: entry.enteredAt,
      enteredBy: entry.enteredBy,
      metrics: entry.metrics,
      note: entry.note
    };
    return json({
      ok: true,
      result,
      idempotent: written.idempotent,
      persistence: written.persistence,
      commits: written.commits,
      automated: false,
      publishedByRoute: false
    }, 200);
  } catch (error) {
    if (error instanceof KvorumRecommendationPersistenceError) {
      return json({ error: error.message, cause: error.code.toLowerCase() }, persistenceStatus(error));
    }
    console.error("Kvórum owner-result write failed:", error);
    return json({ error: "The owner-entered Kvórum result was not saved.", cause: "unknown" }, 503);
  }
}
