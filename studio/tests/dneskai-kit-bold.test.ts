import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BOLD_KIT } from "../src/dneskai-kits/bold.js";
import { DNESKAI_TEMPLATE_ROLES, DNESKAI_TEMPLATE_VARIANTS, DNESKAI_TEXT_LIMITS, dneskaiImageSlots } from "../src/dneskai-kits/contract.js";
import { layoutDneskaiSlide, type DneskaiLaidPicture } from "../src/dneskai-layout.js";
import { DneskaiGoldenSchema, dneskaiGoldenCases } from "../src/dneskai-golden.js";
import { GOLDEN_DIRECTORY } from "../src/golden.js";
import { CAROUSEL_BRANDS, MASTER_FORMAT, carouselTextFits, renderDneskaiSlide, validateTemplateAsRendered, type CarouselTemplate } from "../src/index.js";
import { acceptanceDeck } from "./fixtures/dneskai-acceptance-deck.js";

/*
 * The bold kit (src/dneskai-kits/bold.ts): the shared contract per role, its faces, every template
 * passing the kit checks at the shared limits and laid out for the longest, the shortest and the
 * required-only words, and the pinned PNG hashes in golden/dneskai-bold.json.
 *
 * Re-record the pin after an intended change with DNESKAI_BOLD_GOLDEN=record.
 */

const brand = CAROUSEL_BRANDS["caught-up"];
const GOLDEN_PATH = path.join(GOLDEN_DIRECTORY, "dneskai-bold.json");
const PANGRAM = "Žluťoučký kůň úpěl ďábelské ódy a přes noc se naučil číst grafy. ";
const TEMPLATES = [...BOLD_KIT.templates.values()];

function longest(template: CarouselTemplate): Record<string, string> {
  return Object.fromEntries(template.slides[0]!.layers.flatMap((layer) =>
    layer.type === "text" ? [[layer.slot, PANGRAM.repeat(20).slice(0, layer.maxChars).trim()]] : []));
}
function shortest(template: CarouselTemplate): Record<string, string> {
  return Object.fromEntries(template.requiredSlots.map((slot) => [slot, "Krátce."]));
}
const REQUIRED: Record<string, string> = { headline: "Jen titulek", title: "Zdroje", "source-1": "Jediný zdroj", "images-label": "Použité obrázky", disclosure: "Text připravil jazykový model." };

const picture = (width: number, height: number, fit?: "cover" | "contain"): DneskaiLaidPicture =>
  ({ width, height, crop: { focal: { x: 0.5, y: 0.9 }, ...(fit ? { fit } : {}) }, focalGiven: true });

function laidOut(template: CarouselTemplate, strings: Record<string, string>, pictures: Record<string, DneskaiLaidPicture>) {
  const payload = { locale: "cs" as const, strings: Object.fromEntries(template.requiredSlots.map((slot) => [slot, strings[slot] ?? ""])) };
  const fits = carouselTextFits({ template, payload, brand, format: MASTER_FORMAT, look: "bold" });
  return layoutDneskaiSlide({
    flow: BOLD_KIT.flows.get(template.id)!, metrics: BOLD_KIT.metrics, template,
    text: Object.fromEntries(fits.map((fit) => [fit.slot, { lines: fit.fitted.lines.length, fontSize: fit.fitted.fontSize, capHeight: fit.face.capHeight / 1_000 }])),
    pictures
  });
}

