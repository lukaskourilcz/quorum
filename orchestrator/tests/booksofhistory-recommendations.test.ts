import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VentureRecommendationSchema } from "../src/contracts/venture-recommendation.js";
import { repoRoot } from "../src/paths.js";
import { storeBhRecommendation } from "../src/ventures/booksofhistory/recommendations.js";

describe("BOOKSOFHISTORY recommendation store", () => {
  it("writes dossier-story evidence with both payloads once per cycle and story", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-recommendation-"));
    try {
      const recommendation = VentureRecommendationSchema.parse(JSON.parse(await readFile(
        path.join(repoRoot, "contracts/fixtures/venture-recommendation.valid.json"),
        "utf8"
      )));
      const first = await storeBhRecommendation(root, recommendation);
      const bytes = await readFile(path.join(root, first.path), "utf8");
      const second = await storeBhRecommendation(root, recommendation);

      expect(first.status).toBe("created");
      expect(second.status).toBe("already-recorded");
      expect(await readFile(path.join(root, first.path), "utf8")).toBe(bytes);
      expect(second.recommendation).toEqual(first.recommendation);
      expect(first.recommendation).toMatchObject({
        evidence: {
          kind: "dossier-story",
          claimRefs: ["claim-publication-context"],
          storyRef: expect.stringContaining("#story-serial-to-book"),
          dossierRef: expect.stringContaining("dossier.json")
        },
        payloads: { cs: { locale: "cs" }, en: { locale: "en" } }
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
