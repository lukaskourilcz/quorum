import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  contrastRatio,
  renderCarouselSvg,
  validateTemplateForBrand,
  type CarouselTemplateInput
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The v2 capabilities, and the promise that came with them.
 *
 * `carousel-template/1` stays the schemaVersion, so every stored proposal, pack and deck
 * reference has to keep parsing and keep rendering to the bytes it rendered before. That is the
 * whole reason each new field is optional with a default that reproduces the old behaviour, and
 * it is asserted here against a document copied out of the engine's own output before any of
 * them existed.
 */

const base: Omit<CarouselTemplateInput, "slides" | "requiredSlots" | "id" | "name" | "description"> = {
  schemaVersion: "carousel-template/1",
  version: "1.0.0",
  status: "draft",
  citedObservationRefs: [],
  formats: {
    "instagram-square": { width: 1_080, height: 1_080, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
    "instagram-portrait": { width: 1_080, height: 1_350, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
    "instagram-story": { width: 1_080, height: 1_920, safeArea: { top: 0.14, right: 0.07, bottom: 0.16, left: 0.07 } },
    threads: { width: 1_200, height: 1_200, safeArea: { top: 0.07, right: 0.07, bottom: 0.09, left: 0.07 } }
  }
};

function templateWith(layers: CarouselTemplateInput["slides"][number]["layers"], slots = ["line"]): CarouselTemplateInput {
  return {
    ...base,
    id: "capability-fixture",
    name: "Capability fixture",
    description: "A single slide used to exercise one schema capability at a time.",
    requiredSlots: slots,
    slides: [{ id: "slide-one", backgroundToken: "background", layers }]
  };
}

const line = {
  type: "text" as const,
  slot: "line",
  x: 0.1, y: 0.4, width: 0.8, height: 0.2,
  colorToken: "foreground",
  fontToken: "headline" as const,
  fontWeight: 800,
  minFontSize: 30,
  maxFontSize: 60,
  maxChars: 90,
  maxLines: 3
};

describe("every new capability round-trips through the schema", () => {
  it("carries a two-stop gradient with an angle", () => {
    const parsed = CarouselTemplateSchema.parse(templateWith([
      { type: "linear-gradient", x: 0, y: 0, width: 1, height: 1, angle: 168, stops: [{ colorToken: "surface", offset: 0.42 }, { colorToken: "background", offset: 0.42 }] },
      line
    ]));
    const gradient = parsed.slides[0]!.layers[0]!;
    expect(gradient.type).toBe("linear-gradient");
    expect(gradient.type === "linear-gradient" && gradient.stops).toHaveLength(2);
  });

  it("refuses a gradient with one stop, or three", () => {
    const oneStop = [{ colorToken: "surface", offset: 0 }];
    const threeStops = [...oneStop, { colorToken: "background", offset: 0.5 }, { colorToken: "accent", offset: 1 }];
    for (const stops of [oneStop, threeStops]) {
      expect(CarouselTemplateSchema.safeParse({
        ...templateWith([line]),
        slides: [{
          id: "slide-one",
          backgroundToken: "background",
          layers: [{ type: "linear-gradient", x: 0, y: 0, width: 1, height: 1, angle: 90, stops }, line]
        }]
      }).success).toBe(false);
    }
  });

  it("carries a circular and a polygon image window", () => {
    const clips: Array<"circle" | Array<[number, number]>> = ["circle", [[0, 0], [1, 0], [1, 0.82], [0, 1]]];
    for (const clip of clips) {
      const parsed = CarouselTemplateSchema.parse(templateWith([
        { type: "image", slot: "image", optional: true, fit: "cover", x: 0, y: 0, width: 1, height: 0.5, clip },
        line
      ]));
      const image = parsed.slides[0]!.layers[0]!;
      expect(image.type === "image" && image.clip).toEqual(clip);
      // Defaults reproduce the old behaviour exactly.
      expect(image.type === "image" && image.treatment).toBe("none");
      expect(image.type === "image" && image.reprise).toBe(false);
    }
  });

  it("counts image slots rather than image layers, so a reprise is legal", () => {
    const image = { type: "image" as const, slot: "image" as const, optional: true as const, fit: "cover" as const, x: 0, y: 0, width: 1, height: 0.3 };
    const reprised = CarouselTemplateSchema.safeParse({
      ...base,
      id: "reprise-fixture",
      name: "Reprise fixture",
      description: "One photograph appearing twice: one slot, two layers.",
      requiredSlots: ["line"],
      slides: [
        { id: "slide-one", backgroundToken: "background", layers: [image, line] },
        { id: "slide-two", backgroundToken: "background", layers: [{ ...image, reprise: true }, line] }
      ]
    });
    expect(reprised.success).toBe(true);
  });

  it("carries a dashed rule, a tracked and glowing text, and a text-hugging panel", () => {
    const parsed = CarouselTemplateSchema.parse(templateWith([
      { type: "shape", x: 0.08, y: 0.38, width: 0.84, height: 0.24, fillToken: "surface", padText: "line", padding: 0.03 },
      { ...line, tracking: 0.14, glow: true },
      { type: "rule", x: 0.1, y: 0.7, width: 0.3, height: 0.006, colorToken: "accent", thickness: 6, dash: true }
    ]));
    const [panel, text, rule] = parsed.slides[0]!.layers as [
      Extract<typeof parsed.slides[0]["layers"][number], { type: "shape" }>,
      Extract<typeof parsed.slides[0]["layers"][number], { type: "text" }>,
      Extract<typeof parsed.slides[0]["layers"][number], { type: "rule" }>
    ];
    expect(panel.padText).toBe("line");
    expect(panel.padding).toBeCloseTo(0.03);
    expect(text.tracking).toBeCloseTo(0.14);
    expect(text.glow).toBe(true);
    expect(rule.dash).toBe(true);
  });

  it("refuses a panel that hugs a slot the slide does not carry", () => {
    const result = CarouselTemplateSchema.safeParse(templateWith([
      { type: "shape", x: 0.08, y: 0.38, width: 0.84, height: 0.24, fillToken: "surface", padText: "nowhere" },
      line
    ]));
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("nowhere");
  });
});

describe("a document written before any of this parses and renders unchanged", () => {
  const stored = JSON.parse(readFileSync(path.join(here, "fixtures/v1-article-deck.json"), "utf8")) as CarouselTemplateInput;

  it("carries none of the new fields", () => {
    expect(JSON.stringify(stored)).not.toMatch(/tracking|glow|dash|padText|padding|treatment|reprise|clip/u);
  });

  it("parses, and every new field arrives at its old-behaviour default", () => {
    const parsed = CarouselTemplateSchema.parse(stored);
    for (const slide of parsed.slides) {
      for (const layer of slide.layers) {
        if (layer.type === "text") { expect(layer.tracking).toBe(0); expect(layer.glow).toBe(false); }
        if (layer.type === "rule") expect(layer.dash).toBe(false);
        if (layer.type === "shape") expect(layer.padText).toBeUndefined();
        if (layer.type === "image") { expect(layer.treatment).toBe("none"); expect(layer.reprise).toBe(false); }
      }
    }
  });

  /*
   * Pinned, not recomputed. A test that renders the fixture twice proves the renderer is a
   * function; only a committed hash proves this release renders what the last deliberate
   * re-baseline did, which is the promise `carousel-template/1` makes to the packs already in
   * state/social. Re-baselined for the owner-amended MMA Files Anton identity.
   */
  it("renders to the SVG pinned at the last deliberate re-baseline", () => {
    const parsed = CarouselTemplateSchema.parse(stored);
    const strings = Object.fromEntries(parsed.requiredSlots.map((slot, index) =>
      [slot, `Řádek ${index + 1}: nejneobhospodařovávatelnější věta, kterou deska napsala.`]));
    const slides = renderCarouselSvg({
      template: parsed,
      payload: { locale: "cs", strings },
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait"
    });
    const combined = createHash("sha256").update(slides.map((slide) => slide.svgHash).join("")).digest("hex");
    expect(combined).toBe("63a4442bcd8ea66a7382e0fbdc61f0e8df948209e32702a59fcff4601d9edc77");
  });
});

describe("the contrast check reads the new grounds", () => {
  const brand = CAROUSEL_BRANDS["mma-files"];

  it("refuses text that clears one gradient stop and not the other", () => {
    // `muted` clears `background` easily and `secondary` not at all — which is precisely the
    // failure a one-stop check would miss, because half the frame looks fine.
    expect(contrastRatio(brand.colors.muted!, brand.colors.background!)).toBeGreaterThan(4.5);
    expect(contrastRatio(brand.colors.muted!, brand.colors.secondary!)).toBeLessThan(4.5);
    const checks = validateTemplateForBrand(
      CarouselTemplateSchema.parse(templateWith([
        { type: "linear-gradient", x: 0, y: 0, width: 1, height: 1, angle: 90, stops: [{ colorToken: "background", offset: 0 }, { colorToken: "secondary", offset: 1 }] },
        { ...line, colorToken: "muted" }
      ])),
      brand,
      "instagram-portrait"
    );
    expect(checks.find((check) => check.id === "contrast")).toMatchObject({ status: "fail" });
  });

  it("passes background-coloured type on an accent panel, which it used to call 1.00:1", () => {
    const checks = validateTemplateForBrand(
      CarouselTemplateSchema.parse(templateWith([
        { type: "shape", x: 0.05, y: 0.3, width: 0.9, height: 0.4, fillToken: "accent" },
        { ...line, colorToken: "background" }
      ])),
      brand,
      "instagram-portrait"
    );
    expect(checks.find((check) => check.id === "contrast")).toMatchObject({ status: "pass" });
  });

  it("still refuses that type when no panel is under it", () => {
    const checks = validateTemplateForBrand(
      CarouselTemplateSchema.parse(templateWith([{ ...line, colorToken: "background" }])),
      brand,
      "instagram-portrait"
    );
    expect(checks.find((check) => check.id === "contrast")).toMatchObject({ status: "fail" });
  });

  it("checks the rendering a variant produces, not only the default one", () => {
    const checks = validateTemplateForBrand(
      CarouselTemplateSchema.parse({
        ...templateWith([{ ...line, colorToken: "accent" }]),
        slides: [{
          id: "slide-one",
          backgroundToken: "background",
          // Legible on `background`; the variant repaints the slide `accent` and it is not.
          variants: [{ id: "B", backgroundToken: "accent" }],
          layers: [{ ...line, colorToken: "accent" }]
        }]
      }),
      brand,
      "instagram-portrait"
    );
    expect(checks.find((check) => check.id === "contrast")).toMatchObject({ status: "fail" });
  });

  it("names an unknown token a variant introduces", () => {
    const checks = validateTemplateForBrand(
      CarouselTemplateSchema.parse({
        ...templateWith([line]),
        slides: [{ id: "slide-one", backgroundToken: "background", variants: [{ id: "B", accentToken: "chartreuse" }], layers: [line] }]
      }),
      brand,
      "instagram-portrait"
    );
    expect(checks.find((check) => check.id === "brand-tokens")).toMatchObject({ status: "fail" });
  });

  it("counts tracking against a slot's capacity", () => {
    // 19 characters fit on this line untracked; at 0.3 em only 12 do, and the slot asks for 18.
    const tight = { ...line, x: 0.1, width: 0.3, minFontSize: 30, maxChars: 18, maxLines: 1 };
    const untracked = validateTemplateForBrand(CarouselTemplateSchema.parse(templateWith([tight])), brand, "instagram-portrait");
    const tracked = validateTemplateForBrand(
      CarouselTemplateSchema.parse(templateWith([{ ...tight, tracking: 0.3 }])),
      brand,
      "instagram-portrait"
    );
    expect(untracked.find((check) => check.id === "overflow")).toMatchObject({ status: "pass" });
    expect(tracked.find((check) => check.id === "overflow")).toMatchObject({ status: "fail" });
  });
});

describe("the new capabilities reach the SVG", () => {
  const brand = CAROUSEL_BRANDS["mma-files"];
  const render = (layers: CarouselTemplateInput["slides"][number]["layers"]) => renderCarouselSvg({
    template: CarouselTemplateSchema.parse(templateWith(layers)),
    payload: { locale: "cs", strings: { line: "Krátká věta." } },
    brand,
    format: "instagram-portrait"
  })[0]!.svg;

  it("draws a gradient, a dashed rule, tracking and a glow, and draws none of them when unasked", () => {
    const plain = render([line, { type: "rule", x: 0.1, y: 0.7, width: 0.3, height: 0.006, colorToken: "accent", thickness: 6 }]);
    expect(plain).not.toContain("linearGradient");
    expect(plain).not.toContain("stroke-dasharray");
    expect(plain).not.toContain("letter-spacing");
    expect(plain).not.toContain("feDropShadow");

    const dressed = render([
      { type: "linear-gradient", x: 0, y: 0, width: 1, height: 1, angle: 168, stops: [{ colorToken: "surface", offset: 0.42 }, { colorToken: "background", offset: 0.42 }] },
      { ...line, tracking: 0.14, glow: true },
      { type: "rule", x: 0.1, y: 0.7, width: 0.3, height: 0.006, colorToken: "accent", thickness: 6, dash: true }
    ]);
    expect(dressed).toContain("linearGradient");
    expect(dressed).toContain("stroke-dasharray");
    expect(dressed).toContain("letter-spacing");
    expect(dressed).toContain("feDropShadow");
  });

  it("hugs a short passage instead of drawing the panel its frame allows", () => {
    const panel = { type: "shape" as const, x: 0.05, y: 0.38, width: 0.9, height: 0.3, fillToken: "surface", padText: "line" };
    const hugged = render([panel, { ...line, y: 0.4, height: 0.26 }]);
    const fixed = render([{ ...panel, padText: undefined }, { ...line, y: 0.4, height: 0.26 }]);
    const heightOf = (svg: string) => Number(/<rect x="54" y="513" width="972" height="([\d.]+)"/u.exec(svg)?.[1] ?? 0);
    expect(heightOf(hugged)).toBeGreaterThan(0);
    expect(heightOf(hugged)).toBeLessThan(heightOf(fixed));
  });
});
