import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  fitText,
  fontFiles,
  measureEm,
  renderCarouselPng,
  resolveFace,
  type CarouselTemplateInput
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Typography, and the two things it was never allowed to promise.
 *
 * The brands named system font stacks and the repository carried no font file, so the render
 * server drew in whatever it found: SVG was deterministic and PNG bytes were a property of the
 * machine. And the fitter charged 0.56 em per character whatever the face and whatever the case,
 * so an uppercase headline measured as fitting and drew wider than the canvas, while a word too
 * long for the measure was chopped into silent fragments and reported as a clean fit.
 */

describe("the committed faces", () => {
  it("ships one file per face, each readable", () => {
    const files = fontFiles();
    expect(files.length).toBeGreaterThanOrEqual(25);
    for (const file of files) expect(readFileSync(file).subarray(0, 4).length).toBe(4);
  });

  it("resolves a requested weight to the nearest committed one, never to another family", () => {
    expect(resolveFace("Anton", 800).weight).toBe(400);
    expect(resolveFace("Barlow Condensed", 800).weight).toBe(800);
    // The design set gives body faces 400 and 700; a template asking for 500 gets body at 400,
    // not a headline face and not a system substitute.
    expect(resolveFace("Barlow", 500).weight).toBe(400);
    expect(resolveFace("Barlow", 600).weight).toBe(700);
    expect(resolveFace("Barlow", 500).familyName).toContain("Barlow");
    expect(() => resolveFace("Helvetica", 400)).toThrow(/No committed font/u);
  });

  it("uses the amended MMA Files type system", () => {
    expect(CAROUSEL_BRANDS["mma-files"].fonts).toEqual({
      headline: "Anton",
      body: "Archivo",
      mono: "IBM Plex Mono"
    });
  });

  it("uses only committed OFL faces for Kvórum's record-and-highlighter system", () => {
    expect(CAROUSEL_BRANDS.kvorum.fonts).toEqual({
      headline: "Barlow Condensed",
      body: "IBM Plex Sans",
      mono: "IBM Plex Mono"
    });
    for (const family of Object.values(CAROUSEL_BRANDS.kvorum.fonts)) {
      expect(resolveFace(family, 400).familyName).toContain(family);
    }
  });

  it("charges all-caps what all-caps costs", () => {
    const face = resolveFace("Archivo", 800);
    // The old flat estimate charged these the same. They are not the same.
    expect(measureEm(face, "PRAHA")).toBeGreaterThan(measureEm(face, "praha") * 1.15);
  });

  it("charges a condensed face less than a grotesque for the same word", () => {
    const word = "NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ";
    expect(measureEm(resolveFace("Barlow Condensed", 800), word))
      .toBeLessThan(measureEm(resolveFace("Archivo", 800), word));
  });
});

describe("the fitter", () => {
  const frame = {
    locale: "cs" as const,
    widthPx: 860,
    heightPx: 420,
    minFontSize: 24,
    maxFontSize: 84,
    maxLines: 5,
    maxChars: 120,
    fontFamily: "Barlow Condensed",
    fontWeight: 800
  };

  it("keeps Czech graphemes intact", () => {
    const fitted = fitText({ ...frame, value: "Nejnezdevětadevadesáteronásobitelnější příliš žluťoučký kůň" });
    expect(fitted.lines.join(" ")).toContain("ě");
    expect(fitted.lines.join(" ")).toContain("ů");
    expect(fitted.lines.length).toBeLessThanOrEqual(4);
  });

  it("shrinks until the stress word fits whole, instead of chopping it in silence", () => {
    const fitted = fitText({ ...frame, value: "NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ" });
    expect(fitted.lines).toEqual(["NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ"]);
    expect(fitted.brokenWords).toEqual([]);
    expect(fitted.truncated).toBe(false);
    const face = resolveFace(frame.fontFamily, frame.fontWeight);
    expect(measureEm(face, fitted.lines[0]!) * fitted.fontSize).toBeLessThanOrEqual(frame.widthPx);
  });

  it("reports the break when even the minimum size cannot hold the word", () => {
    const fitted = fitText({ ...frame, widthPx: 90, value: "NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ" });
    expect(fitted.brokenWords).toEqual(["NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ"]);
    expect(fitted.truncated).toBe(true);
  });

  it("never returns a line wider than its measure", () => {
    const face = resolveFace(frame.fontFamily, frame.fontWeight);
    for (const value of [
      "Krátká věta.",
      "PŘÍLIŠ ŽLUŤOUČKÝ KŮŇ ÚPĚL ĎÁBELSKÉ ÓDY, A NIKDO HO NEPOSLOUCHAL ANI CHVÍLI",
      "Gamrot vs Salkilld: co ten výsledek znamená pro lehkou váhu a pro obě jména v ní"
    ]) {
      const fitted = fitText({ ...frame, maxChars: 200, value });
      for (const line of fitted.lines) {
        expect(measureEm(face, line) * fitted.fontSize, line).toBeLessThanOrEqual(frame.widthPx + 0.5);
      }
    }
  });

  it("counts tracking as width, because it is width", () => {
    const narrow = { ...frame, value: "PŘEHLED DNE", maxLines: 1, heightPx: 120, widthPx: 500 };
    const plain = fitText(narrow);
    const tracked = fitText({ ...narrow, tracking: 0.2 });
    expect(tracked.fontSize).toBeLessThan(plain.fontSize);
  });
});

