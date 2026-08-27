import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import {
  applyPersonalGrowthAdminAction,
  PersonalGrowthAdminStoreError
} from "@/lib/personal-growth-admin-store";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

const json = (value: unknown, status: number) => Response.json(value, {
  status,
  headers: {
    "Cache-Control": "no-store, private",
    "X-Robots-Tag": "noindex, nofollow, noarchive"
  }
});

function errorStatus(error: PersonalGrowthAdminStoreError): number {
  if (error.code === "INVALID") return 422;
  if (error.code === "CONFLICT") return 409;
  if (error.code === "CORRUPT") return 500;
  if (error.code === "UNCONFIGURED" || error.code === "REMOTE" || error.code === "REFUSED") return 503;
  return 500;
}

/** Records owner decisions only. This route cannot publish, reply, buy, upgrade or raise a cap. */
export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: "Cross-origin Personal Growth writes are not allowed." }, 403);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: `Personal Growth payload exceeds ${MAX_BODY_BYTES} bytes.` }, 413);
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ error: "Personal Growth payload could not be read." }, 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ error: `Personal Growth payload exceeds ${MAX_BODY_BYTES} bytes.` }, 413);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    return json({ error: "Personal Growth payload must be valid JSON." }, 400);
  }
  try {
    const result = await applyPersonalGrowthAdminAction(value);
    return json({ ok: true, ...result }, result.changed ? 201 : 200);
  } catch (error) {
    if (error instanceof PersonalGrowthAdminStoreError) {
      return json({ error: error.message, code: error.code }, errorStatus(error));
    }
    return json({ error: "The Personal Growth owner action was not saved." }, 500);
  }
}
