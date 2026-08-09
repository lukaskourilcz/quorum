import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { dispatchMmaBannerDelivery, MmaBannerDeliveryError } from "@/lib/mma-banner-delivery";

export const dynamic = "force-dynamic";
const json = (value: unknown, status: number) => Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } });

export async function POST(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Cross-origin delivery requests are not allowed." }, 403);
  try {
    await dispatchMmaBannerDelivery();
    return json({ status: "dispatched" }, 202);
  } catch (error) {
    return json({ error: error instanceof MmaBannerDeliveryError ? error.message : "Banner delivery was not dispatched." }, 503);
  }
}
