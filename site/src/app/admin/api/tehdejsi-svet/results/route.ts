import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { parseTehdejsiOwnerResultInput } from "@/lib/tehdejsi-result-model";
import { saveTehdejsiOwnerResult } from "@/lib/tehdejsi-results-store";
import { TehdejsiStateError } from "@/lib/tehdejsi-state-store";
import { MAX_TEHDEJSI_RESULT_BYTES } from "@/lib/admin-route-limits";

export const dynamic = "force-dynamic";
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

/** Records manual owner evidence only; it cannot read a platform or analytics service. */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin result writes are not allowed." }, 403);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_TEHDEJSI_RESULT_BYTES) {
    return json({ error: `Result payload exceeds ${MAX_TEHDEJSI_RESULT_BYTES} bytes.` }, 413);
  }
  let raw: string;
  try { raw = await request.text(); } catch { return json({ error: "Result payload could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_TEHDEJSI_RESULT_BYTES) {
    return json({ error: `Result payload exceeds ${MAX_TEHDEJSI_RESULT_BYTES} bytes.` }, 413);
  }
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return json({ error: "Result payload must be valid JSON." }, 400); }
  const input = parseTehdejsiOwnerResultInput(value);
  if (!input) return json({ error: "Result fields and at least one nonnegative metric are required." }, 422);
  try {
    const saved = await saveTehdejsiOwnerResult(input);
    return json(saved, saved.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof TehdejsiStateError) {
      const status = error.code === "UNAVAILABLE" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "CORRUPT" ? 500 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The owner result was not saved." }, 500);
  }
}
