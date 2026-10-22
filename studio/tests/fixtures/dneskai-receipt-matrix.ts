import { EDITORIAL_KIT } from "../../src/dneskai-kits/editorial.js";
import { createHash } from "node:crypto";
import { layoutDneskaiSlide, type DneskaiLaidPicture } from "../../src/dneskai-layout.js";
import { CAROUSEL_BRANDS, DNESKAI_PHOTO_TEMPLATES, MASTER_FORMAT, carouselTextFits, type CarouselTemplate } from "../../src/index.js";

/*
 * The frame matrix `tests/fixtures/dneskai-receipts.json` pins (docs/design-lab/dneskai-kits/ADR.md
 * §10): every flowed editorial template laid out for the shortest, the longest and the
 * required-only strings, times no picture, a contained picture and a covering picture with a low
 * focal point the caller gave. Each case records every layer's frame as unit fractions and the
 * shade stops of any shaded picture, so a refactor that moves one frame names it.
 *
 * The receipts were recorded from the code before the kit work began and are never regenerated
 * inside it. This module is the one place the matrix is defined; the recorder and the test both
 * read it.
 */

const brand = CAROUSEL_BRANDS["caught-up"];
const PANGRAM = "Žluťoučký kůň úpěl ďábelské ódy a přes noc se naučil číst grafy. ";

export const RECEIPT_TEMPLATES = [...DNESKAI_PHOTO_TEMPLATES.keys()].filter((id) => id !== "dneskai-cover-photo");

type Strings = Record<string, string>;

function longest(template: CarouselTemplate): Strings {
  return Object.fromEntries(template.slides[0]!.layers.flatMap((layer) =>
    layer.type === "text" ? [[layer.slot, PANGRAM.repeat(20).slice(0, layer.maxChars).trim()]] : []));
}

function shortest(template: CarouselTemplate): Strings {
  return Object.fromEntries(template.requiredSlots.map((slot) => [slot, slot === "folio" ? "02 / 07" : "Krátce."]));
}

/** Only what a slide must carry, plus the strings code writes. */
const REQUIRED_ONLY: Strings = {
  headline: "Jen titulek",
  folio: "02 / 07",
  title: "Zdroje",
  "source-1": "Jediný zdroj",
  "images-label": "Použité obrázky",
  disclosure: "Text připravil jazykový model."
};

const picture = (fit: "cover" | "contain", focal = { x: 0.5, y: 0.5 }, focalGiven = false): DneskaiLaidPicture =>
  ({ width: 1_600, height: 900, crop: { focal, fit }, focalGiven });

const PICTURE_SETS = {
  none: null,
  contain: picture("contain"),
  "cover-low-focal": picture("cover", { x: 0.5, y: 0.85 }, true)
} as const;

const STRING_SETS = { shortest, longest, "required-only": () => REQUIRED_ONLY } as const;

export type ReceiptLayout = (input: {
  template: CarouselTemplate;
  text: Record<string, { lines: number; fontSize: number }>;
  pictures: Record<string, DneskaiLaidPicture>;
}) => CarouselTemplate;

/** Today's call. The kit work changes this adapter, never the recorded frames. */
export const receiptLayout: ReceiptLayout = (input) => layoutDneskaiSlide({...input,flow:EDITORIAL_KIT.flows.get(input.template.id)!,metrics:EDITORIAL_KIT.metrics});

/** One case's frames: `[x, y, width, height]` per layer, and `shade` per shaded picture. */
export interface ReceiptFrames {
  layers: number[][];
  shades: Record<string, Array<{ at: number; opacity: number }>>;
}

export function receiptFrames(layout: ReceiptLayout = receiptLayout, templates: ReadonlyMap<string, CarouselTemplate> = DNESKAI_PHOTO_TEMPLATES): Record<string, ReceiptFrames> {
  const out: Record<string, ReceiptFrames> = {};
  for (const id of RECEIPT_TEMPLATES) {
    const template = templates.get(id)!;
    for (const [stringsName, make] of Object.entries(STRING_SETS)) {
      const source = make(template);
      const payload = { locale: "cs" as const, strings: Object.fromEntries(template.requiredSlots.map((slot) => [slot, source[slot] ?? ""])) };
      const fits = carouselTextFits({ template, payload, brand, format: MASTER_FORMAT });
      const text = Object.fromEntries(fits.map((fit) => [fit.slot, { lines: fit.fitted.lines.length, fontSize: fit.fitted.fontSize }]));
      for (const [pictureName, laidPicture] of Object.entries(PICTURE_SETS)) {
        const pictures = laidPicture
          ? Object.fromEntries(template.slides[0]!.layers.flatMap((layer) => layer.type === "image" ? [[layer.slot, laidPicture]] : []))
          : {};
        const laid = layout({ template, text, pictures });
        const layers = laid.slides[0]!.layers;
        out[`${id}|${stringsName}|${pictureName}`] = {
          layers: layers.map((layer) => [layer.x, layer.y, layer.width, layer.height]),
          shades: Object.fromEntries(layers.flatMap((layer) => layer.type === "image" && layer.shade ? [[layer.slot, layer.shade.stops]] : []))
        };
      }
    }
  }
  return out;
}

/** The sha256 of the editorial templates as composed. */
export function editorialTemplatesSha256(templates: ReadonlyMap<string, CarouselTemplate> = DNESKAI_PHOTO_TEMPLATES): string {
  return createHash("sha256").update(JSON.stringify([...templates.values()])).digest("hex");
}
