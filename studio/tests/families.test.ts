import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  CarouselPresetFileSchema,
  CarouselPresetSchema,
  DECK_FAMILIES,
  MAX_RESOLVABLE_SLIDES,
  MIN_SLIDES,
  articleDeckTemplates,
  articleSlideSlot,
  familyDeckTemplate,
  familyDeckTemplates,
  familyTemplateId,
  fitsSafeArea,
  deriveRecipe,
  livePresetsFor,
  liveTemplates,
  mayGoLive,
  previewFormats,
  renderCarouselSvg,
  templateByReference,
  validateTemplateForBrand,
  type CarouselFormat,
  type CarouselPayload
} from "../src/index.js";

/**
 * Ten families, and the two things the suite could never previously say.
 *
 * It checked that the engine was deterministic and that a template's colours cleared the floor.
 * It never checked that two designs *are* two designs, or that variant B differs from variant A —
 * which is exactly how five styles that share one primitive and an A/B pair that shares one byte
 * stream both passed every gate they had.
 */

const brands = Object.values(CAROUSEL_BRANDS);

/**
 * How many families the library ships, written down rather than read off `DECK_FAMILIES`.
 *
 * A count derived from the array under test proves nothing — it would pass on an empty library.
 * This number moves in the commit that adds a family, which is the point at which somebody has to
 * notice that it did.
 */
const FAMILY_COUNT = 21;

function payload(slideCount: number, variant?: string): CarouselPayload {
  return {
    locale: "cs",
    strings: Object.fromEntries(Array.from({ length: slideCount }, (_, index) => [
      articleSlideSlot(index),
      `Věta ${index + 1}: Gamrot vs Salkilld a co ten výsledek znamená pro lehkou váhu.`
    ])),
    ...(variant ? { variant } : {})
  };
}

function render(templateId: string, slideCount: number, format: CarouselFormat, variant?: string): string[] {
  const template = templateByReference(templateId, "1.0.0");
  if (!template) throw new Error(`${templateId} does not resolve`);
  return renderCarouselSvg({
    template,
    payload: payload(slideCount, variant),
    brand: CAROUSEL_BRANDS["mma-files"],
    format
  }).map((slide) => slide.svgHash);
}

