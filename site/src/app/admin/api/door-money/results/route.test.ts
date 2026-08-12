import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

async function fixture(resultsApproved = true): Promise<{ root: string; recommendationId: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "door-money-results-route-"));
  roots.push(root);
  const recommendation = JSON.parse(await readFile(
    path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation.valid.json"), "utf8"
  )) as { id: string };
  const directory = path.join(root, "state/ventures/door-money/recommendations");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(root, "state/INBOX.md"),
    `- [${resultsApproved ? "x" : " "}] HUMAN_APPROVAL DM-RESULTS-004 — synthetic test state.\n`
  );
  await writeFile(path.join(directory, `${recommendation.id}.json`), `${JSON.stringify(recommendation, null, 2)}\n`);
  const { applyDoorMoneyRecommendationDecision } = await import("@/lib/door-money-recommendations-store");
  await applyDoorMoneyRecommendationDecision({
    id: recommendation.id,
    decision: { action: "approve" },
    now: new Date("2026-08-12T11:00:00.000Z")
  }, root);
  await applyDoorMoneyRecommendationDecision({
    id: recommendation.id,
    decision: { action: "posted", postedUrl: "https://example.test/posts/synthetic-radio" },
    now: new Date("2026-08-12T12:00:00.000Z")
  }, root);
  return { root, recommendationId: recommendation.id };
}

async function routeFor(root: string, production = false) {
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "correct-password");
  if (production) vi.stubEnv("VERCEL", "1");
  vi.resetModules();
  const [{ POST, MAX_OWNER_RESULT_BYTES }, { createAdminSessionToken, ADMIN_SESSION_COOKIE }] = await Promise.all([
    import("./route"),
    import("@/lib/admin-session")
  ]);
  return {
    POST,
    MAX_OWNER_RESULT_BYTES,
    cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "correct-password")}`
  };
}

function request(body: unknown, cookie?: string, options: { origin?: string; size?: number } = {}): Request {
  const text = JSON.stringify(body);
  return new Request(`${ORIGIN}/admin/api/door-money/results`, {
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

function body(recommendationId: string) {
  return {
    recommendationId,
    platform: "instagram",
    metrics: { views: 41, saves: 5, linkTaps: 2 },
    outcome: "The synthetic owner observed five saves and two link taps."
  };
}

describe("Door Money owner-results route", () => {
  it("runs authentication, same-origin and size gates before persistence", async () => {
    const { root, recommendationId } = await fixture();
    const { POST, MAX_OWNER_RESULT_BYTES, cookie } = await routeFor(root);
    expect((await POST(request(body(recommendationId)))).status).toBe(401);
    expect((await POST(request(body(recommendationId), cookie, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(body(recommendationId), cookie, { size: MAX_OWNER_RESULT_BYTES + 1 }))).status).toBe(413);
  });

  it("requires owner-entered evidence and persists an idempotent manual record", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00.000Z"));
    const { root, recommendationId } = await fixture();
    const { POST, cookie } = await routeFor(root);
    expect((await POST(request({ ...body(recommendationId), metrics: {} }, cookie))).status).toBe(422);

    const recommendationPath = path.join(root, `state/ventures/door-money/recommendations/${recommendationId}.json`);
    const recommendationBefore = await readFile(recommendationPath, "utf8");
    const first = await POST(request(body(recommendationId), cookie));
    expect(first.status).toBe(201);
    expect(first.headers.get("Cache-Control")).toContain("no-store");
    const firstValue = await first.json() as { result: { id: string; source: string; postUrl: string }; changed: boolean };
    expect(firstValue).toMatchObject({
      changed: true,
      result: { source: "owner-entry", postUrl: "https://example.test/posts/synthetic-radio" }
    });
    expect(firstValue.result.id).toMatch(/^owner-result-[a-f0-9]{24}$/u);
    expect(await readFile(recommendationPath, "utf8")).toBe(recommendationBefore);

    const stored = JSON.parse(await readFile(
      path.join(root, `state/ventures/door-money/results/${firstValue.result.id}.json`), "utf8"
    ));
    expect(stored).toMatchObject({ source: "owner-entry", metrics: { views: 41, saves: 5, linkTaps: 2 } });
    const retry = await POST(request(body(recommendationId), cookie));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ changed: false, result: { id: firstValue.result.id } });
  });

  it("keeps the result writer closed while DM-RESULTS-004 is pending", async () => {
    const { root, recommendationId } = await fixture(false);
    const { POST, cookie } = await routeFor(root);
    const response = await POST(request(body(recommendationId), cookie));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      cause: "conflict",
      error: expect.stringContaining("DM-RESULTS-004 is pending")
    });
    await expect(readdir(path.join(root, "state/ventures/door-money/results")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("fails closed in production without persistence credentials", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T10:00:00.000Z"));
    const { root, recommendationId } = await fixture();
    const { POST, cookie } = await routeFor(root, true);
    const response = await POST(request(body(recommendationId), cookie));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ cause: "no-token" });
    await expect(readdir(path.join(root, "state/ventures/door-money/results"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});
