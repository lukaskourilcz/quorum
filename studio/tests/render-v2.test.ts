import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  cropImage,
  cropRegion,
  prepareCarouselImages,
  renderCarouselPng,
  renderCarouselSvg,
  validateTemplateAsRendered,
  type CarouselLayerInput,
  type CarouselRenderInput,
  type CarouselTemplateInput
} from "../src/index.js";

/*
 * The renderer half of carousel-template/2: crops cut in sharp before embedding, several image
 * slots, a required photograph, the shade and anchored text — and the contrast check that now
 * measures words set over a photograph instead of over the ground the photograph hides.
 */

const brand = CAROUSEL_BRANDS["caught-up"];
const formats = {
  "instagram-square": { width: 1_080, height: 1_080, safeArea: { top: 0.05, right: 0.06, bottom: 0.05, left: 0.06 } },
  "instagram-portrait": { width: 1_080, height: 1_350, safeArea: { top: 0.05, right: 0.06, bottom: 0.05, left: 0.06 } },
  "instagram-story": { width: 1_080, height: 1_920, safeArea: { top: 0.14, right: 0.07, bottom: 0.16, left: 0.07 } },
  threads: { width: 1_200, height: 1_200, safeArea: { top: 0.07, right: 0.07, bottom: 0.09, left: 0.07 } }
};

const headline: CarouselLayerInput = {
  type: "text",
  slot: "headline",
  x: 0.07, y: 0.6, width: 0.86, height: 0.25,
  colorToken: "background",
  fontToken: "headline",
  fontWeight: 700,
  minFontSize: 40,
  maxFontSize: 72,
  maxChars: 90,
  maxLines: 4,
  valign: "bottom"
};

const SHADE = { colorToken: "foreground", stops: [{ at: 0, opacity: 0 }, { at: 0.55, opacity: 0.66 }, { at: 1, opacity: 0.86 }] };

function photoTemplate(options: { shade?: typeof SHADE | null; optional?: boolean; second?: boolean } = {}) {
  const layers: CarouselLayerInput[] = [
    {
      type: "image", slot: "image-1", optional: options.optional ?? false, fit: "cover",
      x: 0, y: 0, width: 1, height: 1,
      ...(options.shade === null ? {} : { shade: options.shade ?? SHADE })
    },
    ...(options.second ? [{ type: "image" as const, slot: "image-2", optional: true, fit: "contain" as const, x: 0.6, y: 0.1, width: 0.3, height: 0.2 }] : []),
    headline
  ];
  const input: CarouselTemplateInput = {
    schemaVersion: "carousel-template/2",
    id: "render-v2-fixture",
    name: "Render v2 fixture",
    version: "1.0.0",
    status: "draft",
    description: "One photograph under a bottom-anchored headline, for the v2 renderer tests.",
    citedObservationRefs: [],
    formats,
    requiredSlots: ["headline"],
    slides: [{ id: "slide-cover", backgroundToken: "foreground", layers }]
  };
  return CarouselTemplateSchema.parse(input);
}

