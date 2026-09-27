import { editorialThumbnail } from "@/lib/admin-queue/editorial";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<Response> {
  const auth = verifyAdminRequest(request);
  if (auth !== "ok") return adminAuthorizationError(auth);
  const url = new URL(request.url);
  const bytes = await editorialThumbnail(url.searchParams.get("id") ?? "", url.searchParams.get("image") ?? "").catch(() => null);
  return bytes ? new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff" } }) : new Response(null, { status: 404 });
}
