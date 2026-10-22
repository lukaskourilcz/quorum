import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAGAZINE_KIT } from "../src/dneskai-kits/magazine.js";
import { DNESKAI_TEMPLATE_ROLES, DNESKAI_TEMPLATE_VARIANTS, DNESKAI_TEXT_LIMITS, dneskaiImageSlots, type DneskaiTemplateRole } from "../src/dneskai-kits/contract.js";
import { DneskaiGoldenSchema } from "../src/dneskai-golden.js";
import { MAGAZINE_GOLDEN_PATH, magazineGoldenCases } from "../scripts/dneskai-magazine-golden.js";
import { renderDneskaiSlide, type DneskaiSlideInput } from "../src/dneskai-slide.js";
import { CAROUSEL_BRANDS, kitStyleFor, kitStyleWithLook, renderCarouselSvg, syntheticPhoto, validateTemplateAsRendered, type CarouselTemplate } from "../src/index.js";
import { ACCEPTANCE_TEMPLATES, acceptanceDeck } from "./fixtures/dneskai-acceptance-deck.js";

/*
 * The magazine kit (src/dneskai-kits/magazine.ts): the shared contract per role, every gate in its
 * own look, the flat brand rules, its derived field tables and the pinned renders in
 * golden/dneskai-magazine.json.
 */

const kit = MAGAZINE_KIT;
const brand = CAROUSEL_BRANDS["caught-up"];
const templates = [...kit.templates.values()];
const thumbnailsOf = (template: CarouselTemplate) => Number(template.id.match(/sources-(\d)$/)?.[1] ?? 0);
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

describe("the magazine kit contract", () => {
  it("has every role under its own prefixed ids, with the kit's look", () => {
    expect(kit.id).toBe("magazine");
    expect(kit.look).toBe("magazine");
    expect(templates).toHaveLength(14);
    for (const template of templates) expect(template.id).toMatch(/^dneskai-magazine-/);
    expect(new Set(kit.roles.values())).toEqual(new Set(DNESKAI_TEMPLATE_ROLES));
  });

  it("pins each role's limits, image slots and template variants to the shared tables", () => {
    for (const template of templates) {
      const role = kit.roles.get(template.id)!;
      const layers = template.slides[0]!.layers;
      expect(layers.filter((l) => l.type === "text").map((l) => [l.slot, l.maxChars]), template.id)
        .toEqual(Object.entries(DNESKAI_TEXT_LIMITS[role]).filter(([slot]) => template.requiredSlots.includes(slot)));
      expect(layers.filter((l) => l.type === "image").map((l) => ({ slot: l.slot, optional: l.optional })), template.id).toEqual(dneskaiImageSlots(role, thumbnailsOf(template)));
      expect(template.slides[0]!.variants.map((v) => v.id), template.id).toEqual(DNESKAI_TEMPLATE_VARIANTS[role]);
      expect(kit.flows.has(template.id)).toBe(true);
    }
  });

  it("places the same text fields as the editorial kit, each in one face", () => {
    expect(kit.fieldFaces).toEqual({
      headline: { family: "Petrona", weight: 800, uppercase: false },
      body: { family: "Literata", weight: 400, uppercase: false },
      kicker: { family: "IBM Plex Mono", weight: 400, uppercase: true },
      credit: { family: "IBM Plex Mono", weight: 400, uppercase: false },
      sources: { family: "Literata", weight: 400, uppercase: false }
    });
    expect(kit.placedFields).toEqual({ "cover-photo": ["headline", "kicker", "credit"], figure: ["headline", "body", "credit"], split: ["headline", "body", "kicker", "credit"], statement: ["headline", "body"], sources: ["sources"], single: ["headline", "body", "kicker", "credit"] });
  });

  it("resolves the acceptance deck to the prefixed templates", async () => {
    const deck = await acceptanceDeck();
    expect(deck.map((s) => kit.resolve(s.type, s.variant, (s.images ?? []).map((i) => i.slot)).id)).toEqual(ACCEPTANCE_TEMPLATES.map((id) => id.replace(/^dneskai-/, "dneskai-magazine-")));
  });

  it.each(templates.map((t) => [t.id, t] as const))("%s passes every check in the magazine look", (_id, template) => {
    expect(validateTemplateAsRendered(template, brand, "instagram-portrait", kit.look).filter((check) => check.status === "fail")).toEqual([]);
  });
});

