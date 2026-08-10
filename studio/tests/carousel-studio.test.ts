import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  articleDeckTemplates,
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  familyDeckTemplates,
  liveTemplates,
  SEED_TEMPLATES,
  articleDeckTemplate,
  articleSlideSlot,
  deprecateTemplate,
  fitText,
  fixturePayload,
  mayGoLive,
  previewFormats,
  renderCarouselPng,
  renderCarouselSlidePng,
  renderCarouselSlideSvg,
  renderCarouselSvg,
  resolveLifecycleStatus,
  validateTemplateForBrand
} from "../src/index.js";

describe("carousel-template/1", () => {
  it("ships twelve live, original seed layouts", () => {
    // The eleventh is quiz-code-context, added for marketingShark and justified by a gap rather
    // than by a preference: every other live layout tops out at a 100-character mono slot over
    // two lines, which is a source label and not a program, so a quiz question carrying a fenced
    // code block had nowhere to put it that kept the characters monospaced and legible.
    //
    // The twelfth is story-quote, and it is here for the same kind of reason: the 9:16 canvas
    // reserves roughly a seventh of its height at each end for the platform's own chrome, and
    // every layout composed for 4:5 puts its logo and its closing line inside those bands.
    expect(SEED_TEMPLATES).toHaveLength(12);
    expect(new Set(SEED_TEMPLATES.map((template) => template.id)).size).toBe(12);
    expect(SEED_TEMPLATES.every((template) => CarouselTemplateSchema.parse(template).status === "live")).toBe(true);
  });

  it("resolves the generated article decks without counting them as seed layouts", () => {
    // The seed layouts are design work someone made, and counting them is a real check. The
    // decks are one layout at six lengths, generated, and kept out of that count so they
    // cannot pad it — while still resolving like any other live template.
    // Five designs at six lengths each.
    expect(articleDeckTemplates()).toHaveLength(30);
    expect(liveTemplates()).toHaveLength(SEED_TEMPLATES.length + articleDeckTemplates().length + familyDeckTemplates().length);
    expect(articleDeckTemplates().every((template) => template.status === "live")).toBe(true);
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
      maxChars: 58,
      fontFamily: "Anton",
      fontWeight: 800
    });
    expect(fitted.lines.join(" ")).toContain("ě");
    expect(fitted.lines.length).toBeLessThanOrEqual(4);
    expect(fitted.fontSize).toBeGreaterThanOrEqual(24);
  });

  it("renders the story at 1080 x 1920, deterministically and seeded like the rest (D14)", async () => {
    const template = SEED_TEMPLATES.find((entry) => entry.id === "story-quote");
    if (!template) throw new Error("story-quote is not a seed layout");
    const input = {
      template,
      brand: CAROUSEL_BRANDS["caught-up"]!,
      payload: fixturePayload(template),
      format: "instagram-story" as const
    };
    const first = await renderCarouselPng(input);
    const second = await renderCarouselPng(input);
    expect(await sharp(first[0]!.png).metadata()).toMatchObject({ width: 1_080, height: 1_920, format: "png" });
    // Same input, same bytes — the studio's whole contract, and the story is not an exception.
    expect(createHash("sha256").update(first[0]!.png).digest("hex"))
      .toBe(createHash("sha256").update(second[0]!.png).digest("hex"));
  });

  it("offers the story only to layouts composed for it", () => {
    // Every seed is offered the three canvases it was designed for.
    for (const template of SEED_TEMPLATES) {
      expect(previewFormats(template), template.id).toEqual(
        expect.arrayContaining(["instagram-square", "instagram-portrait", "threads"])
      );
    }
    // The story is offered to the layout built for it, and withheld from those that are not —
    // which is what stopped a new canvas from demoting every live template to draft.
    expect(previewFormats(SEED_TEMPLATES.find((entry) => entry.id === "story-quote")!))
      .toContain("instagram-story");
    expect(previewFormats(SEED_TEMPLATES.find((entry) => entry.id === "quote-card")!))
      .not.toContain("instagram-story");
    // With no template it is every canvas the studio can render, which is the preview route's enum.
    expect(previewFormats()).toHaveLength(4);
  });

  // Every template a reference can resolve to, not only the ten authored seeds. The deck
  // generators were outside this loop, which is how thirty of them went unchecked against four
  // of the five brands for as long as they existed.
  it("checks safe areas, contrast, token bindings and overflow for every brand and format", () => {
    for (const template of liveTemplates()) {
      for (const brand of Object.values(CAROUSEL_BRANDS)) {
        for (const format of previewFormats(template)) {
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
      // An embedded asset is a base64 payload sitting in the source. The renderer builds a
      // data URI at render time from bytes the caller hands it, which is the opposite: nothing
      // is stored, and what is drawn is the article's own image. The prefix alone is not the
      // thing this guards against; a hundred characters of base64 after it is.
      expect(text, "no image is embedded in the studio source").not.toMatch(/data:image\/[a-z]+;base64,[A-Za-z0-9+/]{100}/i);
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

describe("one slide without its deck", () => {
  const deckInput = (count: number, style: Parameters<typeof articleDeckTemplate>[1]) => ({
    template: articleDeckTemplate(count, style),
    payload: {
      locale: "cs" as const,
      strings: Object.fromEntries(
        Array.from({ length: count }, (_, index) => [articleSlideSlot(index), `Krátký text na slide ${index + 1}.`])
      )
    },
    brand: CAROUSEL_BRANDS["mma-files"],
    format: "instagram-portrait" as const
  });

  it("renders exactly the string the whole-deck render would put at that index", () => {
    // The preview page shows one slide per request. Rendering the deck to reach it cost ten
    // rasterisations per slide; rendering the slide alone is only correct if it is the same
    // slide, down to the SVG ids, which are seeded from the index it sits at.
    for (const style of ["mesh", "editorial", "spotlight", "contrast", "aurora"] as const) {
      for (let count = 5; count <= 10; count += 1) {
        const input = deckInput(count, style);
        const deck = renderCarouselSvg(input);
        for (let index = 0; index < count; index += 1) {
          const alone = renderCarouselSlideSvg({ ...input, index });
          expect(alone, `${style}/${count}/${index}`).toEqual(deck[index]);
        }
      }
    }
  });

  it("rasterises the same bytes as the deck render, and only that slide", async () => {
    const input = deckInput(6, "mesh");
    const deck = await renderCarouselPng(input);
    for (let index = 0; index < 6; index += 1) {
      const alone = await renderCarouselSlidePng({ ...input, index });
      expect(alone!.pngHash, `slide ${index}`).toBe(deck[index]!.pngHash);
      expect(alone!.png.equals(deck[index]!.png)).toBe(true);
      expect(alone!.index).toBe(index);
    }
  }, 60_000);

  it("still checks the whole template, not just the slide asked for", () => {
    // Narrowing what gets drawn must not narrow what gets checked. A deck whose fifth slide names
    // a colour the brand does not have is a broken deck, and asking for its first slide is not a
    // way to be told otherwise.
    const input = deckInput(6, "mesh");
    const broken = structuredClone(input.template) as typeof input.template;
    for (const layer of broken.slides[4]!.layers) {
      if (layer.type === "mesh") layer.blobs[0]!.colorToken = "not-a-token";
    }
    expect(() => renderCarouselSvg({ ...input, template: broken })).toThrow(/Template checks failed/u);
    expect(() => renderCarouselSlideSvg({ ...input, template: broken, index: 0 })).toThrow(/Template checks failed/u);
  });

  it("returns null for a slide the deck does not have", () => {
    const input = deckInput(5, "mesh");
    expect(renderCarouselSlideSvg({ ...input, index: 5 })).toBeNull();
    expect(renderCarouselSlideSvg({ ...input, index: -1 })).toBeNull();
  });
});

describe("a gradient behind the words", () => {
  it("counts every mesh blob as something the text sits on", () => {
    // The check measured text against the slide background alone, which stopped being the whole
    // answer the moment a gradient could sit between it and the words. A blob is composited at
    // its own opacity, because comparing against the raw colour fails designs a reader would
    // find perfectly legible — and a check that cries wolf gets its threshold lowered.
    const brand = CAROUSEL_BRANDS["mma-files"];
    const template = articleDeckTemplate(5, "mesh");
    expect(mayGoLive(validateTemplateForBrand(template, brand, "instagram-portrait"))).toBe(true);

    const loud = structuredClone(template) as typeof template;
    for (const slide of loud.slides) {
      for (const layer of slide.layers) {
        if (layer.type === "mesh") for (const blob of layer.blobs) blob.opacity = 1;
      }
    }
    const checks = validateTemplateForBrand(loud, brand, "instagram-portrait");
    expect(mayGoLive(checks), "a fully opaque accent field under the text must fail").toBe(false);
    expect(checks.find((check) => check.id === "contrast")?.detail).toMatch(/Contrast below/u);
  });

  it("refuses a mesh blob naming a colour the brand does not have", () => {
    // Blob tokens were never visited, so a template reported clean and then threw at render:
    // a green check and a broken deck.
    const template = structuredClone(articleDeckTemplate(5, "mesh")) as ReturnType<typeof articleDeckTemplate>;
    for (const layer of template.slides[0]!.layers) {
      if (layer.type === "mesh") layer.blobs[0]!.colorToken = "not-a-token";
    }
    const checks = validateTemplateForBrand(template, CAROUSEL_BRANDS["mma-files"], "instagram-portrait");
    expect(checks.find((check) => check.id === "brand-tokens")?.status).toBe("fail");
  });
});
