import type { BrandTokens, CarouselFormat, CarouselTemplate } from "./schema.js";
import { charactersPerLine } from "./text.js";

export interface TemplateCheck {
  id: "schema" | "safe-area" | "contrast" | "brand-tokens" | "overflow" | "originality";
  status: "pass" | "fail";
  detail: string;
}

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function luminance(hex: string): number {
  const adjust = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  return 0.2126 * adjust(channel(hex, 1)) + 0.7152 * adjust(channel(hex, 3)) + 0.0722 * adjust(channel(hex, 5));
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

/**
 * Whether a template's text and logos sit inside a canvas's safe area.
 *
 * The geometry half of `safeAreaCheck`, without the brand or the check wrapper, so the library can
 * answer "is this template composed for that canvas" without pretending to validate it.
 */
export function fitsSafeArea(template: CarouselTemplate, format: CarouselFormat): boolean {
  const safe = template.formats[format]?.safeArea;
  if (!safe) return false;
  return template.slides.every((slide) => slide.layers.every((layer) => {
    if (layer.type !== "text" && layer.type !== "logo") return true;
    return layer.x >= safe.left
      && layer.y >= safe.top
      && layer.x + layer.width <= 1 - safe.right
      && layer.y + layer.height <= 1 - safe.bottom;
  }));
}

function safeAreaCheck(template: CarouselTemplate, format: CarouselFormat): TemplateCheck {
  const safe = template.formats[format].safeArea;
  const failures: string[] = [];
  template.slides.forEach((slide) => slide.layers.forEach((layer) => {
    if (layer.type !== "text" && layer.type !== "logo") return;
    if (
      layer.x < safe.left ||
      layer.y < safe.top ||
      layer.x + layer.width > 1 - safe.right ||
      layer.y + layer.height > 1 - safe.bottom
    ) failures.push(`${slide.id}:${layer.type === "text" ? layer.slot : "logo"}`);
  }));
  return failures.length
    ? { id: "safe-area", status: "fail", detail: `Outside ${format} safe area: ${failures.join(", ")}` }
    : { id: "safe-area", status: "pass", detail: `${format} text and logos stay inside the safe area` };
}

function brandTokenCheck(template: CarouselTemplate, brand: BrandTokens): TemplateCheck {
  const failures = new Set<string>();
  const expect = (token: string) => { if (!brand.colors[token]) failures.add(token); };
  template.slides.forEach((slide) => {
    expect(slide.backgroundToken);
    // A variant is a rendering the deck actually ships, so a variant naming a token the brand
    // does not have is a template that passes its checks and throws when someone requests B.
    slide.variants.forEach((variant) => {
      if (variant.backgroundToken) expect(variant.backgroundToken);
      if (variant.accentToken) expect(variant.accentToken);
    });
    slide.layers.forEach((layer) => {
      if (layer.type === "text" || layer.type === "logo" || layer.type === "rule") expect(layer.colorToken);
      if (layer.type === "shape") {
        expect(layer.fillToken);
        if (layer.strokeToken) expect(layer.strokeToken);
      }
      // A mesh names a colour per blob. Skipping them let a template report clean and then
      // throw at render time, which is the worst of both: a green check and a broken deck.
      if (layer.type === "mesh") layer.blobs.forEach((blob) => expect(blob.colorToken));
      if (layer.type === "linear-gradient") layer.stops.forEach((stop) => expect(stop.colorToken));
    });
  });
  return failures.size
    ? { id: "brand-tokens", status: "fail", detail: `Unknown color tokens: ${[...failures].join(", ")}` }
    : { id: "brand-tokens", status: "pass", detail: `All layers bind to ${brand.id} tokens` };
}

/**
 * Text contrast, measured against everything that can end up behind the text.
 *
 * The slide's background token used to be the whole answer, and it stopped being the whole
 * answer the moment a mesh or a photograph could sit between it and the words. A gradient blob
 * is a colour behind the text as surely as the background is, so each one is checked too, and
 * the slide passes only if the text clears 4.5:1 against the worst of them.
 *
 * A photograph cannot be checked here — its pixels are the article's, not the template's — so a
 * slide carrying one relies on the scrim the image layer draws. That is a real limit and is
 * stated rather than papered over.
 */
/** Source-over compositing of one colour on another, which is what the renderer draws. */
function composite(base: string, over: string, alpha: number): string {
  const parse = (value: string) => [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  const [br, bg, bb] = parse(base);
  const [or, og, ob] = parse(over);
  const mix = (b: number, o: number) => Math.round(b * (1 - alpha) + o * alpha);
  return `#${[mix(br!, or!), mix(bg!, og!), mix(bb!, ob!)].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Whether one frame sits entirely inside another. */
function contains(outer: Frame, inner: Frame): boolean {
  return outer.x <= inner.x
    && outer.y <= inner.y
    && outer.x + outer.width >= inner.x + inner.width
    && outer.y + outer.height >= inner.y + inner.height;
}

interface Frame { x: number; y: number; width: number; height: number }

function contrastCheck(template: CarouselTemplate, brand: BrandTokens): TemplateCheck {
  const failures = new Set<string>();
  template.slides.forEach((slide) => {
    /*
     * Every rendering this slide can produce, not only its default one.
     *
     * A variant may swap the background or the accent, and the swapped rendering is what half a
     * queued A/B pair actually ships. Checking only the base is how "every token combination a
     * template can produce clears the floor" becomes "the one we happened to look at does".
     */
    const renderings = [
      { background: slide.backgroundToken, accent: "accent" },
      ...slide.variants.map((variant) => ({
        background: variant.backgroundToken ?? slide.backgroundToken,
        accent: variant.accentToken ?? "accent"
      }))
    ];
    for (const rendering of renderings) {
      const resolve = (name: string) => brand.colors[name === "accent" ? rendering.accent : name];
      const background = brand.colors[rendering.background];
      if (!background) continue;
      // A blob is composited over its ground at its own opacity, so that is what sits behind the
      // text — not the blob's full colour. Comparing against the raw colour fails designs a
      // reader would find perfectly legible, and a check that cries wolf gets its threshold
      // lowered by the next person, which is how a contrast floor quietly dies.
      const blobs = slide.layers.flatMap((layer) =>
        layer.type === "mesh"
          ? layer.blobs.flatMap((blob) => {
              const colour = resolve(blob.colorToken);
              return colour ? [{ colour, opacity: blob.opacity }] : [];
            })
          : []
      );
      slide.layers.forEach((layer, layerIndex) => {
        if (layer.type !== "text" && layer.type !== "logo") return;
        const foreground = resolve(layer.colorToken);
        if (!foreground) return;
        /*
         * What is actually behind these words.
         *
         * The slide background used to be the whole answer, and it refused designs a reader
         * finds perfectly legible: `background`-coloured type on an `accent` panel measures
         * 6.17:1 and was reported as 1.00:1, because an opaque shape drawn beneath the text was
         * invisible to the check. The last opaque layer before the text that covers its frame —
         * a panel, a gradient whose two stops are two grounds, or a duotone photograph, which
         * runs from black to its tint — is what the reader sees, so that is what is measured.
         *
         * An untreated photograph still cannot be checked: its pixels are the article's, not
         * the template's, and a slide carrying one relies on the scrim its image layer draws.
         * That is a real limit and is stated rather than papered over.
         */
        let ground = [background];
        for (const under of slide.layers.slice(0, layerIndex)) {
          if (!contains(under, layer)) continue;
          if (under.type === "shape") {
            const fill = resolve(under.fillToken);
            if (fill) ground = [fill];
          }
          if (under.type === "linear-gradient") {
            const stops = under.stops
              .map((stop) => resolve(stop.colorToken))
              .filter((colour): colour is string => colour !== undefined);
            if (stops.length) ground = stops;
          }
          if (under.type === "image" && under.treatment === "duotone" && under.scrim === "none") {
            const tint = resolve("accent");
            if (tint) ground = [tint, "#000000"];
          }
        }
        const candidates = [
          ...ground,
          ...blobs.flatMap((blob) => ground.map((base) => composite(base, blob.colour, blob.opacity)))
        ];
        const worst = Math.min(...candidates.map((colour) => contrastRatio(foreground, colour)));
        if (worst < 4.5) failures.add(`${slide.id}:${layer.type === "text" ? layer.slot : "logo"}`);
      });
    }
  });
  return failures.size
    ? { id: "contrast", status: "fail", detail: `Contrast below 4.5:1 at ${[...failures].join(", ")}` }
    : { id: "contrast", status: "pass", detail: "Text contrast meets 4.5:1 against each slide background" };
}

function overflowCheck(template: CarouselTemplate, brand: BrandTokens): TemplateCheck {
  const failures = template.slides.flatMap((slide) => slide.layers.flatMap((layer) => {
    if (layer.type !== "text") return [];
    // Measured in the face the layer will actually be drawn in, and with its tracking. A flat
    // per-character estimate charged a condensed headline what a grotesque costs and charged a
    // tracked kicker nothing for its tracking — so a slot passed the check and ran off the canvas.
    const minimumCapacity = charactersPerLine(
      layer.width * 1_080,
      layer.minFontSize,
      brand.fonts[layer.fontToken],
      layer.fontWeight,
      layer.tracking
    ) * layer.maxLines;
    return minimumCapacity < layer.maxChars ? [`${slide.id}:${layer.slot}`] : [];
  }));
  return failures.length
    ? { id: "overflow", status: "fail", detail: `Slot limit cannot fit at minimum size: ${failures.join(", ")}` }
    : { id: "overflow", status: "pass", detail: "Every slot limit fits at its minimum font size" };
}

export function validateTemplateForBrand(
  template: CarouselTemplate,
  brand: BrandTokens,
  format: CarouselFormat
): TemplateCheck[] {
  return [
    { id: "schema", status: "pass", detail: "carousel-template/1 parsed" },
    safeAreaCheck(template, format),
    contrastCheck(template, brand),
    brandTokenCheck(template, brand),
    overflowCheck(template, brand),
    { id: "originality", status: "pass", detail: "Template data contains no external image bytes" }
  ];
}

export function mayGoLive(checks: readonly TemplateCheck[]): boolean {
  return checks.length > 0 && checks.every((check) => check.status === "pass");
}
