import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCarouselSummary } from "@boardlessai/carousel-studio";

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

  it("exports deterministic PNG and ZIP bytes for Kvorum and both English ventures", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "deck-export-new-brands-"));
    roots.push(root);
    const inputs = [
      { venture: "kvorum" as const, slug: "synthetic-civic-brief", locale: "cs" as const },
      { venture: "door-money" as const, slug: "synthetic-load-in", locale: "en" as const },
      { venture: "booksofhistory" as const, slug: "synthetic-book-story", locale: "en" as const }
    ];
    for (const input of inputs) {
      const content = {
        slug: input.slug,
        date: "2026-08-12",
        title: input.locale === "en" ? "A synthetic English headline" : "Syntetický český titulek",
        dek: input.locale === "en" ? "An invented standfirst for renderer review." : "Umělý perex pro kontrolu rendereru.",
        points: input.locale === "en"
          ? ["The first invented passage.", "The second invented passage.", "The third invented passage."]
          : ["První umělá pasáž.", "Druhá umělá pasáž.", "Třetí umělá pasáž."],
        hasHero: false,
        heroCredit: null
      };
      const summary = input.venture === "booksofhistory"
        ? buildCarouselSummary({ venture: "booksofhistory", locale: "en", ...content })
        : input.venture === "door-money"
          ? buildCarouselSummary({ venture: "door-money", ...content })
          : buildCarouselSummary({ venture: "kvorum", ...content });
      const directory = path.join(root, `state/ventures/carousel-studio/summaries/${input.venture}`);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, `${summary.date}-${summary.slug}-${summary.locale}.json`), JSON.stringify(summary));
    }

    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    vi.resetModules();
    const [{ createAdminSessionToken, ADMIN_SESSION_COOKIE }, { readDesignLab }, exportRoute, slideRoute] = await Promise.all([
      import("./admin-session"),
      import("./design-lab"),
      import("@/app/admin/api/carousel-studio/export/[venture]/[slug]/[date]/[recipe]/route"),
      import("@/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[recipe]/[slide]/route")
    ]);
    const cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}`;
    const articles = await readDesignLab(40);
    expect(new Set(articles.map(({ venture }) => venture))).toEqual(new Set(inputs.map(({ venture }) => venture)));

    for (const input of inputs) {
      const slug = input.venture === "booksofhistory" ? `${input.slug}-en` : input.slug;
      const args = { params: Promise.resolve({ venture: input.venture, slug, date: "2026-08-12", recipe: RECIPE }) };
      const first = await exportRoute.GET(new Request("https://example.test/x?format=threads", { headers: { cookie } }), args);
      const second = await exportRoute.GET(new Request("https://example.test/x?format=threads", { headers: { cookie } }), args);
      expect(first.status, input.venture).toBe(200);
      expect(second.status, input.venture).toBe(200);
      expect(Buffer.from(await first.arrayBuffer()).equals(Buffer.from(await second.arrayBuffer())), input.venture).toBe(true);

      const slide = await slideRoute.GET(
        new Request("https://example.test/x?format=threads", { headers: { cookie } }),
        { params: Promise.resolve({ venture: input.venture, slug, date: "2026-08-12", recipe: RECIPE, slide: "1" }) }
      );
      expect(slide.status, input.venture).toBe(200);
      expect(slide.headers.get("content-type")).toBe("image/png");
    }
  }, 180_000);

  it("exports the approved bilingual family with its licensed-photo attribution", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "deck-export-tehdejsi-"));
    roots.push(root);
    const recommendation = JSON.parse(await readFile(
      path.resolve(process.cwd(), "../contracts/fixtures/venture-recommendation-tehdejsi.valid.json"),
      "utf8"
    )) as Record<string, unknown> & { id: string; date: string; payload: unknown };
    recommendation.id = "ts-2026-08-14-synthetic-export";
    recommendation.payload = {
      slides: [
        { ordinal: 1, cs: "Syntetická karta jedna.", ua: "Синтетична картка один." },
        { ordinal: 2, cs: "Syntetická karta dvě.", ua: "Синтетична картка два." },
        { ordinal: 3, cs: "Syntetická karta tři.", ua: "Синтетична картка три." }
      ],
      captionCs: "Syntetický český popisek.",
      captionUa: "Синтетичний український підпис.",
      ctaKind: "none"
    };
    const summary = buildCarouselSummary({
      venture: "tehdejsi-svet",
      slug: recommendation.id,
      date: recommendation.date,
      title: "Syntetická vzpomínka",
      dek: "Umělý popis ověřuje pouze export.",
      points: ["První umělá pasáž.", "Druhá umělá pasáž.", "Třetí umělá pasáž."],
      hasHero: true,
      heroCredit: "Photo by J. Novák, CC BY-SA 4.0"
    });
    const summaryDirectory = path.join(root, "state/ventures/carousel-studio/summaries/tehdejsi-svet");
    const draftDirectory = path.join(root, "state/ventures/tehdejsi-svet/drafts");
    const mediaDirectory = path.join(root, "state/ventures/tehdejsi-svet/media");
    await Promise.all([
      mkdir(summaryDirectory, { recursive: true }),
      mkdir(draftDirectory, { recursive: true }),
      mkdir(mediaDirectory, { recursive: true })
    ]);
    await Promise.all([
      writeFile(path.join(summaryDirectory, `${summary.date}-${summary.slug}.json`), JSON.stringify(summary)),
      writeFile(path.join(draftDirectory, `${recommendation.id}.json`), JSON.stringify(recommendation)),
      writeFile(path.join(mediaDirectory, `${recommendation.id}.png`), Buffer.from(HERO_WEBP, "base64"))
    ]);

    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    vi.resetModules();
    const [{ createAdminSessionToken, ADMIN_SESSION_COOKIE }, { readDesignLab }, { GET }] = await Promise.all([
      import("./admin-session"),
      import("./design-lab"),
      import("@/app/admin/api/carousel-studio/export/[venture]/[slug]/[date]/[recipe]/route")
    ]);
    const [article] = await readDesignLab(40, "tehdejsi-svet");
    expect(article?.dualLanguage?.slides).toHaveLength(3);
    expect(article?.renderable, article?.problems.join(" ")).toBe(true);
    const cookie = `${ADMIN_SESSION_COOKIE}=${createAdminSessionToken("owner", "secret")}`;
    const response = await GET(
      new Request("https://example.test/x?format=instagram-square", { headers: { cookie } }),
      { params: Promise.resolve({ venture: "tehdejsi-svet", slug: recommendation.id, date: recommendation.date, recipe: RECIPE }) }
    );
    expect(response.status).toBe(200);
    const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(new TextDecoder().decode(files["caption-ua.txt"])).toContain("Синтетичний");
    expect(new TextDecoder().decode(files["manifest.json"])).toContain("Photo by J. Novák, CC BY-SA 4.0");
    expect(Object.keys(files).filter((name) => name.endsWith(".png"))).toHaveLength(3);
  }, 180_000);
});
