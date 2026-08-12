import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("Door Money carousel locale", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("carries an English recorded summary through the Design Lab and rejects a locale mismatch", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "door-money-locale-"));
    roots.push(root);
    const directory = path.join(root, "state/ventures/carousel-studio/summaries/door-money");
    await mkdir(directory, { recursive: true });
    const summary = {
      schemaVersion: "carousel-summary/1",
      venture: "door-money",
      slug: "synthetic-load-in",
      date: "2026-08-06",
      locale: "en",
      kicker: "Door Money · Aug 6",
      headline: "A synthetic load-in story",
      standfirst: "An invented example proves that English follows the record.",
      passages: [
        "The fictional crew arrived before the imaginary doors opened.",
        "A made-up checklist kept the synthetic cases in order.",
        "The invented night ended without describing any real event."
      ],
      closing: "The rest of the story lives in Door Money.",
      sources: [],
      hasHero: false,
      heroCredit: null
    };
    await writeFile(path.join(directory, "2026-08-06-synthetic-load-in.json"), JSON.stringify(summary));
    await writeFile(path.join(directory, "2026-08-07-wrong-locale.json"), JSON.stringify({
      ...summary,
      slug: "wrong-locale",
      date: "2026-08-07",
      locale: "cs"
    }));

    vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
    const { readDesignLab } = await import("./design-lab");
    const articles = await readDesignLab();

    expect(articles).toHaveLength(1);
    expect(articles[0]).toMatchObject({
      venture: "door-money",
      locale: "en",
      ventureLabel: "Door Money",
      origin: "recorded",
      recipe: { venture: "door-money" },
      copy: { venture: "door-money", locale: "en" }
    });
  });
});
