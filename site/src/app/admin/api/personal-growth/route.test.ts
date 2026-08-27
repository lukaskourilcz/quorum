import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const ORIGIN = "https://boardless.example";
const now = new Date("2026-08-27T10:00:00.000Z");

function request(body: string, options: { auth?: boolean; origin?: string; size?: number } = {}): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? Buffer.byteLength(body))
  };
  if (options.auth !== false) {
    headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  }
  return new Request(`${ORIGIN}/admin/api/personal-growth`, { method: "POST", headers, body });
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", await mkdtemp(path.join(os.tmpdir(), "personal-growth-route-")));
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("Personal Growth Admin route", () => {
  it("records a bounded owner decision with private no-store headers", async () => {
    const response = await POST(request(JSON.stringify({
      type: "thread",
      suggestionId: "pg-thread-1111111111111111",
      operation: "approved",
      reason: "Owner approved manual use.",
      postUrl: null
    })));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ ok: true, changed: true });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("enforces auth, same origin, actual byte size and exact action fields", async () => {
    expect((await POST(request("{}", { auth: false }))).status).toBe(401);
    expect((await POST(request("{}", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request("{}", { size: 16_385 }))).status).toBe(413);
    expect((await POST(request(`"${"x".repeat(16_385)}"`, { size: 0 }))).status).toBe(413);
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ type: "thread", suggestionId: "pg-thread-1111111111111111", operation: "publish", reason: null, postUrl: null })))).status).toBe(422);
    expect((await POST(request(JSON.stringify({ type: "thread", suggestionId: "pg-thread-1111111111111111", operation: "approved", reason: null, postUrl: null, capUsd: 99 })))).status).toBe(422);
  });
});
