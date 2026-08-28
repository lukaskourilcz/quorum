import type { SocialResultMetricName, SocialResultUnavailableReason } from "../contracts/social-results.js";
import type { SocialPublisherRegistry } from "./publisher-targets.js";
import {
  resolveProviderBinding,
  type SocialProviderRegistry
} from "./providers.js";
import {
  createSocialMetricObservation,
  type CreateSocialMetricObservationInput
} from "./results.js";

export interface RawOfficialSocialMetric {
  name: string;
  value: unknown;
  unavailableReason?: SocialResultUnavailableReason;
}

export interface RawOfficialSocialInsightsResponse {
  metrics: readonly RawOfficialSocialMetric[];
  error?: SocialResultUnavailableReason;
}

export interface OfficialSocialInsightsTransport {
  read(input: {
    platform: "instagram" | "threads";
    apiVersion: string;
    nativePostId: string;
    connectionId: string;
    credentialRef: string;
    nativeAccountIdRef: string;
  }): Promise<RawOfficialSocialInsightsResponse>;
}

type InsightContext = Omit<CreateSocialMetricObservationInput,
  "provider" | "metrics" | "unavailableReason" | "sourceProvenanceRefs" | "actualCostUsd" | "droppedMetricCount"> & {
  providerResponseEvidenceRef: string;
};

const METRIC_MAP: Readonly<Record<string, SocialResultMetricName>> = {
  reach: "reach",
  views: "views",
  impressions: "impressions",
  non_follower_reach: "non_follower_reach",
  shares: "shares",
  reposts: "reposts",
  quotes: "quotes",
  saved: "saves",
  saves: "saves",
  replies: "replies",
  comments: "comments",
  likes: "likes",
  profile_activity: "profile_actions",
  profile_actions: "profile_actions"
};

export function socialMaturityWindow(publishedAt: Date, observedAt: Date): "24h" | "72h" | "7d" | "28d" | null {
  const hours = (observedAt.getTime() - publishedAt.getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 24) return null;
  if (hours >= 28 * 24) return "28d";
  if (hours >= 7 * 24) return "7d";
  if (hours >= 72) return "72h";
  return "24h";
}

function normalize(response: RawOfficialSocialInsightsResponse) {
  const metrics: Array<{ name: SocialResultMetricName; value: number | null; unavailableReason: SocialResultUnavailableReason | null }> = [];
  const seen = new Set<SocialResultMetricName>();
  let droppedMetricCount = 0;
  for (const raw of response.metrics) {
    const name = METRIC_MAP[raw.name];
    if (!name || seen.has(name)) {
      droppedMetricCount += 1;
      continue;
    }
    if (raw.value === null && raw.unavailableReason) {
      seen.add(name);
      metrics.push({ name, value: null, unavailableReason: raw.unavailableReason });
      continue;
    }
    if (typeof raw.value !== "number" || !Number.isFinite(raw.value) || raw.value < 0 || raw.unavailableReason) {
      droppedMetricCount += 1;
      continue;
    }
    seen.add(name);
    metrics.push({ name, value: raw.value, unavailableReason: null });
  }
  const reach = metrics.find(({ name }) => name === "reach")?.value;
  const nonFollower = metrics.find(({ name }) => name === "non_follower_reach")?.value;
  if (!seen.has("non_follower_reach_ratio") && typeof nonFollower === "number") {
    metrics.push(typeof reach === "number" && reach > 0
      ? { name: "non_follower_reach_ratio", value: Number((nonFollower / reach).toFixed(8)), unavailableReason: null }
      : { name: "non_follower_reach_ratio", value: null, unavailableReason: "invalid-denominator" });
  }
  return { metrics, droppedMetricCount };
}

