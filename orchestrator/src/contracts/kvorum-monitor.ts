import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  HttpsUrlSchema,
  MeetingRefSchema,
  Sha256Schema
} from "./common.js";

const EntityIdSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Sha1Schema = z.string().regex(/^[a-f0-9]{40}$/);

export const KvorumMonitorSourceSchema = z.strictObject({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  kind: z.enum(["facebook", "rss"]),
  host: z.string().min(1).max(253)
});

const BaseMonitorItemShape = {
  source: KvorumMonitorSourceSchema,
  url: HttpsUrlSchema,
  publishedAt: DateTimeSchema,
  text: z.string().min(1).max(4_000),
  entities: z.array(EntityIdSchema).max(40)
};

export const KvorumFeedMonitorItemSchema = z.strictObject(BaseMonitorItemShape);
export const KvorumStitMonitorItemSchema = z.strictObject({
  ...BaseMonitorItemShape,
  stit: z.strictObject({
    pagePostUrl: HttpsUrlSchema,
    likes: z.number().int().nonnegative().nullable(),
    comments: z.number().int().nonnegative().nullable(),
    shares: z.number().int().nonnegative().nullable()
  })
});
export const KvorumMonitorItemSchema = z.union([
  KvorumFeedMonitorItemSchema,
  KvorumStitMonitorItemSchema
]);

export const KvorumMonitorSourceResultSchema = z.strictObject({
  sourceId: z.string().min(1).max(80),
  kind: z.enum(["apify", "feed"]),
  attempted: z.boolean(),
  status: z.enum(["success", "skipped", "failed", "fixture"]),
  count: z.number().int().nonnegative(),
  reason: z.string().min(1).max(300).nullable()
}).superRefine((result, context) => {
  if ((result.status === "success" || result.status === "failed") && !result.attempted) {
    context.addIssue({ code: "custom", message: "Success and failure require an attempted source", path: ["attempted"] });
  }
  if (result.status === "success" && result.count === 0) {
    context.addIssue({ code: "custom", message: "A successful source must keep at least one item", path: ["count"] });
  }
  if (result.status !== "success" && !result.reason) {
    context.addIssue({ code: "custom", message: "Every non-success source requires a reason", path: ["reason"] });
  }
  if (result.status === "fixture" && (result.attempted || result.count === 0)) {
    context.addIssue({ code: "custom", message: "Fixture sources are unattempted and must provide rows", path: ["status"] });
  }
});

export const KvorumClusterAttributionSchema = z.strictObject({
  itemRef: Sha1Schema,
  sourceId: z.string().min(1).max(80),
  sourceName: z.string().min(1).max(120),
  url: HttpsUrlSchema,
  publishedAt: DateTimeSchema,
  excerpt: z.string().min(1).max(600),
  discoveryOnly: z.boolean()
});

export const KvorumMonitorClusterSchema = z.strictObject({
  id: Sha1Schema,
  title: z.string().min(1).max(240),
  entityIds: z.array(EntityIdSchema).max(40),
  topicTokens: z.array(z.string().min(2).max(80)).max(40),
  itemRefs: z.array(Sha1Schema).min(1).max(80),
  attributions: z.array(KvorumClusterAttributionSchema).min(1).max(80),
  continuationOf: z.string().min(1).max(160).nullable()
}).superRefine((cluster, context) => {
  if (cluster.entityIds.length === 0 && cluster.topicTokens.length === 0) {
    context.addIssue({
      code: "custom",
      message: "A cluster requires at least one shared entity or topic token",
      path: ["entityIds"]
    });
  }
  const refs = new Set(cluster.itemRefs);
  if (new Set(cluster.entityIds).size !== cluster.entityIds.length) {
    context.addIssue({ code: "custom", message: "Cluster entityIds must be unique", path: ["entityIds"] });
  }
  if (new Set(cluster.topicTokens).size !== cluster.topicTokens.length) {
    context.addIssue({ code: "custom", message: "Cluster topicTokens must be unique", path: ["topicTokens"] });
  }
  if (refs.size !== cluster.itemRefs.length) {
    context.addIssue({
      code: "custom",
      message: "Cluster itemRefs must be unique",
      path: ["itemRefs"]
    });
  }
  const attributedRefs = new Set<string>();
  for (const [index, attribution] of cluster.attributions.entries()) {
    if (!refs.has(attribution.itemRef)) {
      context.addIssue({
        code: "custom",
        message: "Every attribution must belong to the cluster itemRefs",
        path: ["attributions", index, "itemRef"]
      });
    }
    if (attributedRefs.has(attribution.itemRef)) {
      context.addIssue({
        code: "custom",
        message: "Each cluster item may have one attribution",
        path: ["attributions", index, "itemRef"]
      });
    }
    attributedRefs.add(attribution.itemRef);
  }
  if (attributedRefs.size !== refs.size) {
    context.addIssue({
      code: "custom",
      message: "Every cluster itemRef requires one attribution",
      path: ["attributions"]
    });
  }
});

