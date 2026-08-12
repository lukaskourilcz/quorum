import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const ORIGIN = "https://boardless.example";
const ref = "state/ventures/kvorum/claims/2026-08-12-public-media-claim-snemovna.json";
const now = new Date("2026-08-13T08:00:00.000Z");
let root = "";

async function writeJson(relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8")) as Record<string, unknown>;
}

async function seed(overrides: Record<string, unknown> = {}): Promise<void> {
  const claim = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/kvorum-claim.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  await writeJson(ref, { ...claim, ...overrides });
}

function request(body: unknown, options: { auth?: boolean; origin?: string; raw?: string } = {}): Request {
  const raw = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(Buffer.byteLength(raw))
  };
  if (options.auth !== false) {
    headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  }
  return new Request(`${ORIGIN}/admin/api/kvorum/claims`, { method: "POST", headers, body: raw });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-claim-admin-"));
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

describe("the Kvórum claim correction route", () => {
  it("moves standing to corrected by drafting one idempotent manual-only recommendation", async () => {
    await seed();
    const action = { action: "draft-correction", ref, resolution: "corrected" };
    const first = await POST(request(action));
    expect(first.status).toBe(200);
    const payload = await first.json() as { correctionRef: string };
    expect(payload).toMatchObject({
      ok: true,
      status: "corrected",
      correctionStatus: "draft",
      idempotent: false,
      persistence: "filesystem",
      published: false
    });
    const savedClaim = await readJson(ref);
    expect(savedClaim).toMatchObject({ status: "corrected", correctionRef: payload.correctionRef });
    const correction = await readJson(payload.correctionRef);
    expect(correction).toMatchObject({
      schemaVersion: "venture-recommendation/1",
      status: "draft",
      headline: expect.stringContaining("Oprava"),
      owner: { postingMode: "manual-only", postedAt: null, postedUrl: null },
      designLab: { status: "not-requested" }
    });
    expect(JSON.stringify(correction)).not.toMatch(/publisher|channel|account creation/iu);
    expect(await readJson("state/ventures/kvorum/recommendations/index.json"))
      .toMatchObject({ queue: [{ ref: payload.correctionRef, status: "draft" }] });

    const bytes = await Promise.all([ref, payload.correctionRef].map((relative) => readFile(path.join(root, relative), "utf8")));
    const replay = await POST(request(action));
    expect(await replay.json()).toMatchObject({ status: "corrected", idempotent: true });
    expect(await Promise.all([ref, payload.correctionRef].map((relative) => readFile(path.join(root, relative), "utf8"))))
      .toEqual(bytes);
  });

  it("supports retraction but refuses a second terminal transition", async () => {
    await seed();
    expect(await (await POST(request({ action: "draft-correction", ref, resolution: "retracted" }))).json())
      .toMatchObject({ status: "retracted", correctionStatus: "draft", published: false });
    const conflict = await POST(request({ action: "draft-correction", ref, resolution: "corrected" }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ cause: "conflict" });
  });

  it("does not call an approved draft published or correctable", async () => {
    await seed({
      recommendationStatus: "approved-draft",
      updatedAt: "2026-08-12T22:00:00.000Z",
      publishedAt: null,
      postedUrl: null
    });
    const response = await POST(request({ action: "draft-correction", ref, resolution: "corrected" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ cause: "conflict" });
    await expect(readFile(path.join(root, "state/ventures/kvorum/recommendations/index.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps auth, origin, JSON and production persistence failures explicit", async () => {
    await seed();
    const action = { action: "draft-correction", ref, resolution: "corrected" };
    expect((await POST(request(action, { auth: false }))).status).toBe(401);
    expect((await POST(request(action, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request({}, { raw: "{" }))).status).toBe(400);
    expect((await POST(request({ ...action, resolution: "deleted" }))).status).toBe(422);
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request(action))).status).toBe(503);
  });
});
