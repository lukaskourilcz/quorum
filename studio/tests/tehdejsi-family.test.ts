import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS, deckFormats } from "../src/library.js";
import {
  TEHDEJSI_ATTRIBUTION_SLOT,
  TEHDEJSI_CHIP_SLOT,
  TEHDEJSI_EYEBROW_SLOT,
  TEHDEJSI_MAX_SLIDES,
  TEHDEJSI_MIN_SLIDES,
  UA_SCALE,
  tehdejsiCsSlot,
  tehdejsiDeckTemplate,
  tehdejsiDeckTemplates,
  tehdejsiPhotoAllowed,
  tehdejsiPhotoIssues,
  tehdejsiUaSlot
} from "../src/families-tehdejsi.js";
import { validateTemplateForBrand } from "../src/validation.js";

const brand = CAROUSEL_BRANDS["tehdejsi-svet"];
const formats = Object.keys(deckFormats) as Array<keyof typeof deckFormats>;

type TextLayer = Extract<ReturnType<typeof tehdejsiDeckTemplate>["slides"][number]["layers"][number], { type: "text" }>;

function textLayers(template: ReturnType<typeof tehdejsiDeckTemplate>, slideIndex: number): TextLayer[] {
  return template.slides[slideIndex]!.layers.filter((layer): layer is TextLayer => layer.type === "text");
}

describe("the bilingual family", () => {
  it("declares both languages of every slide as required", () => {
    const template = tehdejsiDeckTemplate(5);
    for (let index = 0; index < 5; index += 1) {
      // A package that lost half of itself has to fail the render rather than draw a card with a
      // blank lower half.
      expect(template.requiredSlots, `slide ${index + 1}`).toContain(tehdejsiCsSlot(index));
      expect(template.requiredSlots, `slide ${index + 1}`).toContain(tehdejsiUaSlot(index));
    }
    expect(template.requiredSlots).toContain(TEHDEJSI_EYEBROW_SLOT);
    expect(template.requiredSlots).toContain(TEHDEJSI_CHIP_SLOT);
    expect(template.requiredSlots).toContain(TEHDEJSI_ATTRIBUTION_SLOT);
  });

  it("sets the Ukrainian line smaller and lighter, in the same face and on the same left edge", () => {
    const layers = textLayers(tehdejsiDeckTemplate(5), 2);
    const cs = layers.find((layer) => layer.slot === tehdejsiCsSlot(2))!;
    const ua = layers.find((layer) => layer.slot === tehdejsiUaSlot(2))!;
    expect(ua.maxFontSize).toBe(Math.round(cs.maxFontSize * UA_SCALE));
    expect(ua.fontWeight).toBeLessThan(cs.fontWeight);
    expect(ua.colorToken).toBe("muted");
    // Not decoration: the same face, the same measure, the same left edge.
    expect(ua.fontToken).toBe(cs.fontToken);
    expect(ua.x).toBe(cs.x);
    expect(ua.width).toBe(cs.width);
  });

  it("puts a hairline across 40% of the measure between the two languages", () => {
    const template = tehdejsiDeckTemplate(5);
    const layers = template.slides[2]!.layers;
    const cs = layers.find((layer) => layer.type === "text" && layer.slot === tehdejsiCsSlot(2))!;
    const ua = layers.find((layer) => layer.type === "text" && layer.slot === tehdejsiUaSlot(2))!;
    // By position, not by type: the crosshair arm is also a rule and comes first in the layer
    // array, so `find(type === "rule")` measures the wrong thing and passes for the wrong reason.
    const hairlines = layers.filter((layer) => layer.type === "rule" && layer.y > cs.y && layer.y < ua.y);
    expect(hairlines).toHaveLength(1);
    // Between them, not beside them: two languages stacked with no mark read as one paragraph in
    // a language nobody speaks.
    expect(hairlines[0]!.width / cs.width).toBeCloseTo(0.4, 5);
    expect(hairlines[0]!.colorToken).toBe("accent");
  });

  it("gives the cover the widest gap between the languages and the photo slide the narrowest", () => {
    const cover = textLayers(tehdejsiDeckTemplate(5), 0);
    const photo = textLayers(tehdejsiDeckTemplate(5), 1);
    const coverCs = cover.find((layer) => layer.slot === tehdejsiCsSlot(0))!;
    const photoCs = photo.find((layer) => layer.slot === tehdejsiCsSlot(1))!;
    expect(coverCs.maxFontSize).toBeGreaterThan(photoCs.maxFontSize);
    const coverUa = cover.find((layer) => layer.slot === tehdejsiUaSlot(0))!;
    // 0.8 on the cover, 0.85 elsewhere: the hook is doing more work there.
    expect(coverUa.maxFontSize / coverCs.maxFontSize).toBeLessThan(UA_SCALE);
  });

  it("carries the three share-image devices on every slide", () => {
    for (const slide of tehdejsiDeckTemplate(5).slides) {
      const shapes = slide.layers.filter((layer) => layer.type === "shape");
      const rules = slide.layers.filter((layer) => layer.type === "rule");
      // Top bar, coral tick, crosshair stem — plus the hairline and the crosshair arm.
      expect(shapes.length).toBeGreaterThanOrEqual(3);
      expect(rules.length).toBeGreaterThanOrEqual(2);
      expect(shapes[0]).toMatchObject({ y: 0, width: 1, fillToken: "secondary" });
    }
  });

  it("puts the photograph on slide two and the footer on all of them", () => {
    const template = tehdejsiDeckTemplate(5);
    const images = template.slides.map((slide) => slide.layers.filter((layer) => layer.type === "image").length);
    expect(images).toEqual([0, 1, 0, 0, 0]);
    for (const slide of template.slides) {
      // A footer that appears and disappears is a layout that jumps; a slide with no photograph
      // puts the source of its fact there instead.
      const slots = slide.layers.filter((layer) => layer.type === "text").map((layer) => layer.slot);
      expect(slots).toContain(TEHDEJSI_ATTRIBUTION_SLOT);
      expect(slots).toContain(TEHDEJSI_CHIP_SLOT);
    }
  });

  it("drops the eyebrow only where the photograph occupies its band", () => {
    const template = tehdejsiDeckTemplate(5);
    const hasEyebrow = template.slides.map((slide) =>
      slide.layers.some((layer) => layer.type === "text" && layer.slot === TEHDEJSI_EYEBROW_SLOT));
    expect(hasEyebrow).toEqual([true, false, true, true, true]);
  });

  it("clears every check at every length and every canvas", () => {
    for (const template of tehdejsiDeckTemplates()) {
      for (const format of formats) {
        const checks = validateTemplateForBrand(template, brand, format);
        expect(
          checks.filter((check) => check.status === "fail"),
          `${template.id}/${format}: ${checks.map((check) => check.detail).join("; ")}`
        ).toEqual([]);
      }
    }
  });

  it("builds one template per deck length and no more", () => {
    const templates = tehdejsiDeckTemplates();
    expect(templates).toHaveLength(TEHDEJSI_MAX_SLIDES - TEHDEJSI_MIN_SLIDES + 1);
    expect(templates.map((template) => template.slides.length))
      .toEqual([3, 4, 5, 6, 7, 8]);
    // Cached, so two calls are the same object rather than two equal ones.
    expect(tehdejsiDeckTemplates()).toBe(templates);
  });

  it("is byte-stable: the same length builds the same template twice", () => {
    expect(JSON.stringify(tehdejsiDeckTemplate(5))).toBe(JSON.stringify(tehdejsiDeckTemplate(5)));
  });
});

