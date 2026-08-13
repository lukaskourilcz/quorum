import { mkdtemp, readFile, rm } from "node:fs/promises";
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

async function route() {
  const root = await mkdtemp(path.join(os.tmpdir(), "design-lab-recipe-route-"));
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.resetModules();
  const [{ POST }, { ADMIN_SESSION_COOKIE, createAdminSessionToken }] = await Promise.all([
    import("./route"),
    import("@/lib/admin-session")
  ]);
  return { root, POST, cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` };
}

function request(cookie: string, body: Record<string, unknown>): Request {
  return new Request(`${ORIGIN}/admin/api/carousel-studio/recipe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify(body)
  });
}

describe("the expanded Design Lab recipe route", () => {
  it("saves generic recipes, presets and slide text for the three new one-language brands", async () => {
    const { root, POST, cookie } = await route();
    const common = { slug: "synthetic-review", date: "2026-08-12" };
    expect((await POST(request(cookie, { ...common, venture: "kvorum", family: "masthead" }))).status).toBe(200);
    expect((await POST(request(cookie, {
      ...common,
      venture: "door-money",
      family: "quiet",
      presetName: "Synthetic English",
      presetStatus: "draft"
    }))).status).toBe(200);
    expect((await POST(request(cookie, {
      ...common,
      venture: "booksofhistory",
      slide: 0,
      text: "Synthetic English slide copy only."
    }))).status).toBe(200);

    expect(await readFile(path.join(root, "state/ventures/carousel-studio/deck-style-overrides.json"), "utf8")).toContain('"venture": "kvorum"');
    expect(await readFile(path.join(root, "state/ventures/carousel-studio/presets.json"), "utf8")).toContain("Synthetic English");
    expect(await readFile(path.join(root, "state/ventures/carousel-studio/slide-overrides.json"), "utf8")).toContain('"venture": "booksofhistory"');
  });

  it("refuses generic one-slot edits for the dedicated bilingual family", async () => {
    const { root, POST, cookie } = await route();
    const response = await POST(request(cookie, {
      venture: "tehdejsi-svet",
      slug: "synthetic-memory",
      date: "2026-08-12",
      family: "masthead"
    }));
    expect(response.status).toBe(422);
    await expect(readFile(path.join(root, "state/ventures/carousel-studio/deck-style-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});
