import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  BRAND_KITS_DIRECTORY,
  FONT_METRICS,
  FONTS_DIRECTORY,
  brandKitProblem,
  fontFiles,
  CAROUSEL_BRANDS,
  DECK_DESIGNS,
  MAX_RESOLVABLE_SLIDES,
  MIN_SLIDES,
  QUIZ_SLIDE_ROLES,
  SEED_TEMPLATES,
  articleDeckTemplates,
  familyDeckTemplates,
  fixturePayload,
  forgetKitStyles,
  kitStyleFor,
  liveTemplateByReference,
  liveTemplates,
  postSlideRenderInput,
  previewFormats,
  quizSlideRenderInput,
  readKitStyle,
  renderCarouselSlideSvg,
  renderCarouselSvg,
  type BrandTokens,
  type CarouselFormat,
  type CarouselTemplate
} from "../src/index.js";

/*
 * A kitted brand renders from its kit and from nothing else (owner request of 2026-09-27: posts
 * from marketingShark and DNESKAi's article decks are always built on the new brand kits).
 *
 * Every template and canvas the Design Lab offers each of the two brands is rendered here and read
 * back as SVG: only kit colours, the kit's outlined logotype where a logo appears and never the
 * name set in a font, nothing the kit's spec forbids, and for devShark the social rules.
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every colour an SVG draws, lowercase. Logo files spell theirs in capitals. */
function colours(svg: string): string[] {
  return [...new Set([...svg.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((match) => match[0].toLowerCase()))].sort();
}

function outsideKit(svg: string, brand: BrandTokens): string[] {
  const kit = kitStyleFor(brand)!;
  return colours(svg).filter((colour) => !kit.colours.has(colour));
}

const LOGO_VIEWBOX = {
  "caught-up": 'viewBox="50 -708 4217.817852834741 708"',
  devshark: 'viewBox="0 -74.9 602.571 95.764"'
} as const;
const FIN_VIEWBOX = 'viewBox="2.4 2.1 19.2 15.9"';

function hasLogoLayer(template: CarouselTemplate, slide: number): boolean {
  return template.slides[slide]!.layers.some((layer) => layer.type === "logo");
}

/** A payload for any live template: the seed fixtures, or one sentence per article slide. */
function payloadFor(template: CarouselTemplate): { locale: "cs" | "en"; strings: Record<string, string> } {
  if (SEED_TEMPLATES.some((seed) => seed.id === template.id)) return fixturePayload(template, "en");
  return {
    locale: "cs",
    strings: Object.fromEntries(template.requiredSlots.map((slot, index) => [slot, `Věta ${index + 1}: co se dnes v AI stalo a proč na tom záleží.`]))
  };
}

/** Flat means no blur, glow, shadow or blend: only hard seams and even scrims. */
function expectFlat(svg: string, label: string): void {
  expect(svg, label).not.toMatch(/<filter|feGaussianBlur|feDropShadow|radialGradient/);
  for (const gradient of svg.matchAll(/<linearGradient[\s\S]*?<\/linearGradient>/g)) {
    const offsets = [...gradient[0].matchAll(/offset="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(offsets).size, `${label}: a gradient blends`).toBe(1);
  }
}

describe("DNESKAi renders from its kit", () => {
  const brand = CAROUSEL_BRANDS["caught-up"];
  // Every seed and deck-style template, and every family at the lengths the dealer deals.
  const lengths = new Set([MIN_SLIDES, 7, MAX_RESOLVABLE_SLIDES]);
  const templates = [
    ...SEED_TEMPLATES,
    ...[...articleDeckTemplates(), ...familyDeckTemplates()].filter((template) => lengths.has(template.slides.length))
  ];

  it("covers every seed, deck style and family", () => {
    for (const design of DECK_DESIGNS) expect(templates.some((template) => template.id.startsWith(`deck-${design}-`)), design).toBe(true);
  });

  it.each(templates.map((template) => [template.id, template] as const))("%s: kit colours, kit logotype, flat and square", (_id, template) => {
    for (const format of previewFormats(template)) {
      const slides = renderCarouselSvg({ template, payload: payloadFor(template), brand, format });
      for (const slide of slides) {
        const label = `${template.id} ${format} slide ${slide.index + 1}`;
        expect(outsideKit(slide.svg, brand), label).toEqual([]);
        expect(slide.svg, label).not.toMatch(/>(?:DNESKAi|CAUGHT UP|Caught Up)<\/(?:text|tspan)>/);
        if (hasLogoLayer(template, slide.index)) expect(slide.svg, label).toContain(LOGO_VIEWBOX["caught-up"]);
        expectFlat(slide.svg, label);
        expect(slide.svg, `${label}: a rounded panel`).not.toMatch(/<rect[^>]*\srx="(?!0")/);
        // The faces DNESKAi's own site sets, and no other.
        for (const family of slide.svg.matchAll(/font-family="([^"]+)"/g)) {
          expect(family[1], label).toMatch(/^(Space Grotesk|Source Serif 4|IBM Plex Mono)/);
        }
      }
    }
  });
});

const marketingShark = JSON.parse(readFileSync(path.join(repoRoot, "config", "marketingshark.json"), "utf8")) as {
  brands: Array<{ id: string; postKinds: Record<string, { templateMap: Record<string, string> }> }>;
};

describe("devShark renders from its kit", () => {
  const brand = CAROUSEL_BRANDS.devshark;
  const devShark = marketingShark.brands.find((entry) => entry.id === "devshark")!;
  const inRoom = new Set(Object.values(devShark.postKinds).flatMap((kind) => Object.values(kind.templateMap)));
  // The quiz's context slide takes the plain-question layout when a question has no code.
  inRoom.add("quiz-question-context");
  const templates = [...inRoom].sort().map((id) => liveTemplates().find((template) => template.id === id && template.status === "live")!);
  const GROUNDS = ["#132019", "#f3f6f1", "#2d7a2d", "#f3f6f1", "#132019"];
  const formats = (template: CarouselTemplate): CarouselFormat[] => [...previewFormats(template), "linkedin-square"];

  it("covers every template marketingShark's post kinds name", () => {
    expect(templates.map((template) => template.id)).toEqual(["minimal-text-poster", "quiz-code-context", "quiz-question-context", "quote-card", "stat-highlight", "story-quote"]);
  });

  it.each(templates.map((template) => [template.id, template] as const))("%s: each of the five slides follows the social rules on every canvas", (_id, template) => {
    for (const format of formats(template)) {
      const width = format === "threads" ? 1_200 : 1_080;
      for (const index of [0, 1, 2, 3, 4]) {
        const slide = renderCarouselSlideSvg({ template, payload: payloadFor(template), brand, format, index: 0, deck: { index, count: 5 } })!;
        const label = `${template.id} ${format} slide ${index + 1}`;
        expect(outsideKit(slide.svg, brand), label).toEqual([]);
        // The ground: Ink, Pale, Green, Pale, Ink.
        expect(slide.svg, label).toMatch(new RegExp(`viewBox="0 0 \\d+ \\d+"[^>]*>.*?<rect width="\\d+" height="\\d+" fill="${GROUNDS[index]}"/>`));
        // The clean fin, 48 px wide on the 1080 canvas and 48 px in from the right, on every slide.
        const fin = new RegExp(`<svg x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="[\\d.]+" ${FIN_VIEWBOX}`).exec(slide.svg);
        expect(fin, `${label}: no corner fin`).not.toBeNull();
        const scale = width / 1_080;
        expect(Number(fin![3]), label).toBeCloseTo(48 * scale, 2);
        expect(Number(fin![1]), label).toBeCloseTo(width - 96 * scale, 2);
        // White on ink and green, green on pale.
        const finFill = /fill="(#[0-9A-F]{6})" color/.exec(slide.svg.slice(fin!.index))![1];
        expect(finFill, label).toBe(GROUNDS[index] === "#f3f6f1" ? "#2D7A2D" : "#FFFFFF");
        // The full logo on the last slide only, drawn from the kit's outlines.
        const logo = slide.svg.includes(LOGO_VIEWBOX.devshark);
        expect(logo, label).toBe(index === 4 && hasLogoLayer(template, 0));
        expect(slide.svg, label).not.toMatch(/DEVSHARK|DevShark|>devShark<\/(?:text|tspan)>/);
        for (const family of slide.svg.matchAll(/font-family="([^"]+)"/g)) {
          expect(family[1], label).toMatch(/^(Manrope|Inter|JetBrains Mono)/);
        }
        expectFlat(slide.svg, label);
      }
    }
  });

  it("builds a quiz carousel on the five grounds with the name once, at the end", () => {
    const facts = { displayName: "devShark", productUrl: "https://devshark.app", correctLetter: "B", options: ["an object", "an array", "a string"], codeBlocks: [] };
    const roles = { hook: "minimal-text-poster", context: "quiz-question-context", reveal: "stat-highlight", why: "quote-card", footer: "minimal-text-poster" } as const;
    const svgs = QUIZ_SLIDE_ROLES.map((role) => {
      const template = liveTemplateByReference(roles[role], "1.0.0");
      const headline = role === "footer" ? "One question a day on devShark." : "What does useState return?";
      return renderCarouselSlideSvg(quizSlideRenderInput({ role, template, headline, body: role === "why" ? "A value and its setter." : "", facts, locale: "en", brand, format: "instagram-portrait" }))!.svg;
    });
    expect(svgs.map((svg) => /<rect width="1080" height="1350" fill="(#[0-9a-f]{6})"/.exec(svg)![1])).toEqual(GROUNDS);
    expect(svgs.map((svg) => svg.includes(LOGO_VIEWBOX.devshark))).toEqual([false, false, false, false, true]);
        // What a reader sees: the text and the logo's label, not the SVG's own description.
    const seen = (svg: string) => svg.replace(/<desc[\s\S]*?<\/desc>/, "");
    expect(svgs.map((svg) => (seen(svg).match(/devShark/g) ?? []).length)).toEqual([0, 0, 0, 0, 2]);
  });

  it("builds a post deck the same way", () => {
    const template = liveTemplateByReference("quote-card", "1.0.0");
    const facts = { displayName: "devShark", productUrl: "https://devshark.app" };
    const grounds = [0, 1, 2, 3, 4].map((index) => {
      const svg = renderCarouselSlideSvg(postSlideRenderInput({ template, headline: "A line", body: "", position: { index, count: 5 }, facts, locale: "en", brand, format: "instagram-portrait" }))!.svg;
      return /<rect width="1080" height="1350" fill="(#[0-9a-f]{6})"/.exec(svg)![1];
    });
    expect(grounds).toEqual(GROUNDS);
  });
});