export const KvorumClusterRankSchema = z.strictObject({
  clusterId: Sha1Schema,
  position: z.number().int().positive(),
  score: z.number().finite().nonnegative(),
  factors: z.strictObject({
    corroboration: z.number().finite().nonnegative(),
    entityWeight: z.number().finite().nonnegative(),
    engagementSalience: z.number().finite().nonnegative(),
    novelty: z.number().finite().min(0).max(1),
    standingTopicContinuity: z.number().finite().nonnegative(),
    /** A recorded GoVIRAL crossover is a small tiebreaker, never a substitute for evidence. */
    trendCrossover: z.number().finite().min(1).max(1.1).default(1)
  })
}).superRefine((rank, context) => {
  const expected = Math.round((
    rank.factors.corroboration
    * rank.factors.entityWeight
    * rank.factors.engagementSalience
    * rank.factors.novelty
    * rank.factors.standingTopicContinuity
    * rank.factors.trendCrossover
  ) * 1_000_000) / 1_000_000;
  if (Math.abs(rank.score - expected) > 0.000001) {
    context.addIssue({
      code: "custom",
      message: "Rank score must equal the recorded factor product",
      path: ["score"]
    });
  }
});

export const KvorumPurgeMarkSchema = z.strictObject({
  fingerprint: Sha256Schema,
  sourceId: z.string().min(1).max(80),
  publishedAt: DateTimeSchema,
  purgedAt: DateTimeSchema
});

const EmptyKvorumTrendContext = {
  topicSet: "kvorum" as const,
  planId: null,
  planRef: null,
  originMeetingRef: null,
  status: null,
  matchedTactics: 0,
  terms: [] as string[],
  droppedRecords: 0
};

