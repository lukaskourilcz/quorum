import { describe, expect, it } from "vitest";
import {
  DNESKAI_AREA,
  DNESKAI_GAPS,
  DNESKAI_SPACE_UNIT,
  DNESKAI_THUMBNAIL_GRID,
  layoutDneskaiSlide,
  type DneskaiLaidPicture
} from "../src/dneskai-layout.js";
import {
  CAROUSEL_BRANDS,
  DNESKAI_PHOTO_TEMPLATES,
  MASTER_FORMAT,
  carouselTextFits,
  renderDneskaiSlide,
  syntheticPhoto,
  validateTemplateAsRendered,
  type CarouselTemplate
} from "../src/index.js";

/*
 * The DNESKAi photo kit laid out for what a slide holds (quorum#603 follow-up): frames shrink to
 * their lines and pictures, elements stack with the kit's gaps, and the height left over is set
 * around them on purpose. The layout may move words; it may never change how they are set.
 */

const brand = CAROUSEL_BRANDS["caught-up"];
const FLOWED = [...DNESKAI_PHOTO_TEMPLATES.keys()].filter((id) => id !== "dneskai-cover-photo");
const PANGRAM = "Žluťoučký kůň úpěl ďábelské ódy a přes noc se naučil číst grafy. ";

type Frame = { x: number; y: number; width: number; height: number; bottom: number };

function laidOut(id: string, strings: Record<string, string>, pictures: Record<string, DneskaiLaidPicture> = {}) {
  const template = DNESKAI_PHOTO_TEMPLATES.get(id)!;
  const payload = { locale: "cs" as const, strings: Object.fromEntries(template.requiredSlots.map((slot) => [slot, strings[slot] ?? ""])) };
  const fits = carouselTextFits({ template, payload, brand, format: MASTER_FORMAT });
  const laid = layoutDneskaiSlide({
    template,
    text: Object.fromEntries(fits.map((fit) => [fit.slot, { lines: fit.fitted.lines.length, fontSize: fit.fitted.fontSize }])),
    pictures
  });
  return { template, payload, laid };
}

function frameOf(template: CarouselTemplate, slot: string): Frame {
  const layer = template.slides[0]!.layers.find((candidate) => (candidate.type === "text" || candidate.type === "image") && candidate.slot === slot);
  if (!layer) throw new Error(`No layer for ${slot} in ${template.id}`);
  const frame = { x: Math.round(layer.x * 1_080), y: Math.round(layer.y * 1_350), width: Math.round(layer.width * 1_080), height: Math.round(layer.height * 1_350) };
  return { ...frame, bottom: frame.y + frame.height };
}

/** Every text slot filled to its declared character limit, in Czech with every diacritic. */
function longest(template: CarouselTemplate): Record<string, string> {
  return Object.fromEntries(template.slides[0]!.layers.flatMap((layer) =>
    layer.type === "text" ? [[layer.slot, PANGRAM.repeat(20).slice(0, layer.maxChars).trim()]] : []));
}

function shortest(template: CarouselTemplate): Record<string, string> {
  return Object.fromEntries(template.requiredSlots.map((slot) => [slot, slot === "folio" ? "02 / 07" : "Krátce."]));
}

const picture = (width: number, height: number, focal = { x: 0.5, y: 0.5 }, focalGiven = false, fit?: "cover" | "contain"): DneskaiLaidPicture =>
  ({ width, height, crop: { focal, ...(fit ? { fit } : {}) }, focalGiven });

function picturesFor(template: CarouselTemplate): Record<string, DneskaiLaidPicture> {
  return Object.fromEntries(template.slides[0]!.layers.flatMap((layer) => layer.type === "image" ? [[layer.slot, picture(1_600, 900)]] : []));
}