describe("a kitted brand fails closed", () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
    forgetKitStyles();
  });
  const template = SEED_TEMPLATES.find((candidate) => candidate.id === "quote-card")!;
  const render = (brand: BrandTokens) => renderCarouselSvg({ template, payload: fixturePayload(template), brand, format: "instagram-portrait" });

  it("refuses a brand whose kit is missing", () => {
    expect(() => render({ ...CAROUSEL_BRANDS.devshark, kit: "no-such-venture" })).toThrow(/Brand kit no-such-venture is unusable: manifest.json is missing/);
  });

  it("refuses a brand drawn without the kit that claims it", () => {
    const { kit: _kit, ...unkitted } = CAROUSEL_BRANDS.devshark;
    expect(() => render(unkitted)).toThrow(/Brand kit marketingshark dresses devshark/);
    const { kit: _dneskai, ...plain } = CAROUSEL_BRANDS["caught-up"];
    expect(() => render(plain)).toThrow(/Brand kit caught-up dresses caught-up/);
  });

  it("refuses a kit whose file fails its hash, and one with no carousel palette", () => {
    const root = mkdtempSync(path.join(tmpdir(), "kit-style-"));
    roots.push(root);
    cpSync(path.join(BRAND_KITS_DIRECTORY, "marketingshark"), path.join(root, "marketingshark"), { recursive: true });
    const fin = path.join(root, "marketingshark", "devshark-fin-clean-white.svg");
    writeFileSync(fin, readFileSync(fin, "utf8").replace("#FFFFFF", "#FF00FF"));
    expect(() => readKitStyle("marketingshark", root)).toThrow(/devshark-fin-clean-white.svg does not match its recorded sha256/);
    cpSync(path.join(BRAND_KITS_DIRECTORY, "marketingshark", "devshark-fin-clean-white.svg"), fin);
    const manifest = path.join(root, "marketingshark", "manifest.json");
    const raw = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, unknown>;
    delete raw.carouselPalette;
    delete raw.carouselStyle;
    writeFileSync(manifest, JSON.stringify(raw));
    expect(() => readKitStyle("marketingshark", root)).toThrow(/sets no carousel palette/);
  });

  it("answers a room's question before it spends anything", () => {
    expect(brandKitProblem(CAROUSEL_BRANDS.devshark)).toBeNull();
    expect(brandKitProblem(CAROUSEL_BRANDS["caught-up"])).toBeNull();
    expect(brandKitProblem(CAROUSEL_BRANDS["mma-files"])).toBeNull();
    expect(brandKitProblem({ id: "devshark", kit: "no-such-venture" })).toMatch(/unusable: manifest.json is missing/);
  });

  it("draws the kit's palette whatever colours a caller passes", () => {
    const repainted = { ...CAROUSEL_BRANDS["caught-up"], colors: { ...CAROUSEL_BRANDS["caught-up"].colors, accent: "#ff00ff" } };
    for (const slide of render(repainted)) expect(slide.svg).not.toContain("#ff00ff");
  });
});

