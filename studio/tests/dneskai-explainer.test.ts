import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DNESKAI_MAX_THUMBNAILS, DNESKAI_TEMPLATE_ROLES, DNESKAI_TEMPLATE_VARIANTS, DNESKAI_TEXT_LIMITS, dneskaiImageSlots } from "../src/dneskai-kits/contract.js";
import { EXPLAINER_KIT } from "../src/dneskai-kits/explainer.js";
import { DneskaiGoldenSchema, dneskaiGoldenCases } from "../src/dneskai-golden.js";
import { layoutDneskaiSlide, type DneskaiLaidPicture } from "../src/dneskai-layout.js";
import { GOLDEN_DIRECTORY } from "../src/golden.js";
import { CAROUSEL_BRANDS, MASTER_FORMAT, carouselTextFits, renderDneskaiSlide, validateTemplateAsRendered, type CarouselTemplate } from "../src/index.js";
import { acceptanceDeck } from "./fixtures/dneskai-acceptance-deck.js";

/*
 * The explainer kit (src/dneskai-kits/explainer.ts): the shared role contract, its derived field
 * tables, every gate as its look draws it at every copy length, the plate that follows a figure,
 * and pinned PNG hashes of the acceptance deck and the golden cases rendered in it.
 *
 * Re-record the pins after a deliberate change with UPDATE_DNESKAI_EXPLAINER_GOLDEN=1.
 */

const brand = CAROUSEL_BRANDS["caught-up"];
const kit = EXPLAINER_KIT;
const look = kit.look;
const templates = [...kit.templates.values()];
const GOLDEN_PATH = path.join(GOLDEN_DIRECTORY, "dneskai-explainer.json");
const PANGRAM = "Žluťoučký kůň úpěl ďábelské ódy a přes noc se naučil číst grafy. ";
const REQUIRED: Record<string, string> = { headline: "Jen titulek", title: "Zdroje", "source-1": "Jediný zdroj", "images-label": "Použité obrázky", disclosure: "Text připravil jazykový model." };

const thumbnailsOf = (template: CarouselTemplate) => Number(template.id.match(/sources-(\d)$/)?.[1] ?? 0);
const imageLayers = (template: CarouselTemplate) => template.slides[0]!.layers.flatMap((layer) => layer.type === "image" ? [layer] : []);

function longest(template: CarouselTemplate): Record<string, string> {
  return Object.fromEntries(template.slides[0]!.layers.flatMap((layer) =>
    layer.type === "text" ? [[layer.slot, layer.slot === "folio" ? "07 / 07" : PANGRAM.repeat(20).slice(0, layer.maxChars).trim()]] : []));
}
function shortest(template: CarouselTemplate): Record<string, string> {
  return Object.fromEntries(template.requiredSlots.map((slot) => [slot, slot === "folio" ? "02 / 07" : "Krátce."]));
}
const picture = (width: number, height: number, fit?: "cover" | "contain"): DneskaiLaidPicture =>
  ({ width, height, crop: { focal: { x: 0.5, y: 0.5 }, ...(fit ? { fit } : {}) }, focalGiven: false });

function laidOut(template: CarouselTemplate, strings: Record<string, string>, pictures: Record<string, DneskaiLaidPicture>) {
  const payload = { locale: "cs" as const, strings: Object.fromEntries(template.requiredSlots.map((slot) => [slot, strings[slot] ?? ""])) };
  const fits = carouselTextFits({ template, payload, brand, format: MASTER_FORMAT, look });
  const laid = layoutDneskaiSlide({
    flow: kit.flows.get(template.id)!, metrics: kit.metrics, template, pictures,
    text: Object.fromEntries(fits.map((fit) => [fit.slot, { lines: fit.fitted.lines.length, fontSize: fit.fitted.fontSize, capHeight: fit.face.capHeight / 1_000 }]))
  });
  return { laid, payload, fits };
}

describe("the explainer kit contract", () => {
  it("implements every role under prefixed ids with the shared slots, limits, image slots and variants", () => {
    expect(templates).toHaveLength(DNESKAI_TEMPLATE_ROLES.length + DNESKAI_MAX_THUMBNAILS);
    for (const template of templates) {
      const role = kit.roles.get(template.id)!;
      expect(template.id).toBe(role === "sources" ? `dneskai-explainer-sources-${thumbnailsOf(template)}` : `dneskai-explainer-${role}`);
      const text = template.slides[0]!.layers.filter((layer) => layer.type === "text");
      expect(text.map((layer) => [layer.slot, layer.maxChars]), template.id)
        .toEqual(Object.entries(DNESKAI_TEXT_LIMITS[role]).filter(([slot]) => template.requiredSlots.includes(slot)));
      for (const layer of text) expect(layer.keepWithNext, `${template.id} ${layer.slot}`).toBe("cs");
      expect(imageLayers(template).map((layer) => ({ slot: layer.slot, optional: layer.optional }))).toEqual(dneskaiImageSlots(role, thumbnailsOf(template)));
      expect(template.slides[0]!.variants.map((variant) => variant.id)).toEqual(DNESKAI_TEMPLATE_VARIANTS[role]);
      expect(kit.flows.has(template.id)).toBe(true);
    }
  });

  it("sets each written field in one face and places the fields each slide type draws", () => {
    expect(kit.fieldFaces).toEqual({
      headline: { family: "IBM Plex Sans", weight: 700, uppercase: false },
      body: { family: "IBM Plex Sans", weight: 400, uppercase: false },
      kicker: { family: "IBM Plex Mono", weight: 400, uppercase: true },
      credit: { family: "IBM Plex Mono", weight: 400, uppercase: false },
      sources: { family: "IBM Plex Sans", weight: 400, uppercase: false }
    });
    expect(kit.placedFields).toEqual({ "cover-photo": ["headline", "kicker", "credit"], figure: ["headline", "body", "credit"], split: ["headline", "body", "kicker", "credit"], statement: ["headline", "body"], sources: ["sources"], single: ["headline", "body", "kicker", "credit"] });
  });

  it("frames every picture: nothing bleeds, nothing is treated, corners are square and nothing glows", () => {
    for (const template of templates) for (const layer of template.slides[0]!.layers) {
      if (layer.type === "image") {
        expect(layer.x > 0 && layer.width < 1, `${template.id} ${layer.slot}`).toBe(true);
        expect([layer.treatment, layer.scrim, layer.shade], `${template.id} ${layer.slot}`).toEqual(["none", "none", undefined]);
      }
      if (layer.type === "shape") expect(layer.radius).toBe(0);
      if (layer.type === "text") expect(layer.glow).toBe(false);
      expect(["mesh", "linear-gradient"]).not.toContain(layer.type);
    }
  });
});

