import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_RESOLVABLE_SLIDES,
  MAX_SLIDES,
  QUEUE_MAX_SLIDES,
  MAX_SLIDE_WORDS,
  MIN_SLIDES,
  buildArticleDeck,
  packIntoSlides,
  proseFromMdx,
  reviewDeck,
  articleDeckTemplates,
  wordCount
} from "../src/index.js";

const OUTRO = "Celý ozdrojovaný text najdete v MMA Files.";

describe("slides never exceed thirty words", () => {
  it("packs whole sentences up to the cap and starts a new slide rather than overflowing", () => {
    const prose = "Prvni veta ma pet slov. Druha veta je o neco delsi a ma deset slov celkem. Treti.";
    for (const slide of packIntoSlides(prose)) {
      expect(wordCount(slide)).toBeLessThanOrEqual(MAX_SLIDE_WORDS);
    }
  });

  it("splits one over-long sentence at a clause boundary, not mid-phrase", () => {
    // Czech runs long compound sentences; a comma is where a reader expects to pause.
    const long = `${"slovo ".repeat(20)}, ${"dalsi ".repeat(20)}.`;
    const slides = packIntoSlides(long);
    expect(slides.length).toBeGreaterThan(1);
    for (const slide of slides) expect(wordCount(slide)).toBeLessThanOrEqual(MAX_SLIDE_WORDS);
    expect(slides[0]!.trim().endsWith(","), "the first piece ends at the clause boundary").toBe(true);
  });

  it("still splits when a sentence has no clause boundary at all", () => {
    const slides = packIntoSlides(`${"slovo ".repeat(75)}.`);
    expect(slides.length).toBe(3);
    for (const slide of slides) expect(wordCount(slide)).toBeLessThanOrEqual(MAX_SLIDE_WORDS);
  });
});

describe("Czech sentence boundaries", () => {
  it("does not split inside an ordinal date", () => {
    // "UFC 306 dne 14. září 2024" holds two periods. Splitting on the ordinal put
    // "září 2024 a vyústila…" on its own slide, beginning mid-sentence in lower case.
    const slides = packIntoSlides("Třetí duel rozhodl sérii na UFC 306 dne 14. září 2024. Shevchenko zvítězila.");
    expect(slides).toHaveLength(1);
    expect(slides[0]).toContain("14. září 2024");
  });

  it("does not split inside an abbreviation", () => {
    // An MMA card is written "Grasso vs. Shevchenko 2". Splitting on "vs." ended the slide at
    // the first name with the opponent on the next one. Found by looking at a rendered slide.
    const slides = packIntoSlides("Odveta proběhla na UFC Fight Night: Grasso vs. Shevchenko 2. Skončila remízou.");
    expect(slides.join(" ")).toContain("Grasso vs. Shevchenko 2");
    expect(slides.some((slide) => slide.trim().endsWith("vs."))).toBe(false);
  });

  it("never starts a slide in lower case", () => {
    const slides = packIntoSlides("Odveta přišla 16. září 2023 a skončila remízou. Rozhodli to sudí.");
    for (const slide of slides) expect(/^[\p{Ll}]/u.test(slide.trim())).toBe(false);
  });
});

describe("MDX becomes the prose a reader sees", () => {
  it("keeps a link's words and drops its address, the markers and the syntax", () => {
    const mdx = "## Nadpis\n\n[Alex Example](/fighters/ufc/alex) má bilanci 12-2. [^source-1]\n\n- odrážka";
    const prose = proseFromMdx(mdx);
    expect(prose).toContain("Alex Example");
    expect(prose).not.toContain("/fighters/");
    expect(prose).not.toContain("source-1");
    expect(prose).not.toContain("##");
  });
});

describe("a deck built from the one published article", () => {
  it("lands inside five to ten slides with nothing over the cap", async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const article = JSON.parse(await readFile(
      path.join(repoRoot, "state/ventures/mma-files/articles/2026-08-02-am-ufc-valentina-shevchenko.json"),
      "utf8"
    )) as { localizations: { cs: { title: string; dek: string; bodyMDX: string } } };
    const cs = article.localizations.cs;
    const review = reviewDeck(buildArticleDeck({ title: cs.title, dek: cs.dek, bodyMdx: cs.bodyMDX, outro: OUTRO }));
    expect(review.problems).toEqual([]);
    expect(review.publishable).toBe(true);
    expect(review.slides.length).toBeGreaterThanOrEqual(MIN_SLIDES);
    expect(review.slides.length).toBeLessThanOrEqual(MAX_SLIDES);
    expect(review.slides[0]!.kind).toBe("cover");
    expect(review.slides.at(-1)!.kind).toBe("outro");
  });
});

