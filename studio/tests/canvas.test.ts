import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANVAS_RATIO_TOLERANCE,
  CAROUSEL_BRANDS,
  CONNECTOR_MAX_SLIDES,
  CarouselTemplateSchema,
  DECK_FAMILIES,
  INSTAGRAM_MAX_SLIDES,
  INSTAGRAM_MIN_SLIDES,
  LAUNCH_FAMILIES,
  MASTER_CANVAS,
  MASTER_FORMAT,
  MASTER_RATIO,
  MAX_RESOLVABLE_SLIDES,
  MAX_SLIDES,
  MIN_SLIDES,
  QUEUE_MAX_SLIDES,
  articleDeckTemplates,
  articleSlideSlot,
  canvasRatio,
  declaredCanvases,
  deckSlideRole,
  familyDeckTemplate,
  familyDeckTemplates,
  familyTemplateId,
  liveTemplates,
  mayGoLive,
  previewFormats,
  ratiosAgree,
  renderCarouselSvg,
  templateByReference,
  validateTemplateForBrand,
  type CarouselFormat,
  type CarouselPayload
} from "../src/index.js";

/**
 * The master canvas, and the two things it is for.
 *
 * A deck is one post and Instagram gives one post one orientation, so "which canvas is this?" has
 * to have one answer per template and a render at any other canvas has to be refused rather than
 * re-proportioned. Before this, `formats` declared four canvases for every template in the library
 * and nothing anywhere said which of them the layout was actually composed for — so 1:1 was
 * offered for every deck, including layouts that had never been looked at square.
 */

const brands = Object.values(CAROUSEL_BRANDS);

function payload(slideCount: number): CarouselPayload {
  return {
    locale: "cs",
    strings: Object.fromEntries(Array.from({ length: slideCount }, (_, index) => [
      articleSlideSlot(index),
      `Věta ${index + 1}: Gamrot vs Salkilld a co ten výsledek znamená pro lehkou váhu.`
    ]))
  };
}

describe("the master canvas", () => {
  it("is 1080 × 1350, and every generated deck is rendered at it", () => {
    expect(MASTER_FORMAT).toBe("instagram-portrait");
    expect(MASTER_CANVAS).toEqual({ width: 1_080, height: 1_350 });
    expect(MASTER_RATIO).toBe(canvasRatio(MASTER_CANVAS));
    for (const template of [...familyDeckTemplates(), ...articleDeckTemplates()]) {
      expect(template.canvas.master, template.id).toBe(MASTER_FORMAT);
      expect(canvasRatio(template.formats[template.canvas.master]), template.id).toBe(MASTER_RATIO);
    }
  });

  it("holds the master ratio at every resolvable deck length, for every family", () => {
    for (const family of DECK_FAMILIES) {
      for (let slideCount = MIN_SLIDES; slideCount <= MAX_RESOLVABLE_SLIDES; slideCount += 1) {
        const template = familyDeckTemplate(family, slideCount);
        expect(canvasRatio(template.formats["instagram-portrait"]), `${family}/${slideCount}`).toBe(MASTER_RATIO);
      }
    }
  });

  it("refuses a template whose portrait canvas is some other shape", () => {
    const template = familyDeckTemplate("rail", 5);
    const square = CarouselTemplateSchema.safeParse({
      ...template,
      formats: { ...template.formats, "instagram-portrait": { ...template.formats["instagram-portrait"], height: 1_080 } }
    });
    expect(square.success).toBe(false);
    // Meta states a one-percent tolerance, so a frame that is the same picture at another size
    // passes and a near-square does not.
    const larger = CarouselTemplateSchema.safeParse({
      ...template,
      formats: { ...template.formats, "instagram-portrait": { width: 1_440, height: 1_800, safeArea: template.formats["instagram-portrait"].safeArea } }
    });
    expect(larger.success).toBe(true);
    expect(ratiosAgree(MASTER_RATIO, MASTER_RATIO * (1 + CANVAS_RATIO_TOLERANCE / 2))).toBe(true);
    expect(ratiosAgree(MASTER_RATIO, MASTER_RATIO * 1.05)).toBe(false);
  });
});

