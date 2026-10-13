import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeGitHub } from "@/lib/admin-queue/fake-github";
import { editionPackageHash, EditorialReviewSchema } from "@boardlessai/orchestrator/marketing-source";
import { applyEditorialDecision, editorialCard } from "@/lib/admin-queue/editorial";
import { applyEditorialPreviewSelection } from "@/lib/admin-queue/editorial-preview";
import { createAdminSessionToken, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
import { GET, POST } from "./route";

const origin = "https://quorum-preview.example";
let root: string;
let review: Record<string, unknown>;
let selection: Record<string, unknown>;
let github: ReturnType<typeof fakeGitHub>;

function request(body: unknown, options: { auth?: boolean; origin?: string; omitOrigin?: boolean; raw?: string; size?: number } = {}) {
  const raw = options.raw ?? JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json", "content-length": String(options.size ?? Buffer.byteLength(raw)) };
  if (!options.omitOrigin) headers.Origin = options.origin ?? origin;
  if (options.auth !== false) headers.Cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "fixture-password")}`;
  return new Request(`${origin}/admin/api/queue/articles/preview`, { method: "POST", headers, body: raw });
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "editorial-preview-route-"));
  const article = JSON.parse(await readFile(path.resolve("../contracts/fixtures/edition-package.valid.json"), "utf8"));
  article.idempotencyKey = editionPackageHash(article);
  review = EditorialReviewSchema.parse({ schemaVersion: "editorial-review/2", id: article.idempotencyKey, createdAt: "2026-09-27T10:00:00.000Z", package: article,
    titles: ["First authored headline", "Second authored headline", "Third authored headline", "Fourth authored headline"],
    images: [1, 2, 3, 4].map(index => ({ id: `candidate-${index}`, image: { ...article.image,
      origin: "illustration", hero_bytes_base64: Buffer.from(`fixture-image-${index}`).toString("base64"),
      license: { ...article.image.license, name: "BoardlessAI illustration" } }, unavailableReason: null })) });
  await mkdir(path.join(root, "state/editorial/reviews"), { recursive: true });
  await writeFile(path.join(root, `state/editorial/reviews/${review.id}.json`), JSON.stringify(review));
  const card = editorialCard(review)!;
  selection = { id: card.id, hash: card.hash, action: "approve", title: card.titles[1], imageId: "candidate-2" };
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "fixture-repository-token");
  vi.stubEnv("BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/quorum");
  vi.stubEnv("BOARDLESSAI_GITHUB_BRANCH", "codex/marketing-source-bridge");
  vi.stubEnv("DNESKAI_EDITORIAL_PREVIEW_BRANCH", "codex/marketing-source-bridge");
  vi.stubEnv("DNESKAI_EDITORIAL_PREVIEW_SELECTION_ENABLED", "true");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "fixture-password");
  github = fakeGitHub(root); vi.stubGlobal("fetch", github.fetch);
});
afterEach(async () => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); await rm(root, { recursive: true, force: true }); });

describe("isolated owner editorial selection", () => {
  it("saves the chosen bytes once on the exact preview branch without any workflow dispatch or release decision", async () => {
    await expect(applyEditorialPreviewSelection({ ...selection, imageId: "fal" }, root)).rejects.toMatchObject({ code: "REFUSED" });
    const response = await POST(request(selection));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({ productionApproval: "required-separately", delivery: "disabled",
      selection: { schemaVersion: "editorial-preview-selection/1", branch: "codex/marketing-source-bridge",
        decision: { reviewHash: selection.hash, title: selection.title, imageId: "candidate-2", actor: "owner" } } });
    expect((await POST(request(selection))).status).toBe(409);
    const writes = github.calls.filter(call => call.method !== "GET");
    expect(writes).toHaveLength(2); // A repeated create conflicts instead of changing the saved selection.
    expect(writes.every(call => call.method === "PUT" && call.path.includes("/editorial/preview-selections/") && call.body?.branch === "codex/marketing-source-bridge")).toBe(true);
    expect(await readdir(path.join(root, "state/editorial/decisions")).catch(() => [])).toEqual([]);
    expect(await readdir(path.join(root, "state/edition/outbox")).catch(() => [])).toEqual([]);
    const get = new Request(`${origin}/admin/api/queue/articles/preview?id=${review.id}`, { headers: { Cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "fixture-password")}` } });
    expect(await (await GET(get)).json()).toMatchObject({ review: { decision: "pending" }, selection: { decision: { title: selection.title } } });
  });

  it.each([
    ["VERCEL_ENV", "production"], ["VERCEL_ENV", "development"], ["VERCEL_ENV", ""],
    ["DNESKAI_EDITORIAL_PREVIEW_SELECTION_ENABLED", "false"], ["DNESKAI_EDITORIAL_PREVIEW_BRANCH", ""],
    ["DNESKAI_EDITORIAL_PREVIEW_BRANCH", "main"], ["BOARDLESSAI_GITHUB_BRANCH", "main"],
    ["BOARDLESSAI_GITHUB_BRANCH", "codex/other-preview"], ["BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/aifirst"]
  ])("refuses %s=%s before any repository access", async (name, value) => {
    vi.stubEnv(name, value);
    expect((await POST(request(selection))).status).toBe(403);
    expect(github.calls).toEqual([]);
  });

  it("requires owner authentication, explicit same origin, bounded valid input and the actual reviewed title/hash/image", async () => {
    expect((await POST(request(selection, { auth: false }))).status).toBe(401);
    expect((await POST(request(selection, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request(selection, { omitOrigin: true }))).status).toBe(403);
    expect((await POST(request(selection, { size: 5001 }))).status).toBe(413);
    expect((await POST(request(selection, { raw: JSON.stringify({ pad: "x".repeat(5001) }), size: 1 }))).status).toBe(413);
    expect((await POST(request(selection, { raw: "{" }))).status).toBe(400);
    expect((await POST(request({ ...selection, delivery: true }))).status).toBe(422);
    expect((await POST(request({ ...selection, hash: "0".repeat(64) }))).status).toBe(409);
    expect((await POST(request({ ...selection, title: "Invented headline" }))).status).toBe(403);
    expect((await POST(request({ ...selection, imageId: "fal" }))).status).toBe(403);
    expect(github.calls.filter(call => call.method !== "GET")).toEqual([]);
  });

  it("holds incomplete or changed image choices and the legacy delivery-triggering action in Preview", async () => {
    const images = review.images as Array<Record<string, unknown>>;
    images[0] = { id: "candidate-1", image: null, unavailableReason: "Fixture unavailable" };
    await writeFile(path.join(root, `state/editorial/reviews/${review.id}.json`), JSON.stringify(review));
    const hash = editorialCard(review)!.hash;
    expect((await POST(request({ ...selection, hash }))).status).toBe(403);
    await expect(applyEditorialDecision(selection, root)).rejects.toMatchObject({ code: "REFUSED" });
    expect(github.calls.filter(call => call.method !== "GET")).toEqual([]);
  });

  it("preserves the existing production approval dispatch", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const fetcher = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      if (String(input).endsWith("/actions/workflows/cycle.yml/dispatches")) return new Response(null, { status: 204 });
      return github.fetch(input, init);
    });
    vi.stubGlobal("fetch", fetcher);
    expect(await applyEditorialDecision(selection, root)).toMatchObject({ decision: "approve", persistence: "github", message: "Article approved. Delivery to DNESKAi has been requested." });
    const dispatch = fetcher.mock.calls.find(([url]) => String(url).endsWith("cycle.yml/dispatches"));
    expect(JSON.parse(String(dispatch?.[1]?.body))).toMatchObject({ inputs: { delivery_only: "true", dry: "false" } });
    expect(await readdir(path.join(root, "state/editorial/preview-selections")).catch(() => [])).toEqual([]);
  });
});
