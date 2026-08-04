import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const siteRoot = path.resolve(import.meta.dirname, "../..");
const repoRoot = path.resolve(siteRoot, "..");

/**
 * What the deployed admin needs in order to show a picture at all.
 *
 * Both halves of this file guard a failure that only exists once the code is packaged. The
 * carousel decks answered 500 for every slide in production while the SVG template previews
 * beside them were fine, and the media route answered 400 for hero files sitting on disk. Neither
 * showed up locally, because a developer's machine has the whole workspace and every encoding the
 * pipeline has ever written.
 */

describe("the image library the deck renderer needs at runtime", () => {
  /**
   * sharp reaches its libvips binding through `require('@img/sharp-' + platform)`, which no
   * bundler can follow. Bundled, its JavaScript is inlined and the platform binaries are never
   * traced into the function, so the deployed renderer throws on first use — which is exactly
   * what happened: `renderCarouselPng` failed for every deck slide and the route turned it into
   * a 500 while `renderCarouselSvg` next door, needing no image library, kept working.
   *
   * Declaring sharp external is what makes the trace collect the binaries.
   */
  it("keeps sharp out of the bundle so its platform binaries are traced", async () => {
    const config = await readFile(path.join(siteRoot, "next.config.ts"), "utf8");
    expect(config).toMatch(/serverExternalPackages:\s*\[[^\]]*"sharp"/u);
  });

  /**
   * An external package is required by bare name from `site/.next/server/**`, so Node resolves
   * it upwards from the site directory. sharp is a dependency of the carousel-studio workspace
   * package, and under pnpm that links it into `studio/node_modules` and nowhere else, so the
   * site has to ask for it itself or the deployed require finds nothing.
   */
  it("resolves sharp from the site package, the way the deployed function does", async () => {
    const { resolve } = createRequire(path.join(siteRoot, "next.config.ts"));
    expect(() => resolve("sharp")).not.toThrow();
    const declared = JSON.parse(await readFile(path.join(siteRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    const studio = JSON.parse(await readFile(path.join(repoRoot, "studio", "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    // One version, not two: a second sharp in the tree ships a second set of libvips binaries.
    expect(declared.dependencies.sharp).toBe(studio.dependencies.sharp);
  });
});

describe("the admin media route", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    vi.resetModules();
  });

  async function fixture(filename: string, bytes: Buffer): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-media-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/mma-files/media/2026-08-04-am-fixture");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes);
    return root;
  }

  async function get(root: string, relative: string): Promise<Response> {
    vi.resetModules();
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import("./admin-session");
    const { GET } = await import("@/app/admin/api/mma-files/media/route");
    const token = createAdminSessionToken("owner", "secret");
    return GET(new Request(`https://example.test/admin/api/mma-files/media?path=${encodeURIComponent(relative)}`, {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` }
    }));
  }

  /**
   * Heroes stopped being generated SVG plates the day the desk started buying licensed
   * photographs, and those are stored as WebP. A route that matched only `.svg` refused a file
   * it was sitting on top of.
   */
  it("serves a WebP hero with its own content type", async () => {
    // A one-pixel WebP: RIFF container, so this is a real decodable file rather than a stub.
    const webp = Buffer.from(
      "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
      "base64"
    );
    const root = await fixture("hero.webp", webp);
    const response = await get(root, "ventures/mma-files/media/2026-08-04-am-fixture/hero.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(webp);
  });

  it("still serves the deterministic SVG plates, sandboxed", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");
    const root = await fixture("hero.svg", svg);
    const response = await get(root, "ventures/mma-files/media/2026-08-04-am-fixture/hero.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("refuses an encoding the package contract does not allow, and refuses to climb out", async () => {
    const root = await fixture("hero.webp", Buffer.from("x"));
    expect((await get(root, "ventures/mma-files/media/2026-08-04-am-fixture/hero.gif")).status).toBe(400);
    expect((await get(root, "ventures/mma-files/../../../secrets.svg")).status).toBe(400);
  });
});
