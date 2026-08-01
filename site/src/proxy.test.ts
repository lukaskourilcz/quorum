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
  it("redirects logged-out page requests to the login screen", () => {
    configure();
    const response = proxy(new NextRequest("https://boardless.example/admin"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://boardless.example/admin/login?error=expired"
    );
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
    expect(response.headers.get("location")).toBe(
      "https://boardless.example/admin/login?error=config"
    );
  });

  it("redirects an authenticated owner away from the login screen", () => {
    configure();
    const response = proxy(authenticated("/admin/login"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://boardless.example/admin"
    );
  });
});
