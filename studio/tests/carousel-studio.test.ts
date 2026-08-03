import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  ARTICLE_DECK_TEMPLATES,
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  LIVE_TEMPLATES,
  SEED_TEMPLATES,
  articleDeckTemplate,
  articleSlideSlot,
  deprecateTemplate,
  fitText,
  fixturePayload,
  mayGoLive,
  renderCarouselPng,
  renderCarouselSvg,
  resolveLifecycleStatus,
  validateTemplateForBrand
} from "../src/index.js";

describe("carousel-template/1", () => {
  it("ships ten live, original seed layouts", () => {
    expect(SEED_TEMPLATES).toHaveLength(10);
    expect(new Set(SEED_TEMPLATES.map((template) => template.id)).size).toBe(10);
    expect(SEED_TEMPLATES.every((template) => CarouselTemplateSchema.parse(template).status === "live")).toBe(true);
  });

  it("resolves the generated article decks without counting them as seed layouts", () => {
    // The seed layouts are design work someone made, and counting them is a real check. The
    // decks are one layout at six lengths, generated, and kept out of that count so they
    // cannot pad it — while still resolving like any other live template.
    expect(ARTICLE_DECK_TEMPLATES).toHaveLength(6);
    expect(LIVE_TEMPLATES).toHaveLength(SEED_TEMPLATES.length + ARTICLE_DECK_TEMPLATES.length);
    expect(ARTICLE_DECK_TEMPLATES.every((template) => template.status === "live")).toBe(true);
  });

  it("renders hash-stable SVG and PNG bytes", async () => {
    const template = SEED_TEMPLATES[0]!;
    const input = { template, brand: CAROUSEL_BRANDS["caught-up"], payload: fixturePayload(template), format: "instagram-portrait" as const };
    const firstSvg = renderCarouselSvg(input);
    const secondSvg = renderCarouselSvg(input);
    expect(firstSvg).toEqual(secondSvg);
    const first = await renderCarouselPng(input);
    const second = await renderCarouselPng(input);
    expect(first.map((slide) => slide.pngHash)).toEqual(second.map((slide) => slide.pngHash));
    expect(createHash("sha256").update(first[0]!.png).digest("hex")).toBe(first[0]!.pngHash);
    expect(await sharp(first[0]!.png).metadata()).toMatchObject({ width: 1_080, height: 1_350, format: "png" });
  }, 20_000);

  it("keeps Czech graphemes intact and fits a long word at the slot limit", () => {
    const fitted = fitText({
      value: "Nejnezdevětadevadesáteronásobitelnější příliš žluťoučký kůň",
      locale: "cs",
      widthPx: 620,
      heightPx: 260,
      minFontSize: 24,
      maxFontSize: 58,
      maxLines: 4,
      maxChars: 58
    });
    expect(fitted.lines.join(" ")).toContain("ě");
    expect(fitted.lines.length).toBeLessThanOrEqual(4);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(24);
  });

  it("checks safe areas, contrast, token bindings and overflow for every brand and format", () => {
    for (const template of SEED_TEMPLATES) {
      for (const brand of Object.values(CAROUSEL_BRANDS)) {
        for (const format of ["instagram-square", "instagram-portrait", "threads"] as const) {
          const checks = validateTemplateForBrand(template, brand, format);
          expect(checks.every((check) => check.status === "pass"), `${template.id}/${brand.id}/${format}: ${checks.map((check) => check.detail).join("; ")}`).toBe(true);
          expect(mayGoLive(checks)).toBe(true);
        }
      }
    }
  });

  it("deprecates without deleting a version and never promotes failed checks", () => {
    const template = SEED_TEMPLATES[0]!;
    const checks = validateTemplateForBrand(template, CAROUSEL_BRANDS["caught-up"], "instagram-square");
    expect(resolveLifecycleStatus({ template: { ...template, status: "draft" }, checks })).toBe("live");
    expect(resolveLifecycleStatus({ template, checks, ownerOverride: "deprecated" })).toBe("deprecated");
    expect(deprecateTemplate(template)).toMatchObject({ id: template.id, version: "1.0.0", status: "deprecated" });
    expect(resolveLifecycleStatus({ template: { ...template, status: "draft" }, checks: [{ ...checks[0]!, status: "fail" }] })).toBe("draft");
  });

  it("contains no downloaded images, data URLs or external references in template assets", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const files = (await readdir(path.join(root, "src"), { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath, entry.name));
    const assetSource = await Promise.all(files.map((file) => readFile(file)));
    for (const bytes of assetSource) {
      const text = bytes.toString("utf8");
      expect(text).not.toMatch(/data:image\//i);
      expect(bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    }
    expect(JSON.stringify(SEED_TEMPLATES)).not.toMatch(/(?:https?:|data:image|\.png|\.jpe?g|\.webp)/i);
  });
});

describe("a deck template sized to the article", () => {
  it("builds a real template at every length the deck builder can produce", () => {
    // Every other template here has a fixed slide array, which is right for a poster and wrong
    // for an article: how many slides a piece deserves is a property of the piece.
    for (let count = 5; count <= 10; count += 1) {
      const template = articleDeckTemplate(count);
      expect(template.slides).toHaveLength(count);
      expect(template.requiredSlots).toHaveLength(count);
      const strings = Object.fromEntries(
        Array.from({ length: count }, (_, index) => [articleSlideSlot(index), "Krátký text na slide."])
      );
      const rendered = renderCarouselSvg({
        template,
        payload: { locale: "cs", strings },
        brand: CAROUSEL_BRANDS["mma-files"],
        format: "instagram-portrait"
      });
      expect(rendered).toHaveLength(count);
      expect(rendered.flatMap((slide) => slide.truncatedSlots)).toEqual([]);
    }
  });

  it("reports the slot whose text was clipped instead of clipping it quietly", () => {
    // fitText has always known; the renderer discarded the answer, so an over-long slide became
    // an ellipsis and nothing said so. A word limit enforced by silent cutting is not a limit.
    const template = articleDeckTemplate(5);
    const strings = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [articleSlideSlot(index), "Krátký text na slide."])
    );
    strings[articleSlideSlot(2)] = "slovo ".repeat(150);
    const rendered = renderCarouselSvg({
      template,
      payload: { locale: "cs", strings },
      brand: CAROUSEL_BRANDS["mma-files"],
      format: "instagram-portrait"
    });
    expect(rendered.flatMap((slide) => slide.truncatedSlots)).toEqual([articleSlideSlot(2)]);
  });
});
