import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(ip: string, password = "e2e-password"): NextRequest {
  return new NextRequest("https://boardless.example/admin", {
    headers: {
      Authorization: `Basic ${Buffer.from(`e2e-owner:${password}`).toString("base64")}`,
      "x-forwarded-for": ip
    }
  });
}

describe("admin proxy rate limit", () => {
  it("never counts authenticated admin traffic as failed login attempts", () => {
    vi.stubEnv("ADMIN_USER", "e2e-owner");
    vi.stubEnv("ADMIN_PASSWORD", "e2e-password");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(proxy(request("203.0.113.40")).status).toBe(200);
    }
  });

  it("still rate-limits repeated invalid credentials", () => {
    vi.stubEnv("ADMIN_USER", "e2e-owner");
    vi.stubEnv("ADMIN_PASSWORD", "e2e-password");
    for (let attempt = 0; attempt < 12; attempt += 1) {
      expect(proxy(request("203.0.113.41", "wrong")).status).toBe(401);
    }
    expect(proxy(request("203.0.113.41", "wrong")).status).toBe(429);
  });

  it("does not count the browser's credential-free challenge requests", () => {
    vi.stubEnv("ADMIN_USER", "e2e-owner");
    vi.stubEnv("ADMIN_PASSWORD", "e2e-password");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const challenge = new NextRequest("https://boardless.example/admin", {
        headers: { "x-forwarded-for": "203.0.113.42" }
      });
      expect(proxy(challenge).status).toBe(401);
    }
    expect(proxy(request("203.0.113.42")).status).toBe(200);
  });
});