describe("the DNESKAi layout", () => {
  it.each(FLOWED)("%s sets every slot exactly as its declared frame does, at every length", (id) => {
    const template = DNESKAI_PHOTO_TEMPLATES.get(id)!;
    for (const strings of [shortest(template), longest(template), { ...longest(template), body: "Jedna věta." }]) {
      const { laid, payload } = laidOut(id, strings, picturesFor(template));
      const before = carouselTextFits({ template, payload, brand, format: MASTER_FORMAT });
      const after = carouselTextFits({ template: laid, payload, brand, format: MASTER_FORMAT });
      expect(after.map((fit) => [fit.slot, fit.fitted])).toEqual(before.map((fit) => [fit.slot, fit.fitted]));
    }
  });

  it.each(FLOWED)("%s passes every kit check laid out for the longest, the shortest and only the required words", (id) => {
    const template = DNESKAI_PHOTO_TEMPLATES.get(id)!;
    // Only what a slide must carry: an empty frame still stands somewhere and is still measured.
    const required = { headline: "Jen titulek", title: "Zdroje", "source-1": "Jediný zdroj", "images-label": "Použité obrázky", disclosure: "Text připravil jazykový model." };
    const slots = Object.keys(picturesFor(template));
    const pictureSets = [
      picturesFor(template),
      // Covering pictures take all the height they are offered, and a low focal point moves a band.
      Object.fromEntries(slots.map((slot) => [slot, picture(1_600, 900, { x: 0.5, y: 0.9 }, true, "cover")]))
    ];
    for (const strings of [shortest(template), longest(template), required]) for (const pictures of pictureSets) {
      const { laid } = laidOut(id, strings, pictures);
      expect(validateTemplateAsRendered(laid, brand, MASTER_FORMAT).filter((check) => check.status === "fail"), id).toEqual([]);
      if (id === "dneskai-single-photo") continue;
      // Every flowed text frame stays in the band between the logotype row and the credit line.
      for (const layer of laid.slides[0]!.layers) {
        if (layer.type !== "text" || layer.slot === "folio" || layer.slot === "credit" || !strings[layer.slot]) continue;
        const frame = frameOf(laid, layer.slot);
        expect(frame.y, `${id} ${layer.slot}`).toBeGreaterThanOrEqual(DNESKAI_AREA.top);
        expect(frame.bottom, `${id} ${layer.slot}`).toBeLessThanOrEqual(DNESKAI_AREA.bottom);
      }
    }
  });

  it("puts a figure's caption directly under its picture and centres the two under the headline", () => {
    const { laid } = laidOut("dneskai-figure", { headline: "Krátký titulek", body: "Jedna věta popisu." }, { "image-1": picture(1_600, 900) });
    const headline = frameOf(laid, "headline");
    const image = frameOf(laid, "image-1");
    const body = frameOf(laid, "body");
    expect(headline.y).toBe(DNESKAI_AREA.top);
    expect(image.height).toBe(Math.round((936 * 900) / 1_600));
    expect(body.y - image.bottom).toBeLessThanOrEqual(DNESKAI_GAPS.pictureToText * DNESKAI_SPACE_UNIT);
    // The height a short headline leaves is shared above the picture and below the caption.
    const above = image.y - headline.bottom - DNESKAI_GAPS.headlineToPicture * DNESKAI_SPACE_UNIT;
    const below = DNESKAI_AREA.bottom - body.bottom;
    expect(Math.abs(above - below)).toBeLessThanOrEqual(DNESKAI_GAPS.headlineToPicture * DNESKAI_SPACE_UNIT);
    // A covering photograph takes the whole of that height instead.
    const cover = laidOut("dneskai-figure", { headline: "Krátký titulek", body: "Jedna věta popisu." }, { "image-1": picture(1_600, 900, undefined, false, "cover") }).laid;
    expect(frameOf(cover, "image-1").height).toBeGreaterThan(image.height);
    expect(DNESKAI_AREA.bottom - frameOf(cover, "body").bottom).toBeLessThanOrEqual(1);
  });

  it("centres a split slide's words against its picture and sets the explanation under both", () => {
    const { laid } = laidOut("dneskai-split", { kicker: "Rada", headline: "Krátký titulek", body: "Jedna věta." }, { "image-1": picture(900, 1_200) });
    const kicker = frameOf(laid, "kicker");
    const headline = frameOf(laid, "headline");
    const image = frameOf(laid, "image-1");
    const body = frameOf(laid, "body");
    expect(Math.abs((kicker.y + headline.bottom) / 2 - (image.y + image.bottom) / 2)).toBeLessThanOrEqual(12);
    expect(body.y - image.bottom).toBeLessThanOrEqual(DNESKAI_GAPS.rowToBody * DNESKAI_SPACE_UNIT);
    // The group stands a little above the middle of the band, never at its top with a hole below.
    const top = Math.min(kicker.y, image.y);
    expect(top - DNESKAI_AREA.top).toBeGreaterThan(0);
    expect(top - DNESKAI_AREA.top).toBeLessThan(DNESKAI_AREA.bottom - body.bottom);
  });

  it("stacks a pair's pictures and centres the word column against them", () => {
    const { laid } = laidOut("dneskai-split-pair", { kicker: "Srovnání", headline: "Dva obrázky", body: "Krátké vysvětlení." }, { "image-1": picture(1_200, 800), "image-2": picture(1_200, 600) });
    const first = frameOf(laid, "image-1");
    const second = frameOf(laid, "image-2");
    expect(second.y - first.bottom).toBe(DNESKAI_GAPS.pictureToPicture * DNESKAI_SPACE_UNIT);
    const words = { top: frameOf(laid, "kicker").y, bottom: frameOf(laid, "body").bottom };
    expect(Math.abs((words.top + words.bottom) / 2 - (first.y + second.bottom) / 2)).toBeLessThanOrEqual(12);
  });

  it("sets a statement at the optical centre: a little above the middle", () => {
    const { laid } = laidOut("dneskai-statement", { headline: "Krátký výrok.", body: "Poznámka." });
    const headline = frameOf(laid, "headline");
    const body = frameOf(laid, "body");
    const centre = (headline.y + body.bottom) / 2;
    const middle = (DNESKAI_AREA.top + DNESKAI_AREA.bottom) / 2;
    expect(centre).toBeLessThan(middle);
    expect(centre).toBeGreaterThan(middle - 120);
    expect(body.y - headline.bottom).toBeLessThanOrEqual(DNESKAI_GAPS.headlineToNote * DNESKAI_SPACE_UNIT);
  });

  it("hangs the thumbnails directly under the sources and the disclosure directly under them", () => {
    const pictures = Object.fromEntries([1, 2, 3, 4, 5].map((index) => [`image-${index}`, picture(1_200, 800)]));
    const { laid } = laidOut("dneskai-sources-5", { title: "Zdroje", "source-1": "Smyšlený blog (20. 10. 2026)", "source-2": "Obrázky: smyšlený zdroj", "images-label": "Použité obrázky", disclosure: "Text připravil jazykový model." }, pictures);
    const label = frameOf(laid, "images-label");
    const tiles = [1, 2, 3, 4, 5].map((index) => frameOf(laid, `image-${index}`));
    const disclosure = frameOf(laid, "disclosure");
    expect(label.y - frameOf(laid, "source-2").bottom).toBeLessThanOrEqual(DNESKAI_GAPS.sourcesToColophon * DNESKAI_SPACE_UNIT);
    expect(tiles[0]!.y - label.bottom).toBeLessThanOrEqual(DNESKAI_GAPS.labelToPictures * DNESKAI_SPACE_UNIT);
    // Three to a row at full size, the second row one gap under the first.
    expect(tiles.map((tile) => [tile.width, tile.height])).toEqual(tiles.map(() => [DNESKAI_THUMBNAIL_GRID.width, DNESKAI_THUMBNAIL_GRID.height]));
    expect(tiles[3]!.y - tiles[0]!.bottom).toBe(DNESKAI_THUMBNAIL_GRID.gap);
    expect(tiles[1]!.x - (tiles[0]!.x + tiles[0]!.width)).toBe(DNESKAI_THUMBNAIL_GRID.gap);
    expect(disclosure.y - tiles[4]!.bottom).toBeLessThanOrEqual(DNESKAI_GAPS.picturesToDisclosure * DNESKAI_SPACE_UNIT);
  });

  it("shrinks the thumbnails evenly when four long sources leave them less room", () => {
    const template = DNESKAI_PHOTO_TEMPLATES.get("dneskai-sources-6")!;
    const pictures = Object.fromEntries([1, 2, 3, 4, 5, 6].map((index) => [`image-${index}`, picture(1_200, 800)]));
    const { laid } = laidOut("dneskai-sources-6", longest(template), pictures);
    const tiles = [1, 2, 3, 4, 5, 6].map((index) => frameOf(laid, `image-${index}`));
    expect(tiles[0]!.height).toBeLessThan(DNESKAI_THUMBNAIL_GRID.height);
    expect(new Set(tiles.map((tile) => `${tile.width}×${tile.height}`)).size).toBe(1);
    expect(frameOf(laid, "disclosure").bottom).toBeLessThanOrEqual(DNESKAI_AREA.bottom);
  });

  it("moves the single photo's band to the top when the focal point would sit under it, and only then", () => {
    const strings = { kicker: "Oznámení", headline: "Jedna věta na modrém panelu", body: "Řádek pod panelem.", credit: "Foto: smyšlený zdroj" };
    const declared = DNESKAI_PHOTO_TEMPLATES.get("dneskai-single-photo")!;
    // Focal points high in the picture, or a centre nobody chose, keep the band at the foot.
    expect(laidOut("dneskai-single-photo", strings, { "image-1": picture(1_080, 1_350, { x: 0.5, y: 0.3 }, true) }).laid).toBe(declared);
    expect(laidOut("dneskai-single-photo", strings, { "image-1": picture(1_080, 1_350, { x: 0.5, y: 0.85 }, false) }).laid).toBe(declared);
    // A low focal point moves the band, its line, the kicker and the credit under the logotype.
    const { laid } = laidOut("dneskai-single-photo", strings, { "image-1": picture(1_080, 1_350, { x: 0.5, y: 0.85 }, true) });
    const panel = laid.slides[0]!.layers.find((layer) => layer.type === "shape" && layer.padText === "headline")!;
    const kicker = frameOf(laid, "kicker");
    expect(Math.round(panel.y * 1_350)).toBe(152);
    expect(frameOf(laid, "headline").y).toBe(169);
    expect(kicker.bottom).toBeLessThan(0.85 * 1_350 - 48);
    expect(frameOf(laid, "credit").y).toBe(kicker.y);
    // Its shade follows it: every line clears the kit's floors over a white and a black picture,
    // at the longest words too.
    expect(validateTemplateAsRendered(laid, brand, MASTER_FORMAT).filter((check) => check.status === "fail")).toEqual([]);
    const longestTop = laidOut("dneskai-single-photo", longest(declared), { "image-1": picture(1_080, 1_350, { x: 0.5, y: 0.95 }, true) }).laid;
    expect(longestTop).not.toBe(declared);
    expect(validateTemplateAsRendered(longestTop, brand, MASTER_FORMAT).filter((check) => check.status === "fail")).toEqual([]);
    // Landing, not the source's coordinate, decides: a tall picture cropped around y 0.85 brings
    // that point to the middle of a 4:5 frame, clear of the band at the foot.
    expect(laidOut("dneskai-single-photo", strings, { "image-1": picture(1_080, 4_000, { x: 0.5, y: 0.5 }, true) }).laid).toBe(declared);
  });

  it("renders a low focal point's single photo with the band at the top, the same bytes twice", async () => {
    const bytes = await syntheticPhoto(1_080, 1_350, 31);
    const input = {
      type: "single" as const, variant: "photo" as const, position: { index: 0, count: 1 },
      kicker: "Smyšlené oznámení", headline: "Jeden obrázek, jedna věta", body: "Řádek pod panelem.", credit: "Foto: smyšlený zdroj",
      images: [{ slot: "image-1", bytes, crop: { focal: { x: 0.5, y: 0.8 } } }]
    };
    const first = await renderDneskaiSlide(input);
    const second = await renderDneskaiSlide(input);
    const foot = await renderDneskaiSlide({ ...input, images: [{ slot: "image-1", bytes, crop: { focal: { x: 0.5, y: 0.2 } } }] });
    expect(first.status).toBe("rendered");
    expect(first.problems).toEqual([]);
    expect(second.pngHash).toBe(first.pngHash);
    expect(foot.pngHash).not.toBe(first.pngHash);
  });
});
