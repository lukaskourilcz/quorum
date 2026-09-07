import { expect, it } from "vitest";
import { CAROUSEL_BRANDS, SEED_TEMPLATES, fixturePayload, renderCarouselSvg } from "../src/index.js";

it("renders the product fin with an ocean accent only for devShark", () => {
  const template = SEED_TEMPLATES[0]!;
  const payload = fixturePayload(template);
  const render = (brand: typeof CAROUSEL_BRANDS.devshark) => renderCarouselSvg({ template, payload, brand, format: "instagram-portrait" });
  expect(CAROUSEL_BRANDS.devshark.colors.accent).toBe("#60a5fa");
  const slides = render(CAROUSEL_BRANDS.devshark);
  expect(JSON.stringify(slides)).toContain("M3 18 Q6 6 15 3 Q17 11 21 18 Z");
  expect(render(CAROUSEL_BRANDS.devshark)).toEqual(slides);
  expect(JSON.stringify(render(CAROUSEL_BRANDS["mma-files"]))).not.toContain("M3 18 Q6 6 15 3 Q17 11 21 18 Z");
});
