import { describe, expect, it, vi } from "vitest";
import { CAROUSEL_BRANDS, renderCarouselPng } from "@boardlessai/carousel-studio";
import { readCarouselStudio, previewPayload } from "./carousel-studio";

vi.mock("server-only", () => ({}));

describe("Carousel Studio gallery and showcase", () => {
  it("exposes twelve checked live seed templates across all brands and formats", async () => {
    const snapshot = await readCarouselStudio();
    expect(snapshot.templates).toHaveLength(12);
    expect(snapshot.templates.every((entry) => entry.template.status === "live" && entry.allChecksPass)).toBe(true);
    expect(snapshot.brands.map((brand) => brand.id)).toEqual([
      "caught-up", "mma-files", "titty-tuesdays", "devshark", "geoshark", "booksofhistory", "door-money"
    ]);
    // The gallery's picker is every canvas the studio renders. Which of them a template is
    // offered is per-template: only a layout composed for 9:16 is offered the story.
    expect(snapshot.formats).toEqual(["instagram-square", "instagram-portrait", "instagram-story", "threads"]);
    const story = snapshot.templates.find((entry) => entry.template.id === "story-quote");
    expect(story?.checks.some((entry) => entry.format === "instagram-story")).toBe(true);
    const quote = snapshot.templates.find((entry) => entry.template.id === "quote-card");
    expect(quote?.checks.some((entry) => entry.format === "instagram-story")).toBe(false);
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
