import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_TEMPLATE_V2,
  CarouselPayloadSchema,
  CarouselTemplateSchema,
  MAX_IMAGE_SLOTS,
  type CarouselLayerInput,
  type CarouselTemplateInput
} from "../src/index.js";

/*
 * carousel-template/2 (quorum#603): several photographs per template, each in its own slot.
 *
 * The promise that comes with it is the one v1's additive fields made: a v1 document parses to the
 * object it always parsed to. So every v2 field is refused in a v1 document rather than defaulted
 * into it, and the parse of the committed v1 fixture is checked for keys it never had.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

const formats = {
  "instagram-square": { width: 1_080, height: 1_080, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
  "instagram-portrait": { width: 1_080, height: 1_350, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
  "instagram-story": { width: 1_080, height: 1_920, safeArea: { top: 0.14, right: 0.07, bottom: 0.16, left: 0.07 } },
  threads: { width: 1_200, height: 1_200, safeArea: { top: 0.07, right: 0.07, bottom: 0.09, left: 0.07 } }
};

const line: CarouselLayerInput = {
  type: "text",
  slot: "line",
  x: 0.1, y: 0.7, width: 0.8, height: 0.15,
  colorToken: "foreground",
  fontToken: "headline",
  fontWeight: 700,
  minFontSize: 30,
  maxFontSize: 60,
  maxChars: 60,
  maxLines: 2
};

function photo(slot: string, options: Partial<Extract<CarouselLayerInput, { type: "image" }>> = {}): CarouselLayerInput {
  return { type: "image", slot, optional: true, fit: "cover", x: 0, y: 0, width: 1, height: 0.5, ...options };
}

function template(
  schemaVersion: CarouselTemplateInput["schemaVersion"],
  slides: Array<CarouselLayerInput[]>
): CarouselTemplateInput {
  return {
    schemaVersion,
    id: "v2-fixture",
    name: "v2 fixture",
    version: "1.0.0",
    status: "draft",
    description: "A fixture that exercises one carousel-template/2 rule at a time.",
    citedObservationRefs: [],
    formats,
    requiredSlots: ["line"],
    slides: slides.map((layers, index) => ({ id: `slide-${index + 1}`, backgroundToken: "background", layers: [...layers, line] }))
  };
}

function messages(input: unknown): string[] {
  const parsed = CarouselTemplateSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

describe("carousel-template/1 stays what it was", () => {
  it("parses the committed v1 fixture without gaining a v2 key", () => {
    const fixture = JSON.parse(readFileSync(path.join(here, "fixtures", "v1-article-deck.json"), "utf8")) as unknown;
    const parsed = CarouselTemplateSchema.parse(fixture);
    const layers = parsed.slides.flatMap((slide) => slide.layers);
    expect(layers.some((layer) => layer.type === "image")).toBe(true);
    for (const layer of layers) {
      expect(layer).not.toHaveProperty("shade");
      expect(layer).not.toHaveProperty("valign");
    }
  });

  it("keeps one image slot, named image, and optional", () => {
    expect(messages(template("carousel-template/1", [[photo("image")]]))).toEqual([]);
    expect(messages(template("carousel-template/1", [[photo("image-1")]]))).toContain("carousel-template/1 has one image slot, named image");
    expect(messages(template("carousel-template/1", [[photo("image", { optional: false })]]))).toContain("Every carousel-template/1 image is optional");
  });

  it("refuses the v2 fields instead of defaulting them in", () => {
    const shade = { colorToken: "foreground", stops: [{ at: 0, opacity: 0 }, { at: 1, opacity: 0.8 }] };
    expect(messages(template("carousel-template/1", [[photo("image", { shade })]]))).toContain("shade is a carousel-template/2 field");
    const anchored = { ...template("carousel-template/1", [[]]) };
    anchored.slides[0]!.layers = [{ ...line, valign: "bottom" }];
    expect(messages(anchored)).toContain("valign is a carousel-template/2 field");
  });
});

describe("carousel-template/2", () => {
  it("holds several photographs, two of them on one slide", () => {
    const parsed = CarouselTemplateSchema.parse(template(CAROUSEL_TEMPLATE_V2, [
      [photo("image-1", { optional: false }), photo("image-2", { y: 0.5 })],
      [photo("image-3"), photo("image-1", { optional: false, reprise: true, width: 0.3, height: 0.2 })]
    ]));
    const slots = new Set(parsed.slides.flatMap((slide) => slide.layers.flatMap((layer) => layer.type === "image" ? [layer.slot] : [])));
    expect([...slots].sort()).toEqual(["image-1", "image-2", "image-3"]);
  });

  it("names slots image or image-1 to image-99 and nothing else", () => {
    for (const slot of ["image", "image-1", "image-9", "image-42", "image-99"]) {
      expect(messages(template(CAROUSEL_TEMPLATE_V2, [[photo(slot)]])), slot).toEqual([]);
    }
    for (const slot of ["image-0", "image-100", "image-01", "photo", "hero", "image-a"]) {
      expect(messages(template(CAROUSEL_TEMPLATE_V2, [[photo(slot)]])), slot).not.toEqual([]);
    }
  });

  it("refuses one slot that is required on one slide and optional on another", () => {
    expect(messages(template(CAROUSEL_TEMPLATE_V2, [[photo("image-1", { optional: false })], [photo("image-1")]])))
      .toContain("Image slot image-1 is both optional and required");
  });

  it(`caps a template at ${MAX_IMAGE_SLOTS} distinct photographs`, () => {
    const many = Array.from({ length: MAX_IMAGE_SLOTS + 1 }, (_, index) => photo(`image-${index + 1}`, { width: 0.04, x: index * 0.045 }));
    const slides = [many.slice(0, 11), many.slice(11)];
    expect(messages(template(CAROUSEL_TEMPLATE_V2, slides))).toContain(`A template may hold at most ${MAX_IMAGE_SLOTS} image slots`);
    expect(messages(template(CAROUSEL_TEMPLATE_V2, [many.slice(0, 11), many.slice(11, MAX_IMAGE_SLOTS)]))).toEqual([]);
  });

  it("keeps shade stops in order and inside the unit range", () => {
    const shade = (stops: Array<{ at: number; opacity: number }>) => template(CAROUSEL_TEMPLATE_V2, [[photo("image-1", { shade: { colorToken: "foreground", stops } })]]);
    expect(messages(shade([{ at: 0.3, opacity: 0 }, { at: 1, opacity: 0.85 }]))).toEqual([]);
    expect(messages(shade([{ at: 0.6, opacity: 0 }, { at: 0.2, opacity: 0.85 }]))).toContain("Shade stops must run top to bottom");
    expect(messages(shade([{ at: 0, opacity: 0 }, { at: 1, opacity: 1.2 }]))).not.toEqual([]);
  });
});

describe("the payload's crop records", () => {
  const payload = (images: unknown) => CarouselPayloadSchema.safeParse({ locale: "cs", strings: { line: "Věta." }, images });

  it("is optional, and a payload without it parses to the object it always did", () => {
    const parsed = CarouselPayloadSchema.parse({ locale: "cs", strings: { line: "Věta." } });
    expect(parsed).toEqual({ locale: "cs", strings: { line: "Věta." } });
  });

  it("takes a focal point, a zoom, a fit and the asset hash per image slot", () => {
    const assetSha256 = "a".repeat(64);
    const parsed = payload({ "image-1": { assetSha256, focal: { x: 0.62, y: 0.4 }, zoom: 1.5, fit: "cover" }, "image-2": { focal: { x: 0.5, y: 0.5 } } });
    expect(parsed.success).toBe(true);
  });

  it("refuses a focal point off the picture, a zoom below one, an unknown key and a slot that is not an image slot", () => {
    expect(payload({ "image-1": { focal: { x: 1.2, y: 0.5 } } }).success).toBe(false);
    expect(payload({ "image-1": { focal: { x: 0.5, y: 0.5 }, zoom: 0.8 } }).success).toBe(false);
    expect(payload({ "image-1": { focal: { x: 0.5, y: 0.5 }, rotate: 90 } }).success).toBe(false);
    expect(payload({ hero: { focal: { x: 0.5, y: 0.5 } } }).success).toBe(false);
    expect(payload({ "image-1": { focal: { x: 0.5, y: 0.5 }, assetSha256: "not-a-hash" } }).success).toBe(false);
  });
});
