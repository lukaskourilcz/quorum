import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { KvorumEntityLexiconSchema, type KvorumEntityLexicon } from "../src/contracts/kvorum-entities.js";
import {
  KvorumMonitorItemSchema,
  KvorumMonitorReceiptSchema,
  type KvorumMonitorCluster,
  type KvorumMonitorItem,
  type KvorumMonitorSourceResult
} from "../src/contracts/kvorum-monitor.js";
import {
  clusterKvorumItems,
  rankKvorumClusters,
  type KvorumPriorRecommendation
} from "../src/ventures/kvorum/cluster.js";
import { buildKvorumMonitorReceipt } from "../src/ventures/kvorum/monitor.js";
import { repoRoot } from "../src/paths.js";
import { applyPerformanceWeightProposal } from "../src/performance/weights.js";
import { KvorumPerformanceWeightsSchema } from "../src/ventures/kvorum/performance.js";
import { loadLatestKvorumGoViralContext } from "../src/ventures/kvorum/goviral.js";
import { atomicWriteJson, atomicWriteText } from "../src/state.js";

const now = new Date("2026-08-12T21:00:00.000Z");

async function fixtureInput(): Promise<{
  items: KvorumMonitorItem[];
  clusters: KvorumMonitorCluster[];
  lexicon: KvorumEntityLexicon;
  history: KvorumPriorRecommendation[];
}> {
  const [itemsRaw, historyRaw, lexiconRaw] = await Promise.all([
    readFile(path.join(import.meta.dirname, "../fixtures/kvorum/monitor-day.json"), "utf8"),
    readFile(path.join(import.meta.dirname, "../fixtures/kvorum/prior-recommendations.json"), "utf8"),
    readFile(path.join(repoRoot, "config/kvorum-entities.json"), "utf8")
  ]);
  const items = (JSON.parse(itemsRaw) as unknown[]).map((item) => KvorumMonitorItemSchema.parse(item));
  const lexicon = KvorumEntityLexiconSchema.parse(JSON.parse(lexiconRaw) as unknown);
  const labels = Object.fromEntries(lexicon.entities.map((entity) => [entity.id, entity.canonicalName]));
  return {
    items,
    clusters: clusterKvorumItems(items, { entityLabels: labels }),
    lexicon,
    history: JSON.parse(historyRaw) as KvorumPriorRecommendation[]
  };
}

function rankOne(input: Awaited<ReturnType<typeof fixtureInput>>, history: KvorumPriorRecommendation[]) {
  const cluster = input.clusters.find((candidate) => candidate.itemRefs.length === 3)!;
  return rankKvorumClusters({
    clusters: [cluster],
    items: input.items,
    lexicon: input.lexicon,
    priorRecommendations: history,
    now
  });
}

