import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_BRANDS,
  renderCarouselPng,
  renderCarouselSvg,
  resolveFace,
  TEHDEJSI_ATTRIBUTION_SLOT,
  TEHDEJSI_CHIP_SLOT,
  TEHDEJSI_EYEBROW_SLOT,
  TEHDEJSI_PHOTO_SLOT,
  tehdejsiCsSlot,
  tehdejsiDeckTemplate,
  tehdejsiPhotoAllowed,
  tehdejsiPhotoIssues,
  tehdejsiUaSlot
} from "../src/index.js";

const UKRAINIAN_DISTINCT = "ЇїЄєҐґІі";
const CREDIT = "Synthetic archive photo · CC BY-SA 4.0";
const SYNTHETIC_PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function fixturePayload(attribution = CREDIT) {
  return {
    locale: "cs" as const,
    strings: {
      [TEHDEJSI_EYEBROW_SLOT]: "Rodinná paměť · Родинна памʼять",
      [TEHDEJSI_CHIP_SLOT]: "1978 · SYNTHETIC PLACE",
      [TEHDEJSI_ATTRIBUTION_SLOT]: attribution,
      [tehdejsiCsSlot(0)]: "Tři smyšlené věty otevírají rodinnou vzpomínku.",
      [tehdejsiUaSlot(0)]: "Її, Єє, Ґґ та Іі живуть у вигаданому рядку.",
      [tehdejsiCsSlot(1)]: "Smyšlený snímek drží místo pro ověření licence.",
      [tehdejsiUaSlot(1)]: "Вигадане фото перевіряє місце для ліцензії.",
      [tehdejsiCsSlot(2)]: "Koho byste se na tento smyšlený večer zeptali?",
      [tehdejsiUaSlot(2)]: "Кого б ви запитали про цей вигаданий вечір?"
    }
  };
}

describe("the Tehdejsi svet bilingual fixture", () => {
  it("rasterises byte-stably with committed Ukrainian glyphs and an on-card photo credit", async () => {
    const template = tehdejsiDeckTemplate(3);
    const payload = fixturePayload();
    const photoCheck = {
      strings: payload.strings,
      hasPhoto: true,
      licence: "cc-by-sa" as const
    };
    expect(tehdejsiPhotoIssues(photoCheck)).toEqual([]);
    expect(tehdejsiPhotoAllowed(tehdejsiPhotoIssues(photoCheck))).toBe(true);

    const input = {
      template,
      payload,
      brand: CAROUSEL_BRANDS["tehdejsi-svet"],
      format: "instagram-portrait" as const,
      images: { [TEHDEJSI_PHOTO_SLOT]: SYNTHETIC_PHOTO }
    };
    const firstSvg = renderCarouselSvg(input);
    const secondSvg = renderCarouselSvg(input);
    expect(firstSvg).toEqual(secondSvg);
    expect(firstSvg.every(({ truncatedSlots }) => truncatedSlots.length === 0)).toBe(true);

    const joinedSvg = firstSvg.map(({ svg }) => svg).join("");
    for (const character of UKRAINIAN_DISTINCT) expect(joinedSvg).toContain(character);
    expect(joinedSvg).not.toMatch(/[�□]/u);
    expect(firstSvg[1]!.svg).toContain(`data:image/png;base64,${SYNTHETIC_PHOTO.toString("base64")}`);
    expect(firstSvg.every(({ svg }) => svg.includes(CREDIT))).toBe(true);

    // Every distinctive Ukrainian glyph is measured by the requested Literata face. The renderer
    // disables system fonts, so the pinned raster below cannot acquire a machine fallback.
    const literata = resolveFace("Literata", 400);
    const measuredGlyphs = Object.values(literata.widths).join("");
    for (const character of UKRAINIAN_DISTINCT) expect(measuredGlyphs).toContain(character);
    expect(joinedSvg.match(/font-family="Literata"/gu)?.length).toBeGreaterThanOrEqual(6);

    const firstPng = await renderCarouselPng(input);
    const secondPng = await renderCarouselPng(input);
    expect(firstPng.map(({ pngHash }) => pngHash)).toEqual(secondPng.map(({ pngHash }) => pngHash));
    const combined = createHash("sha256")
      .update(firstPng.map(({ pngHash }) => pngHash).join(""))
      .digest("hex");
    expect(combined).toBe("1b2608c2c956e75d9f92f28c8b41bcbe75ea82f16ef3dae0fc622c7712c76dfb");

    const withoutCredit = fixturePayload("");
    const missingCredit = tehdejsiPhotoIssues({
      strings: withoutCredit.strings,
      hasPhoto: true,
      licence: "cc-by-sa"
    });
    expect(missingCredit.map(({ rule }) => rule)).toEqual(["photo:missing-attribution"]);
    expect(tehdejsiPhotoAllowed(missingCredit)).toBe(false);
  }, 120_000);
});
