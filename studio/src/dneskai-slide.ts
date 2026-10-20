import { createHash } from "node:crypto";
import { CONNECTOR_MAX_SLIDES, MASTER_CANVAS, MASTER_FORMAT } from "./canvas.js";
import { DNESKAI_MAX_SOURCES, DNESKAI_MAX_THUMBNAILS, DNESKAI_PHOTO_TEMPLATES, dneskaiSourceSlot, dneskaiSourcesTemplate } from "./dneskai-photo.js";
import { cropRegion } from "./images.js";
import { CAROUSEL_BRANDS } from "./library.js";
import { carouselTextFits, renderCarouselSlidePng } from "./renderer.js";
import { ImageCropSchema, type CarouselPayload, type CarouselTemplate, type ImageCrop } from "./schema.js";

/**
 * One DNESKAi Instagram slide, rendered from words and photographs (quorum#603, own-dashboard#110).
 *
 * The API OwnDashboard calls. It picks the photo-kit template for the slide type, writes the
 * strings code owns (the folio, the sources slide's title and its disclosure), decodes and crops
 * the photographs, and renders through the same engine and gates as every other Design Lab slide.
 *
 * It refuses rather than degrades. A missing required photograph, a full-bleed photograph under
 * `DNESKAI_BLEED_MIN_SHORT_SIDE` or cropped past `DNESKAI_BLEED_MAX_UPSCALE`, bytes that do not
 * match the asset hash a crop was set on and an image the slide has no place for each return the
 * problem and no PNG — never a slide without its picture, never a silent upscale. Words that would
 * be cut still render, and every cut slot is in `truncatedSlots` and in `problems`, so nothing is
 * shortened without saying so; a picture stretched short of refusal is reported the same way.
 *
 * Deterministic: the same input renders the same PNG bytes, and the returned `payload` is the
 * exact record the slide was drawn from — the words, the variant and each photograph's crop with
 * the sha256 of the bytes it was set on — so an approval can hash what was seen.
 */

export const DNESKAI_SLIDE_TYPES = ["cover-photo", "figure", "split", "statement", "sources", "single"] as const;
export type DneskaiSlideType = (typeof DNESKAI_SLIDE_TYPES)[number];

/** A photograph drawn to every edge needs this many pixels on its shorter side (report §5.3). */
export const DNESKAI_BLEED_MIN_SHORT_SIDE = 900;

/**
 * The most a full-bleed crop may stretch the pixels it cuts; past it the slide is refused.
 *
 * The farthest a picture that passes the 900 px rule is ever stretched at zoom 1: a 16:9 hero
 * 900 px tall gives a 720 × 900 region, drawn to the 1350 px edge. A zoom, or a crop that cuts
 * less of the picture, may not stretch it further; that is refused like a smaller original.
 */
export const DNESKAI_BLEED_MAX_UPSCALE = MASTER_CANVAS.height / DNESKAI_BLEED_MIN_SHORT_SIDE;

/**
 * A full-bleed crop stretched past this, but within `DNESKAI_BLEED_MAX_UPSCALE`, renders and is
 * reported as `image-upscaled`: 900 px across the 1080 px width.
 */
export const DNESKAI_BLEED_SOFT_UPSCALE = MASTER_CANVAS.width / DNESKAI_BLEED_MIN_SHORT_SIDE;

/** A framed photograph resampled past this factor is reported, not refused. */
export const DNESKAI_FRAME_MAX_UPSCALE = 1.5;

export interface DneskaiImageInput {
  /** `image-1`, `image-2`, … in the order the slide type places them. */
  slot: string;
  /** The stored file: JPEG, PNG or WebP. Decoded and oriented here. */
  bytes: Buffer | Uint8Array;
  /** Where to keep the picture in view. Absent: centred, at zoom 1, in the template's own fit. */
  crop?: Omit<ImageCrop, "assetSha256">;
  /** The sha256 the caller stored the asset under. When given, the bytes must hash to it. */
  assetSha256?: string;
}

export interface DneskaiSlideInput {
  type: DneskaiSlideType;
  /** `statement`: `accent` (default) or `ink`. `single`: `photo` (default) or `type`. */
  variant?: "accent" | "ink" | "photo" | "type";
  headline?: string;
  body?: string;
  kicker?: string;
  credit?: string;
  /** The sources slide's lines, one source each, at most `DNESKAI_MAX_SOURCES`. */
  sources?: readonly string[];
  images?: readonly DneskaiImageInput[];
  /** The slide's place in the carousel. The folio prints it; a single post is `{ 0, 1 }`. */
  position: { index: number; count: number };
  locale?: "cs" | "en";
}

