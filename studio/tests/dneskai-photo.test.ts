import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  DNESKAI_MAX_THUMBNAILS,
  DNESKAI_PHOTO_TEMPLATES,
  dneskaiSourcesTemplate,
  kitStyleFor,
  renderCarouselSvg,
  validateTemplateAsRendered,
  type CarouselTemplate
} from "../src/index.js";

/*
 * The DNESKAi photo kit's templates (quorum#603): each one passes every gate the renderer applies,
 * in the kit it is drawn in, and draws nothing the kit forbids.
 */

const brand = CAROUSEL_BRANDS["caught-up"];
const templates = [...DNESKAI_PHOTO_TEMPLATES.values()];
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function imagesFor(template: CarouselTemplate): Record<string, Buffer> {
  return Object.fromEntries(template.slides.flatMap((slide) => slide.layers.flatMap((layer) => layer.type === "image" ? [[layer.slot, PIXEL]] : [])));
}

function payloadFor(template: CarouselTemplate) {
  return { locale: "cs" as const, strings: Object.fromEntries(template.requiredSlots.map((slot) => [slot, `Věta pro ${slot}: co se dnes stalo.`])) };
}

describe("the DNESKAi photo kit", () => {
  it("is fourteen single-slide carousel-template/2 templates, composed for 4:5 alone", () => {
    expect(templates.map((template) => template.id)).toEqual([
      "dneskai-cover-photo",
      "dneskai-figure",
      "dneskai-split",
      "dneskai-split-pair",
      "dneskai-statement",
      ...Array.from({ length: DNESKAI_MAX_THUMBNAILS + 1 }, (_, count) => `dneskai-sources-${count}`),
      "dneskai-single-photo",
      "dneskai-single-type"
    ]);
    for (const template of templates) {
      expect(template.schemaVersion, template.id).toBe("carousel-template/2");
      expect(template.slides, template.id).toHaveLength(1);
      expect(template.canvas, template.id).toEqual({ master: "instagram-portrait", derive: [] });
      expect(template.status, template.id).toBe("live");
    }
  });

  it.each(templates.map((template) => [template.id, template] as const))("%s passes every check as the kit draws it", (_id, template) => {
    const failed = validateTemplateAsRendered(template, brand, "instagram-portrait").filter((check) => check.status === "fail");
    expect(failed).toEqual([]);
  });

  it("draws photographs in colour, never through a mono or duotone treatment", () => {
    for (const template of templates) {
      for (const layer of template.slides[0]!.layers) {
        if (layer.type === "image") expect(layer.treatment, `${template.id} ${layer.slot}`).toBe("none");
      }
    }
  });

  it("requires the photographs a slide is built around and gives each its own slot", () => {
    const slots = (id: string) => DNESKAI_PHOTO_TEMPLATES.get(id)!.slides[0]!.layers.flatMap((layer) => layer.type === "image" ? [`${layer.slot}${layer.optional ? "?" : ""}`] : []);
    expect(slots("dneskai-cover-photo")).toEqual(["image-1"]);
    expect(slots("dneskai-figure")).toEqual(["image-1"]);
    expect(slots("dneskai-split")).toEqual(["image-1"]);
    expect(slots("dneskai-split-pair")).toEqual(["image-1", "image-2"]);
    expect(slots("dneskai-statement")).toEqual([]);
    expect(slots("dneskai-sources-5")).toEqual(["image-1", "image-2", "image-3", "image-4", "image-5"]);
    expect(slots("dneskai-single-photo")).toEqual(["image-1"]);
    expect(slots("dneskai-single-type")).toEqual([]);
    expect(() => dneskaiSourcesTemplate(DNESKAI_MAX_THUMBNAILS + 1)).toThrow();
  });

  it.each(templates.map((template) => [template.id, template] as const))("%s renders in kit colours, the kit logotype and kit faces, flat and square", (_id, template) => {
    const kit = kitStyleFor(brand)!;
    const variants = [undefined, ...template.slides[0]!.variants.map((variant) => variant.id)];
    for (const variant of variants) {
      const [slide] = renderCarouselSvg({ template, brand, format: "instagram-portrait", images: imagesFor(template), payload: { ...payloadFor(template), ...(variant ? { variant } : {}) } });
      const svg = slide!.svg;
      const colours = [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase()))];
      expect(colours.filter((colour) => !kit.colours.has(colour)), template.id).toEqual([]);
      expect(svg).toContain('viewBox="50 -708 4217.817852834741 708"');
      expect(svg).not.toMatch(/<filter|feGaussianBlur|feDropShadow|radialGradient/);
      expect(svg, "a rounded panel").not.toMatch(/<rect[^>]*\srx="(?!0")/);
      for (const family of svg.matchAll(/font-family="([^"]+)"/g)) expect(family[1]).toMatch(/^(Space Grotesk|Source Serif 4|IBM Plex Mono)/);
      // The one gradient is a shade: a single ink at varying opacity, inside a photograph's window.
      for (const gradient of svg.matchAll(/<linearGradient id="([^"]+)"[\s\S]*?<\/linearGradient>/g)) {
        expect(gradient[1]).toMatch(/-shade$/);
        expect(new Set([...gradient[0].matchAll(/stop-color="([^"]+)"/g)].map((match) => match[1])).size).toBe(1);
        expect(svg).toContain(`fill="url(#${gradient[1]})" clip-path=`);
      }
    }
  });
});
