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
    const fixtures = [
      {
        input: { template: webDevSignalTemplate(4), brand, payload: payload(4, "en", "stable"), format: "instagram-portrait" as const },
        hashes: [
          "bff4cca028f19c63dde177cbe0dbd6d30b14bd82cdb25678deffe5cc6c300412",
          "db27c58293fc37502b75aa898306b9a0c1b16b68d9b22b1848e00e1846e8c842",
          "759e9f57f91566f24006df993f0e144670a55611294cdd492a5956d0bc24e944",
          "7f1d6d66525d46eb34a703d3955fddb5d075e02cf4952c94b37426335e8118f8"
        ]
      },
      {
        input: { template: webDevSignalTemplate(6), brand, payload: payload(6, "cs", "security"), format: "instagram-portrait" as const },
        hashes: [
          "b92b6112097b4a38c1249975f50f1cfb590226682a10bb946f8f37160525feaf",
          "22e82b5b68c5fd1d45af38cf995b6e418e1b2bd50df0295df62d31e6f7f69462",
          "b9d2bf093bb93e7054586c8033b02170638432cc13daafb798ed00d1e15ab4e6",
          "18762b2679b02f90281ec9ae1b739f1915d3c192bcd32bd228dd903bcd61aeea",
          "722f910b0cb2950f78dfb7cc4fecf3a25672c4ca07c46dfd8dbfb987f5265984",
          "50db7ba22e9d990fa71973744920bb92fbc12ba511a9968dd9e13d1e5ac140e2"
        ]
      }
    ];
    for (const fixture of fixtures) {
      expect(renderCarouselSvg(fixture.input).map((slide) => slide.svgHash)).toEqual(fixture.hashes);
      expect(renderCarouselSvg(fixture.input).map((slide) => slide.svgHash)).toEqual(fixture.hashes);
    }
  });
});
