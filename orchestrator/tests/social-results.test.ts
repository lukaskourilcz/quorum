import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { socialMetricSnapshotHash, type SocialMetricObservation } from "../src/contracts/social-results.js";
import { providerBindingHash } from "../src/contracts/social-provider.js";
import { OfficialSocialInsightsAdapter, socialMaturityWindow } from "../src/social/insights.js";
import { loadSocialProviderRegistry, SocialProviderRegistrySchema } from "../src/social/providers.js";
import { loadSocialPublisherRegistry, SocialPublisherRegistrySchema } from "../src/social/publisher-targets.js";
import { appendSocialMetricObservation, readSocialMetricObservations } from "../src/social/results.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))));

const context = {
  correctionOfRef: null,
  profileId: "social-profile-caught-up",
  targetRole: "primary" as const,
  connectionId: "social-connection-caught-up-threads",
  platform: "threads" as const,
  nativePostId: "threads-post-123",
  publicUrl: "https://www.threads.net/@caughtup/post/example",
  campaignRef: "state/social/campaigns/social-campaign-door-money-release-001.json",
  campaignItemId: "door-money-primary-threads",
  releaseId: "door-money-release-001",
  sourceVentureId: "door-money",
  capabilityRef: null,
  publishedAt: "2026-08-26T08:00:00.000Z",
  observedAt: "2026-08-27T08:00:00.000Z",
  maturityWindow: "24h" as const,
  format: "text" as const,
  locale: "en" as const,
  amplifier: null,
  policyState: {
    amplificationPolicyRef: null,
    strategyRef: "config/social-profile-strategies.json#social-profile-strategy-caught-up",
    originalSupportClassification: "original" as const,
    originalRatio: 1,
    supportRatio: 0,
    runwayState: "healthy" as const,
    cooldownState: "clear" as const,
    campaignState: "completed" as const
  },
  attributionRefs: [],
  providerResponseEvidenceRef: "provider-response:bounded-snapshot"
};

async function registriesWithInsights() {
  const providers = structuredClone(await loadSocialProviderRegistry());
  const publishers = structuredClone(await loadSocialPublisherRegistry());
  const provider = providers.providers.find(({ id }) => id === "direct-meta")!;
  provider.capabilities.push("own-insights");
  provider.evidenceCapabilities.metrics = true;
  const binding = providers.bindings.find(({ connectionId }) => connectionId === context.connectionId)!;
  binding.mode = "active";
  binding.capabilities.push("own-insights");
  binding.ownerActivationRef = "owner-decision:insights-only";
  binding.authorityRef = "GitHub #412";
  binding.effectiveAt = "2026-08-27T00:00:00.000Z";
  binding.health = { state: "healthy", unavailableReason: "none", lastVerifiedAt: "2026-08-27T00:00:00.000Z" };
  binding.bindingHash = providerBindingHash(binding);
  const connection = publishers.connections.find(({ id }) => id === context.connectionId)!;
  connection.supportedCapabilities.push("own-insights");
  connection.approvedScopes.push("threads_manage_insights");
  return { providers: SocialProviderRegistrySchema.parse(providers), publishers: SocialPublisherRegistrySchema.parse(publishers) };
}