describe("one ratio per deck", () => {
  it("offers a canvas only where the template declares it", () => {
    const template = familyDeckTemplate("folio", 6);
    expect(declaredCanvases(template)).toEqual([
      "instagram-square",
      "instagram-portrait",
      "instagram-story",
      "threads"
    ]);
    const portraitOnly = CarouselTemplateSchema.parse({ ...template, canvas: { master: "instagram-portrait", derive: [] } });
    expect(previewFormats(portraitOnly)).toEqual(["instagram-portrait"]);
  });

  it("fails the canvas check, and therefore the render, for an undeclared square", () => {
    const template = CarouselTemplateSchema.parse({
      ...familyDeckTemplate("press", 6),
      canvas: { master: "instagram-portrait", derive: ["threads"] }
    });
    const checks = validateTemplateForBrand(template, CAROUSEL_BRANDS["mma-files"], "instagram-square");
    expect(checks.find((check) => check.id === "canvas")).toMatchObject({ status: "fail" });
    expect(mayGoLive(checks)).toBe(false);
    expect(() => renderCarouselSvg({
      template,
      payload: payload(6),
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-square"
    })).toThrow(/declares no instagram-square derivation/u);
    // The same template at its own master renders exactly as it always did.
    expect(renderCarouselSvg({
      template,
      payload: payload(6),
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait"
    })).toHaveLength(6);
  });

  it("never offers two ratios that no declaration covers", () => {
    for (const template of liveTemplates()) {
      const declared = new Set(declaredCanvases(template));
      for (const format of previewFormats(template)) {
        expect(declared.has(format), `${template.id} offers undeclared ${format}`).toBe(true);
      }
    }
  });

  it("keeps the no-argument call the preview route's own enum", () => {
    // Narrowing this would demote live templates through resolveLifecycleStatus; only the
    // per-template overload is a claim about a composition.
    expect(previewFormats()).toHaveLength(4);
  });

  it("parses a document written before the field existed, and offers it its master alone", () => {
    const fixture = JSON.parse(readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "v1-article-deck.json"),
      "utf8"
    )) as Record<string, unknown>;
    expect(fixture).not.toHaveProperty("canvas");
    const parsed = CarouselTemplateSchema.parse(fixture);
    expect(parsed.canvas).toEqual({ master: "instagram-portrait", derive: [] });
    expect(previewFormats(parsed)).toEqual(["instagram-portrait"]);
    // And it still renders the slides it always rendered, at the canvas it was always rendered at.
    expect(renderCarouselSvg({
      template: parsed,
      payload: payload(parsed.slides.length),
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait"
    })).toHaveLength(parsed.slides.length);
  });

  it("refuses a derive list that repeats the master or itself", () => {
    const template = familyDeckTemplate("halo", 5);
    for (const derive of [["instagram-portrait"], ["threads", "threads"]]) {
      expect(CarouselTemplateSchema.safeParse({ ...template, canvas: { master: "instagram-portrait", derive } }).success).toBe(false);
    }
  });
});

describe("slide counts, against three different limits", () => {
  it("keeps the platform, the connector and the editorial band apart", () => {
    expect([INSTAGRAM_MIN_SLIDES, INSTAGRAM_MAX_SLIDES]).toEqual([2, 20]);
    expect(CONNECTOR_MAX_SLIDES).toBe(10);
    // The editorial band is the owner's and is narrower than both. If these ever coincide it is
    // because somebody moved one of them, which is the thing this asserts.
    expect(MIN_SLIDES).toBe(5);
    expect(QUEUE_MAX_SLIDES).toBe(7);
    expect(MAX_SLIDES).toBe(8);
    expect(CONNECTOR_MAX_SLIDES).toBeLessThan(INSTAGRAM_MAX_SLIDES);
    expect(MAX_SLIDES).toBeLessThanOrEqual(CONNECTOR_MAX_SLIDES);
  });
});

