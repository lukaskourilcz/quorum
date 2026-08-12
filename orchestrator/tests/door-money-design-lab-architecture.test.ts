import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

async function sourceFiles(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name) && !entry.name.includes(".test."))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("Door Money's Design Lab boundary", () => {
  it("has one summary handoff and no venture-private renderer or export path", async () => {
    const orchestratorFiles = await sourceFiles(path.join(repoRoot, "orchestrator", "src", "ventures", "door-money"));
    const siteFiles = (await sourceFiles(path.join(repoRoot, "site", "src")))
      .filter((file) => path.relative(path.join(repoRoot, "site", "src"), file).includes("door-money"));
    const ownedFiles = [...orchestratorFiles, ...siteFiles];
    const bodies = new Map(await Promise.all(ownedFiles.map(async (file) => [
      path.relative(repoRoot, file),
      await readFile(file, "utf8")
    ] as const)));

    const studioImports = [...bodies]
      .filter(([, body]) => body.includes("@boardlessai/carousel-studio"))
      .map(([file]) => file);
    expect(studioImports).toEqual(["site/src/lib/door-money-recommendations-store.ts"]);

    const summaryWriters = [...bodies]
      .filter(([, body]) => body.includes("state/ventures/carousel-studio/summaries/door-money"))
      .map(([file]) => file);
    expect(summaryWriters).toEqual(["site/src/lib/door-money-recommendations-store.ts"]);

    const privateRenderSurface = /(?:renderCarouselPng|buildArticleDeck|deriveRecipe|from ["']sharp["']|from ["']satori["']|@resvg|image\/png|application\/zip|<svg\b)/u;
    expect([...bodies].filter(([, body]) => privateRenderSurface.test(body)).map(([file]) => file))
      .toEqual([]);
    expect([...bodies.keys()].filter((file) => /(?:render|export)/iu.test(path.basename(file))))
      .toEqual([]);

    const handoff = bodies.get("site/src/lib/door-money-recommendations-store.ts")!;
    expect(handoff).toContain("buildCarouselSummary({");
    expect(handoff).toContain('venture: "door-money"');
    expect(handoff).toContain("reviewCarouselSummary(summary)");

    const designLabReader = await readFile(path.join(repoRoot, "site", "src", "lib", "carousel-summaries.ts"), "utf8");
    expect(designLabReader).toContain('["caught-up", "mma-files", "booksofhistory", "door-money"]');
    expect(designLabReader).toContain('path.join(root, "state", "ventures", "carousel-studio", "summaries", venture)');
  });

  it("keeps each side of the GoVIRAL handoff to one scalar follow-up", async () => {
    const portfolio = await readFile(path.join(repoRoot, "orchestrator", "src", "portfolio", "run.ts"), "utf8");
    expect(portfolio).toContain("const followUp = contributions.find((contribution) => contribution.agent === chair)?.followUpRequest;");
    expect(portfolio.match(/await requestMeetingAgenda\(/gu)).toHaveLength(1);

    const booker = await readFile(path.join(
      repoRoot, "orchestrator", "src", "ventures", "door-money", "growth-booker.ts"
    ), "utf8");
    expect(booker).toContain("followUpRequest: z.strictObject({");
    expect(booker).toContain('phase: z.literal("gv-brief")');
    expect(booker).not.toContain("followUpRequests:");
  });
});
