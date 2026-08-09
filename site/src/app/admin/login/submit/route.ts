import { NextResponse } from "next/server";
import { verifyAdminCredentials } from "../../../../lib/admin-auth";
import { sanitizeAdminReturnTo } from "../../../../lib/admin-return-to";
import {
  adminSessionCookie,
  createAdminSessionToken
} from "../../../../lib/admin-session";

export const dynamic = "force-dynamic";

/**
 * Per-instance attempt throttling.
 *
 * This Map lives in one running instance's memory. On Vercel a cold start empties it and separate
 * instances never see each other's counts, so this slows a guesser down rather than locking them
 * out fleet-wide — which is why the login page's copy no longer promises a lockout. Making the
 * claim true needs durable shared storage; the honest copy is the fix that ships without one.
 */
const WINDOW_MS = 15 * 60 * 1_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

function requestKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function failureCount(key: string, now = Date.now()): number {
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return 1;
  }
  current.count += 1;
  return current.count;
}

function isLocked(key: string, now = Date.now()): boolean {
  const current = attempts.get(key);
  if (!current) return false;
  if (current.resetAt <= now) {
    attempts.delete(key);
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}

function loginRedirect(request: Request, error?: string, returnTo?: string | null): NextResponse {
  const url = new URL("/admin/login", request.url);
  if (error) url.searchParams.set("error", error);
  // A failed attempt must not lose the destination either, or the second try lands at /admin.
  if (returnTo) url.searchParams.set("returnTo", returnTo);
  const response = NextResponse.redirect(url, { status: 303 });
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse("Cross-origin login requests are not allowed.", {
      status: 403
    });
  }
  if (Number(request.headers.get("content-length") ?? "0") > 4_096) {
    return loginRedirect(request, "invalid");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return loginRedirect(request, "invalid");
  }
  const username = form.get("username");
  const password = form.get("password");
  const returnTo = sanitizeAdminReturnTo(form.get("returnTo"), request.url);
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 160 ||
    password.length > 512
  ) {
    return loginRedirect(request, "invalid", returnTo);
  }

  const key = requestKey(request);
  if (isLocked(key)) return loginRedirect(request, "locked", returnTo);

  const authorization = verifyAdminCredentials(
    username,
    password,
    process.env.ADMIN_USER,
    process.env.ADMIN_PASSWORD
  );
  if (authorization === "missing_config") {
    return loginRedirect(request, "config", returnTo);
  }
  if (authorization !== "ok") {
    const count = failureCount(key);
    return loginRedirect(request, count >= MAX_ATTEMPTS ? "locked" : "invalid", returnTo);
  }

  attempts.delete(key);
  const response = NextResponse.redirect(new URL(returnTo ?? "/admin", request.url), {
    status: 303
  });
  response.cookies.set(
    adminSessionCookie(
      createAdminSessionToken(
        process.env.ADMIN_USER!,
        process.env.ADMIN_PASSWORD!
      )
    )
  );
  response.headers.set("Cache-Control", "no-store, private");
  return response;
}
