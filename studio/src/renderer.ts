import { createHash } from "node:crypto";
import {
  BrandTokensSchema,
  CarouselPayloadSchema,
  CarouselTemplateSchema,
  type BrandTokens,
  type CarouselFormat,
  type CarouselLayer,
  type CarouselPayload,
  type CarouselTemplate
} from "./schema.js";
import { fitText } from "./text.js";
import { fontFiles, measureEm, resolveFace } from "./fonts.js";
import { validateTemplateForBrand } from "./validation.js";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function px(value: number, total: number): number {
  return Math.round(value * total * 1_000) / 1_000;
}

/** Three decimal places, so the same arithmetic writes the same string on every machine. */
function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

/** The wordmark's weight and letter-spacing. Fixed, because a wordmark is not a design axis. */
const LOGO_WEIGHT = 800;
const LOGO_TRACKING = 0.03;

function token(brand: BrandTokens, name: string): string {
  const value = brand.colors[name];
  if (!value) throw new Error(`Brand ${brand.id} does not define color token ${name}`);
  return value.toLowerCase();
}

function layerSvg(input: {
  layer: CarouselLayer;
  payload: CarouselPayload;
  brand: BrandTokens;
  width: number;
  height: number;
  accentToken?: string;
  /** Collector for slots whose text had to be clipped to fit. */
  truncatedSlots?: string[];
  /** Decoded PNG bytes per image slot. Absent means the slide draws without a photograph. */
  images?: Readonly<Record<string, Buffer>>;
  /** Drawn text height per slot on this slide, so a `padText` panel can hug it. */
  hugged?: Readonly<Record<string, number>>;
  /** Unique per layer, so two gradients on one slide cannot share an SVG id. */
  uid: string;
}): string {
  const { layer, payload, brand, width, height } = input;
  const x = px(layer.x, width);
  const y = px(layer.y, height);
  const w = px(layer.width, width);
  const h = px(layer.height, height);
  const color = (name: string) => token(brand, name === "accent" && input.accentToken ? input.accentToken : name);
  if (layer.type === "shape") {
    const fill = layer.fillToken === "accent" && input.accentToken ? input.accentToken : layer.fillToken;
    // Strokes follow the variant's accent remap exactly as fills and inks do. They did not until
    // the launch families ringed their portholes in the accent, and the B render kept variant A's
    // colour on the one element that frames the photograph.
    const stroke = layer.strokeToken ? ` stroke="${color(layer.strokeToken)}" stroke-width="${layer.strokeWidth}"` : "";
    // A panel that hugs its text is the declared frame trimmed to what the text actually needs.
    // The frame stays the maximum — it is what the contrast check measured — and the drawn
    // rectangle is never larger than it.
    const hug = layer.padText === undefined ? null : input.hugged?.[layer.padText];
    const padding = px(layer.padding, Math.min(width, height));
    const panelHeight = hug === undefined || hug === null ? h : Math.min(h, hug + padding * 2);
    return `<rect x="${x}" y="${y}" width="${w}" height="${panelHeight}" rx="${px(layer.radius, Math.min(w, panelHeight))}" fill="${token(brand, fill)}"${stroke}/>`;
  }
  if (layer.type === "rule") {
    const thickness = Math.max(layer.thickness, h);
    if (!layer.dash) {
      return `<rect x="${x}" y="${y}" width="${w}" height="${thickness}" fill="${color(layer.colorToken)}"/>`;
    }
    // Derived from the thickness so the dash scales with the rule rather than with the canvas.
    const on = Math.round(thickness * 3);
    const off = Math.round(thickness * 2);
    const centre = y + thickness / 2;
    return `<line x1="${x}" y1="${centre}" x2="${x + w}" y2="${centre}" stroke="${color(layer.colorToken)}"`
      + ` stroke-width="${thickness}" stroke-dasharray="${on} ${off}" stroke-linecap="butt"/>`;
  }
  if (layer.type === "linear-gradient") {
    const id = `grad-${input.uid}`;
    // The angle is clockwise from the top of the canvas, which is how a designer reads it; SVG
    // wants two points, so it becomes a unit vector across the layer's own box.
    const radians = (layer.angle - 90) * (Math.PI / 180);
    const dx = Math.cos(radians) / 2;
    const dy = Math.sin(radians) / 2;
    const round = (value: number) => Math.round(value * 10_000) / 10_000;
    const stops = layer.stops.map((stop) =>
      `<stop offset="${round(stop.offset)}" stop-color="${color(stop.colorToken)}"/>`
    ).join("");
    return `<defs><linearGradient id="${id}" x1="${round(0.5 - dx)}" y1="${round(0.5 - dy)}" x2="${round(0.5 + dx)}" y2="${round(0.5 + dy)}">${stops}</linearGradient></defs>`
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id})"/>`;
  }
  if (layer.type === "logo") {
    /*
     * Sized to the frame and to the mark, and now to the face as well.
     *
     * The old arithmetic guessed a wordmark's width from its character count, which is what a
     * renderer does when it has no metrics: `MMA FILES` and `TITTY TUESDAYS` were charged the
     * same per character in a condensed face and in a black one. The measured width is the
     * honest constraint, so the mark fills its frame in every family instead of in one.
     */
    const face = resolveFace(brand.fonts[layer.fontToken], LOGO_WEIGHT);
    const tracked = (size: number) => (measureEm(face, brand.logoText) + LOGO_TRACKING * [...brand.logoText].length) * size;
    const byHeight = h * 0.72;
    const size = Math.max(18, Math.min(byHeight, tracked(byHeight) > w ? (w / tracked(1)) : byHeight));
    return `<text x="${x}" y="${y + size}" fill="${color(layer.colorToken)}" font-family="${escapeXml(face.familyName)}" font-size="${round(size)}" font-weight="${LOGO_WEIGHT}" letter-spacing="${round(LOGO_TRACKING * size)}">${escapeXml(brand.logoText)}</text>`;
  }
  if (layer.type === "mesh") {
    // Several wide, blurred colour fields that overlap into a mesh. Built from radial gradients
    // rather than a bitmap so it renders offline and at any canvas size, and from token colours
    // so the same mesh reads as each venture's own palette.
    const id = `mesh-${input.uid}`;
    const blur = Math.max(1, Math.min(width, height) * layer.softness);
    const stops = layer.blobs.map((blob, index) => {
      const fill = color(blob.colorToken);
      return `<radialGradient id="${id}-${index}"><stop offset="0%" stop-color="${fill}" stop-opacity="${blob.opacity}"/><stop offset="100%" stop-color="${fill}" stop-opacity="0"/></radialGradient>`;
    }).join("");
    const circles = layer.blobs.map((blob, index) =>
      `<circle cx="${x + blob.cx * w}" cy="${y + blob.cy * h}" r="${blob.radius * Math.max(w, h)}" fill="url(#${id}-${index})"/>`
    ).join("");
    return `<defs>${stops}<filter id="${id}-soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${blur.toFixed(2)}"/></filter></defs><g filter="url(#${id}-soft)" clip-path="url(#${id}-clip)"><clipPath id="${id}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>${circles}</g>`;
  }
  if (layer.type === "image") {
    // The article's own hero. Supplied as decoded bytes rather than carried in the payload: the
    // payload is hashed into the pack and stored in git, and a 200 kB base64 photo does not
    // belong in either. Absent bytes draw nothing and the slide still renders, because a
    // missing photograph is not a reason to lose the words.
    const bytes = input.images?.[layer.slot];
    if (!bytes) return "";
    const id = `img-${input.uid}`;
    // librsvg does not decode WebP inside a data URI — it silently draws nothing — so callers
    // hand over PNG. Verified by rendering all three: only PNG and JPEG appear.
    const href = `data:image/png;base64,${bytes.toString("base64")}`;
    // The window the photograph is seen through. A circle takes the frame's inscribed disc; a
    // polygon's points are fractions of the frame, so the same shape holds at every canvas.
    const window = layer.clip === undefined
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`
      : layer.clip === "circle"
        ? `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${Math.min(w, h) / 2}"/>`
        : `<polygon points="${layer.clip.map(([px_, py]) => `${x + px_ * w},${y + py * h}`).join(" ")}"/>`;
    const scrim = layer.scrim === "none" ? "" : layer.scrim === "full"
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${token(brand, "background")}" opacity="0.55"/>`
      : `<defs><linearGradient id="${id}-scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="55%" stop-color="${token(brand, "background")}" stop-opacity="0"/><stop offset="100%" stop-color="${token(brand, "background")}" stop-opacity="0.96"/></linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}-scrim)"/>`;
    return `<defs><clipPath id="${id}-clip">${window}</clipPath></defs>`
      + `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${layer.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}" clip-path="url(#${id}-clip)"/>`
      + scrim;
  }
  const fitted = fitTextLayer(layer, payload, brand, width, height);
  if (fitted.truncated) input.truncatedSlots?.push(layer.slot);
  const anchor = layer.align === "start" ? "start" : layer.align;
  const textX = layer.align === "start" ? x : layer.align === "middle" ? x + w / 2 : x + w;
  const lineHeight = fitted.fontSize * 1.12;
  const tspans = fitted.lines.map((line, index) =>
    `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join("");
  // Both optional and both default to off, so a v1 layer renders the string it always did.
  const tracking = layer.tracking === 0 ? "" : ` letter-spacing="${Math.round(layer.tracking * fitted.fontSize * 1_000) / 1_000}"`;
  const glowId = `glow-${input.uid}`;
  const glow = layer.glow
    ? `<defs><filter id="${glowId}" x="-25%" y="-25%" width="150%" height="150%">`
      + `<feDropShadow dx="0" dy="0" stdDeviation="${Math.round(fitted.fontSize * 0.18 * 100) / 100}"`
      + ` flood-color="${color("accent")}" flood-opacity="0.55"/></filter></defs>`
    : "";
  const filter = layer.glow ? ` filter="url(#${glowId})"` : "";
  const face = resolveFace(brand.fonts[layer.fontToken], layer.fontWeight);
  return `${glow}<text x="${textX}" y="${y + fitted.fontSize}" text-anchor="${anchor}" fill="${color(layer.colorToken)}" font-family="${escapeXml(face.familyName)}" font-size="${fitted.fontSize}" font-weight="${face.weight}"${tracking}${filter}>${tspans}</text>`;
}

/** One text layer, fitted for one canvas. Shared so a hugging panel measures what the text does. */
function fitTextLayer(
  layer: Extract<CarouselLayer, { type: "text" }>,
  payload: CarouselPayload,
  brand: BrandTokens,
  width: number,
  height: number
) {
  const raw = payload.strings[layer.slot] ?? "";
  const value = layer.uppercase ? raw.toLocaleUpperCase(payload.locale) : raw;
  return fitText({
    value,
    locale: payload.locale,
    widthPx: px(layer.width, width),
    heightPx: px(layer.height, height),
    minFontSize: layer.minFontSize * (width / 1_080),
    maxFontSize: layer.maxFontSize * (width / 1_080),
    maxLines: layer.maxLines,
    maxChars: layer.maxChars,
    tracking: layer.tracking,
    fontFamily: brand.fonts[layer.fontToken],
    fontWeight: layer.fontWeight
  });
}

export interface RenderedSlide {
  slideId: string;
  index: number;
  format: CarouselFormat;
  svg: string;
  svgHash: string;
  /** Slots whose text did not fit and were clipped. Empty when the slide rendered whole. */
  truncatedSlots: string[];
}

export interface CarouselRenderInput {
  template: CarouselTemplate;
  payload: CarouselPayload;
  brand: BrandTokens;
  format: CarouselFormat;
  /** Decoded PNG bytes per image slot. WebP will not decode inside an SVG data URI. */
  images?: Readonly<Record<string, Buffer>>;
}

/**
 * Build the deck's slides — or, given `wanted`, only that one.
 *
 * `wanted` narrows which slides get built, never how one is built. The slide keeps its real deck
 * index, and the index is the only thing about a slide that its neighbours contribute: it seeds
 * the per-layer SVG ids and it numbers the title. So slide four rendered alone is the same string
 * as slide four rendered fourth, which is what lets a preview serve one slide and still be the
 * bytes the pipeline would ship.
 *
 * Everything that judges the whole template — required slots, brand checks — still runs over the
 * whole template. A deck that would fail on slide nine must not quietly pass because the caller
 * only asked for slide one.
 */
function renderSlides(input: CarouselRenderInput, wanted?: number): RenderedSlide[] {
  const template = CarouselTemplateSchema.parse(input.template);
  const payload = CarouselPayloadSchema.parse(input.payload);
  const brand = BrandTokensSchema.parse(input.brand);
  const missing = template.requiredSlots.filter((slot) => payload.strings[slot] === undefined);
  if (missing.length) throw new Error(`Carousel payload is missing slots: ${missing.join(", ")}`);
  const checks = validateTemplateForBrand(template, brand, input.format);
  const failed = checks.filter((check) => check.status === "fail");
  if (failed.length) throw new Error(`Template checks failed: ${failed.map((check) => check.detail).join("; ")}`);
  const canvas = template.formats[input.format];
  const build = (slide: CarouselTemplate["slides"][number], index: number): RenderedSlide => {
    const variant = payload.variant ? slide.variants.find((candidate) => candidate.id === payload.variant) : undefined;
    const backgroundToken = variant?.backgroundToken ?? slide.backgroundToken;
    // Which slots did not fit, per slide. fitText has always known; the renderer discarded the
    // answer, so an over-long slide clipped to an ellipsis and nothing said so. A word limit
    // that the renderer silently enforces by cutting is not a limit, it is a surprise.
    const truncatedSlots: string[] = [];
    // Measured before anything is drawn, because a panel is drawn under the text it hugs and so
    // has to know the text's height before the text exists in the output.
    const hugged = Object.fromEntries(slide.layers.flatMap((layer) => {
      if (layer.type !== "text") return [];
      const fitted = fitTextLayer(layer, payload, brand, canvas.width, canvas.height);
      return [[layer.slot, fitted.lines.length * fitted.fontSize * 1.12] as const];
    }));
    const content = slide.layers.map((layer, layerIndex) => layerSvg({
      layer,
      payload,
      brand,
      width: canvas.width,
      height: canvas.height,
      accentToken: variant?.accentToken,
      truncatedSlots,
      images: input.images,
      hugged,
      // Slide and layer, so two gradients on one deck cannot collide on an SVG id.
      uid: `${index}-${layerIndex}`
    })).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(template.name)} ${index + 1}</title><desc id="desc">Original ${escapeXml(brand.name)} carousel layout rendered by the Design Lab.</desc><rect width="${canvas.width}" height="${canvas.height}" fill="${token(brand, backgroundToken)}"/>${content}</svg>`;
    return {
      slideId: slide.id,
      index,
      format: input.format,
      svg,
      svgHash: createHash("sha256").update(svg).digest("hex"),
      truncatedSlots
    };
  };
  if (wanted === undefined) return template.slides.map(build);
  const slide = template.slides[wanted];
  return slide ? [build(slide, wanted)] : [];
}