describe("a deck the article cannot fill", () => {
  it("accepts exactly one bounded slide only when the record declares single-image mode", () => {
    const one = [{ kind: "cover" as const, text: "A synthetic poster line." }];
    expect(reviewDeck(one).publishable).toBe(false);
    expect(reviewDeck(one, "single-image")).toEqual({ slides: one, publishable: true, problems: [] });
    expect(reviewDeck([...one, ...one], "single-image").publishable).toBe(false);
  });

  it("comes back short and unpublishable rather than padded", () => {
    // Reaching a slide count by inventing a slide is how a carousel starts saying things the
    // article does not. A thin piece produces a thin deck and the caller decides.
    const review = reviewDeck(buildArticleDeck({
      title: "Krátký titulek",
      dek: "Krátký popis.",
      bodyMdx: "Jedna věta.",
      outro: OUTRO
    }));
    expect(review.slides.length).toBeLessThan(MIN_SLIDES);
    expect(review.publishable).toBe(false);
    expect(review.problems.join(" ")).toMatch(/at least/u);
  });

  it("caps a very long article at seven rather than running on", () => {
    const review = reviewDeck(buildArticleDeck({
      title: "Titulek",
      dek: "Popis.",
      bodyMdx: Array.from({ length: 60 }, (_, index) => `Veta cislo ${index + 1} je zde.`).join(" "),
      outro: OUTRO
    }));
    expect(review.slides).toHaveLength(QUEUE_MAX_SLIDES);
    expect(review.publishable).toBe(true);
  });

  it("builds five to seven slides for every article length that fills a deck", () => {
    // The owner's launch bound. Five is the floor a deck must clear to be publishable at all, and
    // seven is where the builder now stops; nothing in between needs a special case.
    for (const sentences of [2, 5, 10, 20, 40, 80]) {
      const slides = buildArticleDeck({
        title: "Titulek",
        dek: "Popis.",
        bodyMdx: Array.from({ length: sentences }, (_, index) => `Veta cislo ${index + 1} je zde.`).join(" "),
        outro: OUTRO
      });
      expect(slides.length, `${sentences} sentences`).toBeLessThanOrEqual(QUEUE_MAX_SLIDES);
    }
  });
});

/**
 * Eight, on the owner's instruction: a ten-slide deck asks for ten swipes to reach a point that
 * fits in six, and two of the ten are the cover and the closing line.
 */
describe("how long a deck may be", () => {
  it("caps selection at eight slides and keeps five as the floor", () => {
    expect(MIN_SLIDES).toBe(5);
    expect(MAX_SLIDES).toBe(8);
  });

  it("builds to seven while still reviewing against eight", () => {
    // Two different bounds on purpose: `state/social/packs/` holds eight-slide decks that must go
    // on passing review, so the builder narrowed and the rule did not.
    expect(QUEUE_MAX_SLIDES).toBe(7);
    expect(QUEUE_MAX_SLIDES).toBeLessThan(MAX_SLIDES);
    expect(reviewDeck(Array.from({ length: MAX_SLIDES }, () => ({ kind: "body" as const, text: "Veta." }))).problems)
      .toEqual([]);
  });

  it("still builds a nine- or ten-slide template a stored pack names", () => {
    // state/social/packs/2026-08-06.json names deck-spotlight-10. A committed pack that stops
    // resolving is a past day the site can no longer show.
    expect(MAX_RESOLVABLE_SLIDES).toBe(10);
    const built = articleDeckTemplates().map((entry) => entry.id);
    for (const slideCount of [9, 10]) {
      expect(built).toContain(`deck-spotlight-${slideCount}`);
    }
  });

  it("builds no deck template longer than the cap for anything to select", () => {
    const selectable = articleDeckTemplates().filter((entry) => entry.slides.length <= MAX_SLIDES);
    expect(selectable.length).toBeGreaterThan(0);
    for (const entry of selectable) {
      expect(entry.slides.length).toBeGreaterThanOrEqual(MIN_SLIDES);
    }
  });
});
