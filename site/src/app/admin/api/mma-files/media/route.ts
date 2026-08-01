import { readFile } from "node:fs/promises";
import path from "node:path";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";
const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export async function GET(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const relative = new URL(request.url).searchParams.get("path") ?? "";
  if (!/^ventures\/mma-files\/media\/[A-Za-z0-9/-]+\.svg$/u.test(relative)) return new Response("Invalid media path.", { status: 400 });
  const mediaRoot = path.resolve(repositoryRoot, "state");
  const target = path.resolve(mediaRoot, relative);
  const boundary = path.relative(mediaRoot, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) return new Response("Invalid media path.", { status: 400 });
  try {
    const body = await readFile(target);
    return new Response(body, { headers: { "Cache-Control": "no-store, private", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "Content-Type": "image/svg+xml; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return new Response((error as NodeJS.ErrnoException).code === "ENOENT" ? "Media not found." : "Media could not be read.", { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500 });
  }
}