/*
 * Pixels, not eyes.
 *
 * librsvg substituted a missing face silently and drew something plausible, so "the diacritics
 * look fine" was never evidence. These sample the raster: a caron and a ring put ink above the
 * cap line that the bare letter does not, and a face that had not loaded would put none there.
 */
describe("Czech diacritics reach the raster", () => {
  const brand = CAROUSEL_BRANDS["mma-files"];

  /** One line of type on a flat ground: how much ink, and how high the highest ink reaches. */
  async function probe(value: string): Promise<{ total: number; top: number }> {
    const template = CarouselTemplateSchema.parse({
      schemaVersion: "carousel-template/1",
      id: "diacritics-probe",
      name: "Diacritics probe",
      version: "1.0.0",
      status: "draft",
      description: "One line of type on a flat ground, so ink can be counted.",
      citedObservationRefs: [],
      formats: {
        "instagram-square": { width: 1_080, height: 1_080, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
        "instagram-portrait": { width: 1_080, height: 1_350, safeArea: { top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 } },
        "instagram-story": { width: 1_080, height: 1_920, safeArea: { top: 0.14, right: 0.07, bottom: 0.16, left: 0.07 } },
        threads: { width: 1_200, height: 1_200, safeArea: { top: 0.07, right: 0.07, bottom: 0.09, left: 0.07 } }
      },
      requiredSlots: ["probe"],
      slides: [{
        id: "slide-probe",
        backgroundToken: "background",
        layers: [{
          type: "text", slot: "probe",
          x: 0.08, y: 0.4, width: 0.84, height: 0.2,
          colorToken: "foreground", fontToken: "headline", fontWeight: 800,
          minFontSize: 40, maxFontSize: 40, maxChars: 36, maxLines: 1
        }]
      }]
    } satisfies CarouselTemplateInput);
    const [rendered] = await renderCarouselPng({
      template,
      payload: { locale: "cs", strings: { probe: value } },
      brand,
      format: "instagram-square"
    });
    const { default: sharp } = await import("sharp");
    const { data, info } = await sharp(rendered!.png).greyscale().raw().toBuffer({ resolveWithObject: true });
    let total = 0;
    let top = Number.POSITIVE_INFINITY;
    for (let index = 0; index < data.length; index += info.channels) {
      if (data[index]! < 120) continue;
      total += 1;
      top = Math.min(top, Math.floor(index / info.channels / info.width));
    }
    return { total, top };
  }

  it("draws the caron, the ring and the acute above the letters that carry them", async () => {
    const bare = await probe("REKA UNOR SLIB");
    const accented = await probe("ŘEKA ÚNOR SLIB");
    expect(bare.total).toBeGreaterThan(1_000);
    // A face that had not loaded would draw nothing at all, and a face without the accented forms
    // would draw the bare letters — either way the highest ink would not rise.
    expect(accented.top).toBeLessThan(bare.top);
    expect(accented.total).toBeGreaterThan(bare.total);
  }, 60_000);

  it("draws the stress word rather than nothing at all", async () => {
    const bare = await probe("NEJNEOBHOSPODAROVAVATELNEJSI");
    const stress = await probe("NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍ");
    expect(stress.total).toBeGreaterThan(5_000);
    expect(stress.top).toBeLessThan(bare.top);
  }, 60_000);
});

/**
 * The cross-machine guard.
 *
 * The suite could always prove the renderer is a function of its inputs on one machine. It could
 * not prove that two machines agree, and until the fonts were committed and the rasteriser was
 * given them explicitly, they did not. This hash is pinned locally and re-checked by the CI run
 * on Linux; if the two disagree, the rasterisation is not deterministic and the promise is void.
 */
describe("the same deck rasterises to the same bytes anywhere", () => {
  it("matches the committed PNG hash", async () => {
    const stored = CarouselTemplateSchema.parse(
      JSON.parse(readFileSync(path.join(here, "fixtures/v1-article-deck.json"), "utf8"))
    );
    const strings = Object.fromEntries(stored.requiredSlots.map((slot, index) =>
      [slot, `Řádek ${index + 1}: nejneobhospodařovávatelnější věta, kterou deska napsala.`]));
    const slides = await renderCarouselPng({
      template: stored,
      payload: { locale: "cs", strings },
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait"
    });
    const combined = createHash("sha256").update(slides.map((slide) => slide.pngHash).join("")).digest("hex");
    expect(combined).toBe("51a370159aba7c4614bad7f300791fd971f46c881a5d1dec30b084a45b493a32");
  }, 120_000);
});