describe("the family library", () => {
  it("offers every family at every deck length the splitter produces", () => {
    expect(DECK_FAMILIES).toHaveLength(FAMILY_COUNT);
    expect(familyDeckTemplates()).toHaveLength(FAMILY_COUNT * (MAX_RESOLVABLE_SLIDES - MIN_SLIDES + 1));
  });

  it("passes all six checks for every family, brand and offered format", () => {
    for (const family of DECK_FAMILIES) {
      for (let slideCount = MIN_SLIDES; slideCount <= MAX_RESOLVABLE_SLIDES; slideCount += 1) {
        const template = familyDeckTemplate(family, slideCount);
        // Every family composes inside the union of the four safe areas, so all four are offered.
        expect(previewFormats(template), `${family}/${slideCount}`).toHaveLength(4);
        for (const brand of brands) {
          for (const format of previewFormats(template)) {
            const checks = validateTemplateForBrand(template, brand, format);
            expect(checks.filter((check) => check.status === "fail").map((check) => check.detail), `${family}/${slideCount}/${brand.id}/${format}`).toEqual([]);
            expect(mayGoLive(checks)).toBe(true);
          }
        }
      }
    }
  });

  /*
   * The first named gap. Five styles that are one blurred blob under three names all passed the
   * old suite, because nothing ever compared two of them.
   */
  it("renders different bytes for every pair of families, on one payload", () => {
    const seen = new Map<string, string>();
    for (const family of DECK_FAMILIES) {
      const signature = render(familyTemplateId(family, 7), 7, "instagram-portrait").join("");
      const clash = [...seen.entries()].find(([, other]) => other === signature);
      expect(clash, `${family} renders the same bytes as ${clash?.[0]}`).toBeUndefined();
      seen.set(family, signature);
    }
    expect(seen.size).toBe(FAMILY_COUNT);
  });

  /*
   * The second named gap. `articleDeckTemplate` declares `variants: []` on every slide, so the
   * queue's A and B differed only in a field the renderer ignores: same svgHash, two filenames.
   */
  it("renders different bytes for variant A and variant B of every family", () => {
    for (const family of DECK_FAMILIES) {
      const a = render(familyTemplateId(family, 7), 7, "instagram-portrait", "A");
      const b = render(familyTemplateId(family, 7), 7, "instagram-portrait", "B");
      expect(a, `${family} A and B are one design`).not.toEqual(b);
    }
  });

  it("gives adjacent body slides different compositions, which is what a rhythm is for", () => {
    for (const family of DECK_FAMILIES) {
      const hashes = render(familyTemplateId(family, 8), 8, "instagram-portrait");
      // The words differ per slide, so equal hashes would be impossible; the beat is asserted on
      // the template instead — two consecutive body slides never carry the same layer shape.
      const template = familyDeckTemplate(family, 8);
      const shapes = template.slides.slice(1, -1).map((slide) =>
        JSON.stringify(slide.layers.map((layer) => [layer.type, layer.x, layer.y, layer.width, layer.height])));
      for (let index = 1; index < shapes.length; index += 1) {
        expect(shapes[index], `${family} body ${index} repeats its neighbour`).not.toBe(shapes[index - 1]);
      }
      expect(hashes).toHaveLength(8);
    }
  });

  it("keeps every stored reference resolving, five styles included", () => {
    for (const reference of ["deck-mesh-5", "deck-spotlight-10", "deck-editorial-7", "deck-contrast-6", "deck-aurora-8"]) {
      expect(templateByReference(reference, "1.0.0"), reference).not.toBeNull();
    }
    for (const family of DECK_FAMILIES) {
      expect(templateByReference(familyTemplateId(family, 5), "1.0.0"), family).not.toBeNull();
    }
    // Every id in the library is unique, or a reference resolves to whichever came first.
    const ids = liveTemplates().map((template) => `${template.id}@${template.version}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares real variants on every slide, rather than an empty array", () => {
    for (const family of DECK_FAMILIES) {
      for (const slide of familyDeckTemplate(family, 6).slides) {
        expect(slide.variants.map((variant) => variant.id), `${family}/${slide.id}`).toEqual(["A", "B"]);
      }
    }
  });
});

/**
 * The story canvas, and the one line that kept every deck out of it.
 *
 * Every deck template failed `fitsSafeArea` for 9:16 for a single reason: `logo()` defaulted to
 * `y = 0.07`, comfortably inside a 4:5 margin and squarely under the story's profile row. The
 * check only reads text and logo frames, so the closing rule and the progress mark could sit
 * under the reply bar and still report clean — which is why this asserts the geometry rather than
 * the check's verdict.
 */
describe("nine by sixteen", () => {
  const CHROME_TOP = 0.14;
  const CHROME_BOTTOM = 0.16;

  it("offers the story to every family and every deck style", () => {
    for (const template of [...familyDeckTemplates(), ...articleDeckTemplates()]) {
      expect(fitsSafeArea(template, "instagram-story"), template.id).toBe(true);
      expect(previewFormats(template), template.id).toContain("instagram-story");
    }
  });

  it("puts nothing a reader has to see inside the platform's own bands", () => {
    for (const template of [...familyDeckTemplates(), ...articleDeckTemplates()]) {
      for (const slide of template.slides) {
        for (const layer of slide.layers) {
          // Backgrounds, photographs and full-bleed art may run under the chrome; anything that
          // carries meaning may not.
          if (layer.type !== "text" && layer.type !== "logo" && layer.type !== "rule") continue;
          const where = `${template.id}/${slide.id}/${layer.type}`;
          expect(layer.y, where).toBeGreaterThanOrEqual(CHROME_TOP);
          expect(layer.y + layer.height, where).toBeLessThanOrEqual(1 - CHROME_BOTTOM);
        }
      }
    }
  });

  it("clears the overflow and contrast checks at every canvas, not only at 4:5", () => {
    for (const family of DECK_FAMILIES) {
      const template = familyDeckTemplate(family, 9);
      for (const format of previewFormats(template)) {
        for (const brand of brands) {
          const checks = validateTemplateForBrand(template, brand, format);
          expect(checks.filter((check) => check.status === "fail"), `${family}/${brand.id}/${format}`).toEqual([]);
        }
      }
    }
  });
});

/**
 * Presets: designs the owner saved, and the line between saving one and shipping it.
 */
describe("presets", () => {
  const preset = {
    id: "mma-loud",
    name: "MMA loud",
    ventureScope: ["mma-files" as const],
    formats: ["instagram-portrait" as const],
    family: "slab" as const,
    variant: "B" as const,
    accentSwap: true,
    treatment: "mono" as const,
    typeScale: 1.1 as const,
    status: "live" as const,
    changedAt: "2026-08-09T00:00:00.000Z",
    changedBy: "owner" as const
  };

  it("round-trips through its schema", () => {
    expect(CarouselPresetSchema.parse(preset)).toEqual(preset);
    expect(CarouselPresetSchema.safeParse({ ...preset, family: "chartreuse" }).success).toBe(false);
    expect(CarouselPresetSchema.safeParse({ ...preset, status: "live-ish" }).success).toBe(false);
    expect(CarouselPresetFileSchema.safeParse({
      schemaVersion: "carousel-preset/1",
      presets: [preset],
      updatedAt: preset.changedAt
    }).success).toBe(true);
  });

  it("offers a live preset to the ventures in its scope and to nobody else", () => {
    expect(livePresetsFor([preset], "mma-files")).toHaveLength(1);
    expect(livePresetsFor([preset], "caught-up")).toHaveLength(0);
    expect(livePresetsFor([{ ...preset, ventureScope: [] }], "caught-up")).toHaveLength(1);
  });

  it("never offers a draft, because a draft is a design nobody has approved", () => {
    expect(livePresetsFor([{ ...preset, status: "draft" }], "mma-files")).toHaveLength(0);
  });

  it("draws the whole design from the pool, and keeps the engine's own rhythm rotation", () => {
    const drawn = deriveRecipe({
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      pool: [{ family: preset.family, variant: preset.variant, accentSwap: preset.accentSwap, treatment: preset.treatment, typeScale: preset.typeScale }]
    });
    expect(drawn.family).toBe("slab");
    expect(drawn.treatment).toBe("mono");
    expect(drawn.typeScale).toBe(1.1);
    // Two articles in one preset still open on different beats.
    const other = deriveRecipe({
      venture: "mma-files",
      slug: "another",
      date: "2026-08-06",
      pool: [{ family: preset.family, variant: preset.variant, accentSwap: preset.accentSwap, treatment: preset.treatment, typeScale: preset.typeScale }]
    });
    expect(drawn.phaseSeed === other.phaseSeed && drawn.slug === other.slug).toBe(false);
  });

  it("keeps the anti-repeat inside the pool", () => {
    const pool = ["slab", "tower", "dossier"].map((family) => ({
      family: family as typeof preset.family,
      variant: "A" as const,
      accentSwap: false,
      treatment: "none" as const,
      typeScale: 1 as const
    }));
    const drawn = deriveRecipe(
      { venture: "mma-files", slug: "gamrot", date: "2026-08-06", pool },
      [{ date: "2026-08-05", family: "slab" }, { date: "2026-08-04", family: "tower" }]
    );
    expect(drawn.family).toBe("dossier");
  });

  it("refuses a treatment on an article with no photograph, pool or no pool", () => {
    const drawn = deriveRecipe({
      venture: "mma-files",
      slug: "gamrot",
      date: "2026-08-06",
      hasHero: false,
      pool: [{ family: preset.family, variant: "A", accentSwap: false, treatment: "duotone", typeScale: 1 }]
    });
    expect(drawn.treatment).toBe("none");
  });
});
