import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const roots: string[] = [];
const ORIGIN = "https://boardless.example";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs(); vi.resetModules(); vi.useRealTimers();
});

async function route(approved = true) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-signal-route-")); roots.push(root);
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state/INBOX.md"), `- [${approved ? "x" : " "}] HUMAN_APPROVAL TS-RESULTS-005 — synthetic route test.\n`);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root); vi.stubEnv("ADMIN_USER", "owner"); vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  vi.resetModules();
  const [{ POST, MAX_SIGNAL_BYTES }, { createAdminSessionToken, ADMIN_SESSION_COOKIE }] = await Promise.all([
    import("./route"), import("@/lib/admin-session")
  ]);
  return { root, POST, MAX_SIGNAL_BYTES, cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}` };
}

function request(body: unknown, cookie?: string, options: { origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/admin/api/tehdejsi-svet/signals`, {
    method: "POST", body: text,
    headers: { "Content-Type": "application/json", Origin: options.origin ?? ORIGIN, "content-length": String(options.size ?? new TextEncoder().encode(text).byteLength), ...(cookie ? { Cookie: cookie } : {}) }
  });
}

const input = { sourceLabel: "Synthetic comment harvest", comments: ["[theme: fictional radios] A made-up recollection."] };

describe("Tehdejsi svet signals route", () => {
  it("runs authentication, same-origin and byte gates before parsing", async () => {
    const { POST, MAX_SIGNAL_BYTES, cookie } = await route();
    expect((await POST(request(input))).status).toBe(401);
    expect((await POST(request(input, cookie, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(input, cookie, { size: MAX_SIGNAL_BYTES + 1 }))).status).toBe(413);
  });

  it("persists owner-pasted comments once and never creates a channel action", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-15T12:00:00.000Z"));
    const { root, POST, cookie } = await route();
    expect((await POST(request({ ...input, comments: [] }, cookie))).status).toBe(422);
    const first = await POST(request(input, cookie));
    expect(first.status).toBe(201);
    const body = await first.json() as { harvest: { id: string }; changed: boolean };
    expect(body).toMatchObject({ changed: true, harvest: { id: expect.stringMatching(/^ts-signal-harvest-[a-f0-9]{20}$/u) } });
    expect((await POST(request(input, cookie))).status).toBe(200);
    const stored = JSON.parse(await readFile(path.join(root, `state/ventures/tehdejsi-svet/signals/harvests/${body.harvest.id}.json`), "utf8"));
    expect(stored).toMatchObject({ source: "owner-paste", comments: input.comments });
    expect(JSON.stringify(stored)).not.toMatch(/(?:post|account|channel|scrape|apiUrl)/u);
  });

  it("keeps the writer closed while TS-RESULTS-005 is pending", async () => {
    const { POST, cookie } = await route(false);
    const response = await POST(request(input, cookie));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("TS-RESULTS-005 is pending") });
  });
});
