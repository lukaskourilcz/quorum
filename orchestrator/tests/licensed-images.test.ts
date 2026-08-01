import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateLicensedImageCandidate } from "../src/images/article-image.js";
import {
  discoverLicensedPhotos,
  materializeLicensedPhoto,
  type LicensedPhotoCandidate
} from "../src/images/licensed.js";

const candidate: LicensedPhotoCandidate = {
  id: "openverse:fixture-photo",
  provider: "openverse",
  title: "Fixture newsroom",
  thumbnailUrl: "https://images.example/fixture-thumb.jpg",
  downloadUrl: "https://images.example/fixture.jpg",
  width: 1_800,
  height: 1_000,
  license: "CC BY",
  author: "Fixture Photographer",
  sourceUrl: "https://source.example/fixture",
  attributionHtml: "Fixture Photographer · CC BY · fixture source"
};

describe("licensed article images", () => {
  it("rejects non-commercial, no-derivatives and unlicensed candidates", () => {
    for (const license of ["CC BY-NC", "CC BY-ND", null]) {
      expect(validateLicensedImageCandidate({
        license,
        author: "Fixture Photographer",
        sourceUrl: "https://source.example/fixture",
        attributionHtml: "Fixture attribution"
      })).toContain("license-not-allowed");
    }
  });

  it("discovers allowlisted metadata and reports optional sources without keys", async () => {
    const result = await discoverLicensedPhotos({
      query: "fixture newsroom",
      fetchJson: async (url) => url.includes("api.openverse.org")
        ? {
            results: [{
              id: "fixture-photo",
              title: "Fixture newsroom",
              thumbnail: candidate.thumbnailUrl,
              url: candidate.downloadUrl,
              width: candidate.width,
              height: candidate.height,
              license: "by",
              creator: candidate.author,
              foreign_landing_url: candidate.sourceUrl
            }]
          }
        : { query: { pages: {} } }
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ provider: "openverse", license: "CC BY" });
    expect(result.skippedProviders).toEqual([
      { provider: "pexels", reason: "missing-key" },
      { provider: "pixabay", reason: "missing-key" }
    ]);
  });

  it("strips metadata, crops two rehostable variants and preserves attribution", async () => {
    const source = await sharp({
      create: { width: 1_800, height: 1_000, channels: 3, background: "#4e6d7c" }
    }).jpeg({ quality: 92 }).withMetadata({ orientation: 6 }).toBuffer();
    const image = await materializeLicensedPhoto({
      candidate,
      venture: "caught-up",
      slug: "2026-08-01-fixture-release",
      altEn: "A fixture newsroom image",
      altCs: "Ilustrační snímek redakce",
      fetchBytes: async () => source
    });
    const hero = Buffer.from(image.hero_bytes_base64, "base64");
    const thumb = Buffer.from(image.thumb_bytes_base64, "base64");
    expect(image).toMatchObject({
      origin: "photo",
      hero_path: "public/images/editions/2026-08-01-fixture-release/hero.webp",
      thumb_path: "public/images/editions/2026-08-01-fixture-release/thumb.webp",
      width: 1_600,
      height: 900,
      license: { name: "CC BY", author: "Fixture Photographer" }
    });
    expect(await sharp(hero).metadata()).toMatchObject({ width: 1_600, height: 900, format: "webp" });
    expect(await sharp(thumb).metadata()).toMatchObject({ width: 640, height: 360, format: "webp" });
    expect((await sharp(hero).metadata()).orientation).toBeUndefined();
  });
});