export type DneskaiProblemCode =
  | "position-invalid"
  | "variant-invalid"
  | "text-missing"
  | "text-clipped"
  | "sources-missing"
  | "sources-too-many"
  | "image-missing"
  | "image-unexpected"
  | "image-duplicate"
  | "image-undecodable"
  | "image-hash-mismatch"
  | "image-low-resolution"
  | "image-upscaled"
  | "crop-invalid";

export interface DneskaiSlideProblem {
  code: DneskaiProblemCode;
  /** A blocking problem means no PNG. A non-blocking one renders and is reported beside it. */
  blocking: boolean;
  /** The input field or image slot it is about, when there is one. */
  field: string | null;
  message: string;
}

export interface DneskaiSlideResult {
  status: "rendered" | "refused";
  png: Buffer | null;
  pngHash: string | null;
  svgHash: string | null;
  /** Text slots that did not fit whole and were cut, by slot name. */
  truncatedSlots: string[];
  problems: DneskaiSlideProblem[];
  /** Which template drew it, null when the slide type itself could not be resolved. */
  template: { id: string; version: string } | null;
  /** The exact payload the slide was (or would have been) drawn from. */
  payload: CarouselPayload | null;
}

const FIXED_STRINGS = {
  cs: {
    title: "Zdroje",
    imagesLabel: "Použité obrázky",
    disclosure: "Text připravil jazykový model z uvedených zdrojů. Výběr a schválení: redakce DNESKAi."
  },
  en: {
    title: "Sources",
    imagesLabel: "Images used",
    disclosure: "A language model drafted the text from the sources listed. Selected and approved by the DNESKAi editors."
  }
} as const;

/** Which input field a text slot is filled from, so a cut slot names what to shorten. */
function fieldOf(slot: string): string {
  return slot.startsWith("source-") ? `sources[${Number(slot.slice("source-".length)) - 1}]` : slot;
}

const problem = (code: DneskaiProblemCode, blocking: boolean, field: string | null, message: string): DneskaiSlideProblem => ({ code, blocking, field, message });

/** The template a slide type and variant resolve to, or the problem that stops it. */
function resolveTemplate(input: DneskaiSlideInput): CarouselTemplate | DneskaiSlideProblem {
  const variants: Record<DneskaiSlideType, readonly string[]> = {
    "cover-photo": [],
    figure: [],
    split: [],
    statement: ["accent", "ink"],
    sources: [],
    single: ["photo", "type"]
  };
  const allowed = variants[input.type];
  if (!allowed) return problem("variant-invalid", true, "type", `There is no DNESKAi slide type ${String(input.type)}.`);
  if (input.variant !== undefined && !allowed.includes(input.variant)) {
    return problem("variant-invalid", true, "variant", `A ${input.type} slide has ${allowed.length ? `the variants ${allowed.join(", ")}` : "no variants"}, not ${input.variant}.`);
  }
  const imageCount = input.images?.length ?? 0;
  const byId = (id: string) => DNESKAI_PHOTO_TEMPLATES.get(id)!;
  switch (input.type) {
    case "cover-photo": return byId("dneskai-cover-photo");
    case "figure": return byId("dneskai-figure");
    case "split": return byId(input.images?.some((image) => image.slot === "image-2") ? "dneskai-split-pair" : "dneskai-split");
    case "statement": return byId("dneskai-statement");
    case "sources": return dneskaiSourcesTemplate(Math.min(imageCount, DNESKAI_MAX_THUMBNAILS));
    case "single": return byId((input.variant ?? "photo") === "photo" ? "dneskai-single-photo" : "dneskai-single-type");
  }
}

/** Every image layer of a single-slide template, by slot. */
function imageLayers(template: CarouselTemplate) {
  return new Map(template.slides[0]!.layers.flatMap((layer) => layer.type === "image" ? [[layer.slot, layer] as const] : []));
}

function isBleed(layer: { x: number; y: number; width: number; height: number }): boolean {
  return layer.x <= 0 && layer.y <= 0 && layer.width >= 1 && layer.height >= 1;
}

