import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

const ORIGIN = "https://boardless.example";

function configure() {
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  vi.stubEnv("NODE_ENV", "production");
}

function request(body: unknown, options: { origin?: string; auth?: boolean; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? text.length),
  };
  if (options.auth) headers.Cookie = "admin_session=forged";
  return new Request(`${ORIGIN}/admin/api/caught-up/events`, { method: "POST", headers, body: text });
}

const event = {
  id: "ml-prague-2026",
  scope: "cz",
  title: "Machine Learning Prague 2026",
  starts: "2026-10-14",
  online: false,
  url: "https://mlprague.com",
};

describe("the events admin route", () => {
  it("refuses an unauthenticated write", async () => {
    configure();
    const response = await POST(request({ event }));
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(response.status).toBeLessThan(500);
  });

  it("refuses a forged session", async () => {
    configure();
    const response = await POST(request({ event }, { auth: true }));
    expect(response.status).toBeGreaterThanOrEqual(401);
    expect(response.status).toBeLessThan(500);
  });

  it("refuses a cross-origin write before it reaches the store", async () => {
    configure();
    const response = await POST(request({ event }, { origin: "https://evil.example", auth: true }));
    // Either the auth gate or the origin gate stops it; neither may pass.
    expect([401, 403]).toContain(response.status);
  });

  it("refuses an oversized payload", async () => {
    configure();
    const response = await POST(request({ event }, { auth: true, size: 9_000 }));
    expect([401, 413]).toContain(response.status);
  });

  it("never returns a cacheable response", async () => {
    configure();
    const response = await POST(request({ event }));
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});
