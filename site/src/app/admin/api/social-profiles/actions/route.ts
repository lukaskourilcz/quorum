import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { applySocialProfileAdminAction, SocialProfileActionError } from "@/lib/social-profiles/actions";

export const dynamic = "force-dynamic";
const MAX_BYTES = 2_048;
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow, noarchive" } });

function status(error: SocialProfileActionError): number {
  if (error.code === "INVALID") return 422;
  if (error.code === "REFUSED") return 403;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "UNCONFIGURED" || error.code === "REMOTE") return 503;
  return 500;
}

/** Appends bounded internal lifecycle evidence. It cannot create, connect or activate an account. */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request); if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin Social Profiles writes are not allowed." }, 403);
  const declared = Number(request.headers.get("content-length") ?? "0"); if (Number.isFinite(declared) && declared > MAX_BYTES) return json({ error: `Social Profiles payload exceeds ${MAX_BYTES} bytes.` }, 413);
  let raw: string; try { raw = await request.text(); } catch { return json({ error: "Social Profiles payload could not be read." }, 400); }
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return json({ error: `Social Profiles payload exceeds ${MAX_BYTES} bytes.` }, 413);
  let value: unknown; try { value = JSON.parse(raw) as unknown; } catch { return json({ error: "Social Profiles payload must be valid JSON." }, 400); }
  try {
    const result = await applySocialProfileAdminAction(value);
    return json({ ok: true, ...result }, result.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof SocialProfileActionError) return json({ error: error.message, code: error.code }, status(error));
    return json({ error: "The Social Profiles lifecycle action was not saved." }, 500);
  }
}