describe("Kvórum deterministic cluster ranking", () => {
  test("records the complete factor product and excludes Štít from corroboration", async () => {
    const input = await fixtureInput();
    const ranked = rankKvorumClusters({
      ...input,
      priorRecommendations: input.history,
      now
    });
    const media = ranked.clusters.find((cluster) => cluster.itemRefs.length === 3)!;
    const rank = ranked.ranks.find((candidate) => candidate.clusterId === media.id)!;

    expect(media.continuationOf).toBe("kv-rec-public-media-2026-08-05");
    expect(rank.factors).toMatchObject({
      corroboration: 2,
      entityWeight: 4.5,
      engagementSalience: 4.105851,
      novelty: 0.7,
      standingTopicContinuity: 1.25,
      trendCrossover: 1
    });
    expect(rank.score).toBe(32.333577);
    expect(ranked.ranks.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    expect(ranked.ranks.at(-1)?.factors.novelty).toBe(0);
    expect(ranked.ranks.at(-1)?.score).toBe(0);
  });

  test("multiplies the curated topic factor by the recorded performance weight", async () => {
    const input = await fixtureInput();
    const state = JSON.parse(await readFile(
      path.join(repoRoot, "state/ventures/kvorum/performance-weights.json"),
      "utf8"
    )) as unknown;
    const resultIds = ["kv-result-01", "kv-result-02", "kv-result-03"];
    const performanceWeights = KvorumPerformanceWeightsSchema.parse(applyPerformanceWeightProposal({
      state,
      proposal: {
        schemaVersion: "performance-weight-proposal/1",
        id: "kv-rank-2026-w33",
        ventureId: "kvorum",
        week: "2026-W33",
        proposedAt: "2026-08-13T09:00:00.000Z",
        changes: [{
          axis: "topic",
          key: "public-media-funding",
          weight: 0.9,
          resultIds,
          reason: "Three cited owner results support a bounded topic adjustment."
        }]
      },
      evidence: resultIds.map((resultId) => ({
        resultId,
        topics: ["public-media-funding"],
        formats: ["carousel"]
      })),
      now: new Date("2026-08-13T10:00:00.000Z")
    }).state);
    const ranked = rankKvorumClusters({
      ...input,
      priorRecommendations: input.history,
      now,
      performanceWeights
    });
    const media = ranked.clusters.find((cluster) => cluster.itemRefs.length === 3)!;
    expect(ranked.ranks.find((entry) => entry.clusterId === media.id)?.factors.entityWeight).toBe(4.25);
  });

  test("reads the latest recorded GoVIRAL fixture and applies only its Kvórum crossover", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "kvorum-goviral-"));
    try {
      const fixture = JSON.parse(await readFile(
        path.join(import.meta.dirname, "../fixtures/kvorum/goviral-plan.json"),
        "utf8"
      )) as Record<string, unknown>;
      await atomicWriteJson(
        stateRoot,
        "ventures/goviral/plans/plan-2026-08-10-weekly-brief.json",
        fixture
      );
      await atomicWriteJson(stateRoot, "ventures/goviral/plans/plan-future.json", {
        ...fixture,
        id: "plan-2026-08-13-weekly-brief",
        originMeetingRef: "2026-08-13-gv-brief"
      });
      await atomicWriteText(
        stateRoot,
        "ventures/goviral/plans/plan-corrupt.json",
        "{not-json}\n"
      );
      const trendContext = await loadLatestKvorumGoViralContext({
        stateRoot,
        asOfDate: "2026-08-12"
      });
      expect(trendContext).toMatchObject({
        planId: "plan-2026-08-10-weekly-brief",
        planRef: "state/ventures/goviral/plans/plan-2026-08-10-weekly-brief.json",
        matchedTactics: 1,
        terms: ["poplatky"],
        droppedRecords: 1
      });

      const input = await fixtureInput();
      const ranked = rankKvorumClusters({
        ...input,
        priorRecommendations: input.history,
        now,
        trendContext
      });
      const media = ranked.clusters.find((cluster) => cluster.itemRefs.length === 3)!;
      const mediaRank = ranked.ranks.find((candidate) => candidate.clusterId === media.id)!;
      expect(mediaRank.factors.trendCrossover).toBe(1.1);
      expect(mediaRank.score).toBe(35.566934);
      expect(ranked.ranks.filter((rank) => rank.factors.trendCrossover === 1.1)).toHaveLength(1);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("consumes a newer vetoed GoVIRAL draft without turning it into a boost", async () => {
    const stateRoot = await mkdtemp(path.join(os.tmpdir(), "kvorum-goviral-veto-"));
    try {
      const fixture = JSON.parse(await readFile(
        path.join(import.meta.dirname, "../fixtures/kvorum/goviral-plan.json"),
        "utf8"
      )) as Record<string, unknown>;
      await atomicWriteJson(stateRoot, "ventures/goviral/plans/plan-approved.json", fixture);
      await atomicWriteJson(stateRoot, "ventures/goviral/plans/plan-draft.json", {
        ...fixture,
        id: "plan-2026-08-11-weekly-brief",
        status: "draft",
        originMeetingRef: "2026-08-11-gv-brief"
      });
      const context = await loadLatestKvorumGoViralContext({
        stateRoot,
        asOfDate: "2026-08-12"
      });
      expect(context).toMatchObject({
        planId: "plan-2026-08-11-weekly-brief",
        status: "draft",
        matchedTactics: 0,
        terms: []
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("decays the similarity penalty across the 14-day window", async () => {
    const input = await fixtureInput();
    const historyAt = (ageDays: number): KvorumPriorRecommendation[] => [{
      recommendationId: `kv-media-${ageDays}`,
      recommendedAt: new Date(now.getTime() - ageDays * 86_400_000).toISOString(),
      entityIds: ["public-media-funding"],
      topicTokens: ["poplatky", "televizni"]
    }];
    expect(rankOne(input, historyAt(0)).ranks[0]?.factors.novelty).toBe(0.4);
    expect(rankOne(input, historyAt(7)).ranks[0]?.factors.novelty).toBe(0.7);
    expect(rankOne(input, historyAt(14)).ranks[0]?.factors.novelty).toBe(1);
    expect(rankOne(input, historyAt(14)).clusters[0]?.continuationOf).toBe("kv-media-14");
    expect(rankOne(input, historyAt(14.01)).ranks[0]?.factors.novelty).toBe(1);
    expect(rankOne(input, historyAt(14.01)).clusters[0]?.continuationOf).toBeNull();
  });

  test("hard-stops a rerun and marks only a real development as a continuation", async () => {
    const input = await fixtureInput();
    const media = input.clusters.find((cluster) => cluster.itemRefs.length === 3)!;
    const rerun = rankOne(input, [{
      recommendationId: "kv-media-yesterday",
      recommendedAt: "2026-08-11T21:00:00.000Z",
      entityIds: media.entityIds,
      topicTokens: media.topicTokens
    }]);
    expect(rerun.ranks[0]).toMatchObject({ score: 0, factors: { novelty: 0 } });
    expect(rerun.clusters[0]?.continuationOf).toBeNull();

    const development = rankOne(input, [{
      recommendationId: "kv-media-prior-step",
      recommendedAt: "2026-08-11T21:00:00.000Z",
      entityIds: ["public-media-funding"],
      topicTokens: ["poplatky", "televizni"]
    }]);
    expect(development.ranks[0]!.factors.novelty).toBeGreaterThan(0);
    expect(development.clusters[0]?.continuationOf).toBe("kv-media-prior-step");
  });

  test("fails closed on corrupt history and an entity missing from the owner lexicon", async () => {
    const input = await fixtureInput();
    const future = [{
      recommendationId: "future",
      recommendedAt: "2026-08-13T21:00:00.000Z",
      entityIds: [],
      topicTokens: ["future"]
    }];
    expect(() => rankOne(input, future)).toThrow("future timestamp");
    const duplicate = [{ ...future[0]!, recommendedAt: now.toISOString() }];
    expect(() => rankOne(input, [...duplicate, ...duplicate])).toThrow("unique ids");
    expect(() => rankKvorumClusters({
      clusters: [{ ...input.clusters[0]!, entityIds: ["unknown-entity"] }],
      items: input.items,
      lexicon: input.lexicon,
      priorRecommendations: [],
      now
    })).toThrow("unknown-entity");
  });

  test("is byte-stable when clusters, items and history arrive in reverse order", async () => {
    const input = await fixtureInput();
    const first = rankKvorumClusters({ ...input, priorRecommendations: input.history, now });
    const reversed = rankKvorumClusters({
      clusters: [...input.clusters].reverse(),
      items: [...input.items].reverse(),
      lexicon: input.lexicon,
      priorRecommendations: [...input.history].reverse(),
      now
    });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(first));
  });

  test("builds a stable fixture monitor receipt end to end", async () => {
    const input = await fixtureInput();
    const ranked = rankKvorumClusters({ ...input, priorRecommendations: input.history, now });
    const counts = new Map<string, number>();
    for (const item of input.items) counts.set(item.source.id, (counts.get(item.source.id) ?? 0) + 1);
    const sourceResults: KvorumMonitorSourceResult[] = [...counts].sort().map(([sourceId, count]) => ({
      sourceId,
      kind: sourceId === "stit-demokracie-facebook" ? "apify" : "feed",
      attempted: true,
      status: "success",
      count,
      reason: null
    }));
    const build = () => buildKvorumMonitorReceipt({
      date: "2026-08-12",
      now,
      fetched: {
        items: input.items,
        sourceResults,
        artifactPaths: ["fixture://kvorum-cluster-day"],
        fixtureOnly: false
      },
      clusters: ranked.clusters,
      ranks: ranked.ranks
    });
    const receipt = build();
    expect(KvorumMonitorReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(receipt).toMatchObject({ itemsKept: 8 });
    expect(receipt.clusters).toHaveLength(4);
    expect(receipt.ranks).toHaveLength(4);
    expect(JSON.stringify(build())).toBe(JSON.stringify(receipt));

    const falsified = structuredClone(receipt);
    falsified.ranks[0]!.score += 1;
    expect(KvorumMonitorReceiptSchema.safeParse(falsified).success).toBe(false);
  });
});
