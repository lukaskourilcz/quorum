import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { heroCropAnchor, materializeLicensedPhoto, type LicensedPhotoCandidate } from "../src/images/licensed.js";

const BASE: LicensedPhotoCandidate = {
  id: "wikidata:Q1",
  provider: "wikimedia",
  title: "Fixture portrait.jpg",
  thumbnailUrl: "https://upload.wikimedia.org/thumb.jpg",
  downloadUrl: "https://upload.wikimedia.org/file.jpg",
  width: 1_200,
  height: 1_600,
  license: "CC BY-SA",
  author: "Fixture uploader",
  sourceUrl: "https://commons.wikimedia.org/?curid=1",
  attributionHtml: "Fixture uploader · CC BY-SA · Wikimedia Commons"
};

async function frame(width: number, height: number): Promise<Uint8Array> {
  const pixels = Buffer.alloc(width * height * 3, 160);
  return new Uint8Array(await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer());
}

describe("where the 16:9 hero is cut from", () => {
  it("anchors an identity-linked photograph at the top and a searched one at the busiest region", () => {
    // A person photographed in portrait has their head near the top, so the top band holds the
    // face. Attention holds whatever sharp scores highest, which on Commons file "Charles
    // Oliveira do Bronxs.jpg" is a championship belt at chest height: the produced hero contained
    // a belt and a torso and no face, under alt text naming Charles Oliveira.
    expect(heroCropAnchor({ identityOf: "Q5081361" })).toBe("top");
    // A stock photograph of a place or an object has no head to protect and attention is right.
    expect(heroCropAnchor({})).toBe("attention");
  });
});

describe("which shapes of file may illustrate an article", () => {
  it("accepts a portrait only when the subject's own item named it", async () => {
    const bytes = await frame(1_200, 1_600);
    // 43 of the 55 files the roster's Wikidata items name are taller than they are wide, so
    // landscape-only would have thrown away four fifths of the pictures that are provably of the
    // right person.
    await expect(materializeLicensedPhoto({
      candidate: { ...BASE, identityOf: "Q1" },
      venture: "mma-files",
      slug: "portrait-identity",
      altCs: "Alt",
      fetchBytes: async () => bytes
    })).resolves.toMatchObject({ width: 1_600, height: 900 });

    // The same shape arriving from a phrase search is still refused: there, a tall frame is
    // usually a crop of something incidental and nothing links it to the subject.
    await expect(materializeLicensedPhoto({
      candidate: BASE,
      venture: "mma-files",
      slug: "portrait-searched",
      altCs: "Alt",
      fetchBytes: async () => bytes
    })).rejects.toThrow("failed validation");
  });

  it("still refuses a file too small to fill the hero, identity or not", async () => {
    await expect(materializeLicensedPhoto({
      candidate: { ...BASE, identityOf: "Q1", width: 480, height: 640 },
      venture: "mma-files",
      slug: "too-small",
      altCs: "Alt",
      fetchBytes: async () => frame(480, 640)
    })).rejects.toThrow("failed validation");
  });
});
