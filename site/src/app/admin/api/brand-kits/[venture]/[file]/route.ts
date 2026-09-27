import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";
import { readBrandKitAsset } from "@/lib/admin-design-lab-brand";

export const dynamic = "force-dynamic";

/**
 * One file from a venture's brand kit: the preview the Brand tab shows, or a download.
 *
 * Only files the kit's manifest lists, and only while they still match their recorded sha256, so
 * the route cannot serve anything else from the directory and cannot serve a file that drifted.
 * SVG is served with a policy that forbids script and external loads, which matters when the owner
 * opens the file in its own tab rather than through the `<img>` preview.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ venture: string; file: string }> }
): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const { venture, file } = await params;
  const asset = await readBrandKitAsset(venture, decodeURIComponent(file));
  if (!asset) return Response.json({ error: "Brand kit file not found." }, { status: 404 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.mediaType,
      "Content-Length": String(asset.bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${asset.file}"`,
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store"
    }
  });
}
