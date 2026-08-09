import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECK_FAMILIES, DECK_STYLES, buildArticleDeck, deriveRecipe } from "@boardlessai/carousel-studio";
import { effectiveRecipe } from "../src/social/deck-style.js";
import { writeDeckReceipt } from "../src/social/deck-receipt.js";

async function stateRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "deck-render-"));
}

/**
 * The cover was the article title, which is written for a page of prose rather than for a
 * square somebody scrolls past. Both desks now write the cover line in the same call that
 * writes the article, so it passes the same style review.
 */
describe("the deck cover", () => {
  it("uses the line the desk wrote for it", () => {
    const [cover] = buildArticleDeck({
      title: "Gustavo Lopez: bantamová váha mezi UFC a evropskými promotéry",
      coverLine: "Tři organizace za rok. Kam Lopez patří?",
      dek: "Americký bojovník prošel za poslední rok třemi organizacemi.",
      bodyMdx: "Text.",
      outro: "Celý ozdrojovaný text najdete v MMA Files."
    });
    expect(cover!.text).toBe("Tři organizace za rok. Kam Lopez patří?");
  });

  it("falls back to the title for every article written before the field existed", () => {
    const [cover] = buildArticleDeck({
      title: "Gustavo Lopez",
      dek: "Dek.",
      bodyMdx: "Text.",
      outro: "Konec."
    });
    expect(cover!.text).toBe("Gustavo Lopez");
  });
});

/**
 * The /admin switcher re-rendered a preview and nothing else: the shipped deck used the style
 * derived from the date, so choosing a design changed a picture on a screen and no bytes.
 */
describe("the deck design the owner picked", () => {
  it("derives the same recipe twice from the same inputs", async () => {
    const root = await stateRoot();
    const article = { root, venture: "mma-files" as const, slug: "oktagon-lopez", date: "2026-08-04" };
    expect(await effectiveRecipe(article)).toEqual(await effectiveRecipe(article));
    // Nothing new derives one of the five original wallpapers.
    expect(DECK_FAMILIES as readonly string[]).toContain((await effectiveRecipe(article)).family);
  });

  it("takes the recorded choice over the derived one", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "carousel-studio"), { recursive: true });
    const article = { root, venture: "caught-up" as const, slug: "tri-laboratore", date: "2026-08-06" };
    const derived = (await effectiveRecipe(article)).family;
    // Any real design but the derived one. "grid" was here and is not in DECK_STYLES, so the
    // override would have been rejected and the assertion passed for the wrong reason.
    const chosen = DECK_STYLES.find((style) => style !== derived)!;
    expect(chosen).toBeDefined();
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "deck-style-overrides.json"),
      JSON.stringify({
        schemaVersion: "carousel-deck-style-overrides/1",
        overrides: [{ venture: "caught-up", slug: "tri-laboratore", date: "2026-08-06", style: chosen, changedAt: "2026-08-06T10:00:00.000Z" }],
        updatedAt: "2026-08-06T10:00:00.000Z"
      }),
      "utf8"
    );

    expect((await effectiveRecipe(article)).family).toBe(chosen);
    // Another article on the same day is untouched: an override names one article.
    expect((await effectiveRecipe({ ...article, slug: "something-else" })).family).not.toBe(chosen);
  });

  /*
   * Three redeliveries of one MMA event share a slug. Before dates were part of the identity the
   * owner's choice for one of them was the choice for all three, and the panel showed one deck
   * three times — the same bug at both ends of the pipe.
   */
  it("binds one redelivery without binding the others", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "carousel-studio"), { recursive: true });
    const slug = "ufc-event-ufc-fight-night-gamrot-vs-salkilld";
    const article = { root, venture: "mma-files" as const, slug, date: "2026-08-06" };
    const derived = (await effectiveRecipe(article)).family;
    const chosen = DECK_STYLES.find((style) => style !== derived)!;
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "deck-style-overrides.json"),
      JSON.stringify({
        schemaVersion: "carousel-deck-style-overrides/1",
        overrides: [{ venture: "mma-files", slug, date: "2026-08-06", style: chosen, changedAt: "2026-08-08T10:00:00.000Z" }],
        updatedAt: "2026-08-08T10:00:00.000Z"
      }),
      "utf8"
    );

    expect((await effectiveRecipe(article)).family).toBe(chosen);
    expect((await effectiveRecipe({ ...article, date: "2026-08-05" })).family).not.toBe(chosen);
    expect((await effectiveRecipe({ ...article, date: "2026-08-08" })).family).not.toBe(chosen);
  });

  /** The three records already on main name no date, and must go on binding. */
  it("keeps honouring an override recorded before dates existed", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "carousel-studio"), { recursive: true });
    const slug = "ufc-valentina-shevchenko";
    const article = { root, venture: "mma-files" as const, slug, date: "2026-08-02" };
    const derived = (await effectiveRecipe(article)).family;
    const chosen = DECK_STYLES.find((style) => style !== derived)!;
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "deck-style-overrides.json"),
      JSON.stringify({
        schemaVersion: "carousel-deck-style-overrides/1",
        overrides: [{ venture: "mma-files", slug, style: chosen, changedAt: "2026-08-08T23:37:25.406Z" }],
        updatedAt: "2026-08-08T23:37:25.406Z"
      }),
      "utf8"
    );

    expect((await effectiveRecipe(article)).family).toBe(chosen);
    // And it answers for any date, because a record with no date names no one date.
    expect((await effectiveRecipe({ ...article, date: "2026-08-09" })).family).toBe(chosen);
  });
});

