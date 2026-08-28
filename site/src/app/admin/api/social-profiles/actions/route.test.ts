import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const origin = "https://boardless.example";
const roots: string[] = [];

function request(body: unknown, options: { auth?: boolean; origin?: string; size?: number } = {}): Request {
  const raw = JSON.stringify(body); const headers: Record<string, string> = { "Content-Type": "application/json", Origin: options.origin ?? origin, "content-length": String(options.size ?? Buffer.byteLength(raw)) };
  if (options.auth !== false) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}`;
  return new Request(`${origin}/admin/api/social-profiles/actions`, { method: "POST", headers, body: raw });
}

beforeEach(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "social-profile-route-")); roots.push(root); await mkdir(path.join(root, "config"), { recursive: true }); await cp(path.resolve(process.cwd(), "../config/social-publisher-registry.json"), path.join(root, "config/social-publisher-registry.json"));
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root); vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", ""); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("ADMIN_USER", "owner"); vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Social Profiles actions route", () => {
  it("authenticates and appends a bounded private lifecycle event", async () => {
    const body = { type: "request-setup", profileId: "social-profile-door-money", connectionId: null, reason: "Request the bounded manual setup checklist." };
    const response = await POST(request(body)); const retry = await POST(request(body));
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ ok: true, changed: true, event: { action: "setup-requested" } });
    expect(response.headers.get("cache-control")).toBe("no-store, private"); expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(retry.status).toBe(200); expect(await retry.json()).toMatchObject({ changed: false });
  });

  it("rejects missing auth, cross-origin, oversized, malformed and authority-broadening input", async () => {
    const body = { type: "request-setup", profileId: "social-profile-door-money", connectionId: null, reason: "Request the bounded manual setup checklist." };
    expect((await POST(request(body, { auth: false }))).status).toBe(401);
    expect((await POST(request(body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body, { size: 2_049 }))).status).toBe(413);
    expect((await POST(request({ ...body, type: "activate-profile" }))).status).toBe(422);
    expect((await POST(request({ ...body, scopes: ["new_scope"] }))).status).toBe(422);
  });
});
