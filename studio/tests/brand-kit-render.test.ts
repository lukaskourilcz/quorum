import { describe, expect, it } from "vitest";
import { chooseLogotypeVariant, logotypeForBrand } from "../src/brand-kit.js";
import { familyDeckTemplate } from "../src/families.js";
import { textGroundPairs } from "../src/grounds.js";
import { CAROUSEL_BRANDS, articleSlideSlot } from "../src/library.js";
import { renderCarouselSvg } from "../src/renderer.js";

describe("DNESKAi logotype in the renderer", () => {
  const logotype = logotypeForBrand("caught-up")!;
  const brand = CAROUSEL_BRANDS["caught-up"];

  it("is found for caught-up and for no brand without a kit", () => {
    expect(logotype.displayName).toBe("DNESKAi");
    expect(logotype.variants.map((variant) => variant.role)).toEqual(["logo-on-light", "logo-on-dark", "logo-mono-white", "logo-mono-black"]);
    expect(logotypeForBrand("mma-files")).toBeNull();
    expect(logotypeForBrand("devshark")).toBeNull();
  });

  it("strips the file down to its paths and namespaces its clip id", () => {
    const light = logotype.variants[0]!.markup;
    expect(light).not.toMatch(/<metadata|<title|c2pa/);
    expect(light).toContain('clip-path="url(#__logo__ka)"');
  });

  it("reads the spec's grounds literally", () => {
    expect(chooseLogotypeVariant(logotype, ["#ffffff"], false)).toMatchObject({ variant: { role: "logo-on-light" }, exempt: true });
    expect(chooseLogotypeVariant(logotype, ["#F7F7F5", "#ffffff"], false)).toMatchObject({ variant: { role: "logo-on-light" }, exempt: true });
    expect(chooseLogotypeVariant(logotype, ["#14161a"], false)).toMatchObject({ variant: { role: "logo-on-dark" }, exempt: true });
    // Solid blue and a photograph are the white mono's named grounds.
    expect(chooseLogotypeVariant(logotype, ["#2f5ae6"], false)).toMatchObject({ variant: { role: "logo-mono-white" }, exempt: false });
    expect(chooseLogotypeVariant(logotype, ["#ffffff"], true)).toMatchObject({ variant: { role: "logo-mono-white" }, exempt: false });
    // A ground the spec does not name gets a one-colour file, never a recoloured full-colour one.
    expect(chooseLogotypeVariant(logotype, ["#efefec"], false)).toMatchObject({ variant: { role: "logo-mono-black" }, exempt: false });
    expect(chooseLogotypeVariant(logotype, ["#ffffff", "#efefec"], false)).toMatchObject({ variant: { role: "logo-mono-black" } });
  });

  it("draws the outlined logotype, not a font, in every caught-up family deck", () => {
    const template = familyDeckTemplate("masthead", 5);
    const payload = {
      locale: "cs" as const,
      strings: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [articleSlideSlot(index), `Věta ${index + 1}: co se dnes v AI stalo.`]))
    };
    const slides = renderCarouselSvg({ template, payload, brand, format: "instagram-portrait" });
    for (const slide of slides) {
      expect(slide.svg).not.toContain(">DNESKAi</text>");
      expect(slide.svg).not.toContain("CAUGHT UP");
      expect(slide.svg).toContain('viewBox="50 -708 4217.817852834741 708"');
      // The full-colour file clips its overlap shade; its clip id is namespaced per slide and layer.
      if (slide.svg.includes('fill="#10266F"')) expect(slide.svg).toMatch(new RegExp(`id="logo-${slide.index}-\\d+-ka"`));
    }
    // The cover sits on white: the full-colour file with its overlap shade.
    expect(slides[0]!.svg).toContain('fill="#10266F"');
  });

  it("measures a one-colour fallback against the floor and leaves the approved pairing alone", () => {
    const template = familyDeckTemplate("masthead", 5);
    const logoPairs = textGroundPairs(template, brand).filter((pair) => pair.target === "logo");
    for (const pair of logoPairs) {
      // Only fallbacks are measured, and they are measured in their own ink.
      expect(["#ffffff", "#14161a"]).toContain(pair.foreground);
    }
    const without = textGroundPairs(template, brand, null).filter((pair) => pair.target === "logo");
    expect(without.length).toBeGreaterThan(logoPairs.length);
  });
});
