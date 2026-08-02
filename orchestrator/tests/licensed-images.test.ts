import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateLicensedImageCandidate } from "../src/images/article-image.js";
import {
  discoverLicensedPhotos,
  materializeLicensedPhoto,
  type LicensedPhotoCandidate,
  candidatesNaming
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

describe("a hero photo has to name its subject", () => {
  const candidate = (title: string, author = "Someone", sourceUrl = "https://commons.wikimedia.org/wiki/File:X.jpg") => ({
    id: title, provider: "wikimedia" as const, title, thumbnailUrl: "https://example.test/t.jpg",
    downloadUrl: "https://example.test/d.jpg", width: 1600, height: 900, license: "CC0" as const,
    author, sourceUrl, attributionHtml: `<span>${author}</span>`
  });

  it("drops a photo of other people that merely came back from the search", () => {
    // This is the real one: a US Air Force range photograph ran as the hero of a Valentina
    // Shevchenko profile, credited to the airman who took it.
    const results = candidatesNaming(
      [candidate("Airmen fire an M2 machine gun during a range day", "Tech. Sgt. Katie Gar Ward")],
      "valentina shevchenko"
    );
    expect(results).toEqual([]);
  });

  it("keeps a photo whose title names the subject", () => {
    const match = candidate("Valentina Shevchenko at UFC 285 weigh-ins");
    expect(candidatesNaming([match, candidate("A crowd at an arena")], "valentina shevchenko")).toEqual([match]);
  });

  it("accepts the name from the file URL when the title is unhelpful", () => {
    const match = candidate("File photo", "Photographer", "https://commons.wikimedia.org/wiki/File:Valentina_Shevchenko_2023.jpg");
    expect(candidatesNaming([match], "valentina shevchenko")).toEqual([match]);
  });

  it("returns nothing rather than guess when there is no subject to match", () => {
    expect(candidatesNaming([candidate("Anything")], "")).toEqual([]);
  });
});
