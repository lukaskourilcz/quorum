import { readFile } from "node:fs/promises";
import path from "node:path";
import { adminAuthorizationError, verifyAdminRequest } from "@/lib/admin-request-auth";

export const dynamic = "force-dynamic";
const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

/**
 * The garment renders, served only to a signed-in owner.
 *
 * These bytes deliberately do not live under `site/public/`: a rejected pre-launch design should
 * not be a world-readable file at a guessable path. That decision is only worth anything if the
 * route that does serve them checks the session, so it does — and the same sandbox header the
 * MMA Files route carries rides on every response, because a WebP costs nothing to sandbox and it
 * is what stands between a crafted file and the admin session.
 */
export async function GET(request: Request): Promise<Response> {
  const authorization = verifyAdminRequest(request);
  if (authorization !== "ok") return adminAuthorizationError(authorization);

  const relative = new URL(request.url).searchParams.get("path") ?? "";
  // WebP only: it is the one encoding this pipeline writes, and a narrower rule is a smaller
  // surface than a list of encodings nothing produces.
  if (!/^ventures\/titty-tuesdays\/design-proposals\/media\/[A-Za-z0-9/_-]+\.webp$/u.test(relative)) {
    return new Response("Invalid media path.", { status: 400 });
  }

  const mediaRoot = path.resolve(repositoryRoot, "state");
  const target = path.resolve(mediaRoot, relative);
  const boundary = path.relative(mediaRoot, target);
  if (boundary.startsWith("..") || path.isAbsolute(boundary)) {
    return new Response("Invalid media path.", { status: 400 });
  }

  try {
    const body = await readFile(target);
    return new Response(new Uint8Array(body), {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return new Response(missing ? "Media not found." : "Media could not be read.", {
      status: missing ? 404 : 500
    });
  }
}
