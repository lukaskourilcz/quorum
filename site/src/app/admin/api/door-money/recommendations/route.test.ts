import { createHash } from "node:crypto";
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
});

async function fixture(): Promise<{ root: string; id: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "door-money-route-"));
  roots.push(root);
  const raw = await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  );
  const parsed = JSON.parse(raw) as { id: string };
  const directory = path.join(root, "state/ventures/door-money/recommendations");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${parsed.id}.json`), raw);
  return { root, id: parsed.id };
}

async function routeFor(root: string, production = false) {
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  if (production) vi.stubEnv("VERCEL", "1");
  vi.resetModules();
  const [{ POST, MAX_RECOMMENDATION_DECISION_BYTES }, { createAdminSessionToken, ADMIN_SESSION_COOKIE }] = await Promise.all([
    import("./route"),
    import("@/lib/admin-session")
  ]);
  const cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`;
  return { POST, MAX_RECOMMENDATION_DECISION_BYTES, cookie };
}

function request(body: unknown, cookie?: string, options: { origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/admin/api/door-money/recommendations`, {
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

describe("Door Money recommendations route", () => {
  it("runs auth, origin and declared-size gates before persistence", async () => {
    const { root, id } = await fixture();
    const { POST, MAX_RECOMMENDATION_DECISION_BYTES, cookie } = await routeFor(root);
    expect((await POST(request({ id, action: "approve" }))).status).toBe(401);
    expect((await POST(request({ id, action: "approve" }, cookie, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(
      { id, action: "approve" },
      cookie,
      { size: MAX_RECOMMENDATION_DECISION_BYTES + 1 }
    ))).status).toBe(413);
  });

  it("approves locally with no-store and returns an idempotent retry", async () => {
    const { root, id } = await fixture();
    const { POST, cookie } = await routeFor(root);
    const first = await POST(request({ id, action: "approve", approvalNote: "Synthetic fixture approved." }, cookie));
    expect(first.status).toBe(201);
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    const firstBody = await first.json() as { contentHash: string };
    expect(firstBody).toMatchObject({ id, status: "approved", changed: true });
    expect(firstBody.contentHash).toMatch(/^sha256:[a-f0-9]{12}$/u);
    const storedBytes = await readFile(path.join(root, `state/ventures/door-money/recommendations/${id}.json`), "utf8");
    expect(firstBody.contentHash).toBe(`sha256:${createHash("sha256").update(storedBytes).digest("hex").slice(0, 12)}`);

    const retry = await POST(request({ id, action: "approve", approvalNote: "Synthetic fixture approved." }, cookie));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ id, status: "approved", changed: false });
  });

  it("requires a reason to reject and a valid HTTPS URL to record a post", async () => {
    const { root, id } = await fixture();
    const { POST, cookie } = await routeFor(root);
    expect((await POST(request({ id, action: "reject", reason: "" }, cookie))).status).toBe(422);
    expect((await POST(request({ id, action: "posted", postedUrl: "http://example.test/post" }, cookie))).status).toBe(409);
  });

  it("names an unconfigured production persistence failure without pretending the write happened", async () => {
    const { root, id } = await fixture();
    const { POST, cookie } = await routeFor(root, true);
    const response = await POST(request({ id, action: "approve" }, cookie));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ cause: "no-token" });
    const stored = JSON.parse(await readFile(path.join(root, `state/ventures/door-money/recommendations/${id}.json`), "utf8")) as { status: string };
    expect(stored.status).toBe("draft");
  });
});
