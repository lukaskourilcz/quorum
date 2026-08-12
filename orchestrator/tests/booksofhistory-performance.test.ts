import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BhSeedLibrarySchema } from "../src/contracts/bh-seed.js";
import { BooksofHistoryPerformanceWeightProposalSchema } from "../src/contracts/performance-weights.js";
import { repoRoot } from "../src/paths.js";
import { atomicWriteJson, readJson } from "../src/state.js";
import {
  applyBhPerformanceWeightProposal,
  BH_PERFORMANCE_PROPOSALS_ROOT,
  BH_PERFORMANCE_WEIGHT_FLOOR,
  BH_PERFORMANCE_WEIGHTS_PATH,
  readBhLanePerformanceWeights,
  readBhPerformanceWeights
} from "../src/ventures/booksofhistory/performance.js";
import { scoreBhOpportunity } from "../src/ventures/booksofhistory/score.js";

const roots: string[] = [];

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "quorum-bh-performance-"));
  roots.push(root);
  return root;
}

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures", name), "utf8")) as unknown;
}

async function proposal() {
  const base = BooksofHistoryPerformanceWeightProposalSchema.parse(await fixture("performance-weight-proposal.valid.json"));
  const resultIds = ["result-aaaaaaaaaaaaaaaaaaaa"];
  return BooksofHistoryPerformanceWeightProposalSchema.parse({
    ...base,
    adjustments: [
      { lane: "cs", dimension: "categories", key: "publishing-history", from: 1, to: 1.08, resultIds, rationale: "The cited Czech result supports a small category increase." },
      { lane: "cs", dimension: "eras", key: "20th", from: 1, to: 1.04, resultIds, rationale: "The cited Czech result supports a small era increase." },
      { lane: "cs", dimension: "geographies", key: "czechia", from: 1, to: 1.1, resultIds, rationale: "The cited Czech result supports a small geography increase." }
    ]
  });
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("BOOKSOFHISTORY performance weights", () => {
  it("records a cited proposal before applying bounded category, era and geography weights", async () => {
    const root = await temporaryRoot();
    await atomicWriteJson(root, "ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json", await fixture("booksofhistory-owner-result-entry.valid.json"));
    const recordedProposal = await proposal();

    const first = await applyBhPerformanceWeightProposal({ root, proposal: recordedProposal });
    const second = await applyBhPerformanceWeightProposal({ root, proposal: recordedProposal });

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      floor: 0.75,
      ceiling: 1.25,
      lanes: { cs: { categories: { "publishing-history": 1.08 }, eras: { "20th": 1.04 }, geographies: { czechia: 1.1 } } },
      appliedProposalIds: [recordedProposal.proposalId]
    });
    const storedProposal = await readJson<unknown | null>(root, `${BH_PERFORMANCE_PROPOSALS_ROOT}/${recordedProposal.proposalId}.json`, null);
    expect(storedProposal).toEqual(expect.objectContaining({
      adjustments: expect.arrayContaining([expect.objectContaining({ resultIds: ["result-aaaaaaaaaaaaaaaaaaaa"] })])
    }));

    const library = BhSeedLibrarySchema.parse(await fixture("bh-seed.valid.json"));
    const score = scoreBhOpportunity(library.books[0]!, {
      asOf: new Date("2026-08-21T12:00:00.000Z"),
      trendSignals: [],
      recentFeatures: [],
      lanePerformance: await readBhLanePerformanceWeights(root),
      shelfStoriesByBookId: {}
    });
    expect(score.factors.lanePerformance.lanes.cs).toBeGreaterThan(1);
    expect(score.factors.lanePerformance.lanes.en).toBe(1);
  });

  it("rejects a proposal below the fixed floor and leaves neutral weights untouched", async () => {
    const root = await temporaryRoot();
    await atomicWriteJson(root, "ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json", await fixture("booksofhistory-owner-result-entry.valid.json"));
    const belowFloor = { ...await proposal(), adjustments: [{ ...(await proposal()).adjustments[0]!, to: BH_PERFORMANCE_WEIGHT_FLOOR - 0.01 }] };

    await expect(applyBhPerformanceWeightProposal({ root, proposal: belowFloor })).rejects.toThrow("breaches the 0.75-1.25 bounds");
    expect(await readBhPerformanceWeights(root)).toMatchObject({ lanes: { cs: { categories: {}, eras: {}, geographies: {} } }, appliedProposalIds: [] });
    expect(await readJson(root, BH_PERFORMANCE_WEIGHTS_PATH, null)).toBeNull();
  });

  it("rejects missing, future and wrong-lane result citations before recording a proposal", async () => {
    const root = await temporaryRoot();
    const missing = await proposal();
    await expect(applyBhPerformanceWeightProposal({ root, proposal: missing })).rejects.toThrow("cites missing result");

    const futureResult = { ...await fixture("booksofhistory-owner-result-entry.valid.json") as object, recordedAt: "2026-08-22T12:05:00.000Z" };
    await atomicWriteJson(root, "ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json", futureResult);
    await expect(applyBhPerformanceWeightProposal({ root, proposal: missing })).rejects.toThrow("cites future result");

    await atomicWriteJson(root, "ventures/booksofhistory/results/result-aaaaaaaaaaaaaaaaaaaa.json", await fixture("booksofhistory-owner-result-entry.valid.json"));
    const wrongLane = { ...missing, adjustments: [{ ...missing.adjustments[0]!, lane: "en" }] };
    await expect(applyBhPerformanceWeightProposal({ root, proposal: wrongLane })).rejects.toThrow("outside adjustment lane en");
    expect(await readJson(root, `${BH_PERFORMANCE_PROPOSALS_ROOT}/${missing.proposalId}.json`, null)).toBeNull();
  });
});
