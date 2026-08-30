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
    // Three owner-only workspaces: the Personal Growth desk, WebDev Signal and Contest Radar.
    // The last two are `exploration` and neither has a public surface — Contest Radar is
    // owner-only by its founding decision rather than merely unfinished.
    expect(block).toContain("| Portfolio | 11 public projects; 3 owner-only workspaces |");
    expect(block).toContain("| Agent roster | 40 active: 25 Anthropic, 15 OpenAI");
    // The spend boundary is generated from the resolver, not written into the generator. It
    // carried budget-2026-08d's superseded $50/$42/$2.20 as a literal while the runtime enforced
    // budget-2026-08e -- a generated block stating a cap nothing was applying.
    expect(block).toContain("| Approved spend boundary | $50.00 all-in monthly; $25.00 model/API share; $1.00 daily model/API pace |");
    // The workshop's reader-facing name is Design Lab (D13). Its venture id stays
    // `carousel-studio`, which is why the generated table's row label moved and nothing else did.
    expect(block).toContain("Design Lab");
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
