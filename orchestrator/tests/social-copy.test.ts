import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MissingCreditError,
  SocialCopyPackSchema,
  completeHashtags,
  derivedCopyPack,
  deskCopyPack,
  renderCaption,
  renderCaptionFile
} from "@boardlessai/carousel-studio";
import { articleCopyPack, socialCopyPath, storeSocialCopyPack } from "../src/studio/social-copy-store.js";
import { storeArticleCarouselSummary } from "../src/studio/carousel-summary-store.js";
import { effectiveRecipe } from "../src/social/deck-style.js";
import { writeDeckReceipt } from "../src/social/deck-receipt.js";
import type { ArticlePackage } from "../src/contracts/mma-files.js";

/**
 * The words that travel with a deck.
 *
 * They existed only as a concatenation performed inside the queue path, so the Lab had a deck and
 * no caption and an export was impossible. Now the desk writes them in the same call that writes
 * the article — the `altHeadline` precedent, no new paid call site — and the pipeline records
 * them beside the summary.
 */

const CREDIT = "Tech. Sgt. Katie Gar Ward · CC0 · Wikimedia Commons";

function article(overrides: Record<string, unknown> = {}): ArticlePackage {
  return {
    schemaVersion: "article/1",
    slug: "ufc-valentina-shevchenko",
    localizations: {
      cs: {
        title: "Trilogie, kterou nikdo nechtěl",
        dek: "Tři zápasy, tři výsledky a jedna otázka, na kterou zatím nikdo neodpověděl.",
        bodyMDX: "Text.",
        imageAlt: "Ilustrační obrázek k článku",
        ...overrides
      }
    },
    format: "fighter-profile",
    sources: [{ kind: "internal", ref: "state/mma/fighters/ufc:valentina-shevchenko.json" }],
    image: { license: { attribution_html: `<a href="#">${CREDIT}</a>` } },
    heroSpec: { template: "frame", bindings: {} },
    fighterRefs: ["ufc:valentina-shevchenko"],
    publishAt: "2026-08-02T06:00:00.000Z",
    slot: "am",
    status: "published",
    packageHash: "0".repeat(64)
  } as unknown as ArticlePackage;
}

describe("the licence credit", () => {
  it("is appended by code, never asked of the model", () => {
    expect(renderCaption("Tři zápasy, tři výsledky.", CREDIT)).toBe(`Tři zápasy, tři výsledky.\n\n${CREDIT}`);
  });

  it("is not doubled when the caption already carries it", () => {
    const once = renderCaption("Věta.", CREDIT);
    expect(renderCaption(once, CREDIT)).toBe(once);
  });

  it("is absent, honestly, when the article carries no photograph", () => {
    expect(renderCaption("Věta.", null)).toBe("Věta.");
  });

  it("cannot be skipped by handing over an empty one", () => {
    expect(() => renderCaption("Věta.", "   ")).toThrow(MissingCreditError);
  });

  it("ends the caption file, after the hashtags are counted", () => {
    const pack = derivedCopyPack({
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      headline: "Gamrot vs Salkilld",
      standfirst: "Co ten výsledek znamená pro lehkou váhu.",
      closing: "Celý ozdrojovaný text najdete v MMA Files.",
      heroCredit: CREDIT
    });
    const file = renderCaptionFile(pack);
    expect(file).toContain(CREDIT);
    expect(file.trimEnd().endsWith("#mmafiles")).toBe(true);
  });
});

describe("hashtags", () => {
  it("folds diacritics away, because Instagram matches a tag with one as a different tag", () => {
    expect(completeHashtags("mma-files", ["Bojové Sporty", "těžká váha"])).toContain("bojovesporty");
    expect(completeHashtags("mma-files", ["těžká váha"])).toContain("tezkavaha");
  });

  it("fills the venture's base set out and stops at ten", () => {
    const tags = completeHashtags("caught-up", ["openai", "regulace", "eu"]);
    expect(tags).toContain("dneskai");
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(tags.length).toBeLessThanOrEqual(10);
  });

  it("never repeats one", () => {
    const tags = completeHashtags("mma-files", ["mma", "mma", "ufc"]);
    expect(new Set(tags).size).toBe(tags.length);
  });
});

describe("bounds", () => {
  const long = "x".repeat(900);

  it("clips the desk's copy to what each surface can hold", () => {
    const pack = deskCopyPack({
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      copy: { igCaption: long, hashtags: ["mma"], threadsText: long, storyLine: long },
      heroCredit: null
    });
    expect(pack.copy.igCaption).toHaveLength(500);
    expect(pack.copy.threadsText).toHaveLength(480);
    expect(pack.copy.storyLine).toHaveLength(66);
  });

  it("refuses a pack that claims fewer than five hashtags", () => {
    expect(SocialCopyPackSchema.safeParse({
      schemaVersion: "social-copy/1",
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      locale: "cs",
      copy: { igCaption: "Věta.", hashtags: ["mma"], threadsText: "Věta.", storyLine: "Věta." },
      heroCredit: null,
      origin: "desk"
    }).success).toBe(false);
  });
});

