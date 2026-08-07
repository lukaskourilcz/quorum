import { describe, expect, it, vi } from "vitest";
import { CAROUSEL_BRANDS, renderCarouselPng } from "@boardlessai/carousel-studio";
import { readCarouselStudio, previewPayload } from "./carousel-studio";

vi.mock("server-only", () => ({}));

describe("Carousel Studio gallery and showcase", () => {
  it("exposes eleven checked live seed templates across five brands and formats", async () => {
    const snapshot = await readCarouselStudio();
    expect(snapshot.templates).toHaveLength(11);
    expect(snapshot.templates.every((entry) => entry.template.status === "live" && entry.allChecksPass)).toBe(true);
    expect(snapshot.brands.map((brand) => brand.id)).toEqual(["caught-up", "mma-files", "titty-tuesdays", "devshark", "geoshark"]);
    expect(snapshot.formats).toEqual(["instagram-square", "instagram-portrait", "threads"]);
  });

  it("renders a public showcase fixture to postable PNGs", async () => {
    const snapshot = await readCarouselStudio();
    const entry = snapshot.templates.find((candidate) => candidate.template.id === "cover-cta")!;
    const renders = await renderCarouselPng({
      template: entry.template,
      payload: previewPayload(entry.template, "cs"),
      brand: CAROUSEL_BRANDS["caught-up"],
      format: "instagram-portrait"
    });
    expect(renders).toHaveLength(2);
    expect(renders.every((render) => render.png.byteLength > 1_000 && /^[a-f0-9]{64}$/.test(render.pngHash))).toBe(true);
  });
});
