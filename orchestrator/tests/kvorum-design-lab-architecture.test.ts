import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

async function sourceFiles(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name) && !entry.name.includes(".test."))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("Kvórum's Design Lab boundary", () => {
  it("hands one summary to the shared Lab and owns no renderer or export surface", async () => {
    const orchestratorFiles = await sourceFiles(path.join(repoRoot, "orchestrator/src/ventures/kvorum"));
    const siteFiles = (await sourceFiles(path.join(repoRoot, "site/src")))
      .filter((file) => path.relative(path.join(repoRoot, "site/src"), file).includes("kvorum"));
    const bodies = new Map(await Promise.all([...orchestratorFiles, ...siteFiles].map(async (file) => [
      path.relative(repoRoot, file),
      await readFile(file, "utf8")
    ] as const)));

    const studioImports = [...bodies]
      .filter(([, body]) => body.includes("@boardlessai/carousel-studio"))
      .map(([file]) => file);
    expect(studioImports).toEqual(["site/src/lib/kvorum-recommendation-store.ts"]);

    const summaryWriters = [...bodies]
      .filter(([, body]) => body.includes("state/ventures/carousel-studio/summaries/kvorum"))
      .map(([file]) => file);
    expect(summaryWriters).toEqual(["site/src/lib/kvorum-recommendation-store.ts"]);

    const privateRenderSurface = /(?:renderCarouselPng|renderCarouselSvg|buildArticleDeck|deriveRecipe|from ["']sharp["']|from ["']satori["']|@resvg|image\/png|application\/zip|<svg\b)/u;
    expect([...bodies].filter(([, body]) => privateRenderSurface.test(body)).map(([file]) => file))
      .toEqual([]);
    expect([...bodies.keys()].filter((file) => /(?:render|export)/iu.test(path.basename(file))))
      .toEqual([]);

    const handoff = bodies.get("site/src/lib/kvorum-recommendation-store.ts")!;
    expect(handoff).toContain("buildCarouselSummary({");
    expect(handoff).toContain('venture: "kvorum"');

    const reader = await readFile(path.join(repoRoot, "site/src/lib/carousel-summaries.ts"), "utf8");
    expect(reader).toContain('["caught-up", "mma-files", "kvorum", "booksofhistory", "door-money", "tehdejsi-svet"]');
    expect(reader).toContain('path.join(root, "state", "ventures", "carousel-studio", "summaries", venture)');
  });
});