describe("the bold kit contract", () => {
  it("implements every role under its own prefixed ids", () => {
    expect(BOLD_KIT.templates.size).toBe(14);
    for (const t of TEMPLATES) expect(t.id).toMatch(/^dneskai-bold-/);
    expect(new Set(BOLD_KIT.roles.values())).toEqual(new Set(DNESKAI_TEMPLATE_ROLES));
  });

  it("pins each role's limits, image slots and variants to the shared tables", () => {
    for (const t of TEMPLATES) {
      const role = BOLD_KIT.roles.get(t.id)!;
      expect(t.slides[0]!.layers.filter((l) => l.type === "text").map((l) => [l.slot, l.maxChars])).toEqual(Object.entries(DNESKAI_TEXT_LIMITS[role]).filter(([slot]) => t.requiredSlots.includes(slot)));
      expect(t.slides[0]!.layers.filter((l) => l.type === "image").map((l) => ({ slot: l.slot, optional: l.optional }))).toEqual(dneskaiImageSlots(role, Number(t.id.match(/sources-(\d)$/)?.[1] ?? 0)));
      expect(t.slides[0]!.variants.map((v) => v.id)).toEqual(DNESKAI_TEMPLATE_VARIANTS[role]);
      for (const layer of t.slides[0]!.layers) if (layer.type === "text") expect(layer.keepWithNext, `${t.id} ${layer.slot}`).toBe("cs");
    }
  });

  it("keeps the flat brand rules: square plates in colour, no glow, no gradient but none at all", () => {
    for (const t of TEMPLATES) for (const layer of t.slides[0]!.layers) {
      expect(["mesh", "linear-gradient"]).not.toContain(layer.type);
      if (layer.type === "image") expect([layer.treatment, layer.scrim, layer.shade]).toEqual(["none", "none", undefined]);
      if (layer.type === "text") expect(layer.glow).toBe(false);
      if (layer.type === "shape") expect(layer.radius).toBe(0);
    }
  });

  it("derives one face per field and the placed fields", () => {
    expect(BOLD_KIT.fieldFaces).toEqual({
      headline: { family: "Barlow Condensed", weight: 700, uppercase: false }, body: { family: "Inter", weight: 400, uppercase: false },
      kicker: { family: "IBM Plex Mono", weight: 400, uppercase: true }, sources: { family: "Inter", weight: 400, uppercase: false }
    });
    expect(BOLD_KIT.placedFields).toEqual({ "cover-photo": ["headline"], figure: ["headline", "body"], split: ["headline", "body", "kicker"], statement: ["headline", "body"], sources: ["sources"], single: ["headline"] });
  });

  it("resolves the acceptance deck to the bold templates", async () => {
    const deck = await acceptanceDeck();
    expect(deck.map((s) => BOLD_KIT.resolve(s.type, s.variant, (s.images ?? []).map((i) => i.slot)).id)).toEqual([
      "dneskai-bold-cover-photo", "dneskai-bold-figure", "dneskai-bold-figure", "dneskai-bold-split-pair", "dneskai-bold-statement", "dneskai-bold-figure", "dneskai-bold-sources-4"
    ]);
  });
});

describe("the bold kit as drawn", () => {
  it.each(TEMPLATES.map((t) => t.id))("%s passes every check at the shared limits", (id) => {
    expect(validateTemplateAsRendered(BOLD_KIT.templates.get(id)!, brand, MASTER_FORMAT, "bold").filter((check) => check.status === "fail")).toEqual([]);
  });

  it.each(TEMPLATES.map((t) => t.id))("%s passes every check laid out for the longest, the shortest and only the required words", (id) => {
    const template = BOLD_KIT.templates.get(id)!;
    const slots = template.slides[0]!.layers.flatMap((layer) => layer.type === "image" ? [layer.slot] : []);
    const pictureSets = [
      Object.fromEntries(slots.map((slot) => [slot, picture(1_600, 900)])),
      Object.fromEntries(slots.map((slot) => [slot, picture(900, 1_600, "cover")]))
    ];
    for (const strings of [shortest(template), longest(template), REQUIRED]) for (const pictures of pictureSets) {
      const laid = laidOut(template, strings, pictures);
      expect(validateTemplateAsRendered(laid, brand, MASTER_FORMAT, "bold").filter((check) => check.status === "fail"), id).toEqual([]);
      for (const layer of laid.slides[0]!.layers) {
        if (layer.type !== "text" || !strings[layer.slot]) continue;
        expect(layer.y * 1_350, `${id} ${layer.slot}`).toBeGreaterThanOrEqual(BOLD_KIT.metrics.area.top - 1);
        expect((layer.y + layer.height) * 1_350, `${id} ${layer.slot}`).toBeLessThanOrEqual(BOLD_KIT.metrics.area.bottom + 1);
      }
    }
  });
});

async function boldGolden(updatedAt: string) {
  const cases = [
    ...(await dneskaiGoldenCases()),
    ...(await acceptanceDeck()).map((input, index) => ({ name: `acceptance-${index + 1}`, input }))
  ];
  const entries = [];
  for (const { name, input } of cases) {
    const result = await renderDneskaiSlide({ ...input, kit: "bold" });
    expect(result.problems.filter((p) => p.blocking), name).toEqual([]);
    expect(result.kit).toBe("bold");
    entries.push({ name, templateId: result.template!.id, version: result.template!.version, pngHash: result.pngHash! });
  }
  return DneskaiGoldenSchema.parse({ schemaVersion: "dneskai-photo-golden/1", canvas: { width: 1_080, height: 1_350 }, updatedAt, entries });
}

describe("the bold kit golden renders", () => {
  it("renders the golden cases and the acceptance deck to the pinned PNG hashes", async () => {
    if (process.env.DNESKAI_BOLD_GOLDEN === "record") {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(await boldGolden(new Date().toISOString().slice(0, 10)), null, 2)}\n`);
    }
    const committed = DneskaiGoldenSchema.parse(JSON.parse(readFileSync(GOLDEN_PATH, "utf8")));
    const current = await boldGolden(committed.updatedAt);
    expect(current.entries).toEqual(committed.entries);
  }, 120_000);
});