function unavailableFromReasons(reasons: readonly string[]): SocialResultUnavailableReason {
  const joined = reasons.join(" ");
  if (/credential/u.test(joined)) return "missing-credential";
  if (/token-expired/u.test(joined)) return "expired-token";
  if (/app-review/u.test(joined)) return "app-review-expired";
  if (/rate-limit/u.test(joined)) return "rate-limited";
  if (/capability|scope/u.test(joined)) return "missing-permission";
  if (/outage/u.test(joined)) return "provider-outage";
  return "analytics-unavailable";
}

/**
 * Reuses #417's exact provider/binding resolver. The transport owns credential values; this
 * adapter passes reference names only and retains no raw provider response or audience identity.
 */
export class OfficialSocialInsightsAdapter {
  constructor(
    private readonly providerRegistry: SocialProviderRegistry,
    private readonly publisherRegistry: SocialPublisherRegistry,
    private readonly environment: NodeJS.ProcessEnv,
    private readonly transport: OfficialSocialInsightsTransport
  ) {}

  async collect(input: InsightContext) {
    const { providerResponseEvidenceRef, ...observationInput } = input;
    const connection = this.publisherRegistry.connections.find(({ id }) => id === input.connectionId);
    if (connection && (connection.profileId !== input.profileId || connection.platform !== input.platform)) {
      throw new Error("Insight observation does not match the canonical profile/connection binding");
    }
    const resolution = resolveProviderBinding({
      registry: this.providerRegistry,
      publisherRegistry: this.publisherRegistry,
      connectionId: input.connectionId,
      environment: this.environment,
      requiredCapability: "own-insights"
    });
    const provider = resolution.target?.provider ?? this.providerRegistry.providers.find(({ id }) => id === "direct-meta") ?? null;
    const binding = resolution.target?.binding ?? null;
    const providerEvidence = {
      source: "official-meta" as const,
      providerId: "direct-meta" as const,
      implementationVersion: provider?.implementationVersion ?? "unavailable",
      apiVersion: connection?.connector.apiVersion ?? provider?.apiVersion ?? null,
      bindingRef: binding?.id ?? null,
      evidenceRef: providerResponseEvidenceRef
    };
    const unavailable = (reason: SocialResultUnavailableReason) => createSocialMetricObservation({
      ...observationInput,
      provider: providerEvidence,
      metrics: [],
      unavailableReason: reason,
      sourceProvenanceRefs: ["config/social-providers.json", providerResponseEvidenceRef],
      actualCostUsd: provider?.id === "direct-meta" ? 0 : null,
      droppedMetricCount: 0
    });
    if (!connection || !provider || resolution.decision !== "eligible" || !binding) return unavailable(unavailableFromReasons(resolution.reasons));
    const insightScope = connection.platform === "threads"
      ? "threads_manage_insights"
      : connection.connector.loginMode === "instagram-login" ? "instagram_business_manage_insights" : "instagram_manage_insights";
    if (!connection.supportedCapabilities.includes("own-insights") || !connection.approvedScopes.includes(insightScope)) return unavailable("missing-permission");
    if (!connection.credentialRef || !connection.nativeAccountIdRef) return unavailable("missing-credential");
    const response = await this.transport.read({
      platform: connection.platform,
      apiVersion: connection.connector.apiVersion,
      nativePostId: input.nativePostId,
      connectionId: connection.id,
      credentialRef: connection.credentialRef,
      nativeAccountIdRef: connection.nativeAccountIdRef
    }).catch(() => ({ metrics: [], error: "provider-error" as const }));
    if (response.error) return unavailable(response.error);
    const normalized = normalize(response);
    return createSocialMetricObservation({
      ...observationInput,
      provider: providerEvidence,
      metrics: normalized.metrics,
      unavailableReason: normalized.metrics.length === 0 ? "analytics-unavailable" : null,
      sourceProvenanceRefs: ["config/social-providers.json", providerResponseEvidenceRef],
      actualCostUsd: 0,
      droppedMetricCount: normalized.droppedMetricCount
    });
  }
}
