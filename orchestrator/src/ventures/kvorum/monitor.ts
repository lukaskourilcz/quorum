import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import type {
  KvorumFeed,
  KvorumSourceRegistry
} from "../../contracts/kvorum-sources.js";
import {
  KvorumFeedMonitorItemSchema,
  KvorumMonitorReceiptSchema,
  KvorumStitMonitorItemSchema,
  type KvorumClusterRank,
  type KvorumMonitorCluster,
  type KvorumMonitorItem,
  type KvorumMonitorReceipt,
  type KvorumMonitorSourceResult,
  type KvorumTrendContext
} from "../../contracts/kvorum-monitor.js";
import {
  runKvorumApifySource,
  type ApifyDatasetItem,
  type KvorumApifyRunOutcome
} from "../../sources/apify.js";
import { parseFeed, type FetchDeps } from "../../streams/fetch.js";
import { canonicalUrl } from "../../streams/normalize.js";
import { safeFetch, type SafeFetchOptions } from "../../security/url.js";
import { configRoot } from "../../paths.js";
import {
  atomicWriteJson,
  readJson,
  readText,
  resolveStatePath,
  withFileLock
} from "../../state.js";
import {
  kvorumBudgetCapacityDecision,
  signedOwnerDecision
} from "../../portfolio/schedule.js";
import { loadKvorumEntityLexicon } from "./entities.js";
import { loadKvorumSourceRegistry } from "./sources.js";

const MAX_ITEM_TEXT = 4_000;
const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;

export interface KvorumMonitorFetchResult {
  items: KvorumMonitorItem[];
  sourceResults: KvorumMonitorSourceResult[];
  artifactPaths: string[];
  fixtureOnly: boolean;
}

function compactText(value: unknown, max = MAX_ITEM_TEXT): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const compact = String(value)
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
  if (!compact) return null;
  return compact.length > max ? `${compact.slice(0, max - 1).trimEnd()}…` : compact;
}

function first(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  return null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value > 1e12 ? value : value * 1_000);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const normalized = canonicalUrl(value);
    return normalized.startsWith("https://") ? normalized : null;
  } catch {
    return null;
  }
}

