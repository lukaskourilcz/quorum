import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  OPERATING_TRUTH_END,
  OPERATING_TRUTH_START,
  buildCurrentOperatingTruth,
  replaceCurrentOperatingTruth
} from "../src/docs/ecosystem.js";

const repoRoot = path.resolve(process.cwd(), "..");

describe("living ecosystem document", () => {
  it("generates current counts, modes and gates without a provider call", async () => {
    const block = await buildCurrentOperatingTruth(repoRoot);
    expect(block).toContain("| Portfolio | 5 projects");
    expect(block).toContain("| Agent roster | 30 active: 17 Anthropic, 13 OpenAI");
    expect(block).toContain("Carousel Studio");
    expect(block).toContain("METRICS_INGESTION_ENABLED=false");
    // SPLIT is retired and off every venture list, so REACH is the only role MMA Files has
    // switched off rather than removed.
    expect(block).toContain("REACH");
  });

  it("keeps curated prose untouched when the generated block refreshes", async () => {
    const source = await readFile(path.join(repoRoot, "docs", "ECOSYSTEM.md"), "utf8");
    const next = replaceCurrentOperatingTruth(source, await buildCurrentOperatingTruth(repoRoot));
    expect(next.slice(0, next.indexOf(OPERATING_TRUTH_START))).toBe(source.slice(0, source.indexOf(OPERATING_TRUTH_START)));
    expect(next.slice(next.indexOf(OPERATING_TRUTH_END) + OPERATING_TRUTH_END.length)).toBe(
      source.slice(source.indexOf(OPERATING_TRUTH_END) + OPERATING_TRUTH_END.length)
    );
  });
});
