import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The export, unzipped and checked against a direct render.
 *
 * A deck that cannot leave the browser is a deck nobody can post, and the admin's "no download
 * action" was a policy for a tool that could only show a picture. What has to be true of the file
 * the owner gets: the slides in it are the bytes the pipeline would ship, and the caption in it
 * carries the licence credit — most of these photographs are CC BY, so a caption without one is a
 * breach rather than a formatting slip.
 */

/** A one-pixel WebP: a RIFF container, so the hero decode is a real decode. */
const HERO_WEBP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
const CREDIT = "Tech. Sgt. Katie Gar Ward, CC0, Wikimedia Commons";
const BODY = Array.from({ length: 8 }, (_, index) => `Věta číslo ${index + 1} ${"slovo ".repeat(23)}konec.`).join(" ");
const RECIPE = "tower~a~none~10~0";

describe("the whole-deck export", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  async function fixture(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "deck-export-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/mma-files/articles");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "2026-08-04-am-fixture.json"), JSON.stringify({
      slug: "fixture-article",
      publishAt: "2026-08-04T06:00:00Z",
      status: "published",
      image: { hero_bytes_base64: HERO_WEBP, license: { attribution_html: `<a href="#">${CREDIT}</a>` } },
      localizations: {
        cs: {
          title: "Titulek testovacího článku o zápase",
          dek: "Perex testovacího článku, který popisuje, co se stalo a proč to má význam.",
          bodyMDX: BODY
        }
      }
    }));
    return root;
  }

  it("carries every slide, the caption with its credit, the Threads text and a manifest", async () => {
    const root = await fixture();
    vi.resetModules();
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");

    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import("./admin-session");
    const { readDesignLab } = await import("./design-lab");
    const { readArticleHeroPng } = await import("./admin-deck-hero");
    const { GET } = await import("@/app/admin/api/carousel-studio/export/[venture]/[slug]/[date]/[recipe]/route");
    const {
      ARTICLE_HERO_SLOT,
      CAROUSEL_BRANDS,
      articleSlideSlot,
      decodeRecipe,
      recipeTemplate,
      renderCarouselPng
    } = await import("@boardlessai/carousel-studio");

    const [deck] = await readDesignLab(40);
    expect(deck!.slides.length).toBeGreaterThanOrEqual(5);

    const response = await GET(
      new Request("https://example.test/x?format=instagram-portrait", {
        headers: { cookie: `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}` }
      }),
      { params: Promise.resolve({ venture: "mma-files", slug: "fixture-article", date: "2026-08-04", recipe: RECIPE }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain("fixture-article-instagram-portrait.zip");

    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const names = Object.keys(files).sort();
    expect(names).toEqual([
      "caption.txt",
      "manifest.json",
      ...deck!.slides.map((_, index) => `mma-files-2026-08-04-slide-${String(index + 1).padStart(2, "0")}.png`),
      "threads.txt"
    ].sort());

    // The same bytes a direct render produces, slide for slide. An export that disagreed with the
    // preview would be worse than no export.
    const hero = await readArticleHeroPng("mma-files", "fixture-article", "2026-08-04");
    const rendered = await renderCarouselPng({
      template: recipeTemplate(decodeRecipe(RECIPE)!, deck!.slides.length),
      payload: {
        locale: "cs",
        strings: Object.fromEntries(deck!.slides.map((entry, index) => [articleSlideSlot(index), entry.text]))
      },
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait",
      ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {})
    });
    rendered.forEach((slide, index) => {
      const name = `mma-files-2026-08-04-slide-${String(index + 1).padStart(2, "0")}.png`;
      expect(Buffer.from(files[name]!).equals(slide.png), name).toBe(true);
    });

    const decoder = new TextDecoder();
    const caption = decoder.decode(files["caption.txt"]!);
    expect(caption).toContain(CREDIT);
    expect(caption.trimEnd().split("\n").at(-1)).toMatch(/^#/u);
    expect(decoder.decode(files["threads.txt"]!).trim().length).toBeGreaterThan(0);

    const manifest = JSON.parse(decoder.decode(files["manifest.json"]!)) as {
      recipe: { family: string };
      template: { template_id: string };
      attribution: string;
      slides: Array<{ pngHash: string }>;
    };
    expect(manifest.recipe.family).toBe("tower");
    expect(manifest.template.template_id).toBe(`deck-tower-${deck!.slides.length}`);
    expect(manifest.attribution).toBe(CREDIT);
    expect(manifest.slides.map((slide) => slide.pngHash)).toEqual(rendered.map((slide) => slide.pngHash));
    expect(manifest).not.toHaveProperty("coverRef");
    expect(JSON.stringify(manifest)).not.toContain("coverRef");
  }, 180_000);

  it("names the file on a per-slide download and answers 404 for a design that does not exist", async () => {
    const root = await fixture();
    vi.resetModules();
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");

    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import("./admin-session");
    const { GET } = await import("@/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[recipe]/[slide]/route");
    const cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}`;

    const download = await GET(
      new Request("https://example.test/x?download=1", { headers: { cookie } }),
      { params: Promise.resolve({ venture: "mma-files", slug: "fixture-article", date: "2026-08-04", recipe: RECIPE, slide: "2" }) }
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="mma-files-2026-08-04-slide-02.png"');

    const unknown = await GET(
      new Request("https://example.test/x", { headers: { cookie } }),
      { params: Promise.resolve({ venture: "mma-files", slug: "fixture-article", date: "2026-08-04", recipe: "chartreuse~a~none~10~0", slide: "1" }) }
    );
    expect(unknown.status).toBe(404);
  }, 120_000);
});
