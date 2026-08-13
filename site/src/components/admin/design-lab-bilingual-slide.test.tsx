import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DesignLabBilingualSlide } from "./design-lab-bilingual-slide";

describe("the Design Lab bilingual slide", () => {
  it("shows both synthetic languages and no generic editing control", () => {
    const html = renderToStaticMarkup(<DesignLabBilingualSlide pack={{
      recommendationId: "synthetic-memory",
      date: "2026-08-12",
      slides: [{ ordinal: 1, cs: "Krátký syntetický český řádek.", ua: "Короткий синтетичний український рядок." }],
      captionCs: "Syntetický popisek.",
      captionUa: "Синтетичний підпис.",
      photo: null
    }} slide={0} />);
    expect(html).toContain("Krátký syntetický český řádek.");
    expect(html).toContain("Короткий синтетичний український рядок.");
    expect(html).toContain('lang="uk"');
    expect(html).not.toContain("textarea");
    expect(html).not.toContain("data-save-preset");
    expect(html).not.toContain("<input");
  });

  it("states the refusal when an approved package is unavailable", () => {
    expect(renderToStaticMarkup(<DesignLabBilingualSlide pack={null} slide={0} />)).toContain("Náhled ani export se nevytvoří");
  });
});
