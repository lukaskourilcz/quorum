/**
 * What the reader actually sees behind every set of words, resolved once for every measure.
 *
 * A leaf module, importing only the schema's types — the ring-avoidance rule `canvas.ts` and
 * `designs.ts` both state at their own tops.
 *
 * This logic used to live inside `contrastCheck`'s closure, and it had to come out the moment a
 * second readability measure arrived. Two measures that each resolve their own grounds are two
 * answers to "what is behind this line of type", and two answers drift: the WCAG floor would be
 * measuring a panel while APCA measured the slide background, and the pair that failed would be
 * the pair nobody looked at. `validation.ts` and `contrast-apca.ts` now read this one list and
 * differ only in the arithmetic they apply to it.
 */
import type { BrandTokens, CarouselTemplate } from "./schema.js";

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

/**
 * One text or logo frame, the colour it is drawn in, and everything that can end up behind it.
 *
 * The smallest size and the weight travel with the pair because a readability floor depends on
 * them: 4.5:1 is one number for every size, but APCA's is not, and a threshold chosen without the
 * type size is a threshold chosen for the wrong text. A logo carries the renderer's own floor —
 * 18 px at weight 800 — rather than a guess, because that is what `layerSvg` clamps it to.
 */
export interface TextGround {
  slideId: string;
  /** The slot name, or `logo`. Spelled exactly as a failing check reports it. */
  target: string;
  foreground: string;
  /** Every colour that can sit behind those words in this rendering. */
  grounds: string[];
  minFontSize: number;
  fontWeight: number;
}

/** The renderer's own lower bound for a wordmark: `Math.max(18, …)` at `LOGO_WEIGHT`. */
const LOGO_MIN_FONT_SIZE = 18;
const LOGO_FONT_WEIGHT = 800;

/** Every text and logo frame in this template, once per rendering the slide can produce. */
export function textGroundPairs(template: CarouselTemplate, brand: BrandTokens): TextGround[] {
  const pairs: TextGround[] = [];
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
        pairs.push({
          slideId: slide.id,
          target: layer.type === "text" ? layer.slot : "logo",
          foreground,
          grounds: candidates,
          minFontSize: layer.type === "text" ? layer.minFontSize : LOGO_MIN_FONT_SIZE,
          fontWeight: layer.type === "text" ? layer.fontWeight : LOGO_FONT_WEIGHT
        });
      });
    }
  });
  return pairs;
}
