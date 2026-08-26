import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PersonalGrowthProviderObservationSchema,
  PersonalGrowthResultSchema,
  type PersonalGrowthResult
} from "../src/contracts/personal-growth-results.js";
import { loadPersonalGrowthFoundation } from "../src/ventures/personal-growth/foundation.js";
import {
  OfficialMetaPersonalGrowthAdapter,
  loadPersonalGrowthProviderConfig,
  personalGrowthMaturityWindow,
  type MetaPersonalGrowthTransport,
  type PersonalGrowthProviderFlags
} from "../src/ventures/personal-growth/providers.js";
import {
  appendPersonalGrowthObservation,
  createPersonalGrowthResult,
  readPersonalGrowthResult,
  writeNewPersonalGrowthResult
} from "../src/ventures/personal-growth/results.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const liveFlags: PersonalGrowthProviderFlags = {
  instagramInsights: true,
  threadsInsights: true,
  threadsSearch: true,
  providerLive: true,
  tokenRefresh: false
};

function transport(overrides: Partial<MetaPersonalGrowthTransport> = {}): MetaPersonalGrowthTransport {
  return {
    read: async ({ apiFamily }) => ({
      metrics: apiFamily.startsWith("instagram")
        ? [{ name: "reach", value: 120 }, { name: "saved", value: 8 }, { name: "liker_identity", value: "forbidden" }]
        : [{ name: "views", value: 900 }, { name: "replies", value: 12 }, { name: "reposts", value: 5 }]
    }),
    searchThreads: async () => [{
      publicUrl: "https://www.threads.net/@public/post/example",
      observedAt: "2026-08-27T21:00:00.000Z",
      expiresAt: "2026-08-28T21:00:00.000Z",
      evidenceRefs: ["meta-search:example"]
    }],
    ...overrides
  };
}

function result(overrides: Partial<PersonalGrowthResult> = {}) {
  return createPersonalGrowthResult({
    platform: "instagram",
    nativePostId: "ig-123",
    url: "https://www.instagram.com/p/example/",
    publishedAt: "2026-08-26T20:00:00.000Z",
    format: "reel",
    language: "cs",
    personalPillar: "life-lifestyle",
    contentOrigin: "owner-current-life",
    collaborator: null,
    publicationRelation: null,
    reelSeries: "life-between-projects",
    goviralSignalId: null,
    manualVentureReference: null,
    experimentId: null,
    classification: "personal-or-personally-authored",
    provenance: {
      entryMode: "manual",
      ownerEvidenceRefs: ["owner-result:ig-123"],
      automaticPortfolioLookup: false,
      socialDistributionCampaignRef: null,
      monetizationRef: null
    },
    ownerRating: null,
    ownerNote: null,
    ...overrides,
    updatedAt: new Date("2026-08-27T21:00:00.000Z")
  });
}

