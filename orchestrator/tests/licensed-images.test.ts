import { readFile } from "node:fs/promises";
import path from "node:path";
import { deterministicArticleImage } from "../src/images/article-image.js";
import { repoRoot } from "../src/paths.js";
import { imageSubjectQuery, pickedSubjectQuery } from "../src/images/subject-query.js";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateLicensedImageCandidate } from "../src/images/article-image.js";
import {
  discoverLicensedPhotos,
  materializeLicensedPhoto,
  type LicensedPhotoCandidate,
  candidatesNaming,
  candidateHosted
} from "../src/images/licensed.js";

const candidate: LicensedPhotoCandidate = {
  id: "openverse:fixture-photo",
  provider: "openverse",
  title: "Fixture newsroom",
  thumbnailUrl: "https://live.staticflickr.com/fixture-thumb.jpg",
  downloadUrl: "https://live.staticflickr.com/fixture.jpg",
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

describe("a cover never repeats the article", () => {
  it("draws no part of the headline", () => {
    // The old cover set the headline in large type, so a reader met the same sentence twice:
    // once as the page title and once as the picture below it.
    const title = "AI agents cheat to win and the platforms are just starting to notice";
    const image = deterministicArticleImage({
      venture: "caught-up", slug: "ai-agents", title, date: "2026-08-03", tags: ["ai", "safety"]
    });
    const svg = Buffer.from(image.hero_bytes_base64, "base64").toString();
    for (const word of ["cheat", "platforms are", "starting to notice"]) {
      expect(svg, `cover must not carry "${word}"`).not.toContain(word);
    }
    expect(svg).toContain("2026-08-03");
    // Readable labels, not raw slugs. The plate used to print uppercased ref tokens --
    // FIGHT-WEEK-PREVIEW AMANDA-LEMOS BILLY-QUARANTILLO -- on published covers.
    expect(svg).toContain("Ai · Safety");
    expect(svg).toContain("DNESKAi");
    // And no fingerprint: a hex digest of the plate's own inputs identifies the file to nobody.
    expect(svg).not.toContain("FRAME ·");
  });

  it("gives two different articles two different covers, and one article the same one twice", () => {
    const make = (slug: string) => deterministicArticleImage({
      venture: "caught-up", slug, title: slug, date: "2026-08-03", tags: ["ai"]
    }).hero_bytes_base64;
    expect(make("first-story")).not.toBe(make("second-story"));
    expect(make("first-story")).toBe(make("first-story"));
  });
});

describe("the subject query", () => {
  it("turns a day's tags into something an archive is indexed on", () => {
    // Three concatenated headlines truncated to 100 characters returned nothing from every
    // archive, which is why the edition shipped a cover instead of a photograph.
    expect(imageSubjectQuery([["ai", "safety"], ["ai", "platforms"], ["cybersecurity"]]))
      .toBe("artificial intelligence cybersecurity");
  });

  it("says nothing rather than guess when no tag has a visual meaning", () => {
    // primary-source and analysis describe how a story was sourced, not what it looks like.
    expect(imageSubjectQuery([["primary-source"], ["news"], ["analysis"]])).toBe("");
  });

  it("follows the story the editor picked, not the crowd it was picked out of", () => {
    // A digest is eighty items of everything that moved that morning, and the eleven the editor
    // did not commission outvote the one it did. Here the day is loud about data centres and the
    // article is about a court ruling; the query used to describe the day.
    const digest = [
      ["cipy", "datacentra"],
      ["ai-modely", "datacentra"],
      ["ai-agenti"],
      ["firmy", "startupy"],
      ["pravo", "regulace"]
    ];
    expect(pickedSubjectQuery({ picked: [["pravo", "soudy"]], digest })).toBe("courtroom");
    expect(imageSubjectQuery(digest)).toBe("data centre technology company office");
  });

  it("widens back to the digest when the picked story's tags say nothing visual", () => {
    // A pick list tagged only with how it was sourced maps to no concept at all, and an empty
    // phrase empties every archive. The day's crowd is a worse basis than the article and a
    // better one than nothing.
    expect(pickedSubjectQuery({
      picked: [["primary-source"], ["analysis"]],
      digest: [["kyberbezpecnost"], ["bezpecnost"]]
    })).toBe("cybersecurity");
    expect(pickedSubjectQuery({ picked: [], digest: [] })).toBe("");
  });
});

describe("the downloader's allowlist is fixed", () => {
  it("drops a candidate served from a host the downloader may not reach", () => {
    // materializeLicensedPhoto used to add whatever host the search response named to its own
    // allowlist, which is the one thing an allowlist exists to prevent.
    expect(candidateHosted({ downloadUrl: "https://live.staticflickr.com/x.jpg" })).toBe(true);
    expect(candidateHosted({ downloadUrl: "https://upload.wikimedia.org/x.jpg" })).toBe(true);
    expect(candidateHosted({ downloadUrl: "https://images.example/x.jpg" })).toBe(false);
    expect(candidateHosted({ downloadUrl: "not a url" })).toBe(false);
  });
});

describe("the cover's alt describes the cover", () => {
  it("ignores an alt written for an illustration that was never drawn", () => {
    // The writer produces illustration_alt before any image is attached, so the 3 August
    // edition shipped this plate under "A chessboard with pieces casting shadows shaped like
    // daggers and question marks" — a screen-reader user was told about a chessboard that is
    // not there. That alt is right for a photograph and wrong for a generated plate.
    const image = deterministicArticleImage({
      venture: "caught-up", slug: "s", title: "t",
      date: "2026-08-03", tags: ["ai", "safety"]
    });
    expect(image.alt_en).not.toContain("chessboard");
    expect(image.alt_en).toContain("2026-08-03");
    expect(image.alt_en).toContain("no photograph");
    expect(image.alt_cs).toContain("bez fotografie");
  });
});

/**
 * Both magazines illustrate from keyless licensed archives, with a deterministic SVG plate as the
 * last rung. gpt-image-2 has never had a call site in an article pipeline and the budget ledger
 * has never carried an entry for one; this is what says so out loud, so a future image adapter
 * has to argue with a failing test rather than slip in beside the free ladder.
 */
describe("paid image generation has no way into an article", () => {
  it("has no IMAGE role for a pipeline to reach", async () => {
    const models = JSON.parse(
      await readFile(path.join(repoRoot, "config", "models.json"), "utf8")
    ) as { roles: Record<string, unknown> };

    expect(models.roles.IMAGE).toBeUndefined();
    // AVATAR_IMAGE stays: owner-triggered portrait repairs are the one place a generated image
    // is wanted, and they are not an article pipeline.
    expect(models.roles.AVATAR_IMAGE).toBeDefined();
  });

  it("has never billed an image call from an article pipeline", async () => {
    const ledger = JSON.parse(
      await readFile(path.join(repoRoot, "state", "budget", "ledger.json"), "utf8")
    ) as { entries: Array<{ kind: string; phase: string }> };

    const imageEntries = ledger.entries.filter((entry) => entry.kind === "image");
    expect(imageEntries.map((entry) => `${entry.phase}:${entry.kind}`)).toEqual([]);
  });
});
