import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Every sharp() construction, tagged by what the caller handed it.
 *
 * The point of the whole exercise is how many of these one page load causes, so the test counts
 * them rather than timing them: a wall clock reading is a property of the machine, a rasterisation
 * count is a property of the code.
 */
const rasterCalls: string[] = [];

vi.mock("sharp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("sharp")>();
  const real = actual.default;
  const counted = ((...args: Parameters<typeof real>) => {
    const first = args[0];
    const svg = Buffer.isBuffer(first) && first.subarray(0, 4).toString("utf8") === "<svg";
    rasterCalls.push(svg ? "svg->png" : "hero-decode");
    return real(...args);
  }) as typeof real;
  Object.assign(counted, real);
  return { ...actual, default: counted };
});

/** A one-pixel WebP: a RIFF container, so the hero decode is a real decode. */
const HERO_WEBP = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

/**
 * Prose that packs into exactly seven body slides.
 *
 * Each sentence is 27 words, so no two fit on one 30-word slide and each takes its own. Eight of
 * them, capped to the seven the deck has room for, plus a cover, a dek and an outro, is ten — the
 * longest deck the builder makes and the case that hurt most.
 */
const BODY = Array.from(
  { length: 8 },
  (_, index) => `Věta číslo ${index + 1} ${"slovo ".repeat(23)}konec.`
).join(" ");

