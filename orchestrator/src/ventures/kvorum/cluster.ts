import { createHash } from "node:crypto";
import {
  KvorumMonitorClusterSchema,
  KvorumClusterRankSchema,
  type KvorumClusterRank,
  type KvorumMonitorCluster,
  type KvorumMonitorItem,
  type KvorumTrendContext
} from "../../contracts/kvorum-monitor.js";
import type { KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import { canonicalUrl } from "../../streams/normalize.js";
import {
  kvorumTopicPerformanceWeight,
  type KvorumPerformanceWeights
} from "./performance.js";

export const KVORUM_CLUSTER_JACCARD_THRESHOLD = 0.2;
export const KVORUM_ENTITY_JACCARD_WEIGHT = 4;
export const KVORUM_NOVELTY_WINDOW_DAYS = 14;
export const KVORUM_CONTINUATION_JACCARD_THRESHOLD = 0.5;

const MAX_TOPIC_TOKENS = 10;
const CZECH_STOPWORDS = new Set([
  "aby", "ale", "ani", "bez", "bude", "byl", "byla", "byli", "byt", "co", "do",
  "ho", "i", "jak", "je", "jeho", "jejich", "jen", "jeste", "ji", "jiz", "jsou",
  "k", "kdy", "ktera", "ktere", "ktery", "ma", "mezi", "mu", "na", "nad", "nebo",
  "nez", "od", "on", "po", "pod", "podle", "pro", "pred", "pri", "se", "si", "sve",
  "svych", "ta", "tak", "take", "ten", "to", "u", "uz", "v", "ve", "vice", "za", "z", "ze"
]);

interface KvorumSignature {
  entityIds: string[];
  topicTokens: string[];
}

interface PreparedItem extends KvorumSignature {
  item: KvorumMonitorItem;
  itemRef: string;
}

interface WorkingCluster {
  members: PreparedItem[];
  shared: KvorumSignature;
}

export interface KvorumClusterOptions {
  jaccardThreshold?: number;
  entityLabels?: Readonly<Record<string, string>>;
}

export interface KvorumPriorRecommendation {
  recommendationId: string;
  recommendedAt: string;
  entityIds: string[];
  topicTokens: string[];
}

export interface KvorumRankedClusters {
  clusters: KvorumMonitorCluster[];
  ranks: KvorumClusterRank[];
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

function intersection(left: readonly string[], right: readonly string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

function unionSize(left: readonly string[], right: readonly string[]): number {
  return new Set([...left, ...right]).size;
}

/** Tokens come only from the headline-like first clause; body boilerplate cannot join stories. */
export function normalizeKvorumTopicTokens(text: string): string[] {
  const headline = text.split(/\s+—\s+|[.!?](?:\s|$)/u, 1)[0] ?? text;
  const normalized = headline
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const tokens = normalized.match(/[a-z0-9]+/gu) ?? [];
  return sortedUnique(tokens.filter((token) =>
    token.length >= 3
    && !CZECH_STOPWORDS.has(token)
    && !/^\d{1,3}$/u.test(token)
  )).slice(0, MAX_TOPIC_TOKENS);
}

/** Weighted Jaccard keeps a curated lexicon hit more meaningful than one headline word. */
export function kvorumJaccard(
  left: KvorumSignature,
  right: KvorumSignature,
  entityWeight = KVORUM_ENTITY_JACCARD_WEIGHT
): number {
  const entityUnion = unionSize(left.entityIds, right.entityIds);
  const topicUnion = unionSize(left.topicTokens, right.topicTokens);
  const denominator = entityUnion * entityWeight + topicUnion;
  if (denominator === 0) return 0;
  return (
    intersection(left.entityIds, right.entityIds).length * entityWeight
    + intersection(left.topicTokens, right.topicTokens).length
  ) / denominator;
}

function facebookPostId(item: KvorumMonitorItem): string | null {
  if (!("stit" in item)) return null;
  const url = new URL(item.stit.pagePostUrl);
  const pathMatch = url.pathname.match(/\/posts\/([^/]+)/u);
  return pathMatch?.[1] ?? url.searchParams.get("story_fbid");
}

/** URL identity is canonical; a public Facebook post id makes redirects non-duplicating. */
export function kvorumMonitorItemRef(item: KvorumMonitorItem): string {
  const postId = facebookPostId(item);
  const identity = postId
    ? `facebook:${item.source.id}:${postId}`
    : canonicalUrl(item.url);
  return createHash("sha1").update(identity).digest("hex");
}

function signature(item: KvorumMonitorItem): KvorumSignature {
  return {
    entityIds: sortedUnique(item.entities),
    topicTokens: normalizeKvorumTopicTokens(item.text)
  };
}

function commonSignature(left: KvorumSignature, right: KvorumSignature): KvorumSignature {
  return {
    entityIds: intersection(left.entityIds, right.entityIds),
    topicTokens: intersection(left.topicTokens, right.topicTokens)
  };
}

function hasExplanation(value: KvorumSignature): boolean {
  return value.entityIds.length > 0 || value.topicTokens.length > 0;
}

function minimumPairSimilarity(left: WorkingCluster, right: WorkingCluster): number {
  return Math.min(...left.members.flatMap((leftMember) =>
    right.members.map((rightMember) => kvorumJaccard(leftMember, rightMember))
  ));
}

function mergeKey(left: WorkingCluster, right: WorkingCluster): string {
  return [...left.members, ...right.members]
    .map((member) => member.itemRef)
    .sort()
    .join(":");
}

function chooseMerge(
  clusters: readonly WorkingCluster[],
  threshold: number
): { left: number; right: number } | null {
  let best: { left: number; right: number; score: number; key: string } | null = null;
  for (let left = 0; left < clusters.length; left += 1) {
    for (let right = left + 1; right < clusters.length; right += 1) {
      const shared = commonSignature(clusters[left]!.shared, clusters[right]!.shared);
      if (!hasExplanation(shared)) continue;
      const score = minimumPairSimilarity(clusters[left]!, clusters[right]!);
      if (score < threshold) continue;
      const key = mergeKey(clusters[left]!, clusters[right]!);
      if (!best || score > best.score || (score === best.score && key < best.key)) {
        best = { left, right, score, key };
      }
    }
  }
  return best ? { left: best.left, right: best.right } : null;
}

function compactExcerpt(text: string): string {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length <= 600 ? compact : `${compact.slice(0, 599).trimEnd()}…`;
}

function clusterTitle(
  shared: KvorumSignature,
  labels: Readonly<Record<string, string>>
): string {
  const entities = shared.entityIds.map((id) => labels[id] ?? id.replaceAll("-", " "));
  const parts = entities.length > 0 ? entities : shared.topicTokens;
  const title = parts.join(" · ");
  return `${title.charAt(0).toUpperCase()}${title.slice(1)}`.slice(0, 240);
}

function materializeCluster(
  working: WorkingCluster,
  labels: Readonly<Record<string, string>>
): KvorumMonitorCluster {
  const members = [...working.members].sort((left, right) =>
    left.itemRef.localeCompare(right.itemRef));
  const itemRefs = members.map((member) => member.itemRef);
  const id = createHash("sha1").update(itemRefs.join("\n")).digest("hex");
  return KvorumMonitorClusterSchema.parse({
    id,
    title: clusterTitle(working.shared, labels),
    entityIds: working.shared.entityIds,
    topicTokens: working.shared.topicTokens,
    itemRefs,
    attributions: members.map(({ item, itemRef }) => ({
      itemRef,
      sourceId: item.source.id,
      sourceName: item.source.name,
      url: item.url,
      publishedAt: item.publishedAt,
      excerpt: compactExcerpt(item.text),
      discoveryOnly: item.source.kind === "facebook"
    })),
    continuationOf: null
  });
}

function preferDuplicate(left: PreparedItem, right: PreparedItem): PreparedItem {
  const leftDiscovery = left.item.source.kind === "facebook" || left.item.source.id === "google-news-cz";
  const rightDiscovery = right.item.source.kind === "facebook" || right.item.source.id === "google-news-cz";
  if (leftDiscovery !== rightDiscovery) return leftDiscovery ? right : left;
  const comparison = right.item.publishedAt.localeCompare(left.item.publishedAt)
    || left.item.source.id.localeCompare(right.item.source.id)
    || left.item.url.localeCompare(right.item.url);
  return comparison <= 0 ? left : right;
}

/**
 * Pure complete-link clustering. Input order cannot affect merges, ids, titles or attribution order.
 * No model sees individual items until this deterministic digest has been produced.
 */
export function clusterKvorumItems(
  items: readonly KvorumMonitorItem[],
  options: KvorumClusterOptions = {}
): KvorumMonitorCluster[] {
  const threshold = options.jaccardThreshold ?? KVORUM_CLUSTER_JACCARD_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    throw new Error("Kvórum cluster Jaccard threshold must be in (0, 1].");
  }
  const byRef = new Map<string, PreparedItem>();
  for (const item of items) {
    const prepared = { item, itemRef: kvorumMonitorItemRef(item), ...signature(item) };
    const prior = byRef.get(prepared.itemRef);
    byRef.set(prepared.itemRef, prior ? preferDuplicate(prior, prepared) : prepared);
  }
  const clusters: WorkingCluster[] = [...byRef.values()]
    .filter(hasExplanation)
    .sort((left, right) => left.itemRef.localeCompare(right.itemRef))
    .map((member) => ({ members: [member], shared: signature(member.item) }));

  for (let merge = chooseMerge(clusters, threshold); merge; merge = chooseMerge(clusters, threshold)) {
    const left = clusters[merge.left]!;
    const right = clusters[merge.right]!;
    clusters.splice(merge.right, 1);
    clusters.splice(merge.left, 1, {
      members: [...left.members, ...right.members].sort((a, b) => a.itemRef.localeCompare(b.itemRef)),
      shared: commonSignature(left.shared, right.shared)
    });
  }

  return clusters
    .map((cluster) => materializeCluster(cluster, options.entityLabels ?? {}))
    .sort((left, right) => left.id.localeCompare(right.id));
}

interface RecentRecommendation extends KvorumSignature {
  recommendationId: string;
  recommendedAt: string;
  ageDays: number;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function recentRecommendations(
  history: readonly KvorumPriorRecommendation[],
  now: Date
): RecentRecommendation[] {
  if (Number.isNaN(now.getTime())) throw new Error("Kvórum ranking requires a valid now timestamp.");
  const seen = new Set<string>();
  return history.flatMap((entry) => {
    if (!entry.recommendationId || entry.recommendationId.length > 160 || seen.has(entry.recommendationId)) {
      throw new Error("Kvórum recommendation history requires unique ids of at most 160 characters.");
    }
    seen.add(entry.recommendationId);
    const timestamp = Date.parse(entry.recommendedAt);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime()) {
      throw new Error("Kvórum recommendation history contains an invalid or future timestamp.");
    }
    const ageDays = (now.getTime() - timestamp) / 86_400_000;
    if (ageDays > KVORUM_NOVELTY_WINDOW_DAYS) return [];
    return [{
      recommendationId: entry.recommendationId,
      recommendedAt: new Date(timestamp).toISOString(),
      ageDays,
      entityIds: sortedUnique(entry.entityIds),
      topicTokens: sortedUnique(entry.topicTokens)
    }];
  });
}

function noveltyAndContinuation(
  cluster: KvorumMonitorCluster,
  history: readonly RecentRecommendation[]
): { novelty: number; continuationOf: string | null } {
  const matches = history.map((prior) => ({
    prior,
    similarity: kvorumJaccard(cluster, prior)
  })).sort((left, right) =>
    right.similarity - left.similarity
    || right.prior.recommendedAt.localeCompare(left.prior.recommendedAt)
    || left.prior.recommendationId.localeCompare(right.prior.recommendationId));
  const strongest = matches[0];
  if (!strongest) return { novelty: 1, continuationOf: null };

  const priorEntities = new Set(strongest.prior.entityIds);
  const priorTopics = new Set(strongest.prior.topicTokens);
  const hasDevelopment = cluster.entityIds.some((id) => !priorEntities.has(id))
    || cluster.topicTokens.some((token) => !priorTopics.has(token));
  const sameStory = strongest.similarity >= KVORUM_CONTINUATION_JACCARD_THRESHOLD;
  if (sameStory && !hasDevelopment) return { novelty: 0, continuationOf: null };

  const repeatPenalty = Math.max(...matches.map(({ prior, similarity }) =>
    similarity * (1 - prior.ageDays / KVORUM_NOVELTY_WINDOW_DAYS)));
  return {
    novelty: round6(Math.max(0, Math.min(1, 1 - repeatPenalty))),
    continuationOf: sameStory ? strongest.prior.recommendationId : null
  };
}

function rankFactors(input: {
  cluster: KvorumMonitorCluster;
  itemsByRef: ReadonlyMap<string, KvorumMonitorItem>;
  weights: ReadonlyMap<string, number>;
  standingTopics: ReadonlySet<string>;
  performanceWeights?: KvorumPerformanceWeights;
  trendContext?: KvorumTrendContext;
  novelty: number;
}): KvorumClusterRank["factors"] {
  const evidenceDomains = new Set(input.cluster.attributions
    .filter((item) => !item.discoveryOnly)
    .map((item) => new URL(item.url).hostname.replace(/^www\./u, "")));
  const entityWeights = input.cluster.entityIds.map((id) => {
    const weight = input.weights.get(id);
    if (weight === undefined) throw new Error(`Kvórum rank cannot resolve entity weight: ${id}`);
    return weight * kvorumTopicPerformanceWeight(input.performanceWeights, id);
  });
  const engagement = input.cluster.itemRefs.reduce((total, ref) => {
    const item = input.itemsByRef.get(ref);
    return total + (item && "stit" in item
      ? (item.stit.likes ?? 0) + 2 * (item.stit.comments ?? 0) + 3 * (item.stit.shares ?? 0)
      : 0);
  }, 0);
  const standingCount = input.cluster.entityIds.filter((id) => input.standingTopics.has(id)).length;
  const crossoverTerms = new Set(input.trendContext?.terms ?? []);
  const crossoverCandidates = [
    ...input.cluster.topicTokens,
    ...input.cluster.entityIds.flatMap((id) => id.split("-"))
  ];
  const trendCrossover = crossoverCandidates.some((term) => crossoverTerms.has(term)) ? 1.1 : 1;
  return {
    corroboration: evidenceDomains.size,
    entityWeight: entityWeights.length > 0
      ? round6(entityWeights.reduce((sum, weight) => sum + weight, 0) / entityWeights.length)
      : 1,
    engagementSalience: round6(1 + Math.log10(1 + engagement)),
    novelty: input.novelty,
    standingTopicContinuity: 1 + Math.min(2, standingCount) * 0.25,
    trendCrossover
  };
}

/** Pure ranking: all factors and continuation decisions are reconstructable from its inputs. */
export function rankKvorumClusters(input: {
  clusters: readonly KvorumMonitorCluster[];
  items: readonly KvorumMonitorItem[];
  lexicon: KvorumEntityLexicon;
  priorRecommendations: readonly KvorumPriorRecommendation[];
  now: Date;
  performanceWeights?: KvorumPerformanceWeights;
  trendContext?: KvorumTrendContext;
}): KvorumRankedClusters {
  const history = recentRecommendations(input.priorRecommendations, input.now);
  const weights = new Map(input.lexicon.entities.map((entity) => [entity.id, entity.weight]));
  const standingTopics = new Set(input.lexicon.entities
    .filter((entity) => entity.kind === "topic")
    .map((entity) => entity.id));
  const itemsByRef = new Map(input.items.map((item) => [kvorumMonitorItemRef(item), item]));
  const evaluated = input.clusters.map((cluster) => {
    const historyResult = noveltyAndContinuation(cluster, history);
    const retained = KvorumMonitorClusterSchema.parse({
      ...cluster,
      continuationOf: historyResult.continuationOf
    });
    const factors = rankFactors({
      cluster: retained,
      itemsByRef,
      weights,
      standingTopics,
      performanceWeights: input.performanceWeights,
      trendContext: input.trendContext,
      novelty: historyResult.novelty
    });
    return {
      cluster: retained,
      score: round6(
        factors.corroboration
        * factors.entityWeight
        * factors.engagementSalience
        * factors.novelty
        * factors.standingTopicContinuity
        * factors.trendCrossover
      ),
      factors
    };
  });
  evaluated.sort((left, right) => right.score - left.score || left.cluster.id.localeCompare(right.cluster.id));
  return {
    clusters: evaluated.map((entry) => entry.cluster).sort((left, right) => left.id.localeCompare(right.id)),
    ranks: evaluated.map((entry, index) => KvorumClusterRankSchema.parse({
      clusterId: entry.cluster.id,
      position: index + 1,
      score: entry.score,
      factors: entry.factors
    }))
  };
}
