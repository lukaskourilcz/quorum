import { expect, it } from "vitest";
import { CAROUSEL_BRANDS, SEED_TEMPLATES, fixturePayload, renderCarouselSvg } from "../src/index.js";

it("draws devShark's fin and logo from its kit, never the studio's old drawn fin or a font", () => {
  const template = SEED_TEMPLATES[0]!;
  const payload = fixturePayload(template);
  const render = (brand: typeof CAROUSEL_BRANDS.devshark) => renderCarouselSvg({ template, payload, brand, format: "instagram-portrait" });
  expect(CAROUSEL_BRANDS.devshark.colors.background).toBe("#f3f6f1");
  const slides = render(CAROUSEL_BRANDS.devshark);
  const drawn = JSON.stringify(slides);
  expect(drawn).not.toContain("M3 18 Q6 6 15 3 Q17 11 21 18 Z");
  expect(drawn).toContain('viewBox=\\"2.4 2.1 19.2 15.9\\"');
  expect(drawn).toContain('viewBox=\\"0 -74.9 602.571 95.764\\"');
  expect(render(CAROUSEL_BRANDS.devshark)).toEqual(slides);
  expect(JSON.stringify(render(CAROUSEL_BRANDS["mma-files"]))).not.toContain("2.4 2.1 19.2 15.9");
});
