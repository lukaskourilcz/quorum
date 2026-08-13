import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { parseTehdejsiSignalHarvestInput } from "@/lib/tehdejsi-signal-model";
import { saveTehdejsiSignalHarvest } from "@/lib/tehdejsi-signals-store";
import { TehdejsiStateError } from "@/lib/tehdejsi-state-store";

export const dynamic = "force-dynamic";
export const MAX_SIGNAL_BYTES = 32_768;

const json = (value: unknown, status: number) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin signal writes are not allowed." }, 403);
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_SIGNAL_BYTES) return json({ error: `Signal payload exceeds ${MAX_SIGNAL_BYTES} bytes.` }, 413);
  let raw: string;
  try { raw = await request.text(); } catch { return json({ error: "Signal payload could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_SIGNAL_BYTES) return json({ error: `Signal payload exceeds ${MAX_SIGNAL_BYTES} bytes.` }, 413);
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch { return json({ error: "Signal payload must be valid JSON." }, 400); }
  const input = parseTehdejsiSignalHarvestInput(value);
  if (!input) return json({ error: "A source label and 1–50 unique comment lines are required." }, 422);
  try {
    const saved = await saveTehdejsiSignalHarvest(input);
    return json(saved, saved.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof TehdejsiStateError) {
      const status = error.code === "CONFLICT" ? 409 : error.code === "UNAVAILABLE" ? 404 : error.code === "CORRUPT" ? 500 : 503;
      return json({ error: error.message, code: error.code }, status);
    }
    return json({ error: "The comment harvest was not saved." }, 500);
  }
}
