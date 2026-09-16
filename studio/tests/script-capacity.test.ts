import { describe, expect, it } from "vitest";
import { FONT_METRICS } from "../src/font-metrics.generated.js";
import { averageAdvance, capacityAverage, resolveFace } from "../src/fonts.js";
import { CAROUSEL_BRANDS } from "../src/library.js";
import { LATIN_LETTERS, lettersFor, primaryLocaleFor, publishingLocalesFor } from "../src/locales.js";
import { CAROUSEL_SUMMARY_VENTURES, localeForCarouselVenture } from "../src/summary.js";
import { charactersPerLine, fitText } from "../src/text.js";
import { tehdejsiDeckTemplate, tehdejsiUaSlot } from "../src/families-tehdejsi.js";
import { validateTemplateForBrand } from "../src/validation.js";
import { PUBLISHING_LOCALES, type PublishingLocale } from "../src/schema.js";

/**
 * Capacity arithmetic, and the language it was quietly charging everything at.
 *
 * `charactersPerLine` answers "could this slot's declared limit fit at its minimum size", and it
 * has no string to measure — so it charges the face's mean letter advance. That mean was taken
 * over `a-zA-Z` alone, which made it the Latin mean for every language the engine sets. Literata
 * sets Cyrillic about eight per cent wider than Latin, so the bilingual card's Ukrainian slots
 * were told they hold about a dozen characters they cannot.
 */

type TextLayer = Extract<
  ReturnType<typeof tehdejsiDeckTemplate>["slides"][number]["layers"][number],
  { type: "text" }
>;

const faces = Object.entries(FONT_METRICS);
const tehdejsi = CAROUSEL_BRANDS["tehdejsi-svet"];

describe("the runtime average and the generated one", () => {
  it.each(faces)("%s reproduces its committed average over the Latin sample", (_key, face) => {
    // `scripts/generate-font-metrics.ts` computes `average` this way. Two arithmetics for one
    // number is one arithmetic too many, and this equality is what stops them drifting.
    expect(averageAdvance(face, LATIN_LETTERS)).toBe(face.average);
  });

  it("never charges less than the Latin mean, whatever the language", () => {
    // Czech measures marginally narrower than ASCII in every committed face, because its accented
    // letters are the narrow vowels. Charging that lower mean would widen every Czech slot's
    // declared limit — a loosened gate wearing the clothes of a more precise one.
    for (const [key, face] of faces) {
      for (const locale of PUBLISHING_LOCALES) {
        expect(capacityAverage(face, locale), `${key}/${locale}`).toBeGreaterThanOrEqual(face.average);
      }
    }
  });
});

describe("a Cyrillic line costs more per character than a Latin one", () => {
  it.each(["Literata", "Inter"])("%s charges Cyrillic more than Latin", (family) => {
    const face = resolveFace(family, 400);
    expect(averageAdvance(face, lettersFor("uk"))).toBeGreaterThan(averageAdvance(face, lettersFor("en")));
    expect(capacityAverage(face, "uk")).toBeGreaterThan(capacityAverage(face, "cs"));
  });

  it("charges a monospace face the same for either script, because it is monospaced", () => {
    const face = resolveFace("IBM Plex Mono", 400);
    expect(averageAdvance(face, lettersFor("uk"))).toBe(averageAdvance(face, lettersFor("en")));
  });

  it("fits fewer Cyrillic characters on one line of the same frame", () => {
    const frame = { widthPx: 918, fontSize: 32, family: "Literata", weight: 400 };
    expect(charactersPerLine({ ...frame, locale: "uk" })).toBeLessThan(charactersPerLine({ ...frame, locale: "cs" }));
    // No language named is the Latin mean, which is what every slot was charged before this.
    expect(charactersPerLine(frame)).toBe(charactersPerLine({ ...frame, locale: "en" }));
  });
});

