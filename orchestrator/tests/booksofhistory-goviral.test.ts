import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingPlanSchema } from "../src/contracts/marketing-plan.js";
import { BhSeedLibrarySchema } from "../src/contracts/bh-seed.js";
import { repoRoot } from "../src/paths.js";
import { readBhGoViralContext } from "../src/ventures/booksofhistory/goviral.js";
import { scoreBhOpportunity, type BhOpportunityContext } from "../src/ventures/booksofhistory/score.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("BOOKSOFHISTORY GoVIRAL context", () => {
  it("reads the latest recorded fixture brief into the deterministic trend factor", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-goviral-"));
    roots.push(root);
    const plans = path.join(root, "ventures/goviral/plans");
    await mkdir(plans, { recursive: true });
    const raw = await readFile(path.join(repoRoot, "contracts/fixtures/goviral-booksofhistory-plan.valid.json"), "utf8");
    expect(MarketingPlanSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    await writeFile(path.join(plans, "2026-08-10.json"), raw);
    await writeFile(path.join(plans, "poison.json"), "{not-json");

    const goViral = await readBhGoViralContext(root, "2026-08-12");
    const library = BhSeedLibrarySchema.parse(JSON.parse(await readFile(path.join(repoRoot, "state/ventures/booksofhistory/seed/library.json"), "utf8")));
    const dune = library.books.find(({ bookId }) => bookId === "dune")!;
    const context: BhOpportunityContext = { asOf: new Date("2026-08-12T10:00:00.000Z"), trendSignals: goViral.trendSignals, recentFeatures: [], lanePerformance: {}, shelfStoriesByBookId: {} };
    const trend = scoreBhOpportunity(dune, context).factors.trendCrossover;

    expect(goViral.planRef).toBe("ventures/goviral/plans/2026-08-10.json");
    expect(goViral.trendSignals.map((signal) => signal.keywords)).toEqual([["publishing history"], ["literary anniversary"]]);
    expect(trend).toMatchObject({ multiplier: 1.2, strength: 1 });
    expect(trend.matchedSignalIds).toEqual(["plan-2026-08-10-weekly-brief:free-1"]);
  });

  it("does not consume a vetoed draft or a future plan", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "bh-goviral-guard-"));
    roots.push(root);
    const plans = path.join(root, "ventures/goviral/plans");
    await mkdir(plans, { recursive: true });
    const plan = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/goviral-booksofhistory-plan.valid.json"), "utf8"));
    await writeFile(path.join(plans, "draft.json"), JSON.stringify({ ...plan, status: "draft" }));
    await writeFile(path.join(plans, "future.json"), JSON.stringify({ ...plan, id: "plan-2026-08-20-weekly-brief" }));
    expect(await readBhGoViralContext(root, "2026-08-12")).toEqual({ planRef: null, trendSignals: [] });
  });
});