/** Four flat quadrants, so where a crop landed can be read back from one pixel. */
async function quadrants(width: number, height: number): Promise<Buffer> {
  const data = Buffer.alloc(width * height * 3);
  const colours = [[220, 40, 40], [40, 200, 60], [40, 70, 220], [240, 220, 40]];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const colour = colours[(y < height / 2 ? 0 : 2) + (x < width / 2 ? 0 : 1)]!;
      data.set(colour, (y * width + x) * 3);
    }
  }
  return sharp(data, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function pixel(png: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return [...data.subarray(offset, offset + 3)];
}

function input(template = photoTemplate(), images: Record<string, Buffer>, crop?: CarouselRenderInput["payload"]["images"]): CarouselRenderInput {
  return {
    template,
    brand,
    format: "instagram-portrait",
    images,
    payload: { locale: "cs", strings: { headline: "Fotka přes celou plochu a jedna věta dole." }, ...(crop ? { images: crop } : {}) }
  };
}

describe("cropRegion", () => {
  it("cuts the frame's own shape around the focal point and slides it back inside the picture", () => {
    expect(cropRegion({ width: 2_000, height: 1_000 }, { focal: { x: 0.5, y: 0.5 } }, { width: 1_080, height: 1_350 }, "cover"))
      .toEqual({ left: 600, top: 0, width: 800, height: 1_000, outWidth: 1_080, outHeight: 1_350 });
    expect(cropRegion({ width: 2_000, height: 1_000 }, { focal: { x: 0.02, y: 0.5 } }, { width: 1_080, height: 1_350 }, "cover").left).toBe(0);
    expect(cropRegion({ width: 2_000, height: 1_000 }, { focal: { x: 0.99, y: 0.5 } }, { width: 1_080, height: 1_350 }, "cover").left).toBe(1_200);
  });

  it("zooms around the focal point", () => {
    expect(cropRegion({ width: 2_000, height: 1_000 }, { focal: { x: 0.25, y: 0.25 }, zoom: 2 }, { width: 1_000, height: 500 }, "cover"))
      .toEqual({ left: 0, top: 0, width: 1_000, height: 500, outWidth: 1_000, outHeight: 500 });
  });

  it("keeps the whole picture for contain and fits it inside the frame", () => {
    expect(cropRegion({ width: 624, height: 355 }, { focal: { x: 0.5, y: 0.5 } }, { width: 936, height: 594 }, "contain"))
      .toEqual({ left: 0, top: 0, width: 624, height: 355, outWidth: 936, outHeight: 533 });
  });
});

describe("cropImage", () => {
  it("is deterministic and lands where the focal point says", async () => {
    const source = await quadrants(400, 200);
    const left = await cropImage(source, { focal: { x: 0, y: 0 }, zoom: 2 }, { width: 100, height: 100 }, "cover");
    expect(left.equals(await cropImage(source, { focal: { x: 0, y: 0 }, zoom: 2 }, { width: 100, height: 100 }, "cover"))).toBe(true);
    expect(await pixel(left, 50, 50)).toEqual([220, 40, 40]);
    const right = await cropImage(source, { focal: { x: 1, y: 1 }, zoom: 2 }, { width: 100, height: 100 }, "cover");
    expect(await pixel(right, 50, 50)).toEqual([240, 220, 40]);
    expect((await sharp(right).metadata()).width).toBe(100);
  });
});

describe("rendering several photographs with crops", () => {
  it("renders the same PNG for the same bytes and crop, and another for another focal point", async () => {
    const source = await quadrants(1_600, 1_000);
    const crop = { "image-1": { focal: { x: 0.2, y: 0.5 } } };
    const [first] = await renderCarouselPng(input(photoTemplate(), { "image-1": source }, crop));
    const [again] = await renderCarouselPng(input(photoTemplate(), { "image-1": source }, crop));
    const [moved] = await renderCarouselPng(input(photoTemplate(), { "image-1": source }, { "image-1": { focal: { x: 0.8, y: 0.5 } } }));
    expect(again!.pngHash).toBe(first!.pngHash);
    expect(again!.svgHash).toBe(first!.svgHash);
    expect(moved!.pngHash).not.toBe(first!.pngHash);
    // The focal point at the left keeps the left half in view, the right one the right half.
    expect(await pixel(first!.png, 300, 200)).not.toEqual(await pixel(moved!.png, 300, 200));
  });

  it("leaves an uncropped photograph exactly as the caller handed it", async () => {
    const source = await quadrants(1_200, 1_500);
    const [slide] = renderCarouselSvg(input(photoTemplate(), { "image-1": source }));
    expect(slide!.svg).toContain(source.toString("base64"));
  });

  it("prepares once: preparing again, or rendering prepared bytes, changes nothing", async () => {
    const source = await quadrants(1_600, 1_000);
    const raw = input(photoTemplate(), { "image-1": source }, { "image-1": { focal: { x: 0.3, y: 0.4 }, zoom: 1.4 } });
    const prepared = await prepareCarouselImages(raw);
    const twice = await prepareCarouselImages({ ...raw, images: prepared });
    expect(twice!["image-1"]).toBe(prepared!["image-1"]);
    const [fromRaw] = await renderCarouselPng(raw);
    const [fromPrepared] = await renderCarouselPng({ ...raw, images: prepared });
    expect(fromPrepared!.pngHash).toBe(fromRaw!.pngHash);
    const [svg] = renderCarouselSvg({ ...raw, images: prepared });
    expect(svg!.svgHash).toBe(fromRaw!.svgHash);
  });

  it("refuses bytes prepared for another crop instead of drawing them as this one", async () => {
    const source = await quadrants(1_600, 1_000);
    const raw = input(photoTemplate(), { "image-1": source }, { "image-1": { focal: { x: 0.3, y: 0.4 }, zoom: 1.4 } });
    const prepared = await prepareCarouselImages(raw);
    const other = input(photoTemplate(), prepared!, { "image-1": { focal: { x: 0.8, y: 0.4 }, zoom: 1.4 } });
    await expect(prepareCarouselImages(other)).rejects.toThrow(/already prepared for another crop or frame/);
    await expect(renderCarouselPng(other)).rejects.toThrow(/already prepared for another crop or frame/);
    expect(() => renderCarouselSvg(other)).toThrow(/were not cut for/);
  });

  it("passes a cropped and treated photograph through a second preparation unchanged", async () => {
    const plain = photoTemplate();
    const mono = CarouselTemplateSchema.parse({
      ...plain,
      slides: plain.slides.map((slide) => ({ ...slide, layers: slide.layers.map((layer) => layer.type === "image" ? { ...layer, treatment: "mono" } : layer) }))
    });
    const raw = input(mono, { "image-1": await quadrants(1_600, 1_000) }, { "image-1": { focal: { x: 0.3, y: 0.4 } } });
    const prepared = await prepareCarouselImages(raw);
    const twice = await prepareCarouselImages({ ...raw, images: prepared });
    expect(twice!["image-1"]).toBe(prepared!["image-1"]);
    const [fromRaw] = await renderCarouselPng(raw);
    const [svg] = renderCarouselSvg({ ...raw, images: prepared });
    expect(svg!.svgHash).toBe(fromRaw!.svgHash);
  });

  it("refuses to draw a crop the synchronous SVG path cannot apply", async () => {
    const source = await quadrants(1_600, 1_000);
    expect(() => renderCarouselSvg(input(photoTemplate(), { "image-1": source }, { "image-1": { focal: { x: 0.3, y: 0.4 } } })))
      .toThrow(/prepareCarouselImages/);
  });

  it("refuses a missing required photograph and a crop for a slot the template does not carry", async () => {
    expect(() => renderCarouselSvg(input(photoTemplate(), {}))).toThrow("Carousel images are missing required slots: image-1");
    const source = await quadrants(400, 400);
    await expect(renderCarouselPng(input(photoTemplate(), { "image-1": source }, { "image-7": { focal: { x: 0.5, y: 0.5 } } })))
      .rejects.toThrow(/image-7/);
  });

  it("draws a second, optional photograph on the same slide when it is there and nothing when it is not", async () => {
    const one = await quadrants(1_200, 1_500);
    const two = await quadrants(300, 200);
    const template = photoTemplate({ second: true });
    const [both] = renderCarouselSvg(input(template, { "image-1": one, "image-2": two }));
    const [only] = renderCarouselSvg(input(template, { "image-1": one }));
    expect(both!.svg.match(/<image /g)).toHaveLength(2);
    expect(only!.svg.match(/<image /g)).toHaveLength(1);
  });

  it("draws the shade only with its photograph, inside the photograph's window", async () => {
    const [slide] = renderCarouselSvg(input(photoTemplate({ optional: true }), { "image-1": await quadrants(1_200, 1_500) }));
    expect(slide!.svg).toMatch(/<linearGradient id="img-0-0-shade"[^>]*>(<stop[^>]*stop-color="#14161a"[^>]*>){3}<\/linearGradient>/);
    expect(slide!.svg).toContain('fill="url(#img-0-0-shade)" clip-path="url(#img-0-0-clip)"');
    const [bare] = renderCarouselSvg(input(photoTemplate({ optional: true }), {}));
    expect(bare!.svg).not.toContain("shade");
  });

  it("sets a bottom-anchored passage on its frame's floor whatever its length", () => {
    const template = photoTemplate({ optional: true });
    const baseline = (words: string) => {
      const [slide] = renderCarouselSvg({ ...input(template, {}), payload: { locale: "cs", strings: { headline: words } } });
      const match = slide!.svg.match(/<text x="[^"]+" y="([^"]+)"[^>]*font-size="([^"]+)"[^>]*>(.*?)<\/text>/);
      const lines = (match![3]!.match(/<tspan/g) ?? []).length;
      return Number(match![1]) + (lines - 1) * Number(match![2]) * 1.12;
    };
    // The last line's baseline sits at the same height for one line and for three.
    expect(baseline("Krátce.")).toBeCloseTo(baseline("Mnohem delší titulek, který se zalomí do tří řádků a pořád stojí dole."), 0);
  });
});

describe("the border", () => {
  it("frames a contained picture where it is drawn, and a covering one at its frame", async () => {
    const wide = await quadrants(600, 200);
    const layers = (fit: "cover" | "contain"): CarouselLayerInput[] => [
      { type: "image", slot: "image-1", optional: false, fit, x: 0.1, y: 0.1, width: 0.8, height: 0.4, border: { colorToken: "muted", width: 2 } },
      { ...headline, colorToken: "foreground", valign: undefined, y: 0.6 }
    ];
    const template = (fit: "cover" | "contain") => CarouselTemplateSchema.parse({ ...photoTemplate(), slides: [{ id: "slide-border", backgroundToken: "background", layers: layers(fit), variants: [] }] });
    const [contained] = renderCarouselSvg(input(template("contain"), { "image-1": wide }));
    // 864 × 540 frame at (108, 135); a 3:1 picture fills the width at 288 px high, centred.
    expect(contained!.svg).toContain('<rect x="107" y="260" width="866" height="290" fill="none" stroke="#3c4149" stroke-width="2"/>');
    const [covered] = renderCarouselSvg(input(template("cover"), { "image-1": wide }));
    expect(covered!.svg).toContain('<rect x="107" y="134" width="866" height="542" fill="none" stroke="#3c4149" stroke-width="2"/>');
  });

  it("rings a circular window on the disc's edge instead of framing its square", async () => {
    const wide = await quadrants(600, 200);
    const layers: CarouselLayerInput[] = [
      { type: "image", slot: "image-1", optional: true, fit: "cover", clip: "circle", x: 0.5, y: 0.1, width: 0.4, height: 0.32, border: { colorToken: "foreground", width: 6 } },
      { ...headline, colorToken: "foreground", valign: undefined, y: 0.6 }
    ];
    const template = CarouselTemplateSchema.parse({ ...photoTemplate(), slides: [{ id: "slide-ring", backgroundToken: "background", layers, variants: [] }] });
    const [ringed] = renderCarouselSvg(input(template, { "image-1": wide }));
    // A 432 × 432 frame at (540, 135): the disc's radius is 216 and the 6 px ring is centred 3 px outside it.
    expect(ringed!.svg).toContain('<clipPath id="img-');
    expect(ringed!.svg).toContain('<circle cx="756" cy="351" r="216"/>');
    expect(ringed!.svg).toMatch(/<circle cx="756" cy="351" r="219" fill="none" stroke="#[0-9a-f]{6}" stroke-width="6"\/>/);
    expect(ringed!.svg).not.toMatch(/<rect [^>]*stroke-width="6"/);
    const [bare] = renderCarouselSvg(input(template, {}));
    expect(bare!.svg).not.toContain("r=\"219\"");
  });

  it("is a carousel-template/2 field", () => {
    const parsed = CarouselTemplateSchema.safeParse({
      ...photoTemplate(),
      schemaVersion: "carousel-template/1",
      slides: [{ id: "slide-v1", backgroundToken: "background", layers: [{ type: "image", slot: "image", optional: true, fit: "cover", x: 0, y: 0, width: 1, height: 0.5, border: { colorToken: "muted", width: 2 } }, { ...headline, valign: undefined }] }]
    });
    expect(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message)).toContain("border is a carousel-template/2 field");
  });
});

describe("contrast over a photograph", () => {
  const check = (template: ReturnType<typeof photoTemplate>) =>
    validateTemplateAsRendered(template, brand, "instagram-portrait").find((entry) => entry.id === "contrast")!;

  it("measures v2 words against a white and a black photograph seen through the shade", () => {
    expect(check(photoTemplate()).status).toBe("pass");
    expect(check(photoTemplate({ shade: null })).status).toBe("fail");
    const weak = { ...SHADE, stops: [{ at: 0, opacity: 0 }, { at: 1, opacity: 0.4 }] };
    expect(check(photoTemplate({ shade: weak })).status).toBe("fail");
  });

  it("also measures an optional photograph's words against the ground they stand on without it", () => {
    expect(check(photoTemplate({ optional: true })).status).toBe("pass");
  });
});