export function renderCarouselSvg(input: CarouselRenderInput): RenderedSlide[] {
  return renderSlides(input);
}

/**
 * One slide of the deck, identical to `renderCarouselSvg(input)[index]`.
 *
 * Null when the deck has no such slide, which is a 404 and not an error.
 */
export function renderCarouselSlideSvg(input: CarouselRenderInput & { index: number }): RenderedSlide | null {
  return renderSlides(input, input.index)[0] ?? null;
}

/**
 * The photograph, as the template asked for it.
 *
 * Done with sharp before the bytes reach the SVG, never as an SVG filter: librsvg's filter
 * support is the same quiet-failure surface as its WebP handling, and a treatment that silently
 * does nothing is worse than one that is not offered. `duotone` multiplies the greyscale by the
 * slide's accent, which is what makes it read as the venture's own colour rather than as a filter.
 *
 * Returns the input untouched when nothing asks for a treatment, so a v1 template's bytes — and
 * therefore its hashes — are exactly what they were.
 */
export async function treatImage(
  bytes: Buffer,
  treatment: "none" | "mono" | "duotone",
  accentHex: string
): Promise<Buffer> {
  if (treatment === "none") return bytes;
  const { default: sharp } = await import("sharp");
  const grey = sharp(bytes).greyscale();
  if (treatment === "mono") return grey.png().toBuffer();
  const [red, green, blue] = [1, 3, 5].map((offset) => Number.parseInt(accentHex.slice(offset, offset + 2), 16));
  return grey
    .toColourspace("srgb")
    .linear([red! / 255, green! / 255, blue! / 255], [0, 0, 0])
    .png()
    .toBuffer();
}

