import { readFile } from "node:fs/promises";
import path from "node:path";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";
const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

export async function GET(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);
  const src = new URL(request.url).searchParams.get("src") ?? "";
  if (!/^\/ads\/[a-z0-9-]+-\d+x\d+\.webp$/u.test(src)) return new Response("Invalid banner path.", { status: 400 });
  const payloadRoot = path.resolve(repositoryRoot, "state", "ventures", "mma-files", "banners", "payload", "public", "ads");
  const target = path.resolve(payloadRoot, path.basename(src));
  if (path.dirname(target) !== payloadRoot) return new Response("Invalid banner path.", { status: 400 });
  try {
    const body = await readFile(target);
    return new Response(new Uint8Array(body), { headers: { "Cache-Control": "no-store, private", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return new Response((error as NodeJS.ErrnoException).code === "ENOENT" ? "Banner not found." : "Banner could not be read.", { status: (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 500 });
  }
}