describe("official Social Distribution insights and append-only results", () => {
  it("keeps the default official bindings held and records missing permission without transport", async () => {
    const transport = { read: vi.fn(async () => ({ metrics: [{ name: "views", value: 10 }] })) };
    const adapter = new OfficialSocialInsightsAdapter(await loadSocialProviderRegistry(), await loadSocialPublisherRegistry(), {}, transport);
    const observed = await adapter.collect(context);
    expect(observed).toMatchObject({ metrics: [], unavailableReason: "missing-permission", provider: { source: "official-meta", providerId: "direct-meta" }, actualCostUsd: 0 });
    expect(transport.read).not.toHaveBeenCalled();
  });

  it("normalizes official aggregates, derives a valid ratio and drops identity-shaped metrics", async () => {
    const { providers, publishers } = await registriesWithInsights();
    const transport = { read: vi.fn(async () => ({ metrics: [
      { name: "views", value: 500 },
      { name: "reach", value: 200 },
      { name: "non_follower_reach", value: 50 },
      { name: "likes", value: 12 },
      { name: "liker_identity", value: "forbidden" },
      { name: "shares", value: null, unavailableReason: "unsupported-metric" as const }
    ] })) };
    const adapter = new OfficialSocialInsightsAdapter(providers, publishers, {
      META_GRAPH_API_VERSION: "v26.0",
      CAUGHT_UP_THREADS_ACCESS_TOKEN: "secret-stays-in-transport",
      CAUGHT_UP_THREADS_USER_ID: "native-id-stays-in-transport"
    }, transport);
    const observed = await adapter.collect(context);
    expect(observed).toMatchObject({ unavailableReason: null, droppedMetricCount: 1, audienceIdentityExcluded: true, privateMessageExcluded: true, rawProviderPayloadExcluded: true });
    expect(observed.metrics).toContainEqual({ name: "non_follower_reach_ratio", value: 0.25, unavailableReason: null });
    expect(observed.metrics).toContainEqual({ name: "shares", value: null, unavailableReason: "unsupported-metric" });
    expect(JSON.stringify(observed)).not.toContain("secret-stays-in-transport");
    expect(transport.read).toHaveBeenCalledWith(expect.objectContaining({ credentialRef: "CAUGHT_UP_THREADS_ACCESS_TOKEN", nativeAccountIdRef: "CAUGHT_UP_THREADS_USER_ID" }));
    expect(socialMaturityWindow(new Date("2026-08-01T00:00:00.000Z"), new Date("2026-08-29T00:00:00.000Z"))).toBe("28d");
  });

  it("records token, rate, provider and invalid-denominator states as unavailable, never zero", async () => {
    const { providers, publishers } = await registriesWithInsights();
    for (const error of ["expired-token", "rate-limited", "provider-outage"] as const) {
      const adapter = new OfficialSocialInsightsAdapter(providers, publishers, { META_GRAPH_API_VERSION: "v26.0", CAUGHT_UP_THREADS_ACCESS_TOKEN: "token", CAUGHT_UP_THREADS_USER_ID: "id" }, { read: async () => ({ metrics: [], error }) });
      expect(await adapter.collect(context)).toMatchObject({ metrics: [], unavailableReason: error });
    }
    const adapter = new OfficialSocialInsightsAdapter(providers, publishers, { META_GRAPH_API_VERSION: "v26.0", CAUGHT_UP_THREADS_ACCESS_TOKEN: "token", CAUGHT_UP_THREADS_USER_ID: "id" }, { read: async () => ({ metrics: [{ name: "non_follower_reach", value: 5 }, { name: "reach", value: 0 }] }) });
    expect((await adapter.collect(context)).metrics).toContainEqual({ name: "non_follower_reach_ratio", value: null, unavailableReason: "invalid-denominator" });
  });

  it("persists retries idempotently, rejects conflicts and keeps corrections as later records", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "social-results-")); roots.push(root);
    const adapter = new OfficialSocialInsightsAdapter(await loadSocialProviderRegistry(), await loadSocialPublisherRegistry(), {}, { read: async () => ({ metrics: [] }) });
    const first = await adapter.collect(context);
    expect(await appendSocialMetricObservation(root, first)).toMatchObject({ appended: true });
    expect(await appendSocialMetricObservation(root, first)).toMatchObject({ appended: false });
    const conflictBase = { ...first, sourceProvenanceRefs: [...first.sourceProvenanceRefs, "owner-correction:conflict"] };
    const conflict = { ...conflictBase, snapshotHash: socialMetricSnapshotHash(conflictBase as SocialMetricObservation) };
    await expect(appendSocialMetricObservation(root, conflict)).rejects.toThrow(/Append-only/u);
    const correction = await adapter.collect({ ...context, observedAt: "2026-08-27T09:00:00.000Z", correctionOfRef: `state/social/results/observations/${first.id}.json`, providerResponseEvidenceRef: "owner-correction:later-record" });
    expect(await appendSocialMetricObservation(root, correction)).toMatchObject({ appended: true });
    expect((await readSocialMetricObservations(root)).accepted).toHaveLength(2);
  });

  it("drops malformed stored records without invalidating valid evidence", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "social-results-")); roots.push(root);
    const adapter = new OfficialSocialInsightsAdapter(await loadSocialProviderRegistry(), await loadSocialPublisherRegistry(), {}, { read: async () => ({ metrics: [] }) });
    await appendSocialMetricObservation(root, await adapter.collect(context));
    await mkdir(path.join(root, "social/results/observations"), { recursive: true });
    await writeFile(path.join(root, "social/results/observations/malformed.json"), "{\"audienceIds\":[\"forbidden\"]}\n");
    expect(await readSocialMetricObservations(root)).toMatchObject({ accepted: [expect.any(Object)], dropped: 1 });
  });
});
