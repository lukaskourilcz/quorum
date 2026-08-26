import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PersonalGrowthProviderConfigSchema,
  PersonalGrowthProviderObservationSchema,
  type PersonalGrowthMetricName,
  type PersonalGrowthProviderConfig,
  type PersonalGrowthProviderObservation
} from "../../contracts/personal-growth-results.js";
import {
  PersonalGrowthConversationOpportunitySchema,
  type PersonalGrowthConversationOpportunity
} from "../../contracts/personal-growth-recommendations.js";
import { configRoot } from "../../paths.js";
import { personalGrowthHash } from "./planner.js";

export interface PersonalGrowthProviderFlags {
  instagramInsights: boolean;
  threadsInsights: boolean;
  threadsSearch: boolean;
  providerLive: boolean;
  tokenRefresh: boolean;
}

export interface RawMetaMetric {
  name: string;
  value: unknown;
}

export interface RawMetaInsightsResponse {
  metrics: readonly RawMetaMetric[];
  error?: "empty-response" | "missing-permission" | "missing-credential" | "expired-token" | "rate-limited" | "unsupported-account" | "provider-disabled" | "provider-error";
}

export interface MetaPersonalGrowthTransport {
  read(input: {
    apiFamily: "instagram-account" | "instagram-media" | "threads-account" | "threads-post";
    apiVersion: "v26.0" | "v1.0";
    ownerAccountAlias: string;
    nativePostId: string | null;
  }): Promise<RawMetaInsightsResponse>;
  searchThreads?(input: { query: string; limit: 3 }): Promise<readonly {
    publicUrl: string;
    observedAt: string;
    expiresAt: string;
    evidenceRefs: string[];
  }[]>;
}

export interface InstagramAccountInsightsProvider {
  collectInstagramAccount(input: ProviderCollectInput): Promise<PersonalGrowthProviderObservation>;
}

export interface InstagramMediaInsightsProvider {
  collectInstagramMedia(input: ProviderPostCollectInput): Promise<PersonalGrowthProviderObservation>;
}

export interface ThreadsAccountInsightsProvider {
  collectThreadsAccount(input: ProviderCollectInput): Promise<PersonalGrowthProviderObservation>;
}

export interface ThreadsPostInsightsProvider {
  collectThreadsPost(input: ProviderPostCollectInput): Promise<PersonalGrowthProviderObservation>;
}

export interface ThreadsKeywordSearchProvider {
  searchThreads(input: { query: string; observedAt?: Date }): Promise<{
    status: "available" | "unavailable";
    values: readonly PersonalGrowthConversationOpportunity[];
  }>;
}

interface ProviderCollectInput {
  observedAt: Date;
}

interface ProviderPostCollectInput extends ProviderCollectInput {
  nativePostId: string;
  nativeUrl: string;
  publishedAt: Date;
}

const METRIC_MAP: Readonly<Record<string, PersonalGrowthMetricName>> = {
  follower_count: "followers",
  followers_count: "followers",
  net_follower_growth: "net_follower_growth",
  views: "views",
  reach: "reach",
  non_follower_reach: "non_follower_reach",
  profile_views: "profile_views",
  follows: "follows",
  likes: "likes",
  comments: "comments",
  replies: "replies",
  reposts: "reposts",
  quotes: "quotes",
  shares: "shares",
  saved: "saves",
  saves: "saves",
  ig_reels_video_view_total_time: "watch_time_ms",
  ig_reels_avg_watch_time: "average_watch_time_ms",
  early_exit_count: "early_exit_count"
};

