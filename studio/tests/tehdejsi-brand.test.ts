import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS } from "../src/library.js";
import { contrastRatio } from "../src/validation.js";
import { measureEm, resolveFace } from "../src/fonts.js";

const brand = CAROUSEL_BRANDS["tehdejsi-svet"];

/** The three tokens a family may put the same text over. */
const GROUNDS = ["background", "surface", "surface-strong"] as const;

/** The tokens families actually set text in. */
const TEXT_TOKENS = ["foreground", "muted", "accent", "secondary"] as const;

describe("Tehdejsi svet brand tokens", () => {
  it("carries the product's export palette rather than a lookalike", () => {
    // The two anchors are exact. What a card and the product share is the paper and the ink.
    expect(brand.colors.background).toBe("#f7f2e8");
    expect(brand.colors.foreground).toBe("#18201d");
    expect(brand.colors.secondary).toBe("#1e3f39");
    expect(brand.name).toBe("Tehdejší svět");
    expect(brand.logoText).toBe("Tehdejší svět");
  });

  it("runs its three grounds downward from paper rather than upward from ink", () => {
    // The intuitive move on a light brand is to reach for the deep green as the strong surface.
    // It makes the darkest ground darker than the text, and every family setting muted type on a
    // panel fails at once — so the ladder is asserted, not assumed.
    const luminances = GROUNDS.map((token) => contrastRatio(brand.colors[token]!, "#000000"));
    expect(luminances[0]).toBeGreaterThan(luminances[1]!);
    expect(luminances[1]).toBeGreaterThan(luminances[2]!);
    expect(contrastRatio(brand.colors["surface-strong"]!, "#000000")).toBeGreaterThan(5);
  });

  it("clears 4.5:1 for every text token against every ground", () => {
    for (const text of TEXT_TOKENS) {
      for (const ground of GROUNDS) {
        const ratio = contrastRatio(brand.colors[text]!, brand.colors[ground]!);
        expect(ratio, `${text} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the coral recognisably coral after darkening it for text", () => {
    // The export palette's #d9684f reaches 3.1:1 on paper — fine for a two-pixel rule, not for a
    // sentence — and families here use `accent` for both, so it takes the product's own
    // coral-dark treatment. What it must not do is turn into a brown that reads as a different
    // brand: red stays the dominant channel by a clear margin.
    const [red, green, blue] = [1, 3, 5].map((index) => parseInt(brand.colors.accent!.slice(index, index + 2), 16));
    expect(red).toBeGreaterThan(green! * 1.5);
    expect(red).toBeGreaterThan(blue! * 1.5);
  });

  it("binds only faces that can set Ukrainian", () => {
    // Literata and Inter were added for this venture; IBM Plex Mono already covered Cyrillic.
    expect(brand.fonts).toEqual({ headline: "Literata", body: "Inter", mono: "IBM Plex Mono" });
    for (const family of Object.values(brand.fonts)) {
      const face = resolveFace(family, 400);
      expect(measureEm(face, "Ї"), `${family} measures Ї`).toBeGreaterThan(0);
    }
    // Proportional faces only: a monospace face setting every glyph at one width is correct, and
    // asserting variation there would fail IBM Plex Mono for doing its job.
    for (const family of [brand.fonts.headline, brand.fonts.body]) {
      const face = resolveFace(family, 400);
      expect(measureEm(face, "ґ"), `${family} varies`).not.toBe(measureEm(face, "щ"));
    }
  });

  it("follows the light ladder BOOKSOFHISTORY already established rather than inventing one", () => {
    // Two of the eight brands are light. Both run their three grounds downward from paper, and
    // both keep the darkest of them well clear of the text tokens — which is the property that
    // makes a shared family work on a light skin at all.
    const light = Object.values(CAROUSEL_BRANDS)
      .filter((entry) => contrastRatio(entry.colors.background!, "#000000") > 10);
    expect(light.map((entry) => entry.id)).toEqual(["booksofhistory", "tehdejsi-svet"]);
    for (const entry of light) {
      const grounds = GROUNDS.map((token) => contrastRatio(entry.colors[token]!, "#000000"));
      expect(grounds[0], `${entry.id} background`).toBeGreaterThan(grounds[1]!);
      expect(grounds[1], `${entry.id} surface`).toBeGreaterThan(grounds[2]!);
    }
  });
});