function matchingText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** Deterministic ids only: names absent from the owner lexicon never become stored entities. */
export function matchKvorumEntities(
  text: string,
  lexicon: KvorumEntityLexicon
): string[] {
  const normalized = matchingText(text);
  return lexicon.entities
    .filter((entity) => [entity.canonicalName, ...entity.aliases].some((term) => {
      const needle = matchingText(term);
      return new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}(?=$|[^a-z0-9])`, "u")
        .test(normalized);
    }))
    .map((entity) => entity.id);
}

/**
 * Fixed-field Štít mapper.
 *
 * It reads engagement totals but never comment arrays, commenter identities, author profiles,
 * images, cookies or arbitrary actor fields. Zod strictness makes that boundary executable.
 */
export function mapKvorumStitRow(
  row: ApifyDatasetItem,
  lexicon: KvorumEntityLexicon,
  registry: KvorumSourceRegistry
): KvorumMonitorItem | null {
  const text = compactText(first(row, ["text", "message", "caption", "title"]));
  const url = httpsUrl(first(row, ["postUrl", "url", "facebookUrl", "link"]));
  const publishedAt = timestamp(first(row, ["time", "timestamp", "publishedAt", "date", "createdAt"]));
  if (!text || !url || !publishedAt) return null;
  const pageUrl = new URL(registry.recipe[0]!.targetPage);
  return KvorumStitMonitorItemSchema.parse({
    source: {
      id: registry.actors[0]!.id,
      name: "Štít demokracie",
      kind: "facebook",
      host: pageUrl.hostname
    },
    url,
    publishedAt,
    text,
    entities: matchKvorumEntities(text, lexicon),
    stit: {
      pagePostUrl: url,
      likes: count(first(row, ["likesCount", "likeCount", "likes", "reactionsCount"])),
      comments: count(first(row, ["commentsCount", "commentCount", "comments"])),
      shares: count(first(row, ["sharesCount", "shareCount", "shares", "resharesCount"]))
    }
  });
}

export function mapKvorumFeedItem(
  raw: Awaited<ReturnType<typeof parseFeed>>[number],
  feed: KvorumFeed,
  lexicon: KvorumEntityLexicon
): KvorumMonitorItem | null {
  const title = compactText(raw.title);
  const summary = compactText(raw.summary);
  const text = compactText([title, summary].filter(Boolean).join(" — "));
  const url = httpsUrl(raw.url);
  const publishedAt = timestamp(raw.publishedAt);
  if (!text || !url || !publishedAt) return null;
  return KvorumFeedMonitorItemSchema.parse({
    source: { id: feed.id, name: feed.name, kind: "rss", host: feed.host },
    url,
    publishedAt,
    text,
    entities: matchKvorumEntities(text, lexicon)
  });
}

function sourceResultFromApify(
  outcome: KvorumApifyRunOutcome,
  items: readonly KvorumMonitorItem[]
): KvorumMonitorSourceResult {
  const source = outcome.results[0]!;
  if (source.status === "success" && items.length === 0) {
    return {
      sourceId: source.sourceId,
      kind: "apify",
      attempted: outcome.artifactPaths.length > 0,
      status: "skipped",
      count: 0,
      reason: "The actor returned rows, but none satisfied the fixed-field monitor boundary."
    };
  }
  return {
    sourceId: source.sourceId,
    kind: "apify",
    attempted: outcome.artifactPaths.length > 0,
    status: source.status,
    count: items.length,
    reason: source.reason
  };
}

function checkedApproval(inbox: string, id: string): boolean {
  return new RegExp(`^- \\[[xX]\\] HUMAN_APPROVAL ${id}\\b`, "mu").test(inbox);
}

function feedGate(input: {
  inbox: string;
  foundingDecisionRaw: string;
  budgetCapacityDecisionRaw: string;
}): { allowed: boolean; reason: string } {
  const pending = [
    ...(signedOwnerDecision(input.foundingDecisionRaw) !== "countersigned"
      ? ["the Kvórum founding decision"] : []),
    ...(kvorumBudgetCapacityDecision(input.budgetCapacityDecisionRaw) !== "countersigned"
      ? ["the Kvórum budget-capacity decision"] : []),
    ...(!checkedApproval(input.inbox, "KV-SOURCES-002") ? ["KV-SOURCES-002"] : [])
  ];
  return pending.length > 0
    ? {
        allowed: false,
        reason: `Kvórum feeds are waiting for ${pending.join(" and ")}; no external feed was read.`
      }
    : { allowed: true, reason: "The authority and source-approval gates allow feed reads." };
}

async function runtimeHosts(): Promise<string[]> {
  const raw = JSON.parse(await readFile(
    path.join(configRoot, "network-allowlist.json"),
    "utf8"
  )) as { runtimeHosts: string[] };
  return raw.runtimeHosts;
}

function sortItems(items: KvorumMonitorItem[]): KvorumMonitorItem[] {
  return [...items].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt)
    || left.source.id.localeCompare(right.source.id)
    || left.url.localeCompare(right.url));
}

export async function fetchKvorumMonitor(input: {
  root: string;
  date: string;
  now: Date;
  inbox: string;
  token: string | undefined;
  sourceRegistry?: KvorumSourceRegistry;
  entityLexicon?: KvorumEntityLexicon;
  foundingDecisionRaw?: string;
  budgetCapacityDecisionRaw?: string;
  apifyUsageFetcher?: (token: string) => Promise<number | null>;
  actorRunner?: Parameters<typeof runKvorumApifySource>[0]["actorRunner"];
  fetchImpl?: FetchDeps["fetchImpl"];
  resolveImpl?: SafeFetchOptions["resolveImpl"];
}): Promise<KvorumMonitorFetchResult> {
  const [sources, lexicon, foundingRaw, capacityRaw, allowHosts] = await Promise.all([
    input.sourceRegistry ?? loadKvorumSourceRegistry(),
    input.entityLexicon ?? loadKvorumEntityLexicon(),
    input.foundingDecisionRaw !== undefined
      ? Promise.resolve(input.foundingDecisionRaw)
      : readText(input.root, "decisions/2026-08-12-kvorum-founding.md"),
    input.budgetCapacityDecisionRaw !== undefined
      ? Promise.resolve(input.budgetCapacityDecisionRaw)
      : readText(input.root, "decisions/2026-08-12-kvorum-budget-capacity.md"),
    runtimeHosts()
  ]);

  const apify = await runKvorumApifySource({
    root: input.root,
    date: input.date,
    now: input.now,
    inbox: input.inbox,
    token: input.token,
    registry: sources,
    foundingDecisionRaw: foundingRaw,
    budgetCapacityDecisionRaw: capacityRaw,
    ...(input.apifyUsageFetcher ? { usageFetcher: input.apifyUsageFetcher } : {}),
    ...(input.actorRunner ? { actorRunner: input.actorRunner } : {})
  });
  const actorItems = apify.results[0]!.items
    .map((row) => mapKvorumStitRow(row, lexicon, sources))
    .filter((item): item is KvorumMonitorItem => item !== null);
  const items: KvorumMonitorItem[] = [...actorItems];
  const sourceResults: KvorumMonitorSourceResult[] = [sourceResultFromApify(apify, actorItems)];

  const feedsAllowed = feedGate({
    inbox: input.inbox,
    foundingDecisionRaw: foundingRaw,
    budgetCapacityDecisionRaw: capacityRaw
  });
  for (const feed of sources.feeds.filter((entry) => entry.enabled)) {
    if (!feedsAllowed.allowed) {
      sourceResults.push({
        sourceId: feed.id,
        kind: "feed",
        attempted: false,
        status: "skipped",
        count: 0,
        reason: feedsAllowed.reason
      });
      continue;
    }
    try {
      const response = await safeFetch(feed.url, {
        allowHosts,
        maxBytes: MAX_FEED_BYTES,
        timeoutMs: FETCH_TIMEOUT_MS,
        ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
        ...(input.resolveImpl ? { resolveImpl: input.resolveImpl } : {})
      });
      const parsed = await parseFeed(new TextDecoder().decode(response.body));
      const normalized = parsed
        .slice(0, feed.maxItems)
        .map((raw) => mapKvorumFeedItem(raw, feed, lexicon))
        .filter((item): item is KvorumMonitorItem => item !== null);
      items.push(...normalized);
      sourceResults.push({
        sourceId: feed.id,
        kind: "feed",
        attempted: true,
        status: normalized.length > 0 ? "success" : "skipped",
        count: normalized.length,
        reason: normalized.length > 0 ? null : "The feed returned no contract-valid monitor items."
      });
    } catch (error) {
      sourceResults.push({
        sourceId: feed.id,
        kind: "feed",
        attempted: true,
        status: "failed",
        count: 0,
        reason: error instanceof Error ? error.message.slice(0, 200) : "The feed failed."
      });
    }
  }

  return {
    items: sortItems(items),
    sourceResults,
    artifactPaths: apify.artifactPaths,
    fixtureOnly: !sourceResults.some((result) => result.attempted)
  };
}

export const KVORUM_RAW_RETENTION_DAYS = 30;
const MONITOR_DIRECTORY = "ventures/kvorum/monitor";

function purgeFingerprint(item: KvorumMonitorItem): string {
  return createHash("sha256")
    .update(`${item.source.id}\n${item.url}\n${item.publishedAt}`)
    .digest("hex");
}

/** Drop only raw rows. Clusters, their attributions and their rank records are durable evidence. */
export function purgeKvorumRawItems(
  receipt: KvorumMonitorReceipt,
  now: Date
): KvorumMonitorReceipt {
  const cutoffPublishedAt = new Date(
    now.getTime() - KVORUM_RAW_RETENTION_DAYS * 86_400_000
  ).toISOString();
  const kept = receipt.rawItems.filter((item) => item.publishedAt >= cutoffPublishedAt);
  const removed = receipt.rawItems.filter((item) => item.publishedAt < cutoffPublishedAt);
  const marks = new Map(
    receipt.purge.purged.map((mark) => [mark.fingerprint, mark])
  );
  for (const item of removed) {
    const fingerprint = purgeFingerprint(item);
    marks.set(fingerprint, {
      fingerprint,
      sourceId: item.source.id,
      publishedAt: item.publishedAt,
      purgedAt: now.toISOString()
    });
  }
  return KvorumMonitorReceiptSchema.parse({
    ...receipt,
    itemsKept: kept.length,
    rawItems: kept,
    purge: {
      retentionDays: KVORUM_RAW_RETENTION_DAYS,
      evaluatedAt: now.toISOString(),
      cutoffPublishedAt,
      rawItemsBefore: receipt.rawItems.length,
      rawItemsAfter: kept.length,
      purged: [...marks.values()].sort((left, right) =>
        left.publishedAt.localeCompare(right.publishedAt)
        || left.fingerprint.localeCompare(right.fingerprint))
    }
  });
}

export function buildKvorumMonitorReceipt(input: {
  date: string;
  now: Date;
  fetched: KvorumMonitorFetchResult;
  clusters?: KvorumMonitorCluster[];
  ranks?: KvorumClusterRank[];
  trendContext?: KvorumTrendContext;
}): KvorumMonitorReceipt {
  const cutoffPublishedAt = new Date(
    input.now.getTime() - KVORUM_RAW_RETENTION_DAYS * 86_400_000
  ).toISOString();
  return purgeKvorumRawItems(KvorumMonitorReceiptSchema.parse({
    schemaVersion: "kvorum-monitor/1",
    date: input.date,
    generatedAt: input.now.toISOString(),
    fixtureOnly: input.fetched.fixtureOnly,
    sourceResults: input.fetched.sourceResults,
    itemsKept: input.fetched.items.length,
    rawItems: input.fetched.items,
    clusters: input.clusters ?? [],
    ranks: input.ranks ?? [],
    ...(input.trendContext ? { trendContext: input.trendContext } : {}),
    purge: {
      retentionDays: KVORUM_RAW_RETENTION_DAYS,
      evaluatedAt: input.now.toISOString(),
      cutoffPublishedAt,
      rawItemsBefore: input.fetched.items.length,
      rawItemsAfter: input.fetched.items.length,
      purged: []
    }
  }), input.now);
}

/**
 * The monitor's sole persistence entry point.
 *
 * One lock owns the daily atomic write and every older receipt rewrite, so concurrent retries
 * cannot resurrect raw rows another run just purged.
 */
export async function writeKvorumMonitorReceipt(input: {
  root: string;
  receipt: KvorumMonitorReceipt;
  now: Date;
}): Promise<string[]> {
  const currentPath = `${MONITOR_DIRECTORY}/${input.receipt.date}.json`;
  return withFileLock(input.root, `${MONITOR_DIRECTORY}/.lock`, async () => {
    const directory = resolveStatePath(input.root, MONITOR_DIRECTORY);
    const filenames = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
    const rewrites: Array<{ path: string; receipt: KvorumMonitorReceipt }> = [];
    for (const filename of filenames.filter((entry) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(entry))) {
      const relativePath = `${MONITOR_DIRECTORY}/${filename}`;
      if (relativePath === currentPath) continue;
      const stored = KvorumMonitorReceiptSchema.parse(
        await readJson<unknown>(input.root, relativePath, {})
      );
      const purged = purgeKvorumRawItems(stored, input.now);
      if (JSON.stringify(purged) !== JSON.stringify(stored)) {
        rewrites.push({ path: relativePath, receipt: purged });
      }
    }
    const current = purgeKvorumRawItems(input.receipt, input.now);
    await Promise.all([
      atomicWriteJson(input.root, currentPath, current),
      ...rewrites.map((entry) => atomicWriteJson(input.root, entry.path, entry.receipt))
    ]);
    return [currentPath, ...rewrites.map((entry) => entry.path).sort()];
  });
}
