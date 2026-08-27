import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  DoorMoneyPersistenceError,
  type DoorMoneyPersistenceCode
} from "@/lib/door-money-recommendations-store";
import {
  applyDoorMoneyActionCompletion,
  parseDoorMoneyActionCompletion
} from "@/lib/door-money-actions-store";
import { MAX_ACTION_COMPLETION_BYTES } from "@/lib/admin-route-limits";

export const dynamic = "force-dynamic";

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
    console.error("Door Money action completion failed:", error);
    return json({ error: "The action outcome was not saved.", cause: "unknown" }, 503);
  }
  const status = error.code === "UNAVAILABLE" ? 404 : error.code === "CONFLICT" ? 409 : 503;
  return json({ error: error.message, cause: CAUSES[error.code] }, status);
}

/** Records an owner-entered outcome. It never sends, posts, contacts a channel or spends. */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin Door Money writes are not allowed." }, 403);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ACTION_COMPLETION_BYTES) {
    return json({ error: `Door Money action payload exceeds ${MAX_ACTION_COMPLETION_BYTES} bytes.` }, 413);
  }

  let raw: string;
  try { raw = await request.text(); }
  catch { return json({ error: "Door Money action payload could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_ACTION_COMPLETION_BYTES) {
    return json({ error: `Door Money action payload exceeds ${MAX_ACTION_COMPLETION_BYTES} bytes.` }, 413);
  }
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; }
  catch { return json({ error: "Door Money action payload must be valid JSON." }, 400); }
  const completion = parseDoorMoneyActionCompletion(value);
  if (!completion) return json({ error: "Packet, task and an outcome of 1–1000 characters are required." }, 422);

  try {
    const result = await applyDoorMoneyActionCompletion(completion);
    const task = result.packet.tasks.find(({ id }) => id === result.taskId)!;
    return json({
      packetId: result.packet.id,
      taskId: task.id,
      status: "completed",
      outcome: task.completion!.outcome,
      completedAt: task.completion!.completedAt,
      completionRef: result.completionRef,
      changed: result.changed,
      commits: result.commits
    }, result.changed ? 201 : 200);
  } catch (error) {
    return failure(error);
  }
}
