import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

async function sourceFiles(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.[cm]?[jt]sx?$/u.test(entry.name) && !entry.name.includes(".test."))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("Tehdejsi svet's Design Lab boundary", () => {
  it("uses the shared Design Lab engine and has no venture-private image renderer or export route", async () => {
    const orchestratorFiles = await sourceFiles(path.join(repoRoot, "orchestrator/src/ventures/tehdejsi-svet"));
    const siteFiles = (await sourceFiles(path.join(repoRoot, "site/src")))
      .filter((file) => path.basename(file).includes("tehdejsi"));
    const bodies = new Map(await Promise.all([...orchestratorFiles, ...siteFiles].map(async (file) => [
      path.relative(repoRoot, file),
      await readFile(file, "utf8")
    ] as const)));

    const renderers = [...bodies]
      .filter(([, body]) => /\brenderCarouselSvg\s*\(/u.test(body))
      .map(([file]) => file)
      .sort();
    expect(renderers).toEqual([
      "orchestrator/src/ventures/tehdejsi-svet/render.ts",
      "site/src/lib/tehdejsi-features-store.ts"
    ]);
    for (const file of renderers) {
      expect(bodies.get(file)).toContain('from "@boardlessai/carousel-studio"');
    }

    const privateSurface = /from ["'](?:sharp|satori|@resvg\/resvg-js)["']|<svg\b|image\/png|application\/zip/u;
    expect([...bodies].filter(([, body]) => privateSurface.test(body)).map(([file]) => file)).toEqual([]);

    const summaryUsers = [...bodies]
      .filter(([, body]) => body.includes("tehdejsiCarouselSummaryPath"))
      .map(([file]) => file)
      .sort();
    expect(summaryUsers).toEqual([
      "orchestrator/src/ventures/tehdejsi-svet/render.ts",
      "site/src/lib/tehdejsi-features-store.ts"
    ]);

    const previewRoute = await readFile(path.join(
      repoRoot,
      "site/src/app/admin/api/carousel-studio/deck/[venture]/[slug]/[date]/[recipe]/[slide]/route.ts"
    ), "utf8");
    const exportRoute = await readFile(path.join(
      repoRoot,
      "site/src/app/admin/api/carousel-studio/export/[venture]/[slug]/[date]/[recipe]/route.ts"
    ), "utf8");
    for (const route of [previewRoute, exportRoute]) {
      expect(route).toContain('import { tehdejsiRenderInput } from "@/lib/tehdejsi-render"');
      expect(route).toContain("deck.dualLanguage");
    }
  });
});
