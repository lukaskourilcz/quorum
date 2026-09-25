import { createHash } from "node:crypto";
import { isQueueItemId } from "@/lib/admin-queue/event";
import { readQueueFrame } from "@/lib/admin-queue/frames";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";

/** One frame of one queue item, behind the admin session like every admin route. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string; slide: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { itemId, slide } = await params;
  const index = Number(slide);
  if (!isQueueItemId(itemId) || !Number.isInteger(index) || index < 1 || index > 10) {
    return Response.json({ error: "Frame not found." }, { status: 404 });
  }
  try {
    const frame = await readQueueFrame(itemId, index);
    if (!frame) return Response.json({ error: "Frame not found." }, { status: 404 });
    return new Response(frame.bytes, {
      headers: {
        // Revalidated every time: a re-rendered frame keeps its address, and the ETag keeps the repeat cheap.
        "Cache-Control": "private, no-cache",
        "Content-Type": frame.contentType,
        ETag: `"${createHash("sha256").update(frame.bytes).digest("hex").slice(0, 32)}"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error(`Queue frame ${itemId}/${index} could not be read:`, error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Frame could not be read." }, { status: 500 });
  }
}
