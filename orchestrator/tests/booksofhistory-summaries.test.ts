import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";
import { repoRoot } from "../src/paths.js";
import { storeApprovedBhCarouselSummaries } from "../src/ventures/booksofhistory/summaries.js";

async function approvedRecommendation() {
  const fixture = JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/venture-recommendation.valid.json"),
    "utf8"
  )) as Record<string, unknown>;
  return VentureRecommendationSchema.parse({
    ...fixture,
    status: "approved",
    designLab: {
      status: "ready",
      summaryRefs: {
        cs: "ventures/carousel-studio/summaries/booksofhistory/example-cs.json",
        en: "ventures/carousel-studio/summaries/booksofhistory/example-en.json"
      }
    },
    owner: {
      ...fixture.owner as object,
      editHistory: [{ at: "2026-08-14T10:05:00.000Z", action: "approve", locale: null, reason: null }]
    },
    updatedAt: "2026-08-14T10:05:00.000Z"
  });
}

describe("BOOKSOFHISTORY twin Studio summaries", () => {
  it("writes separate Czech and English records and replays byte-identically", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-summaries-"));
    try {
      const recommendation = await approvedRecommendation();
      const first = await storeApprovedBhCarouselSummaries(root, recommendation);
      const firstBytes = {
        cs: await readFile(path.join(root, first.cs.path), "utf8"),
        en: await readFile(path.join(root, first.en.path), "utf8")
      };
      const second = await storeApprovedBhCarouselSummaries(root, recommendation);

      expect(first.cs.path).toMatch(/summaries\/booksofhistory\/.*-cs\.json$/u);
      expect(first.en.path).toMatch(/summaries\/booksofhistory\/.*-en\.json$/u);
      expect(first.cs.summary.slug).toBe(first.en.summary.slug);
      expect(first.cs.summary).toMatchObject({ venture: "booksofhistory", locale: "cs", hasHero: false });
      expect(first.en.summary).toMatchObject({ venture: "booksofhistory", locale: "en", hasHero: false });
      expect(first.cs.summary.headline).not.toBe(first.en.summary.headline);
      expect(await readFile(path.join(root, second.cs.path), "utf8")).toBe(firstBytes.cs);
      expect(await readFile(path.join(root, second.en.path), "utf8")).toBe(firstBytes.en);
      expect(`${firstBytes.cs}${firstBytes.en}`).not.toContain("coverRef");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to place an unapproved recommendation in the Studio rail", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-summaries-"));
    try {
      const approved = await approvedRecommendation();
      await expect(storeApprovedBhCarouselSummaries(root, {
        ...approved,
        status: "draft",
        owner: { ...approved.owner, editHistory: [] }
      })).rejects.toThrow(/owner-approved/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps every venture-owned visual path behind the Design Lab summary handoff", async () => {
    async function sourceFiles(directory: string): Promise<string[]> {
      const entries = await readdir(directory, { withFileTypes: true });
      return (await Promise.all(entries.map(async (entry) => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(absolute) : [absolute];
      }))).flat().filter((file) => /\.[cm]?[jt]sx?$/u.test(file));
    }

    const ventureFiles = [
      ...await sourceFiles(path.join(repoRoot, "orchestrator/src/ventures/booksofhistory")),
      ...await sourceFiles(path.join(repoRoot, "site/src")).then((files) =>
        files.filter((file) => path.relative(repoRoot, file).toLowerCase().includes("booksofhistory")))
    ];
    const sources = await Promise.all(ventureFiles.map(async (file) => ({
      file: path.relative(repoRoot, file),
      source: await readFile(file, "utf8")
    })));
    const studioImports = sources
      .filter(({ source }) => source.includes('from "@boardlessai/carousel-studio"'))
      .map(({ file }) => file)
      .sort();

    expect(studioImports).toEqual([
      "orchestrator/src/ventures/booksofhistory/summaries.ts",
      "site/src/lib/booksofhistory-features-store.ts"
    ]);
    for (const { file, source } of sources) {
      expect(source, `${file} must not own a private raster or SVG renderer`).not.toMatch(
        /from ["'](?:@resvg\/resvg-js|sharp|canvas|satori)["']|\b(?:renderCarouselPng|renderCarouselSvg|toRenderablePng)\b/u
      );
    }
    for (const file of studioImports) {
      const source = sources.find((candidate) => candidate.file === file)!.source;
      expect(source).toContain("buildBooksofhistoryCarouselSummary");
      expect(source).toContain("booksofhistoryCarouselSummaryPath");
    }
  });
});