describe("the magazine kit keeps the flat brand rules", () => {
  it.each(templates.map((t) => [t.id, t] as const))("%s: colour photographs, Czech ties, square and flat, logotype top left", (_id, template) => {
    const style = kitStyleWithLook(kitStyleFor(brand)!, kit.look);
    const role = kit.roles.get(template.id)! as DneskaiTemplateRole;
    const layers = template.slides[0]!.layers;
    for (const layer of layers) {
      if (layer.type === "image") expect(layer.treatment).toBe("none");
      if (layer.type === "text") expect([layer.slot, layer.keepWithNext, layer.glow]).toEqual([layer.slot, "cs", false]);
      if (layer.type === "shape") expect(layer.radius).toBe(0);
      expect(["mesh", "linear-gradient"]).not.toContain(layer.type);
    }
    const logo = layers.find((l) => l.type === "logo")!;
    expect([Math.round(logo.x * 1_080), Math.round(logo.y * 1_350)]).toEqual([72, 64]);
    if (!["cover-photo", "single-photo", "single-type"].includes(role)) expect(layers.some((l) => l.type === "text" && l.slot === "folio" && l.align === "end")).toBe(true);
    const images = Object.fromEntries(layers.flatMap((l) => l.type === "image" ? [[l.slot, PIXEL]] : []));
    for (const variant of [undefined, ...template.slides[0]!.variants.map((v) => v.id)]) {
      const strings = Object.fromEntries(template.requiredSlots.map((slot) => [slot, `Věta pro ${slot}: co se dnes stalo.`]));
      const svg = renderCarouselSvg({ template, brand, format: "instagram-portrait", images, look: kit.look, payload: { locale: "cs", strings, ...(variant ? { variant } : {}) } })[0]!.svg;
      const colours = [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase()))];
      expect(colours.filter((colour) => !style.colours.has(colour))).toEqual([]);
      expect(svg).not.toMatch(/<filter|feGaussianBlur|feDropShadow|radialGradient|<linearGradient|rotate\(/);
      expect(svg).not.toMatch(/<rect[^>]*\srx="(?!0")/);
      for (const family of svg.matchAll(/font-family="([^"]+)"/g)) expect(family[1]).toMatch(/^(Petrona|Literata|IBM Plex Mono)/);
    }
  });
});

/** A string of exactly `length` characters of Czech words, ending on a full stop. */
const filled = (length: number) => "Žluťoučký kůň úpěl ďábelské ódy o modelu ".repeat(10).slice(0, length - 1).trimEnd().padEnd(length - 1, "a") + ".";

describe("the magazine kit renders at both ends of the limits", () => {
  const roles: Array<{ role: DneskaiTemplateRole; slide: (fill: (field: string) => string | undefined) => Omit<DneskaiSlideInput, "images">; images: number }> = [
    { role: "cover-photo", images: 1, slide: (f) => ({ type: "cover-photo", position: { index: 0, count: 5 }, headline: f("headline")!, kicker: f("kicker"), credit: f("credit") }) },
    { role: "figure", images: 1, slide: (f) => ({ type: "figure", position: { index: 1, count: 5 }, headline: f("headline")!, body: f("body"), credit: f("credit") }) },
    { role: "split", images: 1, slide: (f) => ({ type: "split", position: { index: 2, count: 5 }, headline: f("headline")!, body: f("body"), kicker: f("kicker"), credit: f("credit") }) },
    { role: "split-pair", images: 2, slide: (f) => ({ type: "split", position: { index: 2, count: 5 }, headline: f("headline")!, body: f("body"), kicker: f("kicker"), credit: f("credit") }) },
    { role: "statement", images: 0, slide: (f) => ({ type: "statement", position: { index: 3, count: 5 }, headline: f("headline")!, body: f("body") }) },
    { role: "sources", images: 6, slide: (f) => ({ type: "sources", position: { index: 4, count: 5 }, sources: [f("source-1")!, f("source-2"), f("source-3"), f("source-4")].filter((s): s is string => Boolean(s)) }) },
    { role: "single-photo", images: 1, slide: (f) => ({ type: "single", variant: "photo", position: { index: 0, count: 1 }, headline: f("headline")!, body: f("body"), kicker: f("kicker"), credit: f("credit") }) },
    { role: "single-type", images: 0, slide: (f) => ({ type: "single", variant: "type", position: { index: 0, count: 1 }, headline: f("headline")!, body: f("body"), kicker: f("kicker"), credit: f("credit") }) }
  ];
  const ends = {
    longest: (role: DneskaiTemplateRole) => (field: string) => filled(DNESKAI_TEXT_LIMITS[role][field]!),
    shortest: () => (field: string) => field === "credit" ? "Foto: Y." : field === "kicker" ? "AI" : "Krátce.",
    "required-only": () => (field: string) => field === "headline" || field === "source-1" ? "Jen titulek." : undefined
  };
  it.each(roles.flatMap((r) => Object.keys(ends).map((end) => [r.role, end] as const)))("%s, %s strings", async (role, end) => {
    const spec = roles.find((r) => r.role === role)!;
    const photo = await syntheticPhoto(1_200, 900, 3);
    const images = Array.from({ length: spec.images }, (_, n) => ({ slot: `image-${n + 1}`, bytes: photo }));
    const input = { ...spec.slide(ends[end as keyof typeof ends](role)), ...(images.length ? { images } : {}), kit: "magazine" as const } as DneskaiSlideInput;
    const result = await renderDneskaiSlide(input);
    expect(result.problems.filter((p) => p.blocking)).toEqual([]);
    expect(result.status).toBe("rendered");
    expect(result.template!.id).toMatch(/^dneskai-magazine-/);
    expect(result.truncatedSlots).toEqual([]);
  }, 30_000);
});

describe("the magazine kit's pinned renders", () => {
  it("renders the acceptance deck and the golden cases to the committed hashes", async () => {
    const golden = DneskaiGoldenSchema.parse(JSON.parse(readFileSync(MAGAZINE_GOLDEN_PATH, "utf8")));
    const rendered = [];
    for (const { name, input } of await magazineGoldenCases()) {
      const result = await renderDneskaiSlide(input);
      expect(result.status, name).toBe("rendered");
      rendered.push({ name, templateId: result.template!.id, version: result.template!.version, pngHash: result.pngHash });
    }
    expect(rendered).toEqual(golden.entries);
  }, 120_000);
});
