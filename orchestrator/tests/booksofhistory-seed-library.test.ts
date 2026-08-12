import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BhSeedLibrarySchema } from "../src/contracts/bh-seed.js";
import { repoRoot } from "../src/paths.js";

async function library() {
  return BhSeedLibrarySchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "state", "ventures", "booksofhistory", "seed", "library.json"),
    "utf8"
  )) as unknown);
}

describe("the authored BOOKSOFHISTORY seed shelf", () => {
  it("holds 200 unique, prior-labelled cheap records with implementation provenance", async () => {
    const seed = await library();
    expect(seed.books).toHaveLength(200);
    expect(new Set(seed.books.map(({ bookId }) => bookId)).size).toBe(200);
    expect(seed.books.every(({ provenance }) => provenance === "authored:implementation:2026-08-12")).toBe(true);
    expect(seed.books.filter(({ authorDates }) => authorDates !== undefined).length).toBeGreaterThanOrEqual(50);
    expect(seed.books.some(({ coverRef }) => coverRef !== undefined)).toBe(false);
  });

  it("keeps the commissioned regional, chronological, genre and story seams visible", async () => {
    const { books } = await library();
    const centralEuropean = books.filter(({ scoringMetadata }) =>
      scoringMetadata.geographies.includes("central-europe")
    );
    expect(centralEuropean.length / books.length).toBeGreaterThanOrEqual(0.25);
    expect(centralEuropean.length / books.length).toBeLessThanOrEqual(0.3);

    const periods = new Set(books.map(({ scoringMetadata }) => scoringMetadata.period));
    expect(periods).toEqual(new Set(["pre-17th", "17th", "18th", "19th", "20th", "21st"]));
    const genres = new Set(books.flatMap(({ genres }) => genres));
    for (const required of ["novel", "poetry", "drama", "childrens", "science-fiction", "crime", "nonfiction"]) {
      expect(genres, required).toContain(required);
    }
    const geographies = new Set(books.flatMap(({ scoringMetadata }) => scoringMetadata.geographies));
    expect(geographies.size).toBeGreaterThanOrEqual(30);

    const publishingStoryAngles = new Set([
      "anonymous-publication",
      "book-design",
      "censorship",
      "edition-history",
      "exile-publication",
      "legal-history",
      "posthumous-publication",
      "pseudonym",
      "publishing-history",
      "samizdat",
      "serial-publication"
    ]);
    expect(books.filter(({ contentCategories }) =>
      contentCategories.some((category) => publishingStoryAngles.has(category))
    ).length).toBeGreaterThanOrEqual(60);
  });
});