describe("the explainer kit as its look draws it", () => {
  it.each(templates.map((template) => [template.id, template] as const))("%s passes every check at its declared frames", (_id, template) => {
    expect(validateTemplateAsRendered(template, brand, MASTER_FORMAT, look).filter((check) => check.status === "fail")).toEqual([]);
  });

  it.each(templates.map((template) => [template.id, template] as const))("%s passes every check laid out for the longest, the shortest and the required words", (_id, template) => {
    const slots = imageLayers(template).map((layer) => layer.slot);
    const pictureSets = [
      Object.fromEntries(slots.map((slot) => [slot, picture(1_600, 900)])),
      Object.fromEntries(slots.map((slot) => [slot, picture(900, 1_400, "cover")])),
      Object.fromEntries(slots.map((slot) => [slot, picture(2_000, 600, "contain")]))
    ];
    for (const strings of [shortest(template), longest(template), REQUIRED]) for (const pictures of pictureSets) {
      const { laid, payload, fits } = laidOut(template, strings, pictures);
      expect(validateTemplateAsRendered(laid, brand, MASTER_FORMAT, look).filter((check) => check.status === "fail"), template.id).toEqual([]);
      // The layout moves words; it never changes how they are set.
      const after = carouselTextFits({ template: laid, payload, brand, format: MASTER_FORMAT, look });
      expect(after.map((fit) => [fit.slot, fit.fitted])).toEqual(fits.map((fit) => [fit.slot, fit.fitted]));
      for (const fit of fits) expect(fit.fitted.truncated, `${template.id} ${fit.slot}`).toBe(false);
    }
  });

  it("moves a figure's white plate with its picture and keeps it clear of the words and the foot", () => {
    for (const role of ["figure", "cover-photo", "single-photo"] as const) {
      const template = kit.resolve(role === "single-photo" ? "single" : role, role === "single-photo" ? "photo" : undefined, ["image-1"]);
      for (const strings of [shortest(template), longest(template)]) for (const shape of [picture(2_000, 600, "contain"), picture(1_600, 900, "cover")]) {
        const layers = laidOut(template, strings, { "image-1": shape }).laid.slides[0]!.layers;
        const image = layers.find((layer) => layer.type === "image")!;
        const plate = layers[layers.indexOf(image) - 1]!;
        const px = (value: number) => Math.round(value * 1_350);
        expect(plate.type).toBe("shape");
        expect(px(image.y) - px(plate.y), template.id).toBe(24);
        expect(px(plate.y + plate.height) - px(image.y + image.height), template.id).toBe(24);
        expect(px(plate.y + plate.height), template.id).toBeLessThanOrEqual(1_166);
        const headline = layers.find((layer) => layer.type === "text" && layer.slot === "headline")!;
        expect(px(headline.y + headline.height), template.id).toBeLessThan(px(plate.y));
      }
    }
  });
});

describe("the explainer kit's pinned renders", () => {
  it("renders the acceptance deck and the golden cases to the committed hashes", async () => {
    const cases = [
      ...(await acceptanceDeck()).map((input, index) => ({ name: `acceptance-${String(index + 1).padStart(2, "0")}`, input })),
      ...(await dneskaiGoldenCases()).map(({ name, input }) => ({ name, input }))
    ];
    const entries = [];
    for (const { name, input } of cases) {
      const result = await renderDneskaiSlide({ ...input, kit: "explainer" });
      expect(result.problems.filter((problem) => problem.blocking), name).toEqual([]);
      expect(result.truncatedSlots, name).toEqual([]);
      expect(result.kit).toBe("explainer");
      entries.push({ name, templateId: result.template!.id, version: result.template!.version, pngHash: result.pngHash! });
    }
    const again = await renderDneskaiSlide({ ...cases[0]!.input, kit: "explainer" });
    expect(again.pngHash).toBe(entries[0]!.pngHash);
    if (process.env.UPDATE_DNESKAI_EXPLAINER_GOLDEN === "1") {
      const golden = DneskaiGoldenSchema.parse({ schemaVersion: "dneskai-photo-golden/1", canvas: { width: 1_080, height: 1_350 }, updatedAt: new Date().toISOString().slice(0, 10), entries });
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(golden, null, 2)}\n`);
    }
    const committed = DneskaiGoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
    expect(entries).toEqual(committed.entries);
  }, 300_000);
});
