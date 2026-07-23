import { NextRequest, NextResponse } from "next/server";
import { verifyBasicAuthorization } from "@/lib/admin-auth";

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 12;

function requestKey(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function isRateLimited(request: NextRequest, now = Date.now()): boolean {
  const key = requestKey(request);
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

function securityHeaders(response: NextResponse, admin: boolean): NextResponse {
  const developmentEval =
    process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self'; frame-ancestors 'none'; img-src 'self' data: blob:; object-src 'none'; script-src 'self' 'unsafe-inline'${developmentEval}; style-src 'self' 'unsafe-inline'; upgrade-insecure-requests`
  );
  if (admin) {
    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return response;
}

export function proxy(request: NextRequest) {
  const admin = request.nextUrl.pathname.startsWith("/admin");
  if (!admin) {
    return securityHeaders(NextResponse.next(), false);
  }
  if (isRateLimited(request)) {
    return securityHeaders(
      new NextResponse("Too many authentication attempts.", {
        status: 429,
        headers: { "Retry-After": "60" }
      }),
      true
    );
  }
  const result = verifyBasicAuthorization(
    request.headers.get("authorization"),
    process.env.ADMIN_USER,
    process.env.ADMIN_PASSWORD
  );
  if (result === "missing_config") {
    return securityHeaders(
      new NextResponse("Admin authentication is not configured.", {
        status: 503
      }),
      true
    );
  }
  if (result !== "ok") {
    return securityHeaders(
      new NextResponse("Authentication required.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="BoardlessAI Admin", charset="UTF-8"'
        }
      }),
      true
    );
  }
  return securityHeaders(NextResponse.next(), true);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
