import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

vi.mock("server-only", () => ({}));

const ORIGIN = "https://boardless.example";
let root = "";

const payload = {
  recommendationId: "rec-aaaaaaaaaaaaaaaaaaaa",
  locale: "cs",
  platform: "instagram",
  postUrl: "https://social.example/booksofhistory-cs",
  capturedAt: "2026-08-20T12:00:00.000Z",
  recordedAt: "2026-08-20T12:05:00.000Z",
  metrics: { views: 1200, likes: 84, comments: 7, shares: 13, saves: 31, follows: 5, linkTaps: null },
  note: null,
  idempotencyKey: "result-cs-route-one"
};

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-result-route-"));
  const raw = JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/booksofhistory-recommendation.valid.json"), "utf8")) as Record<string, unknown>;
  const recommendation = {
    ...raw,
    status: "approved",
    updatedAt: payload.recordedAt,
    designLab: { status: "ready", summaryRefs: { cs: "ventures/carousel-studio/summaries/booksofhistory/example-cs.json", en: "ventures/carousel-studio/summaries/booksofhistory/example-en.json" } },
    owner: { ...(raw.owner as object), postedUrls: { cs: payload.postUrl, en: null }, editHistory: [{ at: payload.capturedAt, action: "approve", locale: null, reason: null }] }
  };
  const target = path.join(root, "state/ventures/booksofhistory/recommendations/feature.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(recommendation, null, 2)}\n`);
  await writeFile(path.join(root, "state/INBOX.md"), "- [x] HUMAN_APPROVAL BH-RESULTS-004 — owner approved\n");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

function request(body: unknown, options: { authenticated?: boolean; origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json", Origin: options.origin ?? ORIGIN, "content-length": String(options.size ?? text.length) };
  if (options.authenticated) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`;
  return new Request(`${ORIGIN}/admin/api/booksofhistory/results`, { method: "POST", headers, body: text });
}

describe("POST /admin/api/booksofhistory/results", () => {
  it("keeps result writes behind authentication, same-origin and size gates", async () => {
    expect((await POST(request(payload))).status).toBe(401);
    expect((await POST(request(payload, { authenticated: true, origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(payload, { authenticated: true, size: 70_000 }))).status).toBe(413);
  });

  it("rejects malformed metrics and stores an authenticated owner entry once", async () => {
    expect((await POST(request({ ...payload, metrics: { ...payload.metrics, views: -1 } }, { authenticated: true }))).status).toBe(422);
    const first = await POST(request(payload, { authenticated: true }));
    const second = await POST(request(payload, { authenticated: true }));
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ idempotent: true, entry: { enteredBy: "owner", locale: "cs", platform: "instagram" } });
  });
});
