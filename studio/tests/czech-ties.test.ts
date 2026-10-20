import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  CarouselTemplateSchema,
  DNESKAI_PHOTO_TEMPLATES,
  MASTER_FORMAT,
  SEED_TEMPLATES,
  carouselTextFits,
  dneskaiGoldenCases,
  familyDeckTemplates,
  fitText,
  measureEm,
  renderDneskaiSlide,
  resolveFace,
  type CarouselTemplate
} from "../src/index.js";
import { acceptanceDeck } from "./fixtures/dneskai-acceptance-deck.js";

/*
 * Czech ties in the DNESKAi kit: no line ends on a one-letter preposition or conjunction, a number
 * keeps its digit groups and its unit. Opt-in per v2 text layer (`keepWithNext: "cs"`), so every
 * v1 template sets the lines it always set and its recorded hashes hold.
 */

const frame = { locale: "cs" as const, heightPx: 1_000, maxChars: 300, maxLines: 8, fontFamily: "Space Grotesk", fontWeight: 700 };
const at = (size: number, widthPx: number) => ({ ...frame, widthPx, minFontSize: size, maxFontSize: size });
const SINGLE_LETTER_END = /(?:^|\s)[\p{Ps}\p{Pi}"']*[vkszouaiVKSZOUAI]$/u;

describe("the cs ties", () => {
  it("moves a one-letter word that would end a line down to the next one", () => {
    const value = "Každý token projde jen osmi z 256 expertů";
    expect(fitText({ ...at(52, 424), value }).lines).toEqual(["Každý token", "projde jen osmi z", "256 expertů"]);
    expect(fitText({ ...at(52, 424), value, keepWithNext: "cs" }).lines).toEqual(["Každý token", "projde jen osmi", "z 256 expertů"]);
    const conjunction = "Jak se učí dál: recepty na SFT a RL od prvního dne";
    expect(fitText({ ...at(58, 300), value: conjunction }).lines).toContain("na SFT a");
    const tied = fitText({ ...at(58, 300), value: conjunction, keepWithNext: "cs" }).lines;
    expect(tied).toContain("a RL od");
    expect(tied.filter((line) => SINGLE_LETTER_END.test(line))).toEqual([]);
  });

  it("holds the capitals too, and a letter behind a bracket or a quote", () => {
    for (const value of ["Nástroj je hotový A Beam je venku", "Říká to (v blogu) i v kódu", "Jen „k věci“ a nic víc"]) {
      for (const widthPx of [240, 300, 360, 420]) {
        const lines = fitText({ ...at(44, widthPx), value, keepWithNext: "cs" }).lines;
        expect(lines.filter((line) => SINGLE_LETTER_END.test(line)), `${value} @ ${widthPx}`).toEqual([]);
      }
    }
  });

  it("keeps the digit groups of one number together, and a number with its percent sign or unit", () => {
    const reward = "Odměna je 10 000 dolarů za nejlepší projekt";
    expect(fitText({ ...at(52, 334), value: reward }).lines).toEqual(["Odměna je 10", "000 dolarů", "za nejlepší", "projekt"]);
    expect(fitText({ ...at(52, 334), value: reward, keepWithNext: "cs" }).lines).toEqual(["Odměna je", "10 000", "dolarů za", "nejlepší", "projekt"]);
    const share = "Přesnost modelu stoupla o 50 % během jednoho týdne";
    expect(fitText({ ...at(52, 316), value: share }).lines).toContain("% během");
    expect(fitText({ ...at(52, 316), value: share, keepWithNext: "cs" }).lines).toContain("o 50 %");
    const size = fitText({ ...at(52, 300), value: "Model zabere v paměti 3 GB a běží na notebooku", keepWithNext: "cs" }).lines;
    expect(size.some((line) => /(?:^|\s)3 GB(?:\s|$)/u.test(line))).toBe(true);
  });

  it("honours a no-break space the writer typed, and draws it as an ordinary space", () => {
    expect(fitText({ ...at(52, 408), value: "Model vydala firma Reflection AI dnes ráno", keepWithNext: "cs" }).lines)
      .toEqual(["Model vydala", "firma Reflection", "AI dnes ráno"]);
    const lines = fitText({ ...at(52, 408), value: "Model vydala firma Reflection AI dnes ráno", keepWithNext: "cs" }).lines;
    expect(lines).toEqual(["Model vydala", "firma", "Reflection AI", "dnes ráno"]);
    expect(lines.join("\n")).not.toContain(" ");
  });

  it("lets a tie go before it breaks a word that fits on its own", () => {
    const word = "NEJNEOBHOSPODAŘOVÁVATELNĚJŠÍMI";
    // The word alone fits the measure at 40 px; with "a " in front of it, it does not.
    const widthPx = Math.ceil(measureEm(resolveFace("Space Grotesk", 700), word) * 40) + 2;
    const fitted = fitText({ ...at(40, widthPx), value: `a ${word}`, keepWithNext: "cs" });
    expect(fitted.brokenWords).toEqual([]);
    expect(fitted.lines).toEqual(["a", word]);
  });

  it("changes nothing without the option: the fitter breaks at every space as it always has", () => {
    const value = "Každý token projde jen osmi z 256 expertů a 10 000 dolarů o 50 %";
    for (const widthPx of [300, 424, 600, 936]) {
      const plain = fitText({ ...at(52, widthPx), value });
      expect(plain).toEqual(fitText({ ...at(52, widthPx), value, keepWithNext: undefined }));
      // The no-break space is an ordinary space to a v1 layer, exactly as before.
      expect(plain.lines.join(" ")).toBe(value.replace(" ", " "));
    }
  });
});

describe("where the ties apply", () => {
  it("is set on every text slot of every DNESKAi kit template", () => {
    for (const template of DNESKAI_PHOTO_TEMPLATES.values()) {
      for (const layer of template.slides[0]!.layers) {
        if (layer.type === "text") expect(layer.keepWithNext, `${template.id} ${layer.slot}`).toBe("cs");
      }
    }
  });

  it("is never set on a v1 template, and a v1 document that asks for it is refused", () => {
    const v1: CarouselTemplate[] = [...SEED_TEMPLATES, ...familyDeckTemplates()];
    expect(v1.length).toBeGreaterThan(0);
    for (const template of v1) {
      expect(template.schemaVersion, template.id).toBe("carousel-template/1");
      for (const slide of template.slides) for (const layer of slide.layers) {
        if (layer.type === "text") expect(layer.keepWithNext, `${template.id} ${layer.slot}`).toBeUndefined();
      }
    }
    const first = v1[0]!;
    const asked = {
      ...first,
      slides: first.slides.map((slide) => ({ ...slide, layers: slide.layers.map((layer) => layer.type === "text" ? { ...layer, keepWithNext: "cs" } : layer) }))
    };
    const parsed = CarouselTemplateSchema.safeParse(asked);
    expect(parsed.success).toBe(false);
    expect(parsed.error!.issues.map((issue) => issue.message)).toContain("keepWithNext is a carousel-template/2 field");
  });

  it("leaves no kit slot of the golden slides or the acceptance deck ending a line on a one-letter word", async () => {
    const brand = CAROUSEL_BRANDS["caught-up"];
    const inputs = [...(await dneskaiGoldenCases()).map((entry) => entry.input), ...(await acceptanceDeck())];
    for (const input of inputs) {
      const result = await renderDneskaiSlide(input);
      const template = DNESKAI_PHOTO_TEMPLATES.get(result.template!.id)!;
      for (const fit of carouselTextFits({ template, payload: result.payload!, brand, format: MASTER_FORMAT })) {
        expect(fit.fitted.lines.filter((line) => SINGLE_LETTER_END.test(line)), `${template.id} ${fit.slot}`).toEqual([]);
      }
    }
  }, 120_000);
});
