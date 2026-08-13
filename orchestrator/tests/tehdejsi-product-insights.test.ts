import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TehdejsiProductInsightSchema } from "../src/contracts/tehdejsi-product-insight.js";
import { repoRoot } from "../src/paths.js";

describe("Tehdejsi svet seeded product insights", () => {
  it("records exactly the five audited findings as owner recommendations with path evidence", async () => {
    const directory = path.join(repoRoot, "state/ventures/tehdejsi-svet/product-insights");
    const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    const insights = await Promise.all(names.map(async (name) => TehdejsiProductInsightSchema.parse(
      JSON.parse(await readFile(path.join(directory, name), "utf8"))
    )));
    expect(insights).toHaveLength(5);
    expect(insights.map(({ id }) => id).sort()).toEqual([
      "ts-insight-baby-names-coverage",
      "ts-insight-chapter-04-music-promise",
      "ts-insight-coral-token-drift",
      "ts-insight-music-dataset-missing",
      "ts-insight-ua-film-coverage"
    ]);
    for (const insight of insights) {
      expect(insight.status).toBe("proposed");
      expect(insight.evidence.length).toBeGreaterThan(0);
      expect(insight.evidence.every(({ filePath }) => filePath.startsWith("src/"))).toBe(true);
      expect(insight).not.toHaveProperty("productToken");
      expect(insight).not.toHaveProperty("applyProductChange");
    }
  });
});
