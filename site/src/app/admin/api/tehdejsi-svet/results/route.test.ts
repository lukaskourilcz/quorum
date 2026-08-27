import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TEHDEJSI_RESULT_BYTES } from "@/lib/admin-route-limits";

vi.mock("server-only", () => ({}));
const roots: string[] = [];
const ORIGIN = "https://boardless.example";

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-result-route-"));
  roots.push(root);
  const fixture = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation-tehdejsi.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  const recommendation = {
    ...fixture,
    status: "posted",
    owner: {
      postedUrls: {
        cs: "https://www.instagram.com/p/synthetic-route-result/",
        ua: "https://www.instagram.com/p/synthetic-route-result-ua/"
      },
      rejectionReason: null
    },
    updatedAt: "2026-08-20T12:00:00.000Z"
  };
  const directory = path.join(root, "state/ventures/tehdejsi-svet/drafts");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "synthetic.json"), `${JSON.stringify(recommendation, null, 2)}\n`);
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state/INBOX.md"), "- [x] HUMAN_APPROVAL TS-RESULTS-005 — owner approved manual entry\n");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  vi.stubEnv("NODE_ENV", "development");
  vi.resetModules();
  const [{ POST }, session] = await Promise.all([import("./route"), import("@/lib/admin-session")]);
  return {
    POST,
    MAX_TEHDEJSI_RESULT_BYTES,
    cookie: `${session.ADMIN_SESSION_COOKIE}=${session.createAdminSessionToken("owner", "correct-password")}`,
    recommendationId: String(fixture.id)
  };
}

const metrics = { sends: 8, saves: 13, views: 500, likes: null, comments: null, shares: 2, follows: null, linkTaps: null };

function request(body: unknown, cookie?: string, options: { origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/admin/api/tehdejsi-svet/results`, {
    method: "POST",
    body: text,
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin ?? ORIGIN,
      "content-length": String(options.size ?? new TextEncoder().encode(text).byteLength),
      ...(cookie ? { Cookie: cookie } : {})
    }
  });
}

describe("POST /admin/api/tehdejsi-svet/results", () => {
  it("runs authentication, same-origin and byte gates before the manual writer", async () => {
    const { POST, MAX_TEHDEJSI_RESULT_BYTES, cookie, recommendationId } = await setup();
    const body = { recommendationId, locale: "cs", platform: "instagram", capturedAt: "2026-08-20T12:00:00.000Z", recordedAt: "2026-08-20T12:05:00.000Z", metrics, note: null };
    expect((await POST(request(body))).status).toBe(401);
    expect((await POST(request(body, cookie, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body, cookie, { size: MAX_TEHDEJSI_RESULT_BYTES + 1 }))).status).toBe(413);
  });

  it("rejects malformed metrics and records the same owner entry once", async () => {
    const { POST, cookie, recommendationId } = await setup();
    const body = { recommendationId, locale: "cs", platform: "instagram", capturedAt: "2026-08-20T12:00:00.000Z", recordedAt: "2026-08-20T12:05:00.000Z", metrics, note: null };
    expect((await POST(request({ ...body, metrics: { ...metrics, sends: -1 } }, cookie))).status).toBe(422);
    const first = await POST(request(body, cookie));
    const second = await POST(request(body, cookie));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ changed: false, result: { enteredBy: "owner", metrics: { sends: 8, saves: 13 } } });
  });
});