describe("the photo slide's attribution", () => {
  const withAttribution = { attribution: "Photo by J. Novák, CC BY-SA 4.0" };

  it("refuses a licensed photograph credited to nobody", () => {
    const issues = tehdejsiPhotoIssues({ strings: { attribution: "" }, hasPhoto: true, licence: "cc-by-sa" });
    expect(issues.map((issue) => issue.rule)).toEqual(["photo:missing-attribution"]);
    expect(tehdejsiPhotoAllowed(issues)).toBe(false);
  });

  it("renders a licensed photograph that carries its credit", () => {
    expect(tehdejsiPhotoAllowed(tehdejsiPhotoIssues({
      strings: withAttribution, hasPhoto: true, licence: "cc-by-sa"
    }))).toBe(true);
  });

  it("asks nothing of the venture's own render", () => {
    expect(tehdejsiPhotoAllowed(tehdejsiPhotoIssues({
      strings: { attribution: "" }, hasPhoto: true, licence: "own-render"
    }))).toBe(true);
  });

  it("refuses a credit under an empty frame, which is its own false statement", () => {
    const issues = tehdejsiPhotoIssues({ strings: withAttribution, hasPhoto: false, licence: "cc-by-sa" });
    expect(issues.map((issue) => issue.rule)).toEqual(["photo:attribution-without-photo"]);
  });

  it("lets a photoless slide put the source of its fact in the same slot", () => {
    // No licence means no photograph was ever attached, so the footer is carrying a fact source.
    expect(tehdejsiPhotoAllowed(tehdejsiPhotoIssues({
      strings: { attribution: "Zdroj: Český statistický úřad" }, hasPhoto: false, licence: null
    }))).toBe(true);
  });
});
