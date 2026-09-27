import { isQueueItemId } from "@/lib/admin-queue/event";
import { buildQueueExport } from "@/lib/admin-queue/export";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";

/**
 * One queue item as a ZIP for manual posting (quorum#592), behind the admin session. A download
 * changes nothing in the Queue; see `buildQueueExport`.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { itemId } = await params;
  if (!isQueueItemId(itemId)) return Response.json({ error: "Queue item not found." }, { status: 404 });
  try {
    const exported = await buildQueueExport(itemId);
    if (!exported) return Response.json({ error: "Queue item not found." }, { status: 404 });
    return new Response(exported.bytes, {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(`Queue export ${itemId} failed:`, error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "The post could not be exported." }, { status: 500 });
  }
}
