import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  DECK_FAMILIES,
  MAX_RESOLVABLE_SLIDES,
  MIN_SLIDES,
  articleSlideSlot,
  familyDeckTemplate,
  familyDeckTemplates,
  familyTemplateId,
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
  it("offers ten families at every deck length the splitter produces", () => {
    expect(DECK_FAMILIES).toHaveLength(10);
    expect(familyDeckTemplates()).toHaveLength(10 * (MAX_RESOLVABLE_SLIDES - MIN_SLIDES + 1));
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
    expect(seen.size).toBe(10);
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
