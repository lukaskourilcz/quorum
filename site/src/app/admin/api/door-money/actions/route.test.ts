import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ORIGIN = "https://boardless.example";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.useRealTimers();
});

async function fixture(): Promise<{ root: string; packetId: string; taskId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "door-money-actions-route-"));
  roots.push(root);
  const raw = await readFile(path.resolve(process.cwd(), "../contracts/fixtures/action-packet.valid.json"), "utf8");
  const packet = JSON.parse(raw) as { id: string; date: string; tasks: Array<{ id: string; completion: unknown }> };
  const task = packet.tasks.find(({ completion }) => completion === null)!;
  const directory = path.join(root, "state/ventures/door-money/actions");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${packet.date}.json`), raw);
  return { root, packetId: packet.id, taskId: task.id };
}

async function routeFor(root: string, production = false) {
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  if (production) vi.stubEnv("VERCEL", "1");
  vi.resetModules();
  const [{ POST, MAX_ACTION_COMPLETION_BYTES }, { createAdminSessionToken, ADMIN_SESSION_COOKIE }] = await Promise.all([
    import("./route"),
    import("@/lib/admin-session")
  ]);
  return {
    POST,
    MAX_ACTION_COMPLETION_BYTES,
    cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`
  };
}

function request(body: unknown, cookie?: string, options: { origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/admin/api/door-money/actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin ?? ORIGIN,
      "content-length": String(options.size ?? new TextEncoder().encode(text).byteLength),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: text
  });
}

describe("Door Money actions route", () => {
  it("runs authentication, same-origin and size gates before persistence", async () => {
    const { root, packetId, taskId } = await fixture();
    const { POST, MAX_ACTION_COMPLETION_BYTES, cookie } = await routeFor(root);
    const body = { packetId, taskId, outcome: "Synthetic owner outcome." };
    expect((await POST(request(body))).status).toBe(401);
    expect((await POST(request(body, cookie, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body, cookie, { size: MAX_ACTION_COMPLETION_BYTES + 1 }))).status).toBe(413);
  });

  it("requires an outcome, records a completion locally and makes an identical retry idempotent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:00:00.000Z"));
    const { root, packetId, taskId } = await fixture();
    const { POST, cookie } = await routeFor(root);
    expect((await POST(request({ packetId, taskId, outcome: "" }, cookie))).status).toBe(422);

    const body = { packetId, taskId, outcome: "The synthetic owner reviewed the fictional note." };
    const first = await POST(request(body, cookie));
    expect(first.status).toBe(201);
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    expect(await first.json()).toMatchObject({
      packetId,
      taskId,
      status: "completed",
      outcome: body.outcome,
      completionRef: `completion:${packetId}:${taskId}`,
      changed: true
    });
    const stored = JSON.parse(await readFile(
      path.join(root, "state/ventures/door-money/actions/2026-08-13.json"), "utf8"
    )) as { tasks: Array<{ id: string; completion: { outcome: string } | null }> };
    expect(stored.tasks.find(({ id }) => id === taskId)?.completion?.outcome).toBe(body.outcome);

    const retry = await POST(request(body, cookie));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ changed: false, completionRef: `completion:${packetId}:${taskId}` });
    expect((await POST(request({ ...body, outcome: "A different claim." }, cookie))).status).toBe(409);
  });

  it("fails closed in production without persistence credentials", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:00:00.000Z"));
    const { root, packetId, taskId } = await fixture();
    const { POST, cookie } = await routeFor(root, true);
    const response = await POST(request({ packetId, taskId, outcome: "Synthetic owner outcome." }, cookie));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ cause: "no-token" });
    const stored = JSON.parse(await readFile(
      path.join(root, "state/ventures/door-money/actions/2026-08-13.json"), "utf8"
    )) as { tasks: Array<{ id: string; completion: unknown }> };
    expect(stored.tasks.find(({ id }) => id === taskId)?.completion).toBeNull();
  });
});