async function treatedImages(input: CarouselRenderInput): Promise<CarouselRenderInput["images"]> {
  const images = input.images;
  if (!images) return images;
  const wanted = new Map<string, "mono" | "duotone">();
  for (const slide of input.template.slides) {
    const variant = input.payload.variant
      ? slide.variants.find((candidate) => candidate.id === input.payload.variant)
      : undefined;
    for (const layer of slide.layers) {
      if (layer.type !== "image" || layer.treatment === "none") continue;
      // One slot may appear twice — a reprise — and both appearances share the treated bytes.
      wanted.set(`${layer.slot}\0${variant?.accentToken ?? "accent"}`, layer.treatment);
    }
  }
  if (wanted.size === 0) return images;
  const treated: Record<string, Buffer> = { ...images };
  for (const [key, treatment] of wanted) {
    const [slot, accentToken] = key.split("\0") as [string, string];
    const source = images[slot];
    if (!source) continue;
    treated[slot] = await treatImage(source, treatment, token(input.brand, accentToken));
  }
  return treated;
}

/*
 * Rasterised by resvg with the repository's own fonts, and with the operating system's shut out.
 *
 * The alternative was to keep sharp's librsvg and bundle a fontconfig file for it. Both were
 * evaluated in place. librsvg resolves faces through fontconfig, which means the answer depends
 * on an environment variable, on the fontconfig build inside a prebuilt sharp binary, and on
 * whichever system fonts happen to sit alongside ours — and when it cannot find a face it
 * substitutes one without saying so, which is the exact failure this task exists to end. resvg
 * takes the font files as an explicit list and `loadSystemFonts: false` removes the machine from
 * the question entirely: the only faces in the database are the thirty committed here. That is
 * what makes the CI run a real second machine rather than a second guess.
 *
 * sharp stays for what it is good at — decoding a WebP hero and applying a photo treatment before
 * the bytes reach the SVG.
 */
