import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken
} from "./lib/admin-session";

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

function loginUrl(request: NextRequest, error?: "config" | "expired"): URL {
  const url = new URL("/admin/login", request.url);
  if (error) url.searchParams.set("error", error);
  return url;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const admin = pathname.startsWith("/admin");
  if (!admin) return securityHeaders(NextResponse.next(), false);

  const authorization = verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_USER,
    process.env.ADMIN_PASSWORD
  );
  const loginPage = pathname === "/admin/login";
  const publicLoginRoute =
    loginPage || pathname === "/admin/login/submit";

  if (publicLoginRoute) {
    if (loginPage && authorization === "ok") {
      return securityHeaders(
        NextResponse.redirect(new URL("/admin", request.url)),
        true
      );
    }
    return securityHeaders(NextResponse.next(), true);
  }

  if (authorization !== "ok") {
    if (pathname.startsWith("/admin/api/")) {
      return securityHeaders(
        NextResponse.json(
          {
            error:
              authorization === "missing_config"
                ? "Admin login is not configured."
                : "Your admin session expired. Sign in again."
          },
          { status: authorization === "missing_config" ? 503 : 401 }
        ),
        true
      );
    }
    return securityHeaders(
      NextResponse.redirect(
        loginUrl(
          request,
          authorization === "missing_config" ? "config" : "expired"
        )
      ),
      true
    );
  }

  return securityHeaders(NextResponse.next(), true);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
