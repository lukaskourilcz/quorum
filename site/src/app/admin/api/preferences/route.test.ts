import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { ADMIN_RAIL_COOKIE, ADMIN_THEME_COOKIE } from "@/lib/admin-shell-preferences";
import { MAX_ADMIN_PREFERENCE_BYTES, POST } from "./route";

const ORIGIN = "https://boardless.example";
const now = new Date("2026-08-19T10:00:00.000Z");

function request(body: string, options: { auth?: boolean; origin?: string; size?: number } = {}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? Buffer.byteLength(body))
  };
  if (options.auth !== false) {
    headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  }
  return new Request(`${ORIGIN}/admin/api/preferences`, { method: "POST", headers, body });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("the Admin preference route", () => {
  it("persists bounded HttpOnly theme and rail cookies only under Admin", async () => {
    const response = await POST(request(JSON.stringify({ theme: "dark", collapsed: true })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies.join("\n")).toContain(`${ADMIN_THEME_COOKIE}=dark`);
    expect(cookies.join("\n")).toContain(`${ADMIN_RAIL_COOKIE}=collapsed`);
    for (const cookie of cookies) {
      expect(cookie).toContain("Path=/admin");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=strict");
      expect(cookie).toContain("Secure");
    }
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("keeps auth, origin, size, JSON and preference validation explicit", async () => {
    expect((await POST(request("{}", { auth: false }))).status).toBe(401);
    expect((await POST(request("{}", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request("{}", { size: MAX_ADMIN_PREFERENCE_BYTES + 1 }))).status).toBe(413);
    expect((await POST(request("x".repeat(MAX_ADMIN_PREFERENCE_BYTES + 1), { size: 0 }))).status).toBe(413);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request("{}"))).status).toBe(422);
    expect((await POST(request(JSON.stringify({ theme: "system" })))).status).toBe(422);
    expect((await POST(request(JSON.stringify({ theme: "dark", publish: true })))).status).toBe(422);
  });
});
