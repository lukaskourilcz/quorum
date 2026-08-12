import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const ORIGIN = "https://boardless.example";
const recommendationRef = "state/ventures/kvorum/recommendations/2026-08-12-public-media.json";
const now = new Date("2026-08-13T08:05:00.000Z");
let root = "";

async function seed(status: "draft" | "posted" = "posted"): Promise<void> {
  const recommendation = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  if (status === "posted") {
    recommendation.status = "posted";
    recommendation.updatedAt = "2026-08-12T22:00:00.000Z";
    recommendation.designLab = {
      status: "queued",
      requestedAt: "2026-08-12T21:30:00.000Z",
      resolvedAt: null,
      recipeRef: null,
      artifactRefs: [],
      failureReason: null
    };
    recommendation.owner = {
      ...(recommendation.owner as Record<string, unknown>),
      approvedAt: "2026-08-12T21:30:00.000Z",
      postedAt: "2026-08-12T22:00:00.000Z",
      postedUrl: "https://example.com/kvorum/public-media"
    };
  }
  const target = path.join(root, recommendationRef);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(recommendation, null, 2)}\n`, "utf8");
}

function body(overrides: Record<string, unknown> = {}) {
  return {
    recommendationRef,
    platform: "instagram",
    capturedAt: "2026-08-13T08:00:00.000Z",
    metrics: {
      impressions: 1840,
      reach: 1512,
      saves: 43,
      shares: 31,
      comments: 18,
      follows: 7
    },
    note: "Copied manually from post insights.",
    ...overrides
  };
}

function request(value: unknown, options: { auth?: boolean; origin?: string; size?: number; raw?: string } = {}): Request {
  const raw = options.raw ?? JSON.stringify(value);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? Buffer.byteLength(raw))
  };
  if (options.auth !== false) {
    headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  }
  return new Request(`${ORIGIN}/admin/api/kvorum/results`, { method: "POST", headers, body: raw });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-results-route-"));
  vi.useFakeTimers();
  vi.setSystemTime(now);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("VERCEL", "");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe("the Kvórum owner-result route", () => {
  it("records and links owner-entered numbers without collecting or publishing", async () => {
    await seed();
    const first = await POST(request(body()));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      idempotent: false,
      persistence: "filesystem",
      automated: false,
      publishedByRoute: false,
      result: {
        schemaVersion: "owner-result-entry/1",
        enteredBy: "owner",
        platform: "instagram",
        metrics: { saves: 43, shares: 31 }
      }
    });
    const names = await readdir(path.join(root, "state/ventures/kvorum/results"));
    expect(names).toHaveLength(1);
    const recommendation = JSON.parse(await readFile(path.join(root, recommendationRef), "utf8")) as {
      owner: { resultRefs: string[] };
    };
    expect(recommendation.owner.resultRefs).toEqual([
      `state/ventures/kvorum/results/${names[0]}`
    ]);
    const replay = await POST(request(body()));
    expect(await replay.json()).toMatchObject({ idempotent: true, automated: false, publishedByRoute: false });
    await expect(readFile(path.join(root, "state/social/channels.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses unposted recommendations and incomplete metric payloads", async () => {
    await seed("draft");
    const conflict = await POST(request(body()));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ cause: "conflict" });
    expect((await POST(request(body({
      metrics: { impressions: null, reach: null, saves: null, shares: null, comments: null, follows: null }
    })))).status).toBe(422);
  });

  it("keeps auth, origin, size, JSON and production persistence failures explicit", async () => {
    await seed();
    expect((await POST(request(body(), { auth: false }))).status).toBe(401);
    expect((await POST(request(body(), { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body(), { size: 20_000 }))).status).toBe(413);
    expect((await POST(request({}, { raw: "{" }))).status).toBe(400);
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request(body()))).status).toBe(503);
  });
});
