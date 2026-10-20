import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  DNESKAI_BLEED_MIN_SHORT_SIDE,
  dneskaiGoldenCases,
  readDneskaiGolden,
  renderDneskaiSlide,
  syntheticPhoto,
  validateDneskaiSlide,
  type DneskaiSlideInput
} from "../src/index.js";

/*
 * The API OwnDashboard renders DNESKAi slides through (quorum#603).
 *
 * The issue's acceptance: one payload with four assets and their focal points makes seven
 * 1080 × 1350 slides — cover photo, two figures, split, statement, figure, sources — and makes the
 * same bytes again. Then every way the API refuses instead of degrading.
 */

const codes = (problems: Array<{ code: string; blocking: boolean }>) => problems.map((entry) => `${entry.blocking ? "!" : "~"}${entry.code}`);

async function acceptanceDeck(): Promise<DneskaiSlideInput[]> {
  // Four assets, larger than their frames, so every crop really cuts and resamples.
  const cover = await syntheticPhoto(1_600, 1_200, 11);
  const chart = await syntheticPhoto(1_400, 800, 12);
  const photo = await syntheticPhoto(1_200, 1_200, 13);
  const detail = await syntheticPhoto(900, 700, 14);
  const at = (index: number) => ({ index, count: 7 });
  const all = [cover, chart, photo, detail];
  return [
    { type: "cover-photo", position: at(0), kicker: "Model · 20. 10. 2026", headline: "Smyšlený model, který si pustíte doma, a co z toho plyne", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", bytes: cover, crop: { focal: { x: 0.7, y: 0.4 } } }] },
    { type: "figure", position: at(1), headline: "Graf v rámu, nad ním titulek", body: "Popis pod grafem.", credit: "Graf: smyšlený zdroj", images: [{ slot: "image-1", bytes: chart, crop: { focal: { x: 0.5, y: 0.5 } } }] },
    { type: "figure", position: at(2), headline: "Výřez fotky podle focal pointu", body: "Druhý obrázek, oříznutý na rám.", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", bytes: photo, crop: { focal: { x: 0.3, y: 0.6 }, zoom: 1.4, fit: "cover" } }] },
    { type: "split", position: at(3), kicker: "Detail", headline: "Text vlevo, dva obrázky vpravo", body: "Vysvětlení v levém sloupci.", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", bytes: detail, crop: { focal: { x: 0.4, y: 0.5 } } }, { slot: "image-2", bytes: photo, crop: { focal: { x: 0.6, y: 0.2 }, fit: "cover" } }] },
    { type: "statement", position: at(4), headline: "Jeden výrok na modré ploše.", body: "Tichá poznámka pod ním." },
    { type: "figure", position: at(5), headline: "Návrat k prvnímu obrázku, jinak oříznutému", body: "Tentýž asset, jiný rám.", credit: "Foto: smyšlený zdroj", images: [{ slot: "image-1", bytes: cover, crop: { focal: { x: 0.2, y: 0.5 }, fit: "cover" } }] },
    { type: "sources", position: at(6), sources: ["Smyšlený blog: Smyšlený model (20. 10. 2026)", "Obrázky: smyšlený zdroj"], images: all.map((bytes, index) => ({ slot: `image-${index + 1}`, bytes })) }
  ];
}

describe("the acceptance deck", () => {
  it("renders seven 1080 × 1350 slides from four assets with focal points, and the same bytes twice", async () => {
    const deck = await acceptanceDeck();
    const first = await Promise.all(deck.map((slide) => renderDneskaiSlide(slide)));
    const second = await Promise.all(deck.map((slide) => renderDneskaiSlide(slide)));
    expect(first.map((result) => result.template?.id)).toEqual([
      "dneskai-cover-photo", "dneskai-figure", "dneskai-figure", "dneskai-split-pair", "dneskai-statement", "dneskai-figure", "dneskai-sources-4"
    ]);
    for (const [index, result] of first.entries()) {
      expect(result.status, `slide ${index + 1}: ${result.problems.map((entry) => entry.message).join("; ")}`).toBe("rendered");
      expect(result.problems.filter((entry) => entry.blocking)).toEqual([]);
      const meta = await sharp(result.png!).metadata();
      expect([meta.width, meta.height]).toEqual([1_080, 1_350]);
      expect(second[index]!.pngHash).toBe(result.pngHash);
      expect(second[index]!.svgHash).toBe(result.svgHash);
    }
    expect(new Set(first.map((result) => result.pngHash)).size).toBe(7);
  }, 120_000);

  it("records what was drawn: the folio, the crop and the hash of the bytes it was set on", async () => {
    const [cover, figure, , , statement, , sources] = await acceptanceDeck();
    const coverResult = await renderDneskaiSlide(cover!);
    const sha = createHash("sha256").update(cover!.images![0]!.bytes).digest("hex");
    expect(coverResult.payload!.images).toEqual({ "image-1": { assetSha256: sha, focal: { x: 0.7, y: 0.4 } } });
    expect((await renderDneskaiSlide(figure!)).payload!.strings.folio).toBe("02 / 07");
    expect((await renderDneskaiSlide({ ...statement!, variant: "ink" })).payload!.variant).toBe("INK");
    const sourcesResult = await renderDneskaiSlide(sources!);
    expect(sourcesResult.payload!.strings).toMatchObject({
      title: "Zdroje",
      "images-label": "Použité obrázky",
      disclosure: "Text připravil jazykový model z uvedených zdrojů. Výběr a schválení: redakce DNESKAi."
    });
  }, 60_000);

  it("moves the picture when the focal point moves", async () => {
    const [cover] = await acceptanceDeck();
    const left = await renderDneskaiSlide({ ...cover!, images: [{ ...cover!.images![0]!, crop: { focal: { x: 0.1, y: 0.5 } } }] });
    const right = await renderDneskaiSlide({ ...cover!, images: [{ ...cover!.images![0]!, crop: { focal: { x: 0.9, y: 0.5 } } }] });
    expect(left.pngHash).not.toBe(right.pngHash);
  }, 60_000);
});

describe("refusals", () => {
  const figure = async (overrides: Partial<DneskaiSlideInput> = {}): Promise<DneskaiSlideInput> => ({
    type: "figure",
    position: { index: 1, count: 5 },
    headline: "Titulek",
    body: "Popis.",
    images: [{ slot: "image-1", bytes: await syntheticPhoto(800, 500, 21) }],
    ...overrides
  });

  it(`refuses a full-bleed photograph under ${DNESKAI_BLEED_MIN_SHORT_SIDE} px on its shorter side, and accepts one at it`, async () => {
    const small = await renderDneskaiSlide({ type: "cover-photo", position: { index: 0, count: 5 }, headline: "Titulek", images: [{ slot: "image-1", bytes: await syntheticPhoto(1_270, 847, 22) }] });
    expect(small.status).toBe("refused");
    expect(small.png).toBeNull();
    expect(codes(small.problems)).toEqual(["!image-low-resolution"]);
    expect(small.problems[0]!.message).toContain("1270 × 847");
    const enough = await renderDneskaiSlide({ type: "cover-photo", position: { index: 0, count: 5 }, headline: "Titulek", images: [{ slot: "image-1", bytes: await syntheticPhoto(1_600, 900, 22) }] });
    expect(enough.status).toBe("rendered");
    // A 16:9 hero at the floor is a 720 × 900 region drawn at 1.5×: drawn, and said so.
    expect(codes(enough.problems)).toEqual(["~image-upscaled"]);
    expect(enough.problems[0]!.message).toContain("720 × 900 px of it at 1.50×");
  }, 60_000);

  it("measures a full-bleed photograph on the region its crop cuts, not on the file", async () => {
    const large = await syntheticPhoto(1_200, 1_200, 25);
    const cover = (crop?: { focal: { x: number; y: number }; zoom?: number }): DneskaiSlideInput => ({
      type: "cover-photo", position: { index: 0, count: 5 }, headline: "Titulek", images: [{ slot: "image-1", bytes: large, ...(crop ? { crop } : {}) }]
    });
    // 960 × 1200 of a 1200 px square, drawn at 1.125×: nothing to say.
    expect(codes(await validateDneskaiSlide(cover()))).toEqual([]);
    // Zoom 4 cuts 240 × 300 px and would stretch it 4.5× to the whole slide.
    const zoomed = await renderDneskaiSlide(cover({ focal: { x: 0.5, y: 0.5 }, zoom: 4 }));
    expect(zoomed.status).toBe("refused");
    expect(zoomed.png).toBeNull();
    expect(codes(zoomed.problems)).toEqual(["!image-low-resolution"]);
    expect(zoomed.problems[0]!.message).toContain("240 × 300 px of it at 4.50×");
    // Zoom 1.2 cuts 800 × 1000 px, at 1.35×: drawn, and reported.
    expect(codes(await validateDneskaiSlide(cover({ focal: { x: 0.5, y: 0.5 }, zoom: 1.2 })))).toEqual(["~image-upscaled"]);
    // The single photo post bleeds the same way and is held to the same rule.
    const single = await validateDneskaiSlide({ ...cover({ focal: { x: 0.3, y: 0.3 }, zoom: 2 }), type: "single", position: { index: 0, count: 1 } });
    expect(codes(single)).toEqual(["!image-low-resolution"]);
  }, 60_000);

  it("refuses a slide without its required photograph instead of drawing it bare", async () => {
    const result = await renderDneskaiSlide(await figure({ images: [] }));
    expect(result.status).toBe("refused");
    expect(codes(result.problems)).toEqual(["!image-missing"]);
  });

  it("refuses an image the slide has no place for, a duplicate slot and bytes that are not the named asset", async () => {
    const bytes = await syntheticPhoto(900, 560, 23);
    expect(codes(await validateDneskaiSlide({ type: "statement", position: { index: 0, count: 3 }, headline: "Výrok", images: [{ slot: "image-1", bytes }] }))).toEqual(["!image-unexpected"]);
    expect(codes(await validateDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes }, { slot: "image-1", bytes }] })))).toEqual(["!image-duplicate"]);
    expect(codes(await validateDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes, assetSha256: "0".repeat(64) }] })))).toEqual(["!image-hash-mismatch"]);
    expect(codes(await validateDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes: Buffer.from("not an image") }] })))).toEqual(["!image-undecodable"]);
  });

  it("records the hash of the bytes drawn, and refuses a crop record set on other bytes", async () => {
    const before = await syntheticPhoto(900, 560, 26);
    const after = await syntheticPhoto(900, 560, 27);
    const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    const first = await renderDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes: before, crop: { focal: { x: 0.4, y: 0.5 } } }] }));
    const recorded = first.payload!.images!["image-1"]!;
    expect(recorded.assetSha256).toBe(sha(before));
    // The round trip: the stored crop record passed back with the same bytes renders the same slide.
    const again = await renderDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes: before, crop: recorded }] }));
    expect(again.pngHash).toBe(first.pngHash);
    expect(again.payload!.images!["image-1"]!.assetSha256).toBe(sha(before));
    // With refreshed bytes the old hash names another picture: refused, never recorded as drawn.
    const stale = await renderDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes: after, crop: recorded }] }));
    expect(stale.status).toBe("refused");
    expect(codes(stale.problems)).toEqual(["!image-hash-mismatch"]);
    expect(stale.payload?.images?.["image-1"]).toBeUndefined();
    // Without the old hash the crop is reused, and the record names the new bytes.
    const { assetSha256: _old, ...reused } = recorded;
    const fresh = await renderDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes: after, crop: reused }] }));
    expect(fresh.status).toBe("rendered");
    expect(fresh.payload!.images!["image-1"]).toEqual({ ...reused, assetSha256: sha(after) });
  });

  it("refuses a bad position, a missing headline, a wrong variant and a sources slide without sources", async () => {
    expect(codes(await validateDneskaiSlide(await figure({ position: { index: 5, count: 5 } })))).toEqual(["!position-invalid"]);
    expect(codes(await validateDneskaiSlide(await figure({ headline: "  " })))).toEqual(["!text-missing"]);
    expect(codes(await validateDneskaiSlide(await figure({ variant: "ink" })))).toEqual(["!variant-invalid"]);
    expect(codes(await validateDneskaiSlide({ type: "sources", position: { index: 4, count: 5 }, sources: [] }))).toEqual(["!sources-missing"]);
    expect(codes(await validateDneskaiSlide({ type: "sources", position: { index: 4, count: 5 }, sources: ["a", "b", "c", "d", "e"] }))).toEqual(["!sources-too-many"]);
    expect(codes(await validateDneskaiSlide({ type: "sources", position: { index: 4, count: 5 }, sources: ["  ", ""] }))).toEqual(["!sources-missing"]);
  });

  it("closes up blank source lines instead of drawing empty rows or counting them", async () => {
    const result = await renderDneskaiSlide({ type: "sources", position: { index: 4, count: 5 }, sources: ["  ", "Zdroj B", "", "Zdroj C", "Zdroj D", " ", "Zdroj E"] });
    expect(result.status).toBe("rendered");
    expect(result.problems).toEqual([]);
    expect(result.payload!.strings).toMatchObject({ "source-1": "Zdroj B", "source-2": "Zdroj C", "source-3": "Zdroj D", "source-4": "Zdroj E" });
    const tidy = await renderDneskaiSlide({ type: "sources", position: { index: 4, count: 5 }, sources: ["Zdroj B", "Zdroj C", "Zdroj D", "Zdroj E"] });
    expect(result.pngHash).toBe(tidy.pngHash);
    // A cut line still names the entry the caller wrote, not its place after closing up.
    const long = `Zdroj ${"s velmi dlouhým názvem článku, ".repeat(8)}`;
    const cut = await validateDneskaiSlide({ type: "sources", position: { index: 4, count: 5 }, sources: ["", long] });
    expect(cut.map((entry) => [entry.code, entry.field])).toEqual([["text-clipped", "sources[1]"]]);
  });

  it("renders words that do not fit, and says which were cut", async () => {
    const long = "Velmi dlouhý titulek, který se do rámu nevejde ani při nejmenší povolené velikosti písma, protože ho někdo napsal jako odstavec a ne jako titulek, a tak ho šablona musí zkrátit.";
    const result = await renderDneskaiSlide(await figure({ headline: long }));
    expect(result.status).toBe("rendered");
    expect(result.truncatedSlots).toEqual(["headline"]);
    expect(codes(result.problems)).toEqual(["~text-clipped"]);
    expect(result.problems[0]!.field).toBe("headline");
  });

  it("reports a framed picture drawn well past its own pixels without refusing it", async () => {
    const result = await renderDneskaiSlide(await figure({ images: [{ slot: "image-1", bytes: await syntheticPhoto(400, 250, 24) }] }));
    expect(result.status).toBe("rendered");
    expect(codes(result.problems)).toEqual(["~image-upscaled"]);
  });
});

describe("the DNESKAi golden slides", () => {
  it("render the committed bytes", async () => {
    const committed = readDneskaiGolden();
    const cases = await dneskaiGoldenCases();
    expect(committed.entries.map((entry) => entry.name)).toEqual(cases.map((entry) => entry.name));
    for (const { name, input } of cases) {
      const result = await renderDneskaiSlide(input);
      const expected = committed.entries.find((entry) => entry.name === name)!;
      expect(result.status, name).toBe("rendered");
      expect(result.template, name).toEqual({ id: expected.templateId, version: expected.version });
      expect(result.pngHash, name).toBe(expected.pngHash);
    }
  }, 120_000);
});
