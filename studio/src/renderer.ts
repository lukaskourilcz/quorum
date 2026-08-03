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
    const stroke = layer.strokeToken ? ` stroke="${token(brand, layer.strokeToken)}" stroke-width="${layer.strokeWidth}"` : "";
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${px(layer.radius, Math.min(w, h))}" fill="${token(brand, fill)}"${stroke}/>`;
  }
  if (layer.type === "rule") {
    return `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(layer.thickness, h)}" fill="${color(layer.colorToken)}"/>`;
  }
  if (layer.type === "logo") {
    const font = brand.fonts[layer.fontToken];
    const size = Math.max(18, Math.min(h * 0.72, w / Math.max(4, brand.logoText.length) * 1.45));
    return `<text x="${x}" y="${y + size}" fill="${color(layer.colorToken)}" font-family="${escapeXml(font)}" font-size="${size}" font-weight="800" letter-spacing="1.5">${escapeXml(brand.logoText)}</text>`;
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
    const scrim = layer.scrim === "none" ? "" : layer.scrim === "full"
      ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${token(brand, "background")}" opacity="0.55"/>`
      : `<defs><linearGradient id="${id}-scrim" x1="0" y1="0" x2="0" y2="1"><stop offset="55%" stop-color="${token(brand, "background")}" stop-opacity="0"/><stop offset="100%" stop-color="${token(brand, "background")}" stop-opacity="0.96"/></linearGradient></defs><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}-scrim)"/>`;
    return `<defs><clipPath id="${id}-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>`
      + `<image href="${href}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="${layer.fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}" clip-path="url(#${id}-clip)"/>`
      + scrim;
  }
  const raw = payload.strings[layer.slot] ?? "";
  const value = layer.uppercase ? raw.toLocaleUpperCase(payload.locale) : raw;
  const fitted = fitText({
    value,
    locale: payload.locale,
    widthPx: w,
    heightPx: h,
    minFontSize: layer.minFontSize * (width / 1_080),
    maxFontSize: layer.maxFontSize * (width / 1_080),
    maxLines: layer.maxLines,
    maxChars: layer.maxChars
  });
  if (fitted.truncated) input.truncatedSlots?.push(layer.slot);
  const anchor = layer.align === "start" ? "start" : layer.align;
  const textX = layer.align === "start" ? x : layer.align === "middle" ? x + w / 2 : x + w;
  const lineHeight = fitted.fontSize * 1.12;
  const tspans = fitted.lines.map((line, index) =>
    `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join("");
  return `<text x="${textX}" y="${y + fitted.fontSize}" text-anchor="${anchor}" fill="${color(layer.colorToken)}" font-family="${escapeXml(brand.fonts[layer.fontToken])}" font-size="${fitted.fontSize}" font-weight="${layer.fontWeight}">${tspans}</text>`;
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

export function renderCarouselSvg(input: {
  template: CarouselTemplate;
  payload: CarouselPayload;
  brand: BrandTokens;
  format: CarouselFormat;
  /** Decoded PNG bytes per image slot. WebP will not decode inside an SVG data URI. */
  images?: Readonly<Record<string, Buffer>>;
}): RenderedSlide[] {
  const template = CarouselTemplateSchema.parse(input.template);
  const payload = CarouselPayloadSchema.parse(input.payload);
  const brand = BrandTokensSchema.parse(input.brand);
  const missing = template.requiredSlots.filter((slot) => payload.strings[slot] === undefined);
  if (missing.length) throw new Error(`Carousel payload is missing slots: ${missing.join(", ")}`);
  const checks = validateTemplateForBrand(template, brand, input.format);
  const failed = checks.filter((check) => check.status === "fail");
  if (failed.length) throw new Error(`Template checks failed: ${failed.map((check) => check.detail).join("; ")}`);
  const canvas = template.formats[input.format];
  return template.slides.map((slide, index) => {
    const variant = payload.variant ? slide.variants.find((candidate) => candidate.id === payload.variant) : undefined;
    const backgroundToken = variant?.backgroundToken ?? slide.backgroundToken;
    // Which slots did not fit, per slide. fitText has always known; the renderer discarded the
    // answer, so an over-long slide clipped to an ellipsis and nothing said so. A word limit
    // that the renderer silently enforces by cutting is not a limit, it is a surprise.
    const truncatedSlots: string[] = [];
    const content = slide.layers.map((layer, layerIndex) => layerSvg({
      layer,
      payload,
      brand,
      width: canvas.width,
      height: canvas.height,
      accentToken: variant?.accentToken,
      truncatedSlots,
      images: input.images,
      // Slide and layer, so two gradients on one deck cannot collide on an SVG id.
      uid: `${index}-${layerIndex}`
    })).join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" role="img" aria-labelledby="title desc"><title id="title">${escapeXml(template.name)} ${index + 1}</title><desc id="desc">Original ${escapeXml(brand.name)} carousel layout rendered by Carousel Studio.</desc><rect width="${canvas.width}" height="${canvas.height}" fill="${token(brand, backgroundToken)}"/>${content}</svg>`;
    return {
      slideId: slide.id,
      index,
      format: input.format,
      svg,
      svgHash: createHash("sha256").update(svg).digest("hex"),
      truncatedSlots
    };
  });
}

export async function renderCarouselPng(input: {
  template: CarouselTemplate;
  payload: CarouselPayload;
  brand: BrandTokens;
  format: CarouselFormat;
  images?: Readonly<Record<string, Buffer>>;
}): Promise<Array<RenderedSlide & { png: Buffer; pngHash: string }>> {
  const { default: sharp } = await import("sharp");
  const slides = renderCarouselSvg(input);
  return Promise.all(slides.map(async (slide) => {
    const png = await sharp(Buffer.from(slide.svg))
      .png({ compressionLevel: 9, effort: 10, palette: true })
      .toBuffer();
    return { ...slide, png, pngHash: createHash("sha256").update(png).digest("hex") };
  }));
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