describe("the overflow check reads the slot's own language", () => {
  /** The Ukrainian band of slide one, as composed. */
  function slotOf(template: ReturnType<typeof tehdejsiDeckTemplate>): TextLayer {
    return template.slides[0]!.layers.find(
      (layer): layer is TextLayer => layer.type === "text" && layer.slot === tehdejsiUaSlot(0)
    )!;
  }

  function capacity(layer: TextLayer, locale: PublishingLocale): number {
    return charactersPerLine({
      widthPx: layer.width * 1_080,
      fontSize: layer.minFontSize,
      family: tehdejsi.fonts[layer.fontToken],
      weight: layer.fontWeight,
      tracking: layer.tracking,
      locale
    }) * layer.maxLines;
  }

  /**
   * The bilingual deck with slide one's Ukrainian band promising the most Czech would allow.
   *
   * That limit is exactly what the slot was measured against before the language reached the
   * arithmetic, so a template built this way passed the overflow check and overflowed the frame.
   */
  function atCzechLimit(lang: PublishingLocale) {
    const template = structuredClone(tehdejsiDeckTemplate(3));
    const layer = slotOf(template);
    layer.maxChars = capacity(layer, "cs");
    layer.lang = lang;
    return { template, layer };
  }

  function overflow(template: ReturnType<typeof tehdejsiDeckTemplate>) {
    return validateTemplateForBrand(template, tehdejsi, "instagram-portrait")
      .find((check) => check.id === "overflow")!;
  }

  it("declares Ukrainian on the second band of every bilingual slide", () => {
    for (const [index, slide] of tehdejsiDeckTemplate(3).slides.entries()) {
      const declared = slide.layers
        .filter((layer): layer is TextLayer => layer.type === "text")
        .filter((layer) => layer.slot === tehdejsiUaSlot(index))
        .map((layer) => layer.lang);
      expect(declared, `slide ${index + 1}`).toEqual(["uk"]);
    }
  });

  it("fails a limit that only a Latin measurement would have allowed", () => {
    const { template, layer } = atCzechLimit("uk");
    expect(capacity(layer, "uk")).toBeLessThan(layer.maxChars);
    const check = overflow(template);
    expect(check.status).toBe("fail");
    expect(check.detail).toContain(`${template.slides[0]!.id}:${layer.slot} (uk)`);
  });

  it("accepts the same limit once the slot is set in Czech", () => {
    expect(overflow(atCzechLimit("cs").template).status).toBe("pass");
  });
});

describe("a slot may not be set in a language its brand does not publish", () => {
  function script(brandId: keyof typeof CAROUSEL_BRANDS) {
    const checks = validateTemplateForBrand(tehdejsiDeckTemplate(3), CAROUSEL_BRANDS[brandId], "instagram-portrait");
    return checks.find((check) => check.id === "script")!;
  }

  it("passes for the brand whose faces were required to cover Cyrillic", () => {
    expect(script("tehdejsi-svet").status).toBe("pass");
  });

  it("fails for a Czech-only brand, whose faces draw a box there", () => {
    // Archivo has no Cyrillic and nothing ever required it to. The bilingual layout rendered in
    // this brand passed every other check and drew squares where the Ukrainian line should be.
    const check = script("caught-up");
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("uk");
  });
});

describe("the worst real lines fit the bands they are set in", () => {
  const cover = (value: string, locale: PublishingLocale) => fitText({
    value,
    locale: locale === "uk" ? "cs" : locale,
    widthPx: 0.85 * 1_080,
    heightPx: 0.26 * 1_350,
    minFontSize: 40,
    maxFontSize: 78,
    maxLines: 4,
    maxChars: 110,
    fontFamily: tehdejsi.fonts.headline,
    fontWeight: 700
  });

  it("sets the longest Czech compound whole, at a smaller size", () => {
    const fitted = cover("NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ POZEMEK V ZEMI", "cs");
    expect(fitted.brokenWords).toEqual([]);
    expect(fitted.truncated).toBe(false);
    expect(fitted.fontSize).toBeLessThan(78);
  });

  it("sets a long Ukrainian headline whole", () => {
    const fitted = cover("Кілька хвилин перед сном у Києві вісімдесят третього", "uk");
    expect(fitted.brokenWords).toEqual([]);
    expect(fitted.truncated).toBe(false);
  });
});

describe("one declaration of what a venture publishes in", () => {
  it("answers the summary locale from the brand's own primary", () => {
    for (const venture of CAROUSEL_SUMMARY_VENTURES) {
      expect(localeForCarouselVenture(venture), venture).toBe(primaryLocaleFor(venture));
    }
  });

  it("gives every brand a primary and no duplicate languages", () => {
    for (const brand of Object.keys(CAROUSEL_BRANDS) as Array<keyof typeof CAROUSEL_BRANDS>) {
      const locales = publishingLocalesFor(brand);
      expect(locales.length, brand).toBeGreaterThanOrEqual(1);
      expect(new Set(locales).size, brand).toBe(locales.length);
    }
  });
});
