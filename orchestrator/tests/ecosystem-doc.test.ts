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
    expect(block).toContain("| Portfolio | 7 projects");
    expect(block).toContain("| Agent roster | 33 active: 19 Anthropic, 14 OpenAI");
    // The spend boundary is generated from the resolver, not written into the generator. It
    // carried budget-2026-08d's superseded $50/$42/$2.20 as a literal while the runtime enforced
    // budget-2026-08e -- a generated block stating a cap nothing was applying.
    expect(block).toContain("| Approved spend boundary | $30.00 all-in monthly; $25.00 model/API share; $1.00 daily model/API pace |");
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
