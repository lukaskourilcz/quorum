import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TehdejsiFact } from "../src/contracts/tehdejsi-facts.js";
import { repoRoot } from "../src/paths.js";
import {
  applyTehdejsiPerformanceWeightProposal,
  proposeTehdejsiPerformanceWeights,
  readTehdejsiPerformanceWeights,
  runSundayPerformanceOverlay,
  tehdejsiPerformanceMultiplier
} from "../src/ventures/tehdejsi-svet/performance.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures", name), "utf8")) as Record<string, unknown>;
}

async function performanceState(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tehdejsi-performance-"));
  roots.push(root);
  const venture = path.join(root, "ventures/tehdejsi-svet");
  await Promise.all([
    mkdir(path.join(venture, "drafts"), { recursive: true }),
    mkdir(path.join(venture, "results"), { recursive: true })
  ]);
  const factsRaw = await readFile(path.join(repoRoot, "state/ventures/tehdejsi-svet/facts.json"), "utf8");
  const facts = JSON.parse(factsRaw) as { contentHash: string };
  await writeFile(path.join(venture, "facts.json"), factsRaw);

  const baseRecommendation = await fixture("venture-recommendation-tehdejsi.valid.json");
  const recommendations = [
    { id: "ts-performance-cs", factId: "cs-1970s-vecernicek", localeUrl: "https://www.instagram.com/p/synthetic-performance-cs/" },
    { id: "ts-performance-ua", factId: "ua-1970s-kyiv-metro-token", localeUrl: "https://www.instagram.com/p/synthetic-performance-ua/" }
  ];
  for (const [index, item] of recommendations.entries()) {
    const recommendation = structuredClone(baseRecommendation) as Record<string, unknown>;
    recommendation.id = item.id;
    recommendation.status = "posted";
    recommendation.evidence = { ...(recommendation.evidence as Record<string, unknown>), factsHash: facts.contentHash, factIds: [item.factId] };
    recommendation.owner = { postedUrls: { cs: item.localeUrl, ua: item.localeUrl }, rejectionReason: null };
    recommendation.updatedAt = "2026-08-21T12:00:00.000Z";
    await writeFile(path.join(venture, "drafts", `${item.id}.json`), `${JSON.stringify(recommendation, null, 2)}\n`);

    const result = await fixture("tehdejsi-owner-result-entry.valid.json");
    result.resultId = `result-${String(index + 1).repeat(20)}`;
    result.recommendationId = item.id;
    result.locale = index === 0 ? "cs" : "ua";
    result.postUrl = item.localeUrl;
    result.capturedAt = "2026-08-22T12:00:00.000Z";
    result.recordedAt = "2026-08-22T12:05:00.000Z";
    result.metrics = {
      sends: index === 0 ? 30 : 2,
      saves: index === 0 ? 10 : 2,
      views: 100,
      likes: null,
      comments: null,
      shares: null,
      follows: null,
      linkTaps: null
    };
    await writeFile(path.join(venture, "results", `${result.resultId}.json`), `${JSON.stringify(result, null, 2)}\n`);
  }
  return root;
}

describe("Tehdejsi svet performance weights", () => {
  it("creates and applies one cited Sunday proposal, then stays idempotent", async () => {
    const root = await performanceState();
    const now = new Date("2026-08-23T16:00:00.000Z");
    expect(await runSundayPerformanceOverlay({ root, date: "2026-08-23", now, approvalGranted: false })).toEqual([]);
    const artifacts = await runSundayPerformanceOverlay({ root, date: "2026-08-23", now, approvalGranted: true });
    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]).toMatch(/performance-weight-proposals\/weights-[a-f0-9]{20}\.json/u);
    const weights = await readTehdejsiPerformanceWeights(root);
    expect(weights.dimensions).toMatchObject({
      pillars: { media: 1.05, price: 0.95 },
      countries: { cz: 1.05, ua: 0.95 }
    });
    expect(weights.appliedResultIds).toEqual([
      `result-${"1".repeat(20)}`,
      `result-${"2".repeat(20)}`
    ]);
    expect(await runSundayPerformanceOverlay({ root, date: "2026-08-23", now, approvalGranted: true })).toEqual([]);
    expect(await runSundayPerformanceOverlay({ root, date: "2026-08-24", now, approvalGranted: true })).toEqual([]);

    const weightPath = path.join(root, "ventures/tehdejsi-svet/performance-weights.json");
    const tampered = JSON.parse(await readFile(weightPath, "utf8"));
    tampered.dimensions.pillars.media = 1.2;
    await writeFile(weightPath, `${JSON.stringify(tampered, null, 2)}\n`);
    await expect(readTehdejsiPerformanceWeights(root)).rejects.toThrow(/do not replay/u);
  });

  it("rejects off-Sunday and dimension-unsupported citations", async () => {
    const root = await performanceState();
    const proposal = await proposeTehdejsiPerformanceWeights({ root, date: "2026-08-23", now: new Date("2026-08-23T16:00:00.000Z") });
    expect(proposal).not.toBeNull();
    await expect(applyTehdejsiPerformanceWeightProposal({
      root,
      proposal: { ...proposal!, sourceDate: "2026-08-24" }
    })).rejects.toThrow(/Sunday-only/u);
    const unsupported = structuredClone(proposal!);
    unsupported.proposalId = `weights-${"f".repeat(20)}`;
    unsupported.adjustments[0]!.key = "culture";
    await expect(applyTehdejsiPerformanceWeightProposal({ root, proposal: unsupported }))
      .rejects.toThrow(/unsupported result/u);
  });

  it("keeps the three-dimension product inside the final floor", () => {
    const fact: TehdejsiFact = {
      id: "synthetic-performance-fact",
      kind: "media",
      country: "cz",
      place: null,
      yearFrom: 1975,
      yearTo: 1975,
      sensitivityTier: 0,
      shareSafe: true,
      text: "A synthetic performance fact long enough for the strict fixture boundary.",
      sources: [{ title: "Synthetic source", url: null, note: null }],
      verified: null
    };
    expect(tehdejsiPerformanceMultiplier(fact, {
      pillars: { media: 0.75 },
      cohorts: { "1970s": 0.75 },
      countries: { cz: 0.75 }
    })).toBe(0.75);
  });
});
