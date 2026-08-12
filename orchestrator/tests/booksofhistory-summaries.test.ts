import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});
