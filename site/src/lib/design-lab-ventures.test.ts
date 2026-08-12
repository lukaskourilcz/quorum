import { describe, expect, it } from "vitest";
import { CAROUSEL_BRANDS } from "@boardlessai/carousel-studio";
import { designLabVentureIds, isDesignLabVenture } from "@/lib/design-lab-ventures";

/**
 * The Design Lab's sections are the renderer's brand registry, and that is the whole point.
 *
 * The alternative — a list of ventures written in the admin — is a list that has to be remembered
 * twice. A venture would acquire an identity, the studio would happily draw for it, and its
 * section would be missing with nothing to say so: no error, no empty state, just a venture the
 * owner cannot open. Holding the section list to `CAROUSEL_BRANDS` means a new venture gets its
 * section by the same act that lets the studio render for it at all.
 */
describe("the Design Lab's venture sections", () => {
  it("offers one section per brand the engine can render, in the engine's own order", () => {
    expect(designLabVentureIds()).toEqual(Object.keys(CAROUSEL_BRANDS));
  });

  it("covers every venture the owner named, whether or not it publishes articles", () => {
    // devShark, geoShark and Titty Tuesdays deliver no articles. They still have a palette and
    // three typefaces, which is exactly what their section is for.
    for (const id of ["caught-up", "mma-files", "devshark", "geoshark", "titty-tuesdays"]) {
      expect(designLabVentureIds()).toContain(id);
    }
  });

  it("recognises only ids the registry declares", () => {
    expect(isDesignLabVenture("mma-files")).toBe(true);
    expect(isDesignLabVenture("carousel-studio")).toBe(false);
    expect(isDesignLabVenture("dneskai")).toBe(false);
    expect(isDesignLabVenture(undefined)).toBe(false);
  });

  it("gives every section the accent and the two typefaces its renders will use", () => {
    // The section shows the tokens the export route hands the renderer, so a section that cannot
    // name them is one whose preview would come out in colours the owner never saw.
    for (const id of designLabVentureIds()) {
      const brand = CAROUSEL_BRANDS[id];
      expect(brand.colors.accent).toMatch(/^#[0-9a-f]{6}$/i);
      expect(brand.colors.foreground).toMatch(/^#[0-9a-f]{6}$/i);
      expect(brand.fonts.headline.length).toBeGreaterThan(1);
      expect(brand.fonts.body.length).toBeGreaterThan(1);
    }
  });
});
