import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  DoorMoneyPersistenceError,
  applyDoorMoneyRecommendationDecision,
  parseDoorMoneyCopyBlocks,
  type DoorMoneyPersistenceCode,
  type DoorMoneyRecommendationAction
} from "@/lib/door-money-recommendations-store";

export const dynamic = "force-dynamic";

/** Forty contract-sized edited blocks plus the small decision envelope. */
export const MAX_RECOMMENDATION_DECISION_BYTES = 196_608;

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
    console.error("Door Money owner decision failed:", error);
    return json({ error: "The owner decision was not saved.", cause: "unknown" }, 503);
  }
  const status = error.code === "UNAVAILABLE" ? 404 : error.code === "CONFLICT" ? 409 : 503;
  return json({ error: error.message, cause: CAUSES[error.code] }, status);
}

function decision(value: Record<string, unknown>): DoorMoneyRecommendationAction | null {
  if (value.action === "approve") {
    if (Object.keys(value).some((key) => !["id", "action", "editedCopyBlocks", "approvalNote"].includes(key))) return null;
    if (!(value.editedCopyBlocks === undefined || value.editedCopyBlocks === null || Array.isArray(value.editedCopyBlocks))) return null;
    const edited = value.editedCopyBlocks === undefined || value.editedCopyBlocks === null
      ? undefined
      : parseDoorMoneyCopyBlocks(value.editedCopyBlocks) ?? null;
    if (edited === null) return null;
    if (!(value.approvalNote === undefined || (typeof value.approvalNote === "string" && value.approvalNote.trim().length > 0 && value.approvalNote.length <= 1_000))) return null;
    return {
      action: "approve",
      ...(edited ? { editedCopyBlocks: edited } : {}),
      ...(typeof value.approvalNote === "string" ? { approvalNote: value.approvalNote } : {})
    };
  }
  if (value.action === "reject") {
    if (Object.keys(value).some((key) => !["id", "action", "reason"].includes(key))) return null;
    if (typeof value.reason !== "string" || value.reason.trim().length < 1 || value.reason.length > 1_000) return null;
    return { action: "reject", reason: value.reason };
  }
  if (value.action === "posted") {
    if (Object.keys(value).some((key) => !["id", "action", "postedUrl"].includes(key))) return null;
    if (typeof value.postedUrl !== "string" || value.postedUrl.length > 2_000) return null;
    return { action: "posted", postedUrl: value.postedUrl };
  }
  return null;
}

/** Records an owner decision. It never publishes, contacts a channel or validates a URL remotely. */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin Door Money writes are not allowed." }, 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECOMMENDATION_DECISION_BYTES) {
    return json({ error: `Door Money decision payload exceeds ${MAX_RECOMMENDATION_DECISION_BYTES} bytes.` }, 413);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Door Money decision payload could not be read." }, 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_RECOMMENDATION_DECISION_BYTES) {
    return json({ error: `Door Money decision payload exceeds ${MAX_RECOMMENDATION_DECISION_BYTES} bytes.` }, 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return json({ error: "Door Money decision payload must be valid JSON." }, 400);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return json({ error: "Door Money decision payload must be an object." }, 400);
  }
  const body = value as Record<string, unknown>;
  if (typeof body.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(body.id) || body.id.length > 160) {
    return json({ error: "Recommendation id is required." }, 422);
  }
  const parsedDecision = decision(body);
  if (!parsedDecision) {
    return json({ error: "Choose approve, reject with a reason, or posted with an HTTPS URL." }, 422);
  }

  try {
    const result = await applyDoorMoneyRecommendationDecision({ id: body.id, decision: parsedDecision });
    return json({
      id: result.recommendation.id,
      status: result.recommendation.status,
      changed: result.changed,
      summaryPath: result.recommendation.designLab.summaryPath,
      postedUrl: result.recommendation.owner.postedUrl,
      commits: result.commits
    }, result.changed ? 201 : 200);
  } catch (error) {
    return failure(error);
  }
}
