import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";

const workflow = readFileSync(path.join(repoRoot, ".github/workflows/cycle.yml"), "utf8");

/** Every `allowed='...'` line in the delivery steps, in file order. */
function allowlists(): string[] {
  return [...workflow.matchAll(/allowed='([^']+)'/gu)].map((match) => match[1]!);
}

describe("the delivery allowlists", () => {
  it("still carries the dataset allowlist byte-identically", () => {
    // Widening this would let a dataset append rewrite an article.
    expect(allowlists()).toContain(String.raw`^data/(ai-facts|ai-lessons)\.json$`);
  });

  it("gives streams and events their own kinds", () => {
    expect(allowlists()).toContain(String.raw`^data/(talked-about|podcasts)\.json$`);
    expect(allowlists()).toContain(String.raw`^data/events\.json$`);
  });

  it("keeps the edition allowlist as the only one that can write an article", () => {
    const editionAllowlists = allowlists().filter((entry) => entry.includes("content/articles"));
    expect(editionAllowlists).toHaveLength(0);
    // The edition allowlist is assigned with double quotes because it
    // interpolates the package date, so it is matched separately.
    expect(workflow).toContain("content/articles/${PACKAGE_DATE}\\.(en|cs)\\.mdx");
  });

  it("never lets a stream or event allowlist reach an article, an image or board JSON", () => {
    for (const list of [
      String.raw`^data/(talked-about|podcasts)\.json$`,
      String.raw`^data/events\.json$`,
    ]) {
      const pattern = new RegExp(list, "u");
      for (const forbidden of [
        "content/articles/2026-08-09.cs.mdx",
        "public/images/editions/x/hero.webp",
        "public/data/board/2026-08-09.json",
        "data/ai-facts.json",
        "data/ai-lessons.json",
      ]) {
        expect(pattern.test(forbidden), `${list} must not accept ${forbidden}`).toBe(false);
      }
    }
  });

  it("accepts exactly the files each kind is allowed to write", () => {
    const streams = new RegExp(String.raw`^data/(talked-about|podcasts)\.json$`, "u");
    expect(streams.test("data/talked-about.json")).toBe(true);
    expect(streams.test("data/podcasts.json")).toBe(true);
    expect(streams.test("data/events.json")).toBe(false);

    const events = new RegExp(String.raw`^data/events\.json$`, "u");
    expect(events.test("data/events.json")).toBe(true);
    expect(events.test("data/talked-about.json")).toBe(false);
  });
});

describe("how the sync steps are gated", () => {
  it("runs only when the owner has switched streams on", () => {
    expect(workflow).toContain("vars.CAUGHT_UP_STREAMS_ENABLED == 'true'");
  });

  it("adds no new cron entry and no new council phase", () => {
    // The steps live inside the existing daily cycle. The three crons are the
    // cycle's own morning, afternoon and night slots and this work added none.
    const schedules = [...workflow.matchAll(/- cron:/gu)].length;
    expect(schedules).toBe(3);
    expect(workflow).not.toContain("phase == 'cu-streams'");
    expect(workflow).not.toContain("phase == 'cu-events'");
  });

  it("is quiet on a day with no change", () => {
    const quiet = [...workflow.matchAll(/No (stream|event) changes today\./gu)];
    expect(quiet).toHaveLength(2);
  });

  it("verifies the reader's own gates before committing", () => {
    const verifies = [...workflow.matchAll(/pnpm install --frozen-lockfile && pnpm verify/gu)];
    expect(verifies.length).toBeGreaterThanOrEqual(2);
  });

  it("pushes with the same refetch-and-retry pattern as the edition delivery", () => {
    const retries = [...workflow.matchAll(/rebase --autostash origin\/main/gu)];
    expect(retries.length).toBeGreaterThanOrEqual(4);
  });
});
