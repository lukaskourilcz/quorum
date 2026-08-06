import { z } from "zod";
import type { GoViralActor, GoViralRecipeStep, GoViralSourceRegistry, GoViralTopicSet } from "./apify.js";

/**
 * The weekly trend snapshot GoVIRAL reads, and the arithmetic that turns scraped posts into it.
 *
 * Two rules shape every type below. Scraped material is untrusted data: it reaches a room only
 * inside the existing untrusted-data wrapping, it is never handed to a magazine writer as an
 * instruction, and no post, handle or image is ever republished. And raw items are transient —
 * `pruneItems` drops anything older than 30 days on every run, while the aggregate `signals`
 * persist, because a trend line is ours and a stranger's post is not.
 */
export const TREND_ITEM_RETENTION_DAYS = 30;

/** How long a snapshot may stand in for a fresh scout before the room would rather not meet. */
export const TREND_SNAPSHOT_MAX_AGE_DAYS = 14;

export const TrendItemSchema = z.object({
  platform: z.enum(["instagram", "threads"]),
  kind: z.enum(["reel", "post", "thread"]),
  topicSet: z.string().min(1),
  /** Clipped hard: the room needs enough to recognise a subject, never enough to republish. */
  text: z.string().max(280),
  likes: z.number().int().nonnegative().nullable(),
  comments: z.number().int().nonnegative().nullable(),
  reshares: z.number().int().nonnegative().nullable(),
  postedAt: z.string().nullable(),
  url: z.string().max(400).nullable(),
  hashtags: z.array(z.string().max(80)).max(20),
  audioTitle: z.string().max(160).nullable(),
  audioArtist: z.string().max(160).nullable(),
  exploreSection: z.string().max(80).nullable()
});

export const TrendHashtagSignalSchema = z.object({
  hashtag: z.string().max(80),
  topicSet: z.string().min(1),
  posts: z.number().int().nonnegative(),
  /** Likes per hour since posting, summed over the posts carrying the tag. Zero when no post is timestamped. */
  engagementPerHour: z.number().finite().nonnegative(),
  /** Change against the previous snapshot's figure. Null when there is nothing to compare against. */
  weekOverWeekDelta: z.number().finite().nullable()
});

export const TrendAudioSignalSchema = z.object({
  title: z.string().max(160),
  artist: z.string().max(160).nullable(),
  reels: z.number().int().positive()
});

export const TrendTopicSummarySchema = z.object({
  topicSet: z.string().min(1),
  label: z.string().min(1),
  topHashtags: z.array(z.string().max(80)).max(5),
  items: z.number().int().nonnegative(),
  medianEngagementPerHour: z.number().finite().nonnegative()
});

/** What the magazine desks get: topics with numbers, and nothing they have to trust blindly. */
export const ForMagazinesSchema = z.object({
  ai: z.array(z.object({
    topic: z.string().max(120),
    engagementPerHour: z.number().finite().nonnegative(),
    weekOverWeekDelta: z.number().finite().nullable(),
    refs: z.array(z.string().max(160)).max(6)
  })).max(8),
  mma: z.array(z.object({
    topic: z.string().max(120),
    engagementPerHour: z.number().finite().nonnegative(),
    weekOverWeekDelta: z.number().finite().nullable(),
    refs: z.array(z.string().max(160)).max(6)
  })).max(8)
});

export const TrendSourceResultSchema = z.object({
  actorId: z.string().min(1),
  step: z.number().int().min(1),
  status: z.enum(["success", "skipped", "failed"]),
  reason: z.string().max(300).nullable(),
  count: z.number().int().nonnegative(),
  estimatedUsd: z.number().finite().nonnegative()
});

