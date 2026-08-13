import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_SESSION_COOKIE, createAdminSessionToken } from "@/lib/admin-session";
import { POST } from "./route";

const ORIGIN = "https://boardless.example";
const ref = "state/ventures/kvorum/recommendations/2026-08-12-public-media.json";
const summaryRef = "state/ventures/carousel-studio/summaries/kvorum/2026-08-12-public-media.json";
const indexRef = "state/ventures/kvorum/recommendations/index.json";
const claimRefs = [
  "state/ventures/kvorum/claims/2026-08-12-public-media-claim-snemovna.json",
  "state/ventures/kvorum/claims/2026-08-12-public-media-claim-process.json",
  "state/ventures/kvorum/claims/2026-08-12-public-media-claim-angle.json"
] as const;
const now = new Date("2026-08-12T22:00:00.000Z");
let root = "";

async function writeJson(relative: string, value: unknown): Promise<void> {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(root, relative), "utf8")) as Record<string, unknown>;
}

async function seed(): Promise<Record<string, unknown>> {
  const recommendation = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/kvorum-venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  await Promise.all([
    writeJson(ref, recommendation),
    writeJson(indexRef, {
      schemaVersion: "kvorum-recommendation-index/1",
      date: "2026-08-12",
      generatedAt: "2026-08-12T21:03:00.000Z",
      queue: [{
        id: recommendation.id,
        ref,
        clusterId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        status: "draft",
        headline: recommendation.headline,
        createdAt: recommendation.createdAt
      }]
    })
  ]);
  return recommendation;
}

function request(body: unknown, options: {
  auth?: boolean;
  origin?: string;
  size?: number;
  raw?: string;
} = {}): Request {
  const raw = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Origin: options.origin ?? ORIGIN,
    "content-length": String(options.size ?? Buffer.byteLength(raw))
  };
  if (options.auth !== false) {
    headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret", now.getTime())}`;
  }
  return new Request(`${ORIGIN}/admin/api/kvorum/recommendations`, { method: "POST", headers, body: raw });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "boardless-kvorum-admin-"));
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

