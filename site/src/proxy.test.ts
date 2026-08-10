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
});
