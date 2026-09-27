import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGIN = "https://boardless.example";
const committedKits = path.resolve(__dirname, "..", "..", "..", "..", "..", "..", "..", "..", "studio", "brand-kits");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function route() {
  const root = await mkdtemp(path.join(os.tmpdir(), "brand-kit-route-"));
  roots.push(root);
  await mkdir(path.join(root, "config"), { recursive: true });
  await writeFile(path.join(root, "config", "ventures.json"), JSON.stringify({ ventures: [{ id: "caught-up", status: "operating" }] }));
  await cp(committedKits, path.join(root, "studio", "brand-kits"), { recursive: true });
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  vi.stubEnv("ADMIN_USER", "owner");
  vi.stubEnv("ADMIN_PASSWORD", "secret");
  vi.resetModules();
  const [{ GET }, { ADMIN_SESSION_COOKIE, createAdminSessionToken }] = await Promise.all([
    import("./route"),
    import("@/lib/admin-session")
  ]);
  return { GET, cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` };
}

const call = (GET: (request: Request, context: { params: Promise<{ venture: string; file: string }> }) => Promise<Response>, cookie: string | null, venture: string, file: string, query = "") =>
  GET(
    new Request(`${ORIGIN}/admin/api/brand-kits/${venture}/${file}${query}`, { headers: cookie ? { Cookie: cookie } : {} }),
    { params: Promise.resolve({ venture, file }) }
  );

describe("the brand kit file route", () => {
  it("refuses a request without an admin session", async () => {
    const { GET } = await route();
    expect((await call(GET, null, "caught-up", "DNESKAi-logo.svg")).status).toBeGreaterThanOrEqual(401);
  });

  it("serves a listed file inline, or as a download, with script shut out", async () => {
    const { GET, cookie } = await route();
    const inline = await call(GET, cookie, "caught-up", "DNESKAi-logo.svg");
    expect(inline.status).toBe(200);
    expect(inline.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(inline.headers.get("Content-Disposition")).toBe('inline; filename="DNESKAi-logo.svg"');
    expect(inline.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect((await inline.arrayBuffer()).byteLength).toBe(9934);
    const download = await call(GET, cookie, "caught-up", "DNESKAi-square-512.png", "?download=1");
    expect(download.headers.get("Content-Type")).toBe("image/png");
    expect(download.headers.get("Content-Disposition")).toBe('attachment; filename="DNESKAi-square-512.png"');
  });

  it("answers 404 for anything the manifest does not list or a venture that is not running", async () => {
    const { GET, cookie } = await route();
    expect((await call(GET, cookie, "caught-up", "manifest.json")).status).toBe(404);
    expect((await call(GET, cookie, "caught-up", "..%2Fmarketingshark%2Fmanifest.json")).status).toBe(404);
    expect((await call(GET, cookie, "marketingshark", "devshark-fin-clean-green.svg")).status).toBe(404);
  });
});
