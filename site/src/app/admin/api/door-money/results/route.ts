import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  DoorMoneyPersistenceError,
  type DoorMoneyPersistenceCode
} from "@/lib/door-money-recommendations-store";
import { parseDoorMoneyOwnerResultInput } from "@/lib/door-money-result-model";
import { saveDoorMoneyOwnerResult } from "@/lib/door-money-results-store";

export const dynamic = "force-dynamic";
export const MAX_OWNER_RESULT_BYTES = 8_192;

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

const CAUSES: Record<DoorMoneyPersistenceCode, string> = {
  UNAVAILABLE: "missing",
  CONFLICT: "conflict",
  CORRUPT: "corrupt",
  REMOTE: "github",
  UNCONFIGURED: "no-token",
  REFUSED: "token-refused"
};

function failure(error: unknown): Response {
  if (!(error instanceof DoorMoneyPersistenceError)) {
    console.error("Door Money owner result failed:", error);
    return json({ error: "The owner result was not saved.", cause: "unknown" }, 503);
  }
  const status = error.code === "UNAVAILABLE" ? 404 : error.code === "CONFLICT" ? 409 : 503;
  return json({ error: error.message, cause: CAUSES[error.code] }, status);
}

/** Records manual operational evidence only; it never contacts a platform or analytics service. */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin Door Money writes are not allowed." }, 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_OWNER_RESULT_BYTES) {
    return json({ error: `Door Money result payload exceeds ${MAX_OWNER_RESULT_BYTES} bytes.` }, 413);
  }
  let raw: string;
  try { raw = await request.text(); }
  catch { return json({ error: "Door Money result payload could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_OWNER_RESULT_BYTES) {
    return json({ error: `Door Money result payload exceeds ${MAX_OWNER_RESULT_BYTES} bytes.` }, 413);
  }
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; }
  catch { return json({ error: "Door Money result payload must be valid JSON." }, 400); }
  const input = parseDoorMoneyOwnerResultInput(value);
  if (!input) {
    return json({ error: "Recommendation, platform, outcome and at least one nonnegative metric are required." }, 422);
  }
  try {
    const saved = await saveDoorMoneyOwnerResult(input);
    return json({ result: saved.result, changed: saved.changed, commits: saved.commits }, saved.changed ? 201 : 200);
  } catch (error) {
    return failure(error);
  }
}
