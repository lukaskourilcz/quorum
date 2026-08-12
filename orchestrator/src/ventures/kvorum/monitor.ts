import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { KvorumEntityLexicon } from "../../contracts/kvorum-entities.js";
import type {
  KvorumFeed,
  KvorumSourceRegistry
} from "../../contracts/kvorum-sources.js";
import { DateTimeSchema, HttpsUrlSchema } from "../../contracts/common.js";
import {
  runKvorumApifySource,
  type ApifyDatasetItem,
  type KvorumApifyRunOutcome
} from "../../sources/apify.js";
import { parseFeed, type FetchDeps } from "../../streams/fetch.js";
import { canonicalUrl } from "../../streams/normalize.js";
import { safeFetch, type SafeFetchOptions } from "../../security/url.js";
import { configRoot } from "../../paths.js";
import { readText } from "../../state.js";
import {
  kvorumBudgetCapacityDecision,
  signedOwnerDecision
} from "../../portfolio/schedule.js";
import { loadKvorumEntityLexicon } from "./entities.js";
import { loadKvorumSourceRegistry } from "./sources.js";

const MAX_ITEM_TEXT = 4_000;
const MAX_FEED_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 8_000;

const SourceSchema = z.strictObject({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  kind: z.enum(["facebook", "rss"]),
  host: z.string().min(1).max(253)
});

const BaseMonitorItemShape = {
  source: SourceSchema,
  url: HttpsUrlSchema,
  publishedAt: DateTimeSchema,
  text: z.string().min(1).max(MAX_ITEM_TEXT),
  entities: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(40)
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

export type KvorumMonitorItem = z.infer<typeof KvorumMonitorItemSchema>;

export interface KvorumMonitorSourceResult {
  sourceId: string;
  kind: "apify" | "feed";
  status: "success" | "skipped" | "failed";
  count: number;
  reason: string | null;
}

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
      status: "skipped",
      count: 0,
      reason: "The actor returned rows, but none satisfied the fixed-field monitor boundary."
    };
  }
  return {
    sourceId: source.sourceId,
    kind: "apify",
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
        status: normalized.length > 0 ? "success" : "skipped",
        count: normalized.length,
        reason: normalized.length > 0 ? null : "The feed returned no contract-valid monitor items."
      });
    } catch (error) {
      sourceResults.push({
        sourceId: feed.id,
        kind: "feed",
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
    fixtureOnly: sourceResults.every((result) => result.status === "skipped")
  };
}