export async function loadPersonalGrowthProviderConfig(
  filePath = path.join(configRoot, "personal-growth-providers.json")
): Promise<PersonalGrowthProviderConfig> {
  return PersonalGrowthProviderConfigSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

function pragueDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

export function personalGrowthMaturityWindow(publishedAt: Date, observedAt: Date): "24h" | "72h" | "7d" | "28d" | null {
  const ageHours = (observedAt.getTime() - publishedAt.getTime()) / 3_600_000;
  if (!Number.isFinite(ageHours) || ageHours < 0) return null;
  if (ageHours >= 24 * 28) return "28d";
  if (ageHours >= 24 * 7) return "7d";
  if (ageHours >= 72) return "72h";
  if (ageHours >= 24) return "24h";
  return null;
}

function normalizeMetrics(response: RawMetaInsightsResponse) {
  const metrics: Array<{ name: PersonalGrowthMetricName; value: number | null; unavailableReason: string | null }> = [];
  let droppedItemCount = 0;
  const seen = new Set<PersonalGrowthMetricName>();
  for (const raw of response.metrics) {
    const name = METRIC_MAP[raw.name];
    if (!name || seen.has(name) || typeof raw.value !== "number" || !Number.isFinite(raw.value) || raw.value < 0) {
      droppedItemCount += 1;
      continue;
    }
    seen.add(name);
    metrics.push({ name, value: raw.value, unavailableReason: null });
  }
  return { metrics, droppedItemCount };
}

function observation(input: {
  platform: "instagram" | "threads";
  scope: "account" | "post";
  ownerAccountAlias: string;
  nativePostId: string | null;
  nativeUrl: string | null;
  observedAt: Date;
  publishedAt: Date | null;
  response: RawMetaInsightsResponse;
  enabled: boolean;
  config: PersonalGrowthProviderConfig;
}): PersonalGrowthProviderObservation {
  const normalized = normalizeMetrics(input.response);
  const unavailableReason = !input.enabled
    ? "provider-disabled" as const
    : input.response.error ?? (normalized.metrics.length === 0 ? "empty-response" as const : "none" as const);
  const idempotencyKey = personalGrowthHash({
    platform: input.platform,
    scope: input.scope,
    nativePostId: input.nativePostId,
    observedAt: input.observedAt.toISOString(),
    maturityWindow: input.publishedAt ? personalGrowthMaturityWindow(input.publishedAt, input.observedAt) : null,
    metrics: normalized.metrics,
    unavailableReason
  });
  const raw = {
    schemaVersion: "personal-growth-provider-observation/1" as const,
    observationId: `pg-observation-${idempotencyKey.slice(-16)}`,
    idempotencyKey,
    platform: input.platform,
    scope: input.scope,
    ownerAccountAlias: input.ownerAccountAlias,
    nativePostId: input.nativePostId,
    nativeUrl: input.nativeUrl,
    observedAt: input.observedAt.toISOString(),
    publishedAt: input.publishedAt?.toISOString() ?? null,
    pragueReportingDate: pragueDate(input.observedAt),
    apiVersion: input.platform === "instagram" ? input.config.meta.graphApiVersion : input.config.meta.threadsApiVersion,
    maturityWindow: input.publishedAt ? personalGrowthMaturityWindow(input.publishedAt, input.observedAt) : null,
    metrics: unavailableReason === "none" ? normalized.metrics : [],
    unavailableReason,
    droppedItemCount: normalized.droppedItemCount,
    credentialMaterialPresent: false as const,
    audienceIdentityPresent: false as const
  };
  return PersonalGrowthProviderObservationSchema.parse({ ...raw, snapshotHash: personalGrowthHash(raw) });
}

/**
 * The transport owns the secret and exact HTTP client. The adapter accepts no token value, keeps
 * the four insight lanes independently gated, and normalizes only aggregate metrics from the
 * official Instagram v26.0 and Threads v1.0 contracts audited in the provider config.
 */
export class OfficialMetaPersonalGrowthAdapter implements
  InstagramAccountInsightsProvider,
  InstagramMediaInsightsProvider,
  ThreadsAccountInsightsProvider,
  ThreadsPostInsightsProvider,
  ThreadsKeywordSearchProvider {
  constructor(
    private readonly config: PersonalGrowthProviderConfig,
    private readonly flags: PersonalGrowthProviderFlags,
    private readonly transport: MetaPersonalGrowthTransport,
    private readonly ownerAccountAlias = "pg-owner-lukaskouril93"
  ) {
    PersonalGrowthProviderConfigSchema.parse(config);
  }

  private async read(input: {
    family: "instagram-account" | "instagram-media" | "threads-account" | "threads-post";
    platform: "instagram" | "threads";
    scope: "account" | "post";
    enabled: boolean;
    observedAt: Date;
    nativePostId?: string;
    nativeUrl?: string;
    publishedAt?: Date;
  }): Promise<PersonalGrowthProviderObservation> {
    const live = input.enabled && this.flags.providerLive;
    const response = live
      ? await this.transport.read({
          apiFamily: input.family,
          apiVersion: input.platform === "instagram" ? this.config.meta.graphApiVersion : this.config.meta.threadsApiVersion,
          ownerAccountAlias: this.ownerAccountAlias,
          nativePostId: input.nativePostId ?? null
        }).catch(() => ({ metrics: [], error: "provider-error" as const }))
      : { metrics: [], error: "provider-disabled" as const };
    return observation({
      platform: input.platform,
      scope: input.scope,
      ownerAccountAlias: this.ownerAccountAlias,
      nativePostId: input.nativePostId ?? null,
      nativeUrl: input.nativeUrl ?? null,
      observedAt: input.observedAt,
      publishedAt: input.publishedAt ?? null,
      response,
      enabled: live,
      config: this.config
    });
  }

  collectInstagramAccount(input: ProviderCollectInput) {
    return this.read({ ...input, family: "instagram-account", platform: "instagram", scope: "account", enabled: this.flags.instagramInsights });
  }

  collectInstagramMedia(input: ProviderPostCollectInput) {
    return this.read({ ...input, family: "instagram-media", platform: "instagram", scope: "post", enabled: this.flags.instagramInsights });
  }

  collectThreadsAccount(input: ProviderCollectInput) {
    return this.read({ ...input, family: "threads-account", platform: "threads", scope: "account", enabled: this.flags.threadsInsights });
  }

  collectThreadsPost(input: ProviderPostCollectInput) {
    return this.read({ ...input, family: "threads-post", platform: "threads", scope: "post", enabled: this.flags.threadsInsights });
  }

  async searchThreads(input: { query: string; observedAt?: Date }) {
    if (!this.flags.providerLive || !this.flags.threadsSearch || !this.transport.searchThreads || !input.query.trim()) {
      return { status: "unavailable" as const, values: [] };
    }
    const now = input.observedAt ?? new Date();
    const raw = await this.transport.searchThreads({ query: input.query.trim(), limit: 3 }).catch(() => []);
    const values = raw.flatMap((candidate) => {
      const parsed = PersonalGrowthConversationOpportunitySchema.safeParse({
        opportunityId: `pg-conversation-${personalGrowthHash(candidate).slice(-16)}`,
        provider: "official-threads-search",
        publicUrl: candidate.publicUrl,
        observedAt: candidate.observedAt,
        expiresAt: candidate.expiresAt,
        evidenceRefs: candidate.evidenceRefs,
        purpose: "Owner may inspect this public conversation and decide whether to reply manually.",
        manualReplyOnly: true
      });
      return parsed.success && Date.parse(parsed.data.expiresAt) > now.getTime() ? [parsed.data] : [];
    }).slice(0, 3);
    return { status: values.length > 0 ? "available" as const : "unavailable" as const, values };
  }
}
