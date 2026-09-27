import { createHash } from "node:crypto";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { readWebDevSignalPanel } from "@/lib/admin-webdev-signal";

export const dynamic = "force-dynamic";

/**
 * One rendered WebDev Signal panel, behind the admin session like every admin route. `?download=1`
 * serves it as an attachment named for its day, locale and number, for posting by hand.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ date: string; locale: string; panel: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { date, locale, panel } = await params;
  try {
    const result = await readWebDevSignalPanel(date, locale, Number(panel));
    if (result.state === "not-found") return Response.json({ error: "Panel not found." }, { status: 404 });
    if (result.state === "mismatch") return Response.json({ error: "The panel file no longer matches its render receipt." }, { status: 409 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(result.bytes), {
      headers: {
        "Cache-Control": "private, no-cache",
        "Content-Type": "image/png",
        ETag: `"${createHash("sha256").update(result.bytes).digest("hex").slice(0, 32)}"`,
        "X-Content-Type-Options": "nosniff",
        ...(download ? { "Content-Disposition": `attachment; filename="${result.filename}"` } : {})
      }
    });
  } catch (error) {
    console.error(`WebDev Signal panel ${date}/${locale}/${panel} could not be read:`, error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Panel could not be read." }, { status: 500 });
  }
}