describe("the Kvórum recommendation admin route", () => {
  it("approves owner edits, preserves the original and queues one idempotent Design Lab summary", async () => {
    const original = await seed();
    const action = {
      action: "approve",
      ref,
      edits: {
        headline: "Poplatky se vracejí do Sněmovny: co je v návrhu",
        copyBlocks: [{ id: "instagram-carousel-cs", text: "Owner-approved carousel copy." }]
      }
    };
    const first = await POST(request(action));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      ok: true,
      status: "approved",
      idempotent: false,
      persistence: "filesystem",
      designLabQueued: true
    });

    const saved = await readJson(ref) as {
      status: string;
      headline: string;
      copyBlocks: Array<{ id: string; text: string }>;
      designLab: { status: string; requestedAt: string | null };
      owner: {
        approvedAt: string | null;
        original: { headline: string; copyBlocks: Array<{ text: string }> } | null;
        editHistory: Array<{ fields: string[] }>;
      };
    };
    expect(saved).toMatchObject({
      status: "approved",
      headline: action.edits.headline,
      designLab: { status: "queued", requestedAt: now.toISOString() },
      owner: {
        approvedAt: now.toISOString(),
        original: { headline: original.headline },
        editHistory: [{ fields: ["headline", "copyBlocks"] }]
      }
    });
    expect(saved.owner.original?.copyBlocks[0]?.text)
      .toBe((original.copyBlocks as Array<{ text: string }>)[0]?.text);
    expect(saved.copyBlocks[0]?.text).toBe("Owner-approved carousel copy.");

    const summary = await readJson(summaryRef);
    expect(summary).toMatchObject({
      schemaVersion: "carousel-summary/1",
      venture: "kvorum",
      locale: "cs",
      headline: action.edits.headline,
      closing: "Celý kontext a zdroje najdete v Kvóru.",
      hasHero: false,
      heroCredit: null
    });
    expect(JSON.stringify(summary)).not.toContain("Štít demokracie");
    expect(await readJson(indexRef)).toMatchObject({ queue: [{ status: "approved" }] });
    for (const claimRef of claimRefs) {
      expect(await readJson(claimRef)).toMatchObject({
        schemaVersion: "kvorum-claim/1",
        recommendationId: "kv-2026-08-12-public-media",
        recommendationStatus: "approved-draft",
        status: "standing",
        correctionRef: null,
        publishedAt: null,
        postedUrl: null
      });
    }
    const { readDesignLab } = await import("@/lib/design-lab");
    const rail = await readDesignLab();
    expect(rail).toContainEqual(expect.objectContaining({
      id: "kvorum:public-media:2026-08-12",
      venture: "kvorum",
      headline: action.edits.headline,
      origin: "recorded",
      renderable: true
    }));

    const bytes = await Promise.all([ref, summaryRef, indexRef, ...claimRefs].map((relative) =>
      readFile(path.join(root, relative), "utf8")));
    const replay = await POST(request(action));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ idempotent: true, status: "approved" });
    expect(await Promise.all([ref, summaryRef, indexRef, ...claimRefs].map((relative) =>
      readFile(path.join(root, relative), "utf8")))).toEqual(bytes);
    await expect(readFile(path.join(root, "state/social/channels.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("requires a rejection reason and makes an identical rejection retry a no-op", async () => {
    await seed();
    expect((await POST(request({ action: "reject", ref }))).status).toBe(422);
    const action = { action: "reject", ref, reason: "Angle duplicates a package already approved this week." };
    const first = await POST(request(action));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "rejected", idempotent: false, designLabQueued: false });
    const bytes = await readFile(path.join(root, ref), "utf8");
    const replay = await POST(request(action));
    expect(await replay.json()).toMatchObject({ status: "rejected", idempotent: true });
    expect(await readFile(path.join(root, ref), "utf8")).toBe(bytes);
  });

  it("records a manual HTTPS URL after approval without publishing anything", async () => {
    await seed();
    await POST(request({ action: "approve", ref }));
    const posted = await POST(request({ action: "posted", ref, postedUrl: "https://example.com/manual-post" }));
    expect(posted.status).toBe(200);
    expect(await posted.json()).toMatchObject({ status: "posted", designLabQueued: false });
    expect(await readJson(ref)).toMatchObject({
      status: "posted",
      owner: { postedAt: now.toISOString(), postedUrl: "https://example.com/manual-post" }
    });
    for (const claimRef of claimRefs) {
      expect(await readJson(claimRef)).toMatchObject({
        recommendationStatus: "posted",
        status: "standing",
        publishedAt: now.toISOString(),
        postedUrl: "https://example.com/manual-post"
      });
    }
  });

  it("maps conflict, invalid state and corrupt state to their typed statuses", async () => {
    await seed();
    await POST(request({ action: "approve", ref }));
    const conflict = await POST(request({ action: "reject", ref, reason: "Too late." }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ cause: "conflict" });

    await seed();
    const invalid = await POST(request({
      action: "approve",
      ref,
      edits: { copyBlocks: [{ id: "missing-copy-block", text: "No target exists." }] }
    }));
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ cause: "invalid" });

    await writeJson(ref, { schemaVersion: "venture-recommendation/1" });
    const corrupt = await POST(request({ action: "approve", ref }));
    expect(corrupt.status).toBe(500);
    expect(await corrupt.json()).toMatchObject({ cause: "corrupt" });
  });

  it("keeps auth, origin, size, JSON and production persistence failures explicit", async () => {
    await seed();
    expect((await POST(request({ action: "approve", ref }, { auth: false }))).status).toBe(401);
    expect((await POST(request({ action: "approve", ref }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request({ action: "approve", ref }, { size: 40_000 }))).status).toBe(413);
    expect((await POST(request({}, { raw: "{" }))).status).toBe(400);
    vi.stubEnv("NODE_ENV", "production");
    expect((await POST(request({ action: "approve", ref }))).status).toBe(503);
  });
});