export const GoViralTrendsSchema = z.object({
  schemaVersion: z.literal("goviral-trends/1"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  generatedAt: z.string(),
  sourceResults: z.array(TrendSourceResultSchema),
  items: z.array(TrendItemSchema).max(2_000),
  signals: z.object({
    topHashtags: z.array(TrendHashtagSignalSchema).max(24),
    topFormats: z.array(z.object({
      format: z.string().max(40),
      items: z.number().int().nonnegative()
    })).max(8),
    topAudio: z.array(TrendAudioSignalSchema).max(8),
    exploreSections: z.array(z.string().max(80)).max(20),
    perTopicSet: z.array(TrendTopicSummarySchema).max(8)
  }),
  forMagazines: ForMagazinesSchema
});

export type TrendItem = z.infer<typeof TrendItemSchema>;
export type TrendHashtagSignal = z.infer<typeof TrendHashtagSignalSchema>;
export type TrendSourceResult = z.infer<typeof TrendSourceResultSchema>;
export type GoViralTrends = z.infer<typeof GoViralTrendsSchema>;
export type ForMagazines = z.infer<typeof ForMagazinesSchema>;

export function trendsPath(date: string): string {
  return `goviral/trends/${date}.json`;
}

/** Evidence refs the room may cite. Out-of-packet refs are dropped by design; these are in it. */
export function trendEvidenceRefs(date: string, results: readonly TrendSourceResult[]): string[] {
  const platforms = new Set<string>();
  for (const result of results) {
    if (result.status !== "success" || result.count === 0) continue;
    platforms.add(result.actorId.startsWith("threads") ? "threads" : "instagram");
  }
  return [...platforms].sort().map((platform) => `source:apify:${platform}:${date}`);
}

function hoursSince(postedAt: string | null, now: Date): number | null {
  if (!postedAt) return null;
  const posted = Date.parse(postedAt);
  if (Number.isNaN(posted)) return null;
  const hours = (now.getTime() - posted) / 3_600_000;
  // A post from the future, or from this second, would divide engagement by ~0 and read as the
  // biggest trend of the week. One hour is the floor.
  return Math.max(hours, 1);
}

/**
 * Velocity, not volume.
 *
 * A post with 10,000 likes over three weeks is a peaked trend; 400 likes in two hours is a rising
 * one, and the rising one is the useful call. A post with no timestamp contributes nothing rather
 * than a guess — silence is not evidence of speed.
 */
export function engagementPerHour(item: TrendItem, now: Date): number {
  const hours = hoursSince(item.postedAt, now);
  if (hours === null) return 0;
  const engagement = (item.likes ?? 0) + (item.comments ?? 0) + (item.reshares ?? 0);
  return engagement / hours;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function computeHashtagSignals(input: {
  items: readonly TrendItem[];
  previous: readonly TrendHashtagSignal[];
  now: Date;
}): TrendHashtagSignal[] {
  const buckets = new Map<string, { hashtag: string; topicSet: string; posts: number; velocity: number }>();
  for (const item of input.items) {
    const velocity = engagementPerHour(item, input.now);
    for (const raw of item.hashtags) {
      const hashtag = raw.toLowerCase();
      const key = `${item.topicSet}:${hashtag}`;
      const bucket = buckets.get(key) ?? { hashtag, topicSet: item.topicSet, posts: 0, velocity: 0 };
      bucket.posts += 1;
      bucket.velocity += velocity;
      buckets.set(key, bucket);
    }
  }
  const priorByKey = new Map(input.previous.map((signal) => [`${signal.topicSet}:${signal.hashtag}`, signal]));
  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const prior = priorByKey.get(key);
      return {
        hashtag: bucket.hashtag,
        topicSet: bucket.topicSet,
        posts: bucket.posts,
        engagementPerHour: round(bucket.velocity),
        weekOverWeekDelta: prior ? round(bucket.velocity - prior.engagementPerHour) : null
      };
    })
    .sort((left, right) => right.engagementPerHour - left.engagementPerHour || left.hashtag.localeCompare(right.hashtag))
    .slice(0, 24);
}

