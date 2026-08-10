import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { DoctrineRejectError, rejectOnDoctrine } from "@/lib/titty-tuesdays-doctrine";

export const dynamic = "force-dynamic";

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

/**
 * Removal with a paper trail, distinct from a bad rating.
 *
 * A rating is a taste signal and goes to the ratings ledger. This is a statement that the image
 * should not exist: it deletes the bytes and keeps the hash, the prompt and the reason. The two
 * are separate endpoints because they are separate decisions and mixing them would let a slip of
 * the mouse delete something the taste loop needed.
 */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin rejections are not allowed." }, 403);
  }
  if (Number(request.headers.get("content-length") ?? "0") > 4_096) {
    return json({ error: "Rejection payload exceeds 4096 bytes." }, 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "The rejection must be valid JSON." }, 400);
  }
  const body = payload as Record<string, unknown>;
  if (typeof body?.date !== "string" || typeof body?.variantId !== "string" || typeof body?.reason !== "string") {
    return json({ error: "A rejection needs the day, the render and a reason." }, 422);
  }

  try {
    const result = await rejectOnDoctrine({
      date: body.date,
      variantId: body.variantId,
      reason: body.reason,
      now: new Date()
    });
    return json(result, 200);
  } catch (error) {
    if (error instanceof DoctrineRejectError) {
      const status = error.code === "NOT_FOUND" ? 404 : error.code === "UNAVAILABLE" ? 503 : 422;
      return json({ error: error.message }, status);
    }
    return json({ error: "The rejection was not saved." }, 500);
  }
}
