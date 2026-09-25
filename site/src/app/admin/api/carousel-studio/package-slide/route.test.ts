import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PACKAGE_DATE, PACKAGE_SLUG, packageFixtureRoot } from "@/lib/admin-queue/fixture-root";

vi.mock("server-only", () => ({}));

// quorum#575 (B8): Save for one slide of a devShark package re-runs the clip gate first.

const ORIGIN = "https://boardless.example";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function route(options: Parameters<typeof packageFixtureRoot>[0] = {}) {
  const root = await packageFixtureRoot(options);
  roots.push(root);
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.resetModules();
  const [{ POST }, slideRoute, { ADMIN_SESSION_COOKIE, createAdminSessionToken }] = await Promise.all([
    import("./route"),
    import("../package/[venture]/[slug]/[date]/[slide]/route"),
    import("@/lib/admin-session")
  ]);
  return { root, POST, GET: slideRoute.GET, cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` };
}

function save(cookie: string, body: Record<string, unknown>, origin = ORIGIN): Request {
  return new Request(`${ORIGIN}/admin/api/carousel-studio/package-slide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: origin },
    body: JSON.stringify(body)
  });
}

const slide = (index: number, query = "") => ({
  request: (cookie: string | null) => new Request(`${ORIGIN}/admin/api/carousel-studio/package/devshark/${PACKAGE_SLUG}/${PACKAGE_DATE}/${index}${query}`, cookie ? { headers: { Cookie: cookie } } : {}),
  params: { params: Promise.resolve({ venture: "devshark", slug: PACKAGE_SLUG, date: PACKAGE_DATE, slide: String(index) }) }
});

const address = { venture: "devshark", slug: PACKAGE_SLUG, date: PACKAGE_DATE };

describe("POST /admin/api/carousel-studio/package-slide", () => {
  it("refuses an edit that would clip with the slot named, and writes nothing", async () => {
    const { root, POST, cookie } = await route();
    const response = await POST(save(cookie, { ...address, slide: 2, headline: "A", body: "JSON, the small text format every browser parses natively without an XML parser, which is why so many web APIs return it by default today", alt: "Slide 3" }));
    expect(response.status).toBe(422);
    const body = await response.json() as { cause: string; problems: Array<{ slot: string | null; message: string }> };
    expect(body.cause).toBe("refused");
    expect(body.problems[0]).toMatchObject({ slot: "stat-label" });
    expect(body.problems[0]!.message).toContain("would clip in stat-label");
    await expect(readFile(path.join(root, "state/ventures/carousel-studio/slide-overrides.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("saves an edit that fits and the slide route renders it", async () => {
    const { root, POST, GET, cookie } = await route();
    const before = await GET(slide(4).request(cookie), slide(4).params);
    const response = await POST(save(cookie, { ...address, slide: 3, headline: "Why JSON", body: "Browsers parse JSON natively.", alt: "Slide 4: why JSON" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, edited: true, slide: { headline: "Why JSON", body: "Browsers parse JSON natively." } });
    expect(await readFile(path.join(root, "state/ventures/carousel-studio/slide-overrides.json"), "utf8")).toContain('"kind": "package-slide"');
    const after = await GET(slide(4).request(cookie), slide(4).params);
    expect(after.status).toBe(200);
    expect(after.headers.get("content-type")).toBe("image/png");
    expect(after.headers.get("etag")).not.toBe(before.headers.get("etag"));
  });

  it("refuses another origin, a family venture, an unknown field, and a map without the Design Lab edge", async () => {
    const { POST, cookie } = await route();
    const good = { ...address, slide: 0, headline: "Hook", body: "", alt: "Slide 1" };
    expect((await POST(save(cookie, good, "https://evil.example"))).status).toBe(403);
    expect((await POST(save(cookie, { ...good, venture: "caught-up" }))).status).toBe(422);
    expect((await POST(save(cookie, { ...good, text: "A family slide" }))).status).toBe(422);
    const closed = await route({ designLabEdge: false });
    expect((await closed.POST(save(closed.cookie, good))).status).toBe(403);
  });
});

describe("GET /admin/api/carousel-studio/package/.../[slide]", () => {
  it("previews a draft through the query and names the slot it would clip", async () => {
    const { GET, cookie } = await route();
    const draft = slide(3, `?body=${encodeURIComponent("JSON, the small text format every browser parses natively without an XML parser, which is why so many web APIs return it by default today")}`);
    const response = await GET(draft.request(cookie), draft.params);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-truncated-slots")).toBe("stat-label");
  });

  it("answers only an owner, and nothing for a slide outside the five or a closed edge", async () => {
    const { GET, cookie } = await route();
    expect((await GET(slide(1).request(null), slide(1).params)).status).toBe(401);
    expect((await GET(slide(6).request(cookie), slide(6).params)).status).toBe(404);
    const closed = await route({ designLabEdge: false });
    expect((await closed.GET(slide(1).request(closed.cookie), slide(1).params)).status).toBe(404);
  });
});