async function rasterise(
  slides: readonly RenderedSlide[]
): Promise<Array<RenderedSlide & { png: Buffer; pngHash: string }>> {
  const { Resvg } = await import("@resvg/resvg-js");
  const font = { loadSystemFonts: false, fontFiles: fontFiles(), defaultFontFamily: "IBM Plex Sans" };
  return slides.map((slide) => {
    const png = Buffer.from(new Resvg(slide.svg, { font }).render().asPng());
    return { ...slide, png, pngHash: createHash("sha256").update(png).digest("hex") };
  });
}

export async function renderCarouselPng(
  input: CarouselRenderInput
): Promise<Array<RenderedSlide & { png: Buffer; pngHash: string }>> {
  return rasterise(renderSlides({ ...input, images: await treatedImages(input) }));
}

/**
 * One slide's PNG, identical to `(await renderCarouselPng(input))[index]`.
 *
 * A preview that shows a reader one slide should cost one rasterisation. Going through
 * `renderCarouselPng` and discarding the rest cost a whole deck per slide, so opening a ten-slide
 * deck rasterised a hundred images to show ten.
 */
export async function renderCarouselSlidePng(
  input: CarouselRenderInput & { index: number }
): Promise<(RenderedSlide & { png: Buffer; pngHash: string }) | null> {
  const [rendered] = await rasterise(renderSlides({ ...input, images: await treatedImages(input) }, input.index));
  return rendered ?? null;
}

/**
 * Decode any stored image into the PNG bytes an image layer can embed.
 *
 * librsvg draws nothing at all for a WebP data URI — no error, no image, just the background —
 * and heroes are stored as WebP. Verified by rendering all three encodings and sampling pixels.
 * This lives beside the renderer because it is the renderer's requirement, not the caller's
 * problem, and it keeps sharp out of every package that wants a slide.
 *
 * Returns null rather than throwing: a hero that will not decode is a slide without a
 * photograph, which is a worse slide and not a failed render.
 */
export async function toRenderablePng(bytes: Buffer | Uint8Array): Promise<Buffer | null> {
  try {
    const { default: sharp } = await import("sharp");
    return await sharp(Buffer.from(bytes)).png().toBuffer();
  } catch {
    return null;
  }
}
