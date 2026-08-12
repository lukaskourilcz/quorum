import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { KvorumEntityLexiconSchema, type KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import {
  KvorumMonitorItemSchema,
  KvorumMonitorReceiptSchema,
  type KvorumMonitorReceipt,
  type KvorumMonitorSourceResult,
  type KvorumTrendContext
} from "../../contracts/kvorum-monitor.js";
import { VentureRecommendationSchema } from "../../contracts/venture-recommendation.js";
import { configRoot, repoRoot } from "../../paths.js";
import { readJson } from "../../state.js";
import {
  clusterKvorumItems,
  rankKvorumClusters,
  type KvorumPriorRecommendation
} from "./cluster.js";
import {
  buildKvorumMonitorReceipt,
  type KvorumMonitorFetchResult
} from "./monitor.js";
import type { KvorumPerformanceWeights } from "./performance.js";

export interface KvorumDeskSource {
  fetched: KvorumMonitorFetchResult;
  lexicon: KvorumEntityLexicon;
  history: KvorumPriorRecommendation[];
}

export async function loadDryKvorumDeskSource(date: string): Promise<KvorumDeskSource> {
  const [itemsRaw, historyRaw, lexiconRaw] = await Promise.all([
    readFile(path.join(repoRoot, "orchestrator/fixtures/kvorum/monitor-day.json"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/fixtures/kvorum/prior-recommendations.json"), "utf8"),
    readFile(path.join(configRoot, "kvorum-entities.json"), "utf8")
  ]);
  const items = (JSON.parse(itemsRaw) as unknown[]).map((item) => KvorumMonitorItemSchema.parse(item));
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.source.id, (counts.get(item.source.id) ?? 0) + 1);
  const sourceResults: KvorumMonitorSourceResult[] = [...counts].sort().map(([sourceId, count]) => ({
    sourceId,
    kind: sourceId === "stit-demokracie-facebook" ? "apify" : "feed",
    attempted: false,
    status: "fixture",
    count,
    reason: `Committed fixture rows for ${date}; no external source was contacted.`
  }));
  return {
    fetched: { items, sourceResults, artifactPaths: [], fixtureOnly: true },
    lexicon: KvorumEntityLexiconSchema.parse(JSON.parse(lexiconRaw) as unknown),
    history: JSON.parse(historyRaw) as KvorumPriorRecommendation[]
  };
}

export async function readKvorumRecommendationHistory(root: string): Promise<KvorumPriorRecommendation[]> {
  const directory = path.join(root, "ventures/kvorum/recommendations");
  const names = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const history: KvorumPriorRecommendation[] = [];
  for (const name of names.filter((entry) => /^\d{4}-\d{2}-\d{2}-.+\.json$/u.test(entry)).sort()) {
    const recommendation = VentureRecommendationSchema.parse(JSON.parse(
      await readFile(path.join(directory, name), "utf8")
    ) as unknown);
    if (recommendation.status === "rejected" || recommendation.evidence.kind !== "monitor-cluster") continue;
    const receipt = KvorumMonitorReceiptSchema.parse(await readJson<unknown>(
      root,
      recommendation.evidence.receiptRef.replace(/^state\//u, ""),
      null
    ));
    const cluster = receipt.clusters.find((candidate) => candidate.id === recommendation.evidence.clusterId);
    if (!cluster) throw new Error(`Recommendation ${recommendation.id} has no retained monitor cluster.`);
    history.push({
      recommendationId: recommendation.id,
      recommendedAt: recommendation.createdAt,
      entityIds: cluster.entityIds,
      topicTokens: cluster.topicTokens
    });
  }
  return history;
}

export function buildRankedKvorumReceipt(input: {
  date: string;
  now: Date;
  fetched: KvorumMonitorFetchResult;
  lexicon: KvorumEntityLexicon;
  history: KvorumPriorRecommendation[];
  performanceWeights: KvorumPerformanceWeights;
  trendContext: KvorumTrendContext;
}): KvorumMonitorReceipt {
  const labels = Object.fromEntries(input.lexicon.entities.map((entity) => [entity.id, entity.canonicalName]));
  const clusters = clusterKvorumItems(input.fetched.items, { entityLabels: labels });
  const ranked = rankKvorumClusters({
    clusters,
    items: input.fetched.items,
    lexicon: input.lexicon,
    priorRecommendations: input.history,
    now: input.now,
    performanceWeights: input.performanceWeights,
    trendContext: input.trendContext
  });
  return buildKvorumMonitorReceipt({
    date: input.date,
    now: input.now,
    fetched: input.fetched,
    clusters: ranked.clusters,
    ranks: ranked.ranks,
    trendContext: input.trendContext
  });
}
