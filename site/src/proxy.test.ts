import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  createAdminSessionToken
} from "./lib/admin-session";
import { proxy } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure() {
  vi.stubEnv("ADMIN_USER", "e2e-owner");
  vi.stubEnv("ADMIN_PASSWORD", "e2e-password");
}

function authenticated(pathname = "/admin"): NextRequest {
  const token = createAdminSessionToken("e2e-owner", "e2e-password");
  return new NextRequest(`https://boardless.example${pathname}`, {
    headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` }
  });
}

describe("admin session proxy", () => {
  it("redirects logged-out page requests to the login screen, keeping the destination", () => {
    configure();
    const response = proxy(
      new NextRequest("https://boardless.example/admin?venture=fightaiq&tab=slates")
    );
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("error")).toBe("expired");
    expect(location.searchParams.get("returnTo")).toBe("/admin?venture=fightaiq&tab=slates");
  });

  it("lets a signed session open protected pages", () => {
    configure();
    expect(proxy(authenticated()).status).toBe(200);
    expect(proxy(authenticated("/admin/operations?view=incidents")).status).toBe(200);
    expect(proxy(authenticated("/admin/social-profiles?section=activity-setup")).status).toBe(200);
  });

  it("protects the Operations control center and preserves its destination", () => {
    configure();
    const response = proxy(new NextRequest("https://boardless.example/admin/operations?view=schedule"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("returnTo")).toBe("/admin/operations?view=schedule");
  });

  it("protects Social Profiles and preserves its section bookmark", () => {
    configure();
    const response = proxy(new NextRequest("https://boardless.example/admin/social-profiles?section=amplification-profiles"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("returnTo")).toBe("/admin/social-profiles?section=amplification-profiles");
  });

  it("returns JSON instead of a login page for expired API requests", async () => {
    configure();
    const response = proxy(
      new NextRequest("https://boardless.example/admin/api/ratings")
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Your admin session expired. Sign in again."
    });
  });

  it("keeps the login screen available when credentials are not configured", () => {
    expect(
      proxy(new NextRequest("https://boardless.example/admin/login")).status
    ).toBe(200);
    const response = proxy(new NextRequest("https://boardless.example/admin"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/admin/login");
    expect(location.searchParams.get("error")).toBe("config");
  });

  it("redirects an authenticated owner away from the login screen", () => {
    configure();
    const response = proxy(authenticated("/admin/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://boardless.example/admin"
    );
  });

  it("sends a live session on to where it was headed", () => {
    configure();
    const response = proxy(authenticated("/admin/login?returnTo=%2Fadmin%3Fventure%3Dgoviral"));
    expect(response.headers.get("location")).toBe(
      "https://boardless.example/admin?venture=goviral"
    );
  });

  it("ignores a destination pointing off-site", () => {
    configure();
    const response = proxy(
      authenticated("/admin/login?returnTo=https%3A%2F%2Fattacker.example%2Fsteal")
    );
    expect(response.headers.get("location")).toBe("https://boardless.example/admin");
  });

  /*
   * The admin's privacy headers, asserted where they are decided.
   *
   * `admin-visual-qa` checks these on a live response, but that suite runs against `next dev`,
   * which replaces `Cache-Control` with its own `no-cache, must-revalidate` after the proxy has
   * run — so the strictest half of the guarantee has never actually been proven, and that
   * assertion has been failing for as long as it has existed. Here there is no dev server to
   * overwrite anything: what the proxy sets is what is asserted.
   */
  it("marks every admin response uncacheable and unindexable", () => {
    configure();
    for (const response of [
      proxy(authenticated()),
      proxy(authenticated("/admin?venture=kvorum")),
      // Signed out, and on the login page: both still admin, both still private.
      proxy(new NextRequest("https://boardless.example/admin")),
      proxy(new NextRequest("https://boardless.example/admin/login"))
    ]) {
      expect(response.headers.get("cache-control")).toBe("no-store, private");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    }
  });

  /*
   * `'unsafe-eval'` is added on purpose under `next dev`, because React Refresh needs it, and the
   * e2e suite runs against a dev server — so the assertion that production does not carry it can
   * only be made here, where NODE_ENV is a value the test chooses.
   */
  it("allows eval only in development", () => {
    configure();
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(authenticated()).headers.get("content-security-policy"))
      .not.toContain("'unsafe-eval'");

    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(authenticated()).headers.get("content-security-policy"))
      .toContain("'unsafe-eval'");
  });

  it("locks the directives that never vary by environment", () => {
    configure();
    vi.stubEnv("NODE_ENV", "development");
    const policy = proxy(authenticated()).headers.get("content-security-policy") ?? "";
    for (const directive of [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'"
    ]) {
      expect(policy).toContain(directive);
    }
  });

  it("leaves a public page cacheable and indexable", () => {
    configure();
    const response = proxy(new NextRequest("https://boardless.example/ventures/caught-up"));
    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBeNull();
    // The security headers are not admin-only and must still be there.
    expect(response.headers.get("x-frame-options")).toBe("DENY");
  });
});
