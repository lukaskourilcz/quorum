import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCarouselSummary, CarouselPayloadSchema } from "@boardlessai/carousel-studio";
import { repoRoot } from "../src/paths.js";

async function filesUnder(root: string, accept: (relative: string) => boolean): Promise<string[]> {
  try {
    return (await readdir(root, { recursive: true }))
      .filter((relative) => accept(relative))
      .map((relative) => path.join(root, relative));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function objects(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (value === null || typeof value !== "object") return [];
  const object = value as Record<string, unknown>;
  return [object, ...Object.values(object).flatMap(objects)];
}

function quoteProblems(value: unknown): string[] {
  const problems: string[] = [];
  const visit = (entry: unknown, pathParts: string[]) => {
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => visit(item, [...pathParts, String(index)]));
      return;
    }
    if (entry === null || typeof entry !== "object") return;
    const object = entry as Record<string, unknown>;
    for (const [key, child] of Object.entries(object)) {
      const childPath = [...pathParts, key];
      const isQuote = key === "quote" && typeof child === "string";
      const isQuoteListText = key === "text" && typeof child === "string" && pathParts.includes("quotes");
      if (isQuote || isQuoteListText) {
        if ([...child].length > 300) problems.push(`${childPath.join(".")} exceeds 300 characters`);
        if (typeof object.attribution !== "string" || object.attribution.trim().length === 0) {
          problems.push(`${childPath.join(".")} has no attribution`);
        }
      }
      if (key === "quotes" && Array.isArray(child)) {
        child.forEach((quote, index) => {
          if (typeof quote === "string") problems.push(`${[...childPath, String(index)].join(".")} has no attribution`);
        });
      }
      visit(child, childPath);
    }
  };
  visit(value, []);
  return problems;
}

async function jsonValues(files: readonly string[]): Promise<Array<{ file: string; value: unknown; source: string }>> {
  const values: Array<{ file: string; value: unknown; source: string }> = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (file.endsWith(".jsonl")) {
      source.split("\n").filter((line) => line.trim().length > 0).forEach((line, index) => {
        values.push({ file: `${file}:${index + 1}`, value: JSON.parse(line) as unknown, source: line });
      });
    } else {
      values.push({ file, value: JSON.parse(source) as unknown, source });
    }
  }
  return values;
}

describe("BOOKSOFHISTORY cover and quotation boundary", () => {
  it("refuses a cover reference at the Studio payload boundary and drops it from summaries", () => {
    expect(CarouselPayloadSchema.safeParse({
      locale: "cs",
      strings: { headline: "A verified story" },
      coverRef: { url: "https://example.invalid/cover", visibility: "admin-only" }
    }).success).toBe(false);

    const summary = buildCarouselSummary({
      venture: "mma-files",
      slug: "fixture",
      date: "2026-08-12",
      title: "A verified story",
      dek: "A bounded summary.",
      points: ["One sourced point.", "A second sourced point.", "A third sourced point."],
      coverRef: { url: "https://example.invalid/cover", visibility: "admin-only" }
    } as Parameters<typeof buildCarouselSummary>[0]);
    expect(objects(summary).some((object) => Object.hasOwn(object, "coverRef"))).toBe(false);
    expect(JSON.stringify(summary)).not.toContain("https://example.invalid/cover");
  });

  it("keeps cover references out of render, summary and export sources and committed outputs", async () => {
    const sourceRoots = [
      path.join(repoRoot, "studio", "src"),
      path.join(repoRoot, "orchestrator", "src", "studio"),
      path.join(repoRoot, "site", "src", "app", "admin", "api", "carousel-studio")
    ];
    const sourceFiles = (await Promise.all(sourceRoots.map((root) =>
      filesUnder(root, (relative) =>
        (relative.endsWith(".ts") || relative.endsWith(".tsx")) && relative !== "schema.ts"
      )
    ))).flat();
    const ventureRenderFiles = await filesUnder(
      path.join(repoRoot, "orchestrator", "src", "ventures", "booksofhistory"),
      (relative) => /(?:render|studio|export|summary|social|package).*\.tsx?$/u.test(relative)
    );
    for (const file of [...sourceFiles, ...ventureRenderFiles]) {
      expect(await readFile(file, "utf8"), file).not.toMatch(/\bcoverRef\b/u);
    }

    const renderedRoots = [
      path.join(repoRoot, "state", "ventures", "carousel-studio", "summaries"),
      path.join(repoRoot, "state", "ventures", "carousel-studio", "recipes"),
      path.join(repoRoot, "state", "ventures", "carousel-studio", "social-copy"),
      path.join(repoRoot, "state", "social", "assets"),
      path.join(repoRoot, "state", "social", "packs"),
      path.join(repoRoot, "state", "social", "queue")
    ];
    const renderedFiles = (await Promise.all(renderedRoots.map((root) =>
      filesUnder(root, (relative) => relative.endsWith(".json") || relative.endsWith(".jsonl"))
    ))).flat();
    const rendered = await jsonValues(renderedFiles);
    const seedSources = [
      path.join(repoRoot, "contracts", "fixtures", "bh-seed.valid.json"),
      ...(await filesUnder(
        path.join(repoRoot, "state", "ventures", "booksofhistory", "seed"),
        (relative) => relative.endsWith(".json")
      ))
    ];
    const coverUrls = (await jsonValues(seedSources)).flatMap(({ value }) =>
      objects(value).flatMap((object) => {
        const cover = object.coverRef;
        return cover && typeof cover === "object" && typeof (cover as { url?: unknown }).url === "string"
          ? [(cover as { url: string }).url]
          : [];
      })
    );
    for (const artifact of rendered) {
      expect(objects(artifact.value).some((object) => Object.hasOwn(object, "coverRef")), artifact.file).toBe(false);
      for (const url of coverUrls) expect(artifact.source, artifact.file).not.toContain(url);
    }
  });

  it("caps every committed venture quote at 300 characters and requires attribution", async () => {
    const files = await filesUnder(
      path.join(repoRoot, "state", "ventures", "booksofhistory"),
      (relative) => relative.endsWith(".json") || relative.endsWith(".jsonl")
    );
    for (const artifact of await jsonValues(files)) {
      expect(quoteProblems(artifact.value), artifact.file).toEqual([]);
    }

    expect(quoteProblems({ quotes: [{ text: "x".repeat(300), attribution: "Author · work" }] })).toEqual([]);
    expect(quoteProblems({ quotes: [{ text: "x".repeat(301), attribution: "Author · work" }] })).toEqual([
      "quotes.0.text exceeds 300 characters"
    ]);
    expect(quoteProblems({ quote: "A remembered line", attribution: "" })).toEqual([
      "quote has no attribution"
    ]);
    expect(quoteProblems({ quotes: ["An unattributed string"] })).toEqual([
      "quotes.0 has no attribution"
    ]);
  });
});
