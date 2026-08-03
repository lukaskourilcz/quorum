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
  if (layer.type === "image") return "";
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
    const content = slide.layers.map((layer) => layerSvg({
      layer,
      payload,
      brand,
      width: canvas.width,
      height: canvas.height,
      accentToken: variant?.accentToken,
      truncatedSlots
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
