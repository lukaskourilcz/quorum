import { describe, expect, it } from "vitest";
import {
  DECK_FAMILIES,
  GOLDEN_BRAND,
  GOLDEN_SLIDE_COUNT,
  MASTER_CANVAS,
  goldenDeck,
  goldenPayloadHash,
  goldenRenderInput,
  readGoldenManifest,
  strandedGoldenEntries,
  verifyGoldenManifest
} from "../src/index.js";

/**
 * The committed golden renders, re-rasterised and compared.
 *
 * `tehdejsi-determinism.test.ts` pins one literal sha256 for one kit and argues the case for it in
 * full; this is that receipt generalised to the thirty shared families, with the hashes in a
 * committed manifest instead of thirty literals in a test file.
 *
 * One test here rasterises all thirty decks, which is about twenty seconds, and it is worth them:
 * it is the only check in the suite that compares drawn pixels rather than the instructions for
 * drawing them. A composer that moves a shared primitive by a thousandth passes every other gate
 * in this directory.
 */

describe("the golden manifest", () => {
  it("covers exactly the registered families, at the pinned canvas and payload", () => {
    const manifest = readGoldenManifest();
    expect(manifest.schemaVersion).toBe("carousel-golden/1");
    expect(manifest.canvas).toEqual({ width: MASTER_CANVAS.width, height: MASTER_CANVAS.height });
    expect(manifest.brand).toBe(GOLDEN_BRAND);
    expect(manifest.slideCount).toBe(GOLDEN_SLIDE_COUNT);
    // The words are part of the baseline. A changed payload changes every hash, so the manifest
    // says which payload it was taken from rather than leaving the reader to guess.
    expect(manifest.payloadHash).toBe(goldenPayloadHash());
    expect(manifest.entries.map(({ family }) => family)).toEqual([...DECK_FAMILIES]);
    expect(strandedGoldenEntries(manifest)).toEqual([]);
    for (const entry of manifest.entries) {
      expect(entry.templateId, entry.family).toBe(`deck-${entry.family}-${GOLDEN_SLIDE_COUNT}`);
      expect(entry.slideHashes, entry.family).toHaveLength(GOLDEN_SLIDE_COUNT);
      expect(new Set(entry.slideHashes).size, `${entry.family} repeats a slide`).toBe(GOLDEN_SLIDE_COUNT);
    }
    // Thirty families, thirty distinct decks. The same assertion `families.test.ts` makes about
    // SVG bytes, made here about rasterised ones.
    expect(new Set(manifest.entries.map(({ deckHash }) => deckHash)).size).toBe(DECK_FAMILIES.length);
  });

  it("renders the committed bytes for every family", async () => {
    const verdicts = await verifyGoldenManifest();
    const drifted = verdicts.filter((verdict) => !verdict.ok);
    expect(
      drifted.map((verdict) => `${verdict.family}: slides ${verdict.changedSlides.map((index) => index + 1).join(", ")}`)
    ).toEqual([]);
    expect(verdicts).toHaveLength(DECK_FAMILIES.length);
  }, 300_000);

  it("rasterises the same bytes twice in a row", async () => {
    const family = DECK_FAMILIES[0]!;
    const first = await goldenDeck(family);
    const second = await goldenDeck(family);
    expect(first.slideHashes).toEqual(second.slideHashes);
    expect(first.deckHash).toBe(second.deckHash);
  }, 120_000);

  it("pins every axis the recipe engine varies", () => {
    const input = goldenRenderInput("halo");
    expect(input.format).toBe("instagram-portrait");
    expect(input.template.formats["instagram-portrait"]).toMatchObject(MASTER_CANVAS);
    expect(input.template.id).toBe(`deck-halo-${GOLDEN_SLIDE_COUNT}`);
    // No `-s10p0` suffix: a scaled or rotated deck carries one, and a baseline may not be either.
    expect(input.template.id).not.toMatch(/-s\d+p\d+$/);
    expect(input.images).toBeUndefined();
    expect(input.payload.variant).toBeUndefined();
  });
});
