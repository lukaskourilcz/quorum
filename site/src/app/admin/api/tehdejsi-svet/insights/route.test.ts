import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_INSIGHT_ACTION_BYTES } from "@/lib/admin-route-limits";

vi.mock("server-only", () => ({}));
const roots: string[] = [];
const ORIGIN = "https://boardless.example";

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); vi.unstubAllEnvs(); vi.resetModules(); vi.useRealTimers(); });

async function route() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-insight-route-")); roots.push(root);
  const insight = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/tehdejsi-product-insight.valid.json"), "utf8")) as { id: string; evidence: Array<{ filePath: string; detail: string }> };
  const directory = path.join(root, "state/ventures/tehdejsi-svet/product-insights"); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${insight.id}.json`), `${JSON.stringify(insight, null, 2)}\n`);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root); vi.stubEnv("ADMIN_USER", "owner"); vi.stubEnv("ADMIN_PASSWORD", "correct-password"); vi.resetModules();
  const [{ POST }, { createAdminSessionToken, ADMIN_SESSION_COOKIE }] = await Promise.all([import("./route"), import("@/lib/admin-session")]);
  return { root, insight, POST, MAX_INSIGHT_ACTION_BYTES, cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}` };
}

function request(body: unknown, cookie?: string, options: { origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/admin/api/tehdejsi-svet/insights`, { method: "POST", body: text, headers: { "Content-Type": "application/json", Origin: options.origin ?? ORIGIN, "content-length": String(options.size ?? new TextEncoder().encode(text).byteLength), ...(cookie ? { Cookie: cookie } : {}) } });
}

describe("Tehdejsi svet product-insight route", () => {
  it("runs authentication, same-origin and byte gates before the owner writer", async () => {
    const { insight, POST, MAX_INSIGHT_ACTION_BYTES, cookie } = await route();
    const body = { id: insight.id, status: "accepted", ownerNote: null };
    expect((await POST(request(body))).status).toBe(401);
    expect((await POST(request(body, cookie, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body, cookie, { size: MAX_INSIGHT_ACTION_BYTES + 1 }))).status).toBe(413);
  });

  it("records the owner status without changing audit evidence or touching a product", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-13T10:00:00.000Z"));
    const { root, insight, POST, cookie } = await route();
    expect((await POST(request({ id: insight.id, status: "implemented-by-agent", ownerNote: null }, cookie))).status).toBe(422);
    const response = await POST(request({ id: insight.id, status: "accepted", ownerNote: "Synthetic owner note." }, cookie));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ changed: true, insight: { status: "accepted", ownerNote: "Synthetic owner note.", evidence: insight.evidence } });
    const stored = JSON.parse(await readFile(path.join(root, `state/ventures/tehdejsi-svet/product-insights/${insight.id}.json`), "utf8"));
    expect(stored).not.toHaveProperty("productToken");
  });
});
