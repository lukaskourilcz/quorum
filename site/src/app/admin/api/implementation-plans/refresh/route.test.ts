import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";

vi.mock("server-only", () => ({}));

import { POST } from "./route";

const ORIGIN = "https://boardless.example";
const now = new Date("2026-08-26T12:00:00.000Z");
let root = "";

function request(options: { auth?: boolean; origin?: string; body?: string } = {}): Request {
  const headers: Record<string, string> = { Origin: options.origin ?? ORIGIN };
  if (options.auth !== false) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  if (options.body !== undefined) headers["content-length"] = String(Buffer.byteLength(options.body));
  return new Request(`${ORIGIN}/admin/api/implementation-plans/refresh`, {
    method: "POST",
    headers,
    body: options.body
  });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "implementation-refresh-route-"));
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("NODE_ENV", "test");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("the implementation progress refresh route", () => {
  it("authenticates and records a bounded request for the next checkpoint", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({ ok: true, receipt: { requestedAt: now.toISOString() } });
    expect(JSON.parse(await readFile(path.join(root, "state/programs/refresh-request.json"), "utf8")))
      .toMatchObject({ schemaVersion: "implementation-refresh-request/1", requestedBy: "owner" });
  });

  it("rejects missing auth, cross-origin calls, bodies and cooldown replays", async () => {
    expect((await POST(request({ auth: false }))).status).toBe(401);
    expect((await POST(request({ origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request({ body: "{}" }))).status).toBe(413);
    expect((await POST(request())).status).toBe(202);
    const replay = await POST(request());
    expect(replay.status).toBe(429);
    expect(await replay.json()).toMatchObject({ code: "COOLDOWN" });
  });
});
