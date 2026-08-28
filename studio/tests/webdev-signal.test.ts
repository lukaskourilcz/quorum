import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  missingCommittedGlyphs,
  renderCarouselSvg,
  resolveFace,
  validateTemplateForBrand,
  webDevSignalSlot,
  webDevSignalTemplate,
  webDevSignalTemplates,
  webDevSignalVariant
} from "../src/index.js";

const brand = CAROUSEL_BRANDS["webdev-signal"];

function payload(panelCount: number, locale: "cs" | "en", status: "stable" | "preview" | "security" | "breaking" | "deprecated") {
  const strings: Record<string, string> = {};
  for (let index = 0; index < panelCount; index += 1) {
    strings[webDevSignalSlot(index, "locale")] = locale === "cs" ? "CZ" : "EN";
    strings[webDevSignalSlot(index, "status")] = status.toUpperCase();
    strings[webDevSignalSlot(index, "project")] = "@scope/web-runtime · 4.2.1 · GHSA-1234-5678-90ab";
    strings[webDevSignalSlot(index, "heading")] = locale === "cs" ? "Co se změnilo a proč na tom záleží" : "What changed and why it matters";
    strings[webDevSignalSlot(index, "body")] = locale === "cs"
      ? "Příliš žluťoučký kůň ověřuje českou diakritiku i přesné označení verze 4.2.1."
      : "The official release defines the affected workflow and the exact fixed version 4.2.1.";
    strings[webDevSignalSlot(index, "footer")] = `${index + 1} / ${panelCount} · OFFICIAL CHANGE RECORD`;
  }
  return { locale, strings, variant: webDevSignalVariant(status) } as const;
}

describe("WebDev Signal Design Lab family", () => {
  it("ships one versioned identity and one flexible 4–6 panel composition", () => {
    expect(brand).toMatchObject({
      schemaVersion: "carousel-brand/1",
      name: "WebDev Signal",
      logoText: "WEBDEV SIGNAL",
      fonts: { headline: "Figtree", body: "Public Sans", mono: "IBM Plex Mono" }
    });
    expect(webDevSignalTemplates().map((template) => [template.id, template.slides.length, template.version])).toEqual([
      ["webdev-signal-change-4", 4, "1.0.0"],
      ["webdev-signal-change-5", 5, "1.0.0"],
      ["webdev-signal-change-6", 6, "1.0.0"]
    ]);
  });

  it("passes safe area, contrast, token and overflow checks at Instagram export size", () => {
    for (const template of webDevSignalTemplates()) {
      const checks = validateTemplateForBrand(template, brand, "instagram-portrait");
      expect(checks.every((check) => check.status === "pass"), checks.map((check) => check.detail).join("; ")).toBe(true);
      expect(JSON.stringify(template)).not.toMatch(/https?:|data:image|<svg|framework-logo/iu);
    }
  });

  it("keeps every status textual, while semantic variants change only the accent token", () => {
    for (const status of ["stable", "preview", "security", "breaking", "deprecated"] as const) {
      const input = payload(4, "en", status);
      const rendered = renderCarouselSvg({ template: webDevSignalTemplate(4), brand, payload: input, format: "instagram-portrait" });
      expect(rendered).toHaveLength(4);
      expect(rendered.every((slide) => slide.svg.includes(status.toUpperCase()))).toBe(true);
      expect(rendered.flatMap((slide) => slide.truncatedSlots)).toEqual([]);
    }
  });

  it("sets Czech and English punctuation with committed glyphs and stable hashes", () => {
    const characters = "Příliš žluťoučký kůň · náhled — @scope/pkg 4.2.1 <4.2.1 GHSA-1234-5678-90ab";
    for (const family of Object.values(brand.fonts)) {
      expect(missingCommittedGlyphs(resolveFace(family, 400), characters), family).toEqual([]);
    }
    for (const locale of ["cs", "en"] as const) {
      const input = { template: webDevSignalTemplate(6), brand, payload: payload(6, locale, "security"), format: "instagram-portrait" as const };
      expect(renderCarouselSvg(input).map((slide) => slide.svgHash)).toEqual(renderCarouselSvg(input).map((slide) => slide.svgHash));
    }
  });
});