function folio(position: DneskaiSlideInput["position"]): string {
  if (position.count <= 1) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(position.index + 1)} / ${pad(position.count)}`;
}

function strings(input: DneskaiSlideInput, template: CarouselTemplate): Record<string, string> {
  const fixed = FIXED_STRINGS[input.locale ?? "cs"];
  const all: Record<string, string> = {
    headline: input.headline?.trim() ?? "",
    body: input.body?.trim() ?? "",
    kicker: input.kicker?.trim() ?? "",
    credit: input.credit?.trim() ?? "",
    folio: folio(input.position),
    title: fixed.title,
    "images-label": fixed.imagesLabel,
    disclosure: fixed.disclosure,
    ...Object.fromEntries(Array.from({ length: DNESKAI_MAX_SOURCES }, (_, index) => [dneskaiSourceSlot(index), input.sources?.[index]?.trim() ?? ""]))
  };
  return Object.fromEntries(template.requiredSlots.map((slot) => [slot, all[slot] ?? ""]));
}

interface Inspection {
  problems: DneskaiSlideProblem[];
  template: CarouselTemplate | null;
  payload: CarouselPayload | null;
  images: Record<string, Buffer>;
}

async function inspect(input: DneskaiSlideInput): Promise<Inspection> {
  const problems: DneskaiSlideProblem[] = [];
  const { index, count } = input.position;
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || count > CONNECTOR_MAX_SLIDES || index < 0 || index >= count) {
    problems.push(problem("position-invalid", true, "position", `Slide ${index + 1} of ${count} is not a place in a carousel of 1 to ${CONNECTOR_MAX_SLIDES} slides.`));
  }
  const resolved = resolveTemplate(input);
  if (!("schemaVersion" in resolved)) return { problems: [...problems, resolved], template: null, payload: null, images: {} };
  const template = resolved;

  if (input.type === "sources") {
    const lines = (input.sources ?? []).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) problems.push(problem("sources-missing", true, "sources", "A sources slide names at least one source."));
    if ((input.sources ?? []).length > DNESKAI_MAX_SOURCES) {
      problems.push(problem("sources-too-many", true, "sources", `A sources slide carries ${DNESKAI_MAX_SOURCES} sources; this one has ${input.sources!.length}.`));
    }
    if ((input.images?.length ?? 0) > DNESKAI_MAX_THUMBNAILS) {
      problems.push(problem("image-unexpected", true, "images", `A sources slide shows ${DNESKAI_MAX_THUMBNAILS} thumbnails; this one was given ${input.images!.length}.`));
    }
  } else if (!input.headline?.trim()) {
    problems.push(problem("text-missing", true, "headline", `A ${input.type} slide needs a headline.`));
  }

  const layers = imageLayers(template);
  const seen = new Set<string>();
  const images: Record<string, Buffer> = {};
  const crops: Record<string, ImageCrop> = {};
  const { default: sharp } = await import("sharp");
  for (const image of input.images ?? []) {
    if (seen.has(image.slot)) {
      problems.push(problem("image-duplicate", true, image.slot, `Image slot ${image.slot} was given twice.`));
      continue;
    }
    seen.add(image.slot);
    const layer = layers.get(image.slot);
    if (!layer) {
      problems.push(problem("image-unexpected", true, image.slot, `A ${input.type} slide (${template.id}) has no place for ${image.slot}; it holds ${[...layers.keys()].join(", ") || "no images"}.`));
      continue;
    }
    const bytes = Buffer.from(image.bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (image.assetSha256 !== undefined && image.assetSha256 !== sha256) {
      problems.push(problem("image-hash-mismatch", true, image.slot, `The bytes for ${image.slot} hash to ${sha256}, not the asset ${image.assetSha256}.`));
      continue;
    }
    const crop = ImageCropSchema.safeParse({ assetSha256: sha256, focal: { x: 0.5, y: 0.5 }, ...image.crop });
    if (!crop.success) {
      problems.push(problem("crop-invalid", true, image.slot, `The crop for ${image.slot} is not valid: ${crop.error.issues.map((issue) => issue.message).join("; ")}.`));
      continue;
    }
    let decoded: Buffer;
    let size: { width: number; height: number };
    try {
      // rotate() with no angle applies the file's own orientation, so a phone photograph stands up.
      const { data, info } = await sharp(bytes).rotate().png().toBuffer({ resolveWithObject: true });
      decoded = data;
      size = { width: info.width, height: info.height };
    } catch {
      problems.push(problem("image-undecodable", true, image.slot, `The bytes for ${image.slot} are not an image this renderer can decode.`));
      continue;
    }
    // Recorded even when the picture is refused below: the crop is the editor's and stays valid
    // for a larger original of the same subject, and the payload says what would have been drawn.
    images[image.slot] = decoded;
    crops[image.slot] = crop.data;
    // Measured on the region the crop actually cuts, not on the file: a zoom or a frame of another
    // shape draws fewer of the picture's pixels, and those are the ones stretched to the frame.
    const frame = { width: layer.width * MASTER_CANVAS.width, height: layer.height * MASTER_CANVAS.height };
    const region = cropRegion(size, crop.data, frame, crop.data.fit ?? layer.fit);
    const upscale = Math.max(region.outWidth / region.width, region.outHeight / region.height);
    const drawn = `${image.slot} is ${size.width} × ${size.height} px and this crop draws ${region.width} × ${region.height} px of it at ${upscale.toFixed(2)}×`;
    if (isBleed(layer)) {
      const shorter = Math.min(size.width, size.height);
      if (shorter < DNESKAI_BLEED_MIN_SHORT_SIDE || upscale > DNESKAI_BLEED_MAX_UPSCALE) {
        problems.push(problem("image-low-resolution", true, image.slot,
          `${drawn}; a photograph across the whole slide needs ${DNESKAI_BLEED_MIN_SHORT_SIDE} px on its shorter side and at most ${DNESKAI_BLEED_MAX_UPSCALE}× once cropped. Use a larger original, zoom out or use a framed slide.`));
        continue;
      }
      if (upscale > DNESKAI_BLEED_SOFT_UPSCALE) {
        problems.push(problem("image-upscaled", false, image.slot, `${drawn} across the whole slide and may look soft.`));
      }
    } else if (upscale > DNESKAI_FRAME_MAX_UPSCALE) {
      problems.push(problem("image-upscaled", false, image.slot, `${drawn} in this frame and may look soft.`));
    }
  }
  for (const [slot, layer] of layers) {
    if (!layer.optional && !seen.has(slot)) {
      problems.push(problem("image-missing", true, slot, `A ${input.type} slide (${template.id}) needs a photograph in ${slot}.`));
    }
  }

  const payload: CarouselPayload = {
    locale: input.locale ?? "cs",
    strings: strings(input, template),
    ...(input.type === "statement" && input.variant === "ink" ? { variant: "INK" } : {}),
    ...(Object.keys(crops).length ? { images: crops } : {})
  };
  // The cut a render would make, found without the photographs, so it is reported even when an
  // image problem stops the render.
  for (const fit of carouselTextFits({ template, payload, brand: CAROUSEL_BRANDS["caught-up"], format: MASTER_FORMAT })) {
    if (fit.fitted.truncated && payload.strings[fit.slot]) {
      problems.push(problem("text-clipped", false, fieldOf(fit.slot),
        `The ${fieldOf(fit.slot)} does not fit ${fit.slot} whole and would be cut; shorten it.`));
    }
  }
  return { problems, template, payload, images };
}

/** Every problem the slide has, without rendering it. */
export async function validateDneskaiSlide(input: DneskaiSlideInput): Promise<DneskaiSlideProblem[]> {
  return (await inspect(input)).problems;
}

/** Render one slide, or refuse with the problems that stop it. */
export async function renderDneskaiSlide(input: DneskaiSlideInput): Promise<DneskaiSlideResult> {
  const { problems, template, payload, images } = await inspect(input);
  const reference = template ? { id: template.id, version: template.version } : null;
  if (!template || !payload || problems.some((entry) => entry.blocking)) {
    return { status: "refused", png: null, pngHash: null, svgHash: null, truncatedSlots: [], problems, template: reference, payload };
  }
  const rendered = await renderCarouselSlidePng({
    template,
    payload,
    brand: CAROUSEL_BRANDS["caught-up"],
    format: MASTER_FORMAT,
    images,
    deck: input.position,
    index: 0
  });
  if (!rendered) throw new Error(`Template ${template.id} has no slide to render`);
  return {
    status: "rendered",
    png: rendered.png,
    pngHash: rendered.pngHash,
    svgHash: rendered.svgHash,
    truncatedSlots: rendered.truncatedSlots,
    problems,
    template: reference,
    payload
  };
}