describe("slide two is its own role", () => {
  it("is a hook in the five families the dealer deals, and a body everywhere else", () => {
    for (const family of DECK_FAMILIES) {
      const dealt = (LAUNCH_FAMILIES as readonly string[]).includes(family);
      expect(deckSlideRole(family, 1, 7), family).toBe(dealt ? "hook" : "body");
      expect(deckSlideRole(family, 0, 7), family).toBe("cover");
      expect(deckSlideRole(family, 6, 7), family).toBe("outro");
      // A three-slide deck has no room for one: slide two is already the closing slide.
      expect(deckSlideRole(family, 1, 2), family).toBe("outro");
    }
  });

  it("composes the dealt five differently at slide two than at slide three", () => {
    const shapeOf = (slide: { layers: ReadonlyArray<{ type: string; x: number; y: number; width: number; height: number }> }) =>
      JSON.stringify(slide.layers.map((layer) => [layer.type, layer.x, layer.y, layer.width, layer.height]));
    for (const family of LAUNCH_FAMILIES) {
      const template = familyDeckTemplate(family, 7);
      expect(shapeOf(template.slides[1]!), `${family} slide two repeats its body`).not.toBe(shapeOf(template.slides[2]!));
      expect(shapeOf(template.slides[1]!), `${family} slide two repeats its cover`).not.toBe(shapeOf(template.slides[0]!));
      const hashes = renderCarouselSvg({
        template,
        payload: payload(7),
        brand: CAROUSEL_BRANDS["mma-files"],
        format: MASTER_FORMAT
      }).map((slide) => slide.svgHash);
      expect(new Set(hashes).size).toBe(7);
    }
  });

  it("still clears every check, at every brand and every offered canvas", () => {
    for (const family of LAUNCH_FAMILIES) {
      for (let slideCount = MIN_SLIDES; slideCount <= MAX_RESOLVABLE_SLIDES; slideCount += 1) {
        const template = familyDeckTemplate(family, slideCount);
        for (const brand of brands) {
          for (const format of previewFormats(template)) {
            const checks = validateTemplateForBrand(template, brand, format as CarouselFormat);
            expect(
              checks.filter((check) => check.status === "fail").map((check) => check.detail),
              `${family}/${slideCount}/${brand.id}/${format}`
            ).toEqual([]);
          }
        }
      }
    }
  });

  it("leaves every other family rendering the bytes it rendered before the role existed", () => {
    /*
     * Captured from the build immediately before the hook was added, not re-baselined afterwards.
     * A stored recipe or pack naming one of these twenty-five has to redraw exactly as it was
     * sent, and `templateByReference` pins them all at 1.0.0 — so a change here is not a visual
     * preference, it is a template that no longer resolves to what it resolved to.
     */
    const baseline = JSON.parse(readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "legacy-family-hashes.json"),
      "utf8"
    )) as { slideCount: number; hashes: Record<string, string[]> };
    const legacy = DECK_FAMILIES.filter((family) => !(LAUNCH_FAMILIES as readonly string[]).includes(family));
    expect(Object.keys(baseline.hashes).sort()).toEqual([...legacy].sort());
    for (const family of legacy) {
      const template = templateByReference(familyTemplateId(family, baseline.slideCount), "1.0.0");
      expect(template, family).not.toBeNull();
      const hashes = renderCarouselSvg({
        template: template!,
        payload: payload(baseline.slideCount),
        brand: CAROUSEL_BRANDS["mma-files"],
        format: MASTER_FORMAT
      }).map((slide) => slide.svgHash);
      expect(hashes, `${family} no longer renders the bytes it was recorded with`).toEqual(baseline.hashes[family]);
    }
  });
});