describe("an article's copy pack", () => {
  it("uses the desk's words when the desk wrote them", () => {
    const pack = articleCopyPack(article({
      igCaption: "Tři zápasy, tři výsledky.",
      hashtags: ["shevchenko", "flyweight"],
      threadsText: "Tři zápasy, tři výsledky. A jedna otázka.",
      storyLine: "Trilogie, kterou nikdo nechtěl"
    }))!;
    expect(pack.origin).toBe("desk");
    expect(pack.copy.igCaption).toBe("Tři zápasy, tři výsledky.");
    expect(pack.copy.hashtags).toContain("shevchenko");
    expect(pack.heroCredit).toBe(CREDIT);
  });

  it("falls back to the old concatenation for an article written before the fields existed", () => {
    const pack = articleCopyPack(article())!;
    expect(pack.origin).toBe("derived");
    expect(pack.copy.igCaption).toContain("Tři zápasy");
    expect(renderCaption(pack.copy.igCaption, pack.heroCredit)).toContain(CREDIT);
  });

  it("records where the Lab and the composer both look for it", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "social-copy-"));
    const pack = articleCopyPack(article())!;
    const stored = await storeSocialCopyPack(root, pack);
    expect(stored.path).toBe(socialCopyPath(pack));
    expect(stored.path).toBe("ventures/carousel-studio/social-copy/mma-files/2026-08-02-ufc-valentina-shevchenko.json");
    expect(JSON.parse(await readFile(path.join(root, stored.path), "utf8"))).toMatchObject({
      schemaVersion: "social-copy/1",
      venture: "mma-files"
    });
  });
});

/**
 * Delivery records inventory: a summary, a recipe and a copy pack, side by side.
 *
 * None of it needs a channel to be enabled and none of it posts. What it buys is that "what does
 * this article's social set look like" has one recorded answer, so the Lab reads it now and the
 * composer consumes it when channels open rather than deriving a design of its own hours later.
 */
describe("what a delivery records beside the package", () => {
  it("writes the summary, the recipe and the copy in one pass", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "delivery-inventory-"));
    const stored = (await storeArticleCarouselSummary(root, article({
      bodyMDX: Array.from({ length: 8 }, (_, index) => `Věta číslo ${index + 1} ${"slovo ".repeat(23)}konec.`).join(" ")
    })))!;

    expect(stored.path).toContain("summaries/mma-files/");
    expect(stored.recipePath).toBe("ventures/carousel-studio/recipes/mma-files/2026-08-02-ufc-valentina-shevchenko.json");
    expect(stored.copyPath).toBe("ventures/carousel-studio/social-copy/mma-files/2026-08-02-ufc-valentina-shevchenko.json");
    for (const relative of [stored.path, stored.recipePath, stored.copyPath!]) {
      expect(JSON.parse(await readFile(path.join(root, relative), "utf8"))).toBeTruthy();
    }
    const recorded = JSON.parse(await readFile(path.join(root, stored.recipePath), "utf8")) as Record<string, unknown>;
    expect(recorded.schemaVersion).toBe("carousel-recipe/1");
    // A reference, not a second copy: two copies of a caption become two captions the moment one
    // of them is corrected.
    expect(recorded.copyRef).toBe(stored.copyPath);
    expect(recorded.summaryRef).toBe(stored.path);
  });

  it("hands the composer the recorded recipe rather than a freshly derived one", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "delivery-inventory-"));
    const stored = (await storeArticleCarouselSummary(root, article({
      bodyMDX: Array.from({ length: 8 }, (_, index) => `Věta číslo ${index + 1} ${"slovo ".repeat(23)}konec.`).join(" ")
    })))!;
    // A receipt added after delivery moves what a fresh derivation would choose; the record does
    // not move, which is the whole reason composition reads it.
    await writeDeckReceipt({
      root,
      venture: "mma-files",
      date: "2026-08-03",
      slug: "later",
      templateId: "deck-tower-7",
      style: "tower",
      recipe: { family: "tower" },
      slideCount: 7,
      hashes: ["a"]
    });
    const composed = await effectiveRecipe({
      root,
      venture: "mma-files",
      slug: "ufc-valentina-shevchenko",
      date: "2026-08-02"
    });
    expect(composed).toEqual(stored.recipe);
  });

  it("replays a delivery to the same recipe", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "delivery-inventory-"));
    const body = Array.from({ length: 8 }, (_, index) => `Věta číslo ${index + 1} ${"slovo ".repeat(23)}konec.`).join(" ");
    const first = (await storeArticleCarouselSummary(root, article({ bodyMDX: body })))!;
    const second = (await storeArticleCarouselSummary(root, article({ bodyMDX: body })))!;
    expect(second.recipe).toEqual(first.recipe);
  });
});
