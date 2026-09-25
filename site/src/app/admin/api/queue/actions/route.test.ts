import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGitHub } from "@/lib/admin-queue/fake-github";
import { DRAFT_FILE, queueFixtureRoot, readQueueFixture } from "@/lib/admin-queue/fixture-root";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const origin = "https://boardless.example";
const roots: string[] = [];
let root = "";
let hash = "";

function request(body: unknown, options: { auth?: boolean; origin?: string; size?: number; raw?: string } = {}): Request {
  const raw = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: options.origin ?? origin, "content-length": String(options.size ?? Buffer.byteLength(raw)) };
  if (options.auth !== false) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}`;
  return new Request(`${origin}/admin/api/queue/actions`, { method: "POST", headers, body: raw });
}

beforeEach(async () => {
  root = await queueFixtureRoot();
  roots.push(root);
  hash = ((await readQueueFixture()).content as { contentHash: string }).contentHash;
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("POST /admin/api/queue/actions", () => {
  it("approves once, answers the repeat as already recorded, and refuses a stale hash with 409", async () => {
    const body = { action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "window" };
    const first = await POST(request(body));
    expect(first.status).toBe(201);
    expect(await first.json()).toMatchObject({ ok: true, changed: true, event: { action: "approve", nextStatus: "queued" } });
    expect(first.headers.get("cache-control")).toBe("no-store, private");
    expect(first.headers.get("x-robots-tag")).toContain("noindex");
    expect((await POST(request(body))).status).toBe(200);
    const stale = await POST(request({ action: "hold", itemId: body.itemId, expectedContentHash: hash, reason: "Hold it." }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "CONFLICT" });
    expect(JSON.parse(await readFile(path.join(root, `state/social/queue/${DRAFT_FILE}`), "utf8"))).toMatchObject({ status: "queued" });
  });

  it("refuses a missing session, another origin, an oversized or malformed body and an unsafe field", async () => {
    const body = { action: "hold", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, reason: "Not this week." };
    expect((await POST(request(body, { auth: false }))).status).toBe(401);
    expect((await POST(request(body, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body, { size: 20_001 }))).status).toBe(413);
    expect((await POST(request(null, { raw: "{ not json" }))).status).toBe(400);
    expect((await POST(request({ ...body, action: "publish" }))).status).toBe(422);
    expect((await POST(request({ ...body, reason: "Authorization: Bearer ghp_private" }))).status).toBe(422);
    expect(await readdir(path.join(root, "state/social/queue-events")).catch(() => [])).toEqual([]);
  });

  it("answers re-render as not built yet and a deployment without the token as unconfigured", async () => {
    expect((await POST(request({ action: "rerender", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash }))).status).toBe(501);
    vi.stubEnv("NODE_ENV", "production");
    const refused = await POST(request({ action: "hold", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, reason: "Not this week." }));
    expect(refused.status).toBe(503);
    expect(await refused.json()).toMatchObject({ code: "UNCONFIGURED" });
  });

  it("keeps a saved approval a success when the publisher wake-up fails, and says so in the body", async () => {
    const github = fakeGitHub(root);
    github.dispatchAnswer = { status: 403, body: { message: "Resource not accessible by personal access token" } };
    vi.stubGlobal("fetch", github.fetch);
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "test-token");
    const response = await POST(request({ action: "approve", itemId: "ms-2026-09-26-devshark-en-linkedin", expectedContentHash: hash, mode: "now" }));
    expect(response.status).toBe(201);
    const body = await response.json() as { dispatch: unknown; message: string };
    expect(body.dispatch).toEqual({ state: "failed", reason: "refused", runUrl: null });
    expect(body.message).toMatch(/^Queued, but the publisher did not start\./u);
    expect(JSON.stringify(body)).not.toContain("test-token");
    expect(github.dispatches()).toHaveLength(1);
    expect(JSON.parse(await readFile(path.join(root, `state/social/queue/${DRAFT_FILE}`), "utf8"))).toMatchObject({ status: "queued" });
  });
});