/** The engine measure counts articles that produced a deck, and nothing wrote the receipts. */
describe("a render receipt", () => {
  it("records what was rendered, where the measure reads it", async () => {
    const root = await stateRoot();

    const relative = await writeDeckReceipt({
      root,
      venture: "caught-up",
      date: "2026-08-06",
      slug: "tri-laboratore",
      templateId: "deck-mesh-7",
      style: "mesh",
      slideCount: 7,
      hashes: ["aaa", "bbb"]
    });

    expect(relative).toBe("ventures/carousel-studio/deck-receipts/caught-up-2026-08-06-tri-laboratore.json");
    expect(JSON.parse(await readFile(path.join(root, relative), "utf8"))).toMatchObject({
      schemaVersion: "deck-render-receipt/1",
      slug: "tri-laboratore",
      templateId: "deck-mesh-7",
      slideCount: 7
    });
  });
});

/**
 * The variety engine.
 *
 * A design used to be one of five wallpapers picked from a hash of the slug, which meant a week
 * of MMA articles could — and did — ship the same wallpaper three times, and there was nothing in
 * the system that could have noticed. A recipe is derived from the article's identity *and* from
 * what the venture actually shipped, so the memory is the receipts rather than a clock or a die.
 */
describe("the recipe variety engine", () => {
  async function receipts(root: string, entries: Array<{ date: string; slug: string; family: string }>): Promise<void> {
    await mkdir(path.join(root, "ventures", "carousel-studio", "deck-receipts"), { recursive: true });
    for (const entry of entries) {
      await writeDeckReceipt({
        root,
        venture: "mma-files",
        date: entry.date,
        slug: entry.slug,
        templateId: `deck-${entry.family}-7`,
        style: entry.family,
        recipe: { family: entry.family },
        slideCount: 7,
        hashes: ["a"]
      });
    }
  }

  it("replays a whole week identically from the same inputs and the same receipts", async () => {
    const root = await stateRoot();
    await receipts(root, [
      { date: "2026-08-05", slug: "one", family: "tower" },
      { date: "2026-08-04", slug: "two", family: "slab" }
    ]);
    const article = { root, venture: "mma-files" as const, slug: "gamrot", date: "2026-08-06" };
    const first = await effectiveRecipe(article);
    const second = await effectiveRecipe(article);
    expect(first).toEqual(second);
    // And the two families the venture just used are off the table.
    expect(["tower", "slab"]).not.toContain(first.family);
  });

  it("never repeats a family back to back across a synthetic week", async () => {
    const root = await stateRoot();
    const week = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08"];
    const chosen: string[] = [];
    for (const [index, date] of week.entries()) {
      const recipe = await effectiveRecipe({ root, venture: "mma-files", slug: `article-${index}`, date });
      chosen.push(recipe.family);
      await receipts(root, [{ date, slug: `article-${index}`, family: recipe.family }]);
    }
    for (let index = 1; index < chosen.length; index += 1) {
      expect(chosen[index], `day ${index} repeats ${chosen[index - 1]}`).not.toBe(chosen[index - 1]);
    }
    // Not merely non-repeating: the week actually spreads across the library.
    expect(new Set(chosen).size).toBeGreaterThanOrEqual(5);
  });

  it("lets an override pin one field and leaves the rest deriving", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "carousel-studio"), { recursive: true });
    const article = { root, venture: "mma-files" as const, slug: "gamrot", date: "2026-08-06" };
    const derived = await effectiveRecipe(article);
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "deck-style-overrides.json"),
      JSON.stringify({
        schemaVersion: "carousel-deck-style-overrides/1",
        overrides: [{ venture: "mma-files", slug: "gamrot", date: "2026-08-06", family: "dossier", treatment: "duotone", changedAt: "2026-08-08T10:00:00.000Z" }],
        updatedAt: "2026-08-08T10:00:00.000Z"
      }),
      "utf8"
    );
    const pinned = await effectiveRecipe(article);
    expect(pinned.family).toBe("dossier");
    expect(pinned.treatment).toBe("duotone");
    // Unset fields still derive, so pinning a family does not silently freeze the type scale.
    expect(pinned.typeScale).toBe(derived.typeScale);
    expect(pinned.phaseSeed).toBe(derived.phaseSeed);
  });

  it("ignores a pinned design that does not exist rather than rendering nothing", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "carousel-studio"), { recursive: true });
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "deck-style-overrides.json"),
      JSON.stringify({
        schemaVersion: "carousel-deck-style-overrides/1",
        overrides: [{ venture: "mma-files", slug: "gamrot", style: "chartreuse", changedAt: "2026-08-08T10:00:00.000Z" }],
        updatedAt: "2026-08-08T10:00:00.000Z"
      }),
      "utf8"
    );
    const recipe = await effectiveRecipe({ root, venture: "mma-files", slug: "gamrot", date: "2026-08-06" });
    expect(DECK_FAMILIES as readonly string[]).toContain(recipe.family);
  });

  it("asks for no treatment when there is no photograph to treat", () => {
    const withHero = deriveRecipe({ venture: "mma-files", slug: "gamrot", date: "2026-08-06", hasHero: true });
    const without = deriveRecipe({ venture: "mma-files", slug: "gamrot", date: "2026-08-06", hasHero: false });
    expect(without.treatment).toBe("none");
    expect(withHero.family).toBe(without.family);
  });
});