export function computeAudioSignals(items: readonly TrendItem[]): z.infer<typeof TrendAudioSignalSchema>[] {
  const counts = new Map<string, { title: string; artist: string | null; reels: number }>();
  for (const item of items) {
    if (item.kind !== "reel" || !item.audioTitle) continue;
    const key = `${item.audioTitle}::${item.audioArtist ?? ""}`.toLowerCase();
    const entry = counts.get(key) ?? { title: item.audioTitle, artist: item.audioArtist, reels: 0 };
    entry.reels += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    // One reel using a song is not a trend, it is a reel. Two is the smallest thing worth naming.
    .filter((entry) => entry.reels >= 2)
    .sort((left, right) => right.reels - left.reels || left.title.localeCompare(right.title))
    .slice(0, 8);
}

export function computeTopicSummaries(input: {
  items: readonly TrendItem[];
  hashtags: readonly TrendHashtagSignal[];
  topicSets: Record<string, GoViralTopicSet>;
  now: Date;
}): z.infer<typeof TrendTopicSummarySchema>[] {
  return Object.entries(input.topicSets).map(([topicSet, definition]) => {
    const items = input.items.filter((item) => item.topicSet === topicSet);
    return {
      topicSet,
      label: definition.label,
      topHashtags: input.hashtags.filter((signal) => signal.topicSet === topicSet).slice(0, 5).map((signal) => signal.hashtag),
      items: items.length,
      medianEngagementPerHour: round(median(items.map((item) => engagementPerHour(item, input.now))))
    };
  });
}

export function computeFormatSignals(items: readonly TrendItem[]): Array<{ format: string; items: number }> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([format, count]) => ({ format, items: count }))
    .sort((left, right) => right.items - left.items || left.format.localeCompare(right.format));
}

/**
 * The compact block the magazine desks read.
 *
 * It carries numbers and refs and nothing else, because of the one instruction that travels with
 * it: trending status is a tiebreaker between equally sourced candidates, never a substitute for
 * sourcing. A desk that cannot see the number cannot weigh it, and a desk handed a topic with no
 * ref has been handed a rumour.
 */
export function buildForMagazines(input: {
  hashtags: readonly TrendHashtagSignal[];
  refs: readonly string[];
}): ForMagazines {
  const forSet = (topicSet: string) => input.hashtags
    .filter((signal) => signal.topicSet === topicSet)
    .slice(0, 8)
    .map((signal) => ({
      topic: signal.hashtag,
      engagementPerHour: signal.engagementPerHour,
      weekOverWeekDelta: signal.weekOverWeekDelta,
      refs: [...input.refs].slice(0, 6)
    }));
  return { ai: forSet("dneskai"), mma: forSet("mma") };
}

/** GDPR and plain decency: raw items are transient, aggregates are not. */
export function pruneItems(items: readonly TrendItem[], now: Date): TrendItem[] {
  const floor = now.getTime() - TREND_ITEM_RETENTION_DAYS * 86_400_000;
  return items.filter((item) => {
    if (!item.postedAt) return false;
    const posted = Date.parse(item.postedAt);
    return !Number.isNaN(posted) && posted >= floor;
  });
}

export function snapshotAgeDays(snapshotDate: string, date: string): number {
  const from = Date.parse(`${snapshotDate}T12:00:00Z`);
  const to = Date.parse(`${date}T12:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

/**
 * Which recipe steps this run may take, in order, given what is left of the month's credit.
 *
 * Steps are dropped from the end, which is why the recipe lists them cheapest-first-to-keep: the
 * Explore snapshot is monthly and the least load-bearing, so it goes first, then the tracked
 * accounts. A short scout is a smaller brief, not a failed one.
 */
export function plannedRecipeSteps(input: {
  registry: GoViralSourceRegistry;
  remainingUsd: number;
  isFirstScoutOfMonth: boolean;
}): Array<{ step: GoViralRecipeStep; actor: GoViralActor; estimatedUsd: number }> {
  const actorsById = new Map(input.registry.actors.map((actor) => [actor.id, actor]));
  const planned: Array<{ step: GoViralRecipeStep; actor: GoViralActor; estimatedUsd: number }> = [];
  for (const step of [...input.registry.recipe].sort((left, right) => left.step - right.step)) {
    if (step.cadence === "monthly" && !input.isFirstScoutOfMonth) continue;
    if (step.inputs === "account" && input.registry.trackedAccounts.length === 0) continue;
    const actor = actorsById.get(step.actorId);
    if (!actor) continue;
    const perResult = actor.pricePerResultUsd ?? (actor.pricePer1000Usd ?? 0) / 1000;
    planned.push({ step, actor, estimatedUsd: Number(((actor.startUsd ?? 0) + perResult * step.maxResults).toFixed(6)) });
  }
  let budget = input.remainingUsd;
  const affordable: typeof planned = [];
  for (const entry of planned) {
    if (entry.estimatedUsd > budget) continue;
    budget -= entry.estimatedUsd;
    affordable.push(entry);
  }
  return affordable;
}
