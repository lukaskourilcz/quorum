import { z } from "zod";
import {
  DateSchema,
  DateTimeSchema,
  HttpsUrlSchema,
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
  status: z.enum(["success", "skipped", "failed"]),
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
    context.addIssue({ code: "custom", message: "Skipped and failed sources require a reason", path: ["reason"] });
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
  entityIds: z.array(EntityIdSchema).min(1).max(40),
  topicTokens: z.array(z.string().min(2).max(80)).max(40),
  itemRefs: z.array(Sha1Schema).min(1).max(80),
  attributions: z.array(KvorumClusterAttributionSchema).min(1).max(80),
  continuationOf: z.string().min(1).max(160).nullable()
}).superRefine((cluster, context) => {
  const refs = new Set(cluster.itemRefs);
  for (const [index, attribution] of cluster.attributions.entries()) {
    if (!refs.has(attribution.itemRef)) {
      context.addIssue({
        code: "custom",
        message: "Every attribution must belong to the cluster itemRefs",
        path: ["attributions", index, "itemRef"]
      });
    }
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
    standingTopicContinuity: z.number().finite().nonnegative()
  })
});

export const KvorumPurgeMarkSchema = z.strictObject({
  fingerprint: Sha256Schema,
  sourceId: z.string().min(1).max(80),
  publishedAt: DateTimeSchema,
  purgedAt: DateTimeSchema
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
    receipt.rawItems.length > 0
    || receipt.sourceResults.some((result) => result.attempted)
  )) {
    context.addIssue({ code: "custom", message: "Fixture-only receipts cannot claim external attempts or raw items", path: ["fixtureOnly"] });
  }
  const sourceIds = new Set(receipt.sourceResults.map((result) => result.sourceId));
  for (const [index, item] of receipt.rawItems.entries()) {
    if (!sourceIds.has(item.source.id)) {
      context.addIssue({ code: "custom", message: "Raw item source requires a source result", path: ["rawItems", index, "source", "id"] });
    }
  }

  const clusters = new Map(receipt.clusters.map((cluster) => [cluster.id, cluster]));
  const rankIds = new Set<string>();
  const positions = new Set<number>();
  for (const [index, rank] of receipt.ranks.entries()) {
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
export type KvorumMonitorReceipt = z.infer<typeof KvorumMonitorReceiptSchema>;
