import { readFile } from "node:fs/promises";
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
      standingTopicContinuity: 1.25
    });
    expect(rank.score).toBe(32.333577);
    expect(ranked.ranks.map((entry) => entry.position)).toEqual([1, 2, 3, 4]);
    expect(ranked.ranks.at(-1)?.factors.novelty).toBe(0);
    expect(ranked.ranks.at(-1)?.score).toBe(0);
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