describe("official Personal Growth insights and isolated results", () => {
  it("pins the current official Meta contract and keeps every provider lane independently off by default", async () => {
    const [config, foundation] = await Promise.all([loadPersonalGrowthProviderConfig(), loadPersonalGrowthFoundation()]);
    expect(config).toMatchObject({
      auditedAt: "2026-08-26",
      officialSourcesOnly: true,
      meta: {
        graphApiVersion: "v26.0",
        threadsApiVersion: "v1.0",
        instagramProfessionalAccountTypes: ["business", "creator"],
        threadsPermissions: ["threads_basic", "threads_manage_insights"],
        threadsSearchPermission: "threads_keyword_search",
        retentionPolicy: "provider-defined-do-not-assume",
        deprecatedMetricPolicy: "unavailable-never-zero"
      }
    });
    expect(foundation.featureGates).toMatchObject({
      instagramInsights: false,
      threadsInsights: false,
      threadsSearch: false,
      providerLive: false,
      tokenRefresh: false,
      publishing: false
    });
  });

  it("normalizes healthy Instagram and Threads account/post aggregates without identities", async () => {
    const config = await loadPersonalGrowthProviderConfig();
    const adapter = new OfficialMetaPersonalGrowthAdapter(config, liveFlags, transport());
    const instagramAccount = await adapter.collectInstagramAccount({ observedAt: new Date("2026-08-27T21:00:00.000Z") });
    expect(instagramAccount).toMatchObject({ platform: "instagram", scope: "account", apiVersion: "v26.0", droppedItemCount: 1 });
    expect(instagramAccount.metrics).toEqual([
      { name: "reach", value: 120, unavailableReason: null },
      { name: "saves", value: 8, unavailableReason: null }
    ]);
    const threads = await adapter.collectThreadsPost({
      nativePostId: "threads-123",
      nativeUrl: "https://www.threads.net/@owner/post/example",
      publishedAt: new Date("2026-08-26T20:00:00.000Z"),
      observedAt: new Date("2026-08-27T21:00:00.000Z")
    });
    expect(threads).toMatchObject({ platform: "threads", scope: "post", maturityWindow: "24h", credentialMaterialPresent: false, audienceIdentityPresent: false });
    expect(threads.metrics.map(({ name }) => name)).toEqual(["views", "replies", "reposts"]);
    expect(personalGrowthMaturityWindow(new Date("2026-07-01T00:00:00.000Z"), new Date("2026-07-29T00:00:00.000Z"))).toBe("28d");
  });

  it("records permission, token, rate and empty failures as unavailable instead of zero", async () => {
    const config = await loadPersonalGrowthProviderConfig();
    for (const error of ["empty-response", "missing-permission", "expired-token", "rate-limited"] as const) {
      const adapter = new OfficialMetaPersonalGrowthAdapter(config, liveFlags, transport({ read: async () => ({ metrics: [], error }) }));
      const observed = await adapter.collectInstagramAccount({ observedAt: new Date("2026-08-27T21:00:00.000Z") });
      expect(observed).toMatchObject({ metrics: [], unavailableReason: error });
    }
    const held = new OfficialMetaPersonalGrowthAdapter(config, { ...liveFlags, instagramInsights: false }, transport());
    expect(await held.collectInstagramAccount({ observedAt: new Date("2026-08-27T21:00:00.000Z") }))
      .toMatchObject({ metrics: [], unavailableReason: "provider-disabled" });
  });

  it("keeps Threads public search independently gated and bounded to three public results", async () => {
    const config = await loadPersonalGrowthProviderConfig();
    const disabled = new OfficialMetaPersonalGrowthAdapter(config, { ...liveFlags, threadsSearch: false }, transport());
    expect(await disabled.searchThreads({ query: "psaní" })).toEqual({ status: "unavailable", values: [] });
    const enabled = new OfficialMetaPersonalGrowthAdapter(config, liveFlags, transport());
    expect(await enabled.searchThreads({ query: "psaní", observedAt: new Date("2026-08-27T21:00:00.000Z") })).toMatchObject({
      status: "available",
      values: [expect.objectContaining({
        provider: "official-threads-search",
        publicUrl: expect.stringContaining("threads.net"),
        manualReplyOnly: true
      })]
    });
    const malformed = new OfficialMetaPersonalGrowthAdapter(config, liveFlags, transport({
      searchThreads: async () => [{
        publicUrl: "not-public",
        observedAt: "2026-08-27T21:00:00.000Z",
        expiresAt: "2026-08-28T21:00:00.000Z",
        evidenceRefs: ["meta-search:bad"]
      }]
    }));
    expect(await malformed.searchThreads({ query: "psaní", observedAt: new Date("2026-08-27T21:00:00.000Z") }))
      .toEqual({ status: "unavailable", values: [] });
  });

  it("persists post observations append-only and makes retries idempotent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "pg-results-"));
    roots.push(root);
    const initial = result();
    expect(await writeNewPersonalGrowthResult(root, initial)).toMatchObject({ created: true });
    const config = await loadPersonalGrowthProviderConfig();
    const adapter = new OfficialMetaPersonalGrowthAdapter(config, liveFlags, transport());
    const observed = await adapter.collectInstagramMedia({
      nativePostId: initial.nativePostId,
      nativeUrl: initial.url,
      publishedAt: new Date(initial.publishedAt),
      observedAt: new Date("2026-08-27T21:00:00.000Z")
    });
    expect(await appendPersonalGrowthObservation({ root, resultId: initial.resultId, observation: observed }))
      .toMatchObject({ appended: true, result: { provenance: { entryMode: "manual-and-api" } } });
    expect(await appendPersonalGrowthObservation({ root, resultId: initial.resultId, observation: observed }))
      .toMatchObject({ appended: false });
    expect((await readPersonalGrowthResult(root, initial.resultId))?.observations).toHaveLength(1);
  });

  it("keeps manual-only results complete and rejects portfolio, campaign and Kvórum fields", () => {
    const manual = result();
    expect(manual).toMatchObject({ observations: [], provenance: { entryMode: "manual" } });
    for (const poison of [
      { ...manual, kvorumClaimId: "kv-claim-1" },
      { ...manual, automaticPortfolioItemId: "portfolio-item-1" },
      { ...manual, socialDistributionCampaignId: "campaign-1" },
      { ...manual, otherVentureResultRef: "state/ventures/door-money/results/1.json" },
      { ...manual, monetizationTaskRef: "monetization:offer" }
    ]) expect(PersonalGrowthResultSchema.safeParse(poison).success).toBe(false);
  });

  it("requires the complete bounded record for an owner-manual venture result", () => {
    const valid = result({
      contentOrigin: "owner-manual-venture-reference",
      classification: "owner-manual-venture-led",
      manualVentureReference: {
        referenceId: "pg-manual-ref-0123456789abcdef",
        sourceProject: "caught-up",
        publicItemId: "public-123",
        publicUrl: "https://example.com/public-123",
        ownerAuthored: true,
        personalConnectionRecorded: false,
        ownerCommentaryRecorded: true,
        policyCompliantAtRecommendation: true,
        ownerProvenanceRef: "owner-entry:manual-123"
      }
    });
    expect(PersonalGrowthResultSchema.safeParse(valid).success).toBe(true);
    expect(PersonalGrowthResultSchema.safeParse({
      ...valid,
      manualVentureReference: { ...valid.manualVentureReference, ownerProvenanceRef: "" }
    }).success).toBe(false);
    expect(() => result({
      contentOrigin: "owner-manual-venture-reference",
      classification: "owner-manual-venture-led",
      manualVentureReference: { ...valid.manualVentureReference!, sourceProject: "kvorum" }
    })).toThrow();
  });

  it("accepts explicit unavailable metric values only with reasons", () => {
    const base = {
      schemaVersion: "personal-growth-provider-observation/1",
      observationId: "pg-observation-0123456789abcdef",
      idempotencyKey: "a".repeat(64),
      platform: "threads",
      scope: "account",
      ownerAccountAlias: "pg-owner-lukaskouril93",
      nativePostId: null,
      nativeUrl: null,
      observedAt: "2026-08-27T21:00:00.000Z",
      publishedAt: null,
      pragueReportingDate: "2026-08-27",
      apiVersion: "v26.0",
      maturityWindow: null,
      metrics: [{ name: "views", value: null, unavailableReason: "unsupported" }],
      unavailableReason: "none",
      droppedItemCount: 0,
      snapshotHash: "b".repeat(64),
      credentialMaterialPresent: false,
      audienceIdentityPresent: false
    };
    expect(PersonalGrowthProviderObservationSchema.safeParse(base).success).toBe(true);
    expect(PersonalGrowthProviderObservationSchema.safeParse({
      ...base, metrics: [{ name: "views", value: null, unavailableReason: null }]
    }).success).toBe(false);
  });
});