describe("one deck's worth of slide requests", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    rasterCalls.length = 0;
    vi.resetModules();
  });

  function storedArticle(date: string, title: string, hero: string | null): string {
    return JSON.stringify({
      slug: "fixture-article",
      publishAt: `${date}T06:00:00Z`,
      status: "published",
      ...(hero ? { image: { hero_bytes_base64: hero, license: { attribution_html: "<a href='#'>Autor</a>, CC BY 4.0" } } } : {}),
      localizations: {
        cs: {
          title,
          dek: "Perex testovacího článku, který popisuje, co se stalo a proč to má význam.",
          bodyMDX: BODY
        }
      }
    });
  }

  async function fixture(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "deck-slide-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/mma-files/articles");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "2026-08-04-am-fixture.json"),
      storedArticle("2026-08-04", "Titulek testovacího článku o zápase", HERO_WEBP)
    );
    return root;
  }

  /**
   * Two redeliveries of one event: one slug, two dates, two different articles.
   *
   * This is the shape of the real bug — three MMA packages share
   * `ufc-event-ufc-fight-night-gamrot-vs-salkilld` and the panel showed one deck three times.
   */
  async function redeliveries(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "deck-slide-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/mma-files/articles");
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, "2026-08-05-am-fixture.json"),
      storedArticle("2026-08-05", "První doručení testovacího zápasového článku", HERO_WEBP)
    );
    await writeFile(
      path.join(directory, "2026-08-06-am-fixture.json"),
      storedArticle("2026-08-06", "Druhé doručení téhož zápasu s jiným titulkem", null)
    );
    return root;
  }

  it("rasterises one image per slide, not one deck per slide, and ships the deck's own bytes", async () => {
    const root = await fixture();
    vi.resetModules();
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");

    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import("./admin-session");
    const { readAdminDecks } = await import("./admin-decks");
    const { readArticleHeroPng } = await import("./admin-deck-hero");
    const { GET } = await import("@/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[style]/[slide]/route");
    const {
      ARTICLE_HERO_SLOT,
      CAROUSEL_BRANDS,
      articleDeckTemplate,
      articleSlideSlot,
      renderCarouselPng
    } = await import("@boardlessai/carousel-studio");

    const [deck] = await readAdminDecks(40);
    // Eight, since the owner capped a deck there: ten swipes to reach a point that fits in six.
    expect(deck!.slides).toHaveLength(8);
    expect(deck!.hasHero).toBe(true);
    const style = "editorial";

    // What the pipeline would ship: the whole deck, rendered the way every publisher renders it.
    const hero = await readArticleHeroPng(deck!.venture, deck!.slug, deck!.date);
    const shipped = await renderCarouselPng({
      template: articleDeckTemplate(deck!.slides.length, style),
      payload: {
        locale: "cs",
        strings: Object.fromEntries(deck!.slides.map((entry, index) => [articleSlideSlot(index), entry.text]))
      },
      brand: CAROUSEL_BRANDS[deck!.venture],
      format: "instagram-portrait",
      ...(hero ? { images: { [ARTICLE_HERO_SLOT]: hero } } : {})
    });

    // Only what the page itself causes counts, so the reference render above is not in the tally.
    rasterCalls.length = 0;
    const token = createAdminSessionToken("owner", "secret");
    const served: Buffer[] = [];
    for (let slide = 1; slide <= deck!.slides.length; slide += 1) {
      const response = await GET(
        new Request("https://example.test/x", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } }),
        { params: Promise.resolve({ venture: deck!.venture, slug: deck!.slug, date: deck!.date, style, slide: String(slide) }) }
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
      served.push(Buffer.from(await response.arrayBuffer()));
    }

    // Ten slides, ten rasterisations. Rendering the deck to serve one slide of it made this a
    // hundred, which is the ten-second page this test exists to keep fixed.
    expect(rasterCalls.filter((call) => call === "svg->png")).toHaveLength(deck!.slides.length);

    // And the cheap path is the same path: byte-for-byte what the publisher would send.
    served.forEach((png, index) => {
      expect(png.equals(shipped[index]!.png), `slide ${index + 1} must be the bytes the pipeline ships`).toBe(true);
    });
  }, 120_000);

  it("gives two redeliveries of one event two decks, not one deck twice", async () => {
    const root = await redeliveries();
    vi.resetModules();
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");

    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import("./admin-session");
    const { readAdminDecks } = await import("./admin-decks");
    const { GET } = await import("@/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[style]/[slide]/route");

    const decks = await readAdminDecks(40);
    expect(decks).toHaveLength(2);
    // One slug, two identities. Keying on the slug alone collapsed them into one card, and the
    // React list keyed on the same thing and warned about it.
    expect(new Set(decks.map((deck) => deck.slug)).size).toBe(1);
    expect(new Set(decks.map((deck) => `${deck.venture}/${deck.slug}/${deck.date}`)).size).toBe(2);
    expect(decks[0]!.hasHero).not.toBe(decks[1]!.hasHero);

    const token = createAdminSessionToken("owner", "secret");
    const cover = async (date: string) => {
      const response = await GET(
        new Request("https://example.test/x", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } }),
        { params: Promise.resolve({ venture: "mma-files", slug: "fixture-article", date, style: "editorial", slide: "1" }) }
      );
      expect(response.status).toBe(200);
      return Buffer.from(await response.arrayBuffer());
    };

    // Different headline, different photograph — so different bytes. The route resolving by
    // first-slug-match served the same cover for both dates.
    expect((await cover("2026-08-05")).equals(await cover("2026-08-06"))).toBe(false);
  }, 120_000);

  it("answers 404 for a slide past the end of the deck without rasterising anything", async () => {
    const root = await fixture();
    vi.resetModules();
    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    vi.stubEnv("ADMIN_USER", "owner");
    vi.stubEnv("ADMIN_PASSWORD", "secret");
    const { createAdminSessionToken, ADMIN_SESSION_COOKIE } = await import("./admin-session");
    const { GET } = await import("@/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[style]/[slide]/route");
    const token = createAdminSessionToken("owner", "secret");

    rasterCalls.length = 0;
    const response = await GET(
      new Request("https://example.test/x", { headers: { cookie: `${ADMIN_SESSION_COOKIE}=${token}` } }),
      { params: Promise.resolve({ venture: "mma-files", slug: "fixture-article", date: "2026-08-04", style: "editorial", slide: "11" }) }
    );
    expect(response.status).toBe(404);
    expect(rasterCalls.filter((call) => call === "svg->png")).toHaveLength(0);
  }, 60_000);
});
