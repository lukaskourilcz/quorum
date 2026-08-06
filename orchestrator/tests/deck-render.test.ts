import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildArticleDeck } from "@boardlessai/carousel-studio";
import { effectiveDeckStyle } from "../src/social/deck-style.js";
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
  it("derives a style when nothing is recorded", async () => {
    const root = await stateRoot();
    expect(await effectiveDeckStyle({ root, venture: "mma-files", slug: "oktagon-lopez", seed: "oktagon-lopez" }))
      .toBe(await effectiveDeckStyle({ root, venture: "mma-files", slug: "oktagon-lopez", seed: "oktagon-lopez" }));
  });

  it("takes the recorded choice over the derived one", async () => {
    const root = await stateRoot();
    await mkdir(path.join(root, "ventures", "carousel-studio"), { recursive: true });
    const derived = await effectiveDeckStyle({ root, venture: "caught-up", slug: "tri-laboratore", seed: "2026-08-06" });
    const chosen = derived === "mesh" ? "grid" : "mesh";
    await writeFile(
      path.join(root, "ventures", "carousel-studio", "deck-style-overrides.json"),
      JSON.stringify({
        schemaVersion: "carousel-deck-style-overrides/1",
        overrides: [{ venture: "caught-up", slug: "tri-laboratore", style: chosen, changedAt: "2026-08-06T10:00:00.000Z" }],
        updatedAt: "2026-08-06T10:00:00.000Z"
      }),
      "utf8"
    );

    expect(await effectiveDeckStyle({ root, venture: "caught-up", slug: "tri-laboratore", seed: "2026-08-06" })).toBe(chosen);
    // Another article on the same day is untouched: an override names one article.
    expect(await effectiveDeckStyle({ root, venture: "caught-up", slug: "something-else", seed: "2026-08-06" })).toBe(derived);
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