export const KvorumTrendContextSchema = z.strictObject({
  topicSet: z.literal("kvorum"),
  planId: z.string().regex(/^plan-[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
  planRef: z.string().regex(/^state\/ventures\/goviral\/plans\/[a-z0-9.-]+\.json$/).nullable(),
  originMeetingRef: MeetingRefSchema.nullable(),
  status: z.enum(["draft", "owner_rated", "approved", "archived"]).nullable(),
  matchedTactics: z.number().int().nonnegative().max(100),
  terms: z.array(z.string().regex(/^[a-z0-9]+$/).max(80)).max(120),
  droppedRecords: z.number().int().nonnegative()
}).superRefine((context, refinement) => {
  const planFields = [context.planId, context.planRef, context.originMeetingRef, context.status];
  const hasPlan = planFields.every((value) => value !== null);
  if (!hasPlan && planFields.some((value) => value !== null)) {
    refinement.addIssue({ code: "custom", message: "GoVIRAL plan identity must be all present or all null", path: ["planId"] });
  }
  if (!hasPlan && (context.matchedTactics !== 0 || context.terms.length !== 0)) {
    refinement.addIssue({ code: "custom", message: "An empty GoVIRAL context cannot claim matches", path: ["matchedTactics"] });
  }
  if (new Set(context.terms).size !== context.terms.length || [...context.terms].sort().some((term, index) => term !== context.terms[index])) {
    refinement.addIssue({ code: "custom", message: "GoVIRAL context terms must be unique and sorted", path: ["terms"] });
  }
});

export const KvorumMonitorReceiptSchema = z.strictObject({
  schemaVersion: z.literal("kvorum-monitor/1"),
  date: DateSchema,
  generatedAt: DateTimeSchema,
  fixtureOnly: z.boolean(),
  sourceResults: z.array(KvorumMonitorSourceResultSchema).min(1).max(30),
  itemsKept: z.number().int().nonnegative(),
  rawItems: z.array(KvorumMonitorItemSchema).max(5_000),
  clusters: z.array(KvorumMonitorClusterSchema).max(100),
  ranks: z.array(KvorumClusterRankSchema).max(100),
  /**
   * How much a busy day did not fit.
   *
   * The receipt is a bounded record and the desk picks one story, so the hundred highest-ranked
   * clusters are the ones worth keeping. Saying how many were dropped is what stops that bound
   * from quietly rewriting how busy the day looked.
   */
  truncated: z.strictObject({
    clusters: z.number().int().nonnegative(),
    ranks: z.number().int().nonnegative()
  }).default({ clusters: 0, ranks: 0 }),
  trendContext: KvorumTrendContextSchema.default(EmptyKvorumTrendContext),
  purge: z.strictObject({
    retentionDays: z.literal(30),
    evaluatedAt: DateTimeSchema,
    cutoffPublishedAt: DateTimeSchema,
    rawItemsBefore: z.number().int().nonnegative(),
    rawItemsAfter: z.number().int().nonnegative(),
    purged: z.array(KvorumPurgeMarkSchema).max(5_000)
  })
}).superRefine((receipt, context) => {
  if (receipt.itemsKept !== receipt.rawItems.length) {
    context.addIssue({ code: "custom", message: "itemsKept must equal rawItems length", path: ["itemsKept"] });
  }
  if (receipt.fixtureOnly && (
    receipt.sourceResults.some((result) => result.attempted)
    || receipt.sourceResults.some((result) => result.status === "success" || result.status === "failed")
  )) {
    context.addIssue({ code: "custom", message: "Fixture-only receipts cannot claim external attempts", path: ["fixtureOnly"] });
  }
  if (!receipt.fixtureOnly && receipt.sourceResults.some((result) => result.status === "fixture")) {
    context.addIssue({ code: "custom", message: "External receipts cannot contain fixture source rows", path: ["sourceResults"] });
  }
  const sourceIds = new Set(receipt.sourceResults.map((result) => result.sourceId));
  for (const [index, item] of receipt.rawItems.entries()) {
    if (!sourceIds.has(item.source.id)) {
      context.addIssue({ code: "custom", message: "Raw item source requires a source result", path: ["rawItems", index, "source", "id"] });
    }
  }

  const clusters = new Map(receipt.clusters.map((cluster) => [cluster.id, cluster]));
  if (clusters.size !== receipt.clusters.length) {
    context.addIssue({ code: "custom", message: "Cluster ids must be unique", path: ["clusters"] });
  }
  const rankIds = new Set<string>();
  const positions = new Set<number>();
  for (const [index, rank] of receipt.ranks.entries()) {
    if (rank.position !== index + 1) {
      context.addIssue({ code: "custom", message: "Ranks must be stored in position order", path: ["ranks", index, "position"] });
    }
    if (!clusters.has(rank.clusterId)) {
      context.addIssue({ code: "custom", message: "Rank must reference a retained cluster", path: ["ranks", index, "clusterId"] });
    }
    if (rankIds.has(rank.clusterId)) {
      context.addIssue({ code: "custom", message: "Each cluster may be ranked once", path: ["ranks", index, "clusterId"] });
    }
    if (positions.has(rank.position)) {
      context.addIssue({ code: "custom", message: "Rank positions must be unique", path: ["ranks", index, "position"] });
    }
    rankIds.add(rank.clusterId);
    positions.add(rank.position);
  }
  if (rankIds.size !== clusters.size) {
    context.addIssue({ code: "custom", message: "Every retained cluster requires one rank", path: ["ranks"] });
  }
  if (receipt.purge.rawItemsAfter !== receipt.rawItems.length) {
    context.addIssue({ code: "custom", message: "Purge rawItemsAfter must equal retained raw items", path: ["purge", "rawItemsAfter"] });
  }
  if (receipt.purge.rawItemsBefore < receipt.purge.rawItemsAfter) {
    context.addIssue({ code: "custom", message: "A purge cannot add raw items", path: ["purge", "rawItemsBefore"] });
  }
});

export type KvorumMonitorItem = z.infer<typeof KvorumMonitorItemSchema>;
export type KvorumMonitorSourceResult = z.infer<typeof KvorumMonitorSourceResultSchema>;
export type KvorumMonitorCluster = z.infer<typeof KvorumMonitorClusterSchema>;
export type KvorumClusterRank = z.infer<typeof KvorumClusterRankSchema>;
export type KvorumTrendContext = z.infer<typeof KvorumTrendContextSchema>;
export type KvorumMonitorReceipt = z.infer<typeof KvorumMonitorReceiptSchema>;
