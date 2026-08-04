import { readFile } from "node:fs/promises";
import path from "node:path";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";
const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

/**
 * The encodings an article package is allowed to store, from the asset-path rule in
 * orchestrator/src/contracts/autonomy.ts. Serving only SVG was right while every hero was a
 * generated plate and wrong the moment the desk started storing licensed WebP photographs: the
 * route answered 400 for a file sitting on disk beside the ones it would serve.
 */
const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  svg: "image/svg+xml; charset=utf-8",
  webp: "image/webp"
};

export async function GET(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const relative = new URL(request.url).searchParams.get("path") ?? "";
  const extension = /^ventures\/mma-files\/media\/[A-Za-z0-9/-]+\.(png|svg|webp)$/u.exec(relative)?.[1];
  if (!extension) return new Response("Invalid media path.", { status: 400 });
  const mediaRoot = path.resolve(repositoryRoot, "state");
  const target = path.resolve(mediaRoot, relative);
  const boundary = path.relative(mediaRoot, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) return new Response("Invalid media path.", { status: 400 });
  try {
    const body = await readFile(target);
    // The sandbox stays on every encoding, not just SVG: it costs a raster nothing and it is the
    // only thing standing between a scripted SVG and the admin session.
    return new Response(new Uint8Array(body), { headers: { "Cache-Control": "no-store, private", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "Content-Type": MEDIA_TYPES[extension]!, "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return new Response((error as NodeJS.ErrnoException).code === "ENOENT" ? "Media not found." : "Media could not be read.", { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500 });
  }
}
