import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { MmaBannerStoreError, setMmaBannerEnabled, stageMmaBannerCreative } from "@/lib/mma-banner-store";

export const dynamic = "force-dynamic";
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

function authorize(request: Request): Response | null {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin banner writes are not allowed." }, 403);
  return null;
}

function failure(error: unknown): Response {
  if (!(error instanceof MmaBannerStoreError)) return json({ error: "Banner state was not saved." }, 503);
  const status = error.code === "INVALID" ? 422 : error.code === "UNCONFIGURED" || error.code === "REFUSED" ? 503 : 409;
  return json({ error: error.message, code: error.code }, status);
}

export async function POST(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") ?? "0") > 16_000_000) return json({ error: "Banner upload exceeds 16 MB." }, 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Banner upload must use multipart form data." }, 400); }
  const file = form.get("file");
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  const slotId = form.get("slotId");
  const alt = form.get("alt");
  const href = form.get("href");
  const enabled = form.get("enabled") === "true";
  if (!(file instanceof File) || typeof slotId !== "string" || typeof alt !== "string" || (typeof href !== "string" && href !== null) || !Number.isInteger(width) || !Number.isInteger(height)) {
    return json({ error: "Choose a slot, size, image and alt text." }, 422);
  }
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(file.type)) return json({ error: "Upload a JPEG, PNG or WebP image." }, 415);
  try {
    const result = await stageMmaBannerCreative({ slotId, width, height, source: new Uint8Array(await file.arrayBuffer()), alt, href, enabled });
    return json(result, 201);
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  const denied = authorize(request);
  if (denied) return denied;
  if (Number(request.headers.get("content-length") ?? "0") > 4_096) return json({ error: "Banner toggle payload exceeds 4096 bytes." }, 413);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: "Banner toggle must be valid JSON." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Banner toggle must be an object." }, 422);
  const input = body as Record<string, unknown>;
  if (typeof input.slotId !== "string" || typeof input.enabled !== "boolean") return json({ error: "Choose a slot and enabled state." }, 422);
  try { return json(await setMmaBannerEnabled({ slotId: input.slotId, enabled: input.enabled }), 200); }
  catch (error) { return failure(error); }
}