describe("the kitted brands' faces", () => {
  /*
   * resvg keys a face on its typographic family (name id 16), so a static cut asked for by its
   * legacy name ("Source Serif 4 Semibold", "Inter SemiBold") is not found and the slide silently
   * draws in the fallback face. Kitted brands ask by `rasterFamily`; this renders every face they
   * bind both ways to prove the name finds the file.
   */
  const picture = async (family: string, weight: number, files: string[], fallback: string) => {
    const { Resvg } = await import("@resvg/resvg-js");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60"><text x="5" y="45" font-family="${family}" font-size="40" font-weight="${weight}">agq Rř 0{}</text></svg>`;
    return createHash("sha256").update(new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: files, defaultFontFamily: fallback } }).render().asPng()).digest("hex");
  };
  const bound = new Set(["caught-up", "devshark"].flatMap((id) => Object.values(CAROUSEL_BRANDS[id as "devshark"].fonts)));
  const faces = Object.values(FONT_METRICS).filter((face) => bound.has(face.rasterFamily));

  it.each(faces.map((face) => [face.file, face] as const))("%s draws as itself", async (_file, face) => {
    const alone = await picture("Nothing", face.weight, [path.join(FONTS_DIRECTORY, face.file)], face.familyName);
    expect(await picture(face.rasterFamily, face.weight, fontFiles(), "IBM Plex Sans")).toBe(alone);
  });
});
