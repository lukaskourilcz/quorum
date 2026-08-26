import { describe, expect, it } from "vitest";
import {
  PersonalGrowthExperimentRegisterSchema,
  PersonalGrowthExperimentSchema,
  type PersonalGrowthExperiment
} from "../src/contracts/personal-growth-analysis.js";
import { PersonalGrowthResultSchema, type PersonalGrowthResult } from "../src/contracts/personal-growth-results.js";
import { configRoot, stateRoot } from "../src/paths.js";
import { loadCurrentKpiSet } from "../src/metrics/quarterly-collector.js";
import {
  assertPersonalGrowthExperimentRegisterUpdate,
  buildPersonalGrowthBaseline,
  buildPersonalGrowthFeedback,
  collectPersonalGrowthOperationalMeasurements,
  evaluatePersonalGrowthExperiment,
  readPersonalGrowthExperimentRegister
} from "../src/ventures/personal-growth/analytics.js";
import { evaluatePersonalGrowthBufferQueue } from "../src/ventures/personal-growth/buffer.js";
import { loadPersonalGrowthFoundation } from "../src/ventures/personal-growth/foundation.js";
import { loadPersonalGrowthProviderConfig } from "../src/ventures/personal-growth/providers.js";
import { createPersonalGrowthResult } from "../src/ventures/personal-growth/results.js";

function measuredResult(input: {
  nativePostId: string;
  reach: number | null;
  origin?: PersonalGrowthResult["contentOrigin"];
  experimentId?: string | null;
  rating?: number | null;
}) {
  const origin = input.origin ?? "owner-current-life";
  const result = createPersonalGrowthResult({
    platform: "instagram",
    nativePostId: input.nativePostId,
    url: `https://www.instagram.com/p/${input.nativePostId}/`,
    publishedAt: "2026-08-10T20:00:00.000Z",
    format: "photo",
    language: "cs",
    personalPillar: "life-lifestyle",
    contentOrigin: origin,
    collaborator: null,
    publicationRelation: null,
    reelSeries: null,
    goviralSignalId: origin === "goviral-assisted" ? "pg-gv-0123456789abcdef" : null,
    manualVentureReference: null,
    experimentId: input.experimentId ?? null,
    classification: "personal-or-personally-authored",
    provenance: {
      entryMode: "manual",
      ownerEvidenceRefs: [`owner-result:${input.nativePostId}`],
      automaticPortfolioLookup: false,
      socialDistributionCampaignRef: null,
      monetizationRef: null
    },
    ownerRating: input.rating ?? null,
    ownerNote: null,
    updatedAt: new Date("2026-08-11T20:00:00.000Z")
  });
  return PersonalGrowthResultSchema.parse({
    ...result,
    provenance: { ...result.provenance, entryMode: "manual-and-api" },
    observations: [{
      schemaVersion: "personal-growth-provider-observation/1",
      observationId: `pg-observation-${input.nativePostId.padEnd(16, "0").slice(0, 16)}`,
      idempotencyKey: input.nativePostId.padEnd(64, "a").slice(0, 64),
      platform: "instagram",
      scope: "post",
      ownerAccountAlias: "pg-owner-lukaskouril93",
      nativePostId: input.nativePostId,
      nativeUrl: result.url,
      observedAt: "2026-08-11T20:00:00.000Z",
      publishedAt: result.publishedAt,
      pragueReportingDate: "2026-08-11",
      apiVersion: "v26.0",
      maturityWindow: "24h",
      metrics: [{
        name: "reach",
        value: input.reach,
        unavailableReason: input.reach === null ? "not-returned" : null
      }],
      unavailableReason: "none",
      droppedItemCount: 0,
      snapshotHash: input.nativePostId.padEnd(64, "b").slice(0, 64),
      credentialMaterialPresent: false,
      audienceIdentityPresent: false
    }]
  });
}

function experiment(overrides: Partial<PersonalGrowthExperiment> = {}): PersonalGrowthExperiment {
  return PersonalGrowthExperimentSchema.parse({
    schemaVersion: "personal-growth-experiment/1",
    id: "pg-exp-photo-format",
    status: "active",
    hypothesis: "A photo dump produces more saves than one photo.",
    changedVariable: "photo-format",
    platform: "instagram",
    format: "photo",
    primaryMetric: "reach",
    secondaryGuardrail: "No policy or privacy violation.",
    startDate: "2026-08-03",
    minimumSample: 3,
    evaluationWindowDays: 28,
    stopCondition: "Stop on any policy violation.",
    evidenceResultIds: [],
    verdict: "INSUFFICIENT_DATA",
    maxCostUsd: 0,
    publishingAuthorized: false,
    ...overrides
  });
}

describe("Personal Growth baseline, KPIs, experiments and Buffer seam", () => {
  it("builds a partial 28-day baseline with honest unavailable values and median outlier resistance", () => {
    const baseline = buildPersonalGrowthBaseline({
      startsOn: "2026-08-03",
      evaluatedAt: new Date("2026-08-20T12:00:00.000Z"),
      results: [
        measuredResult({ nativePostId: "0000000000000001", reach: 10 }),
        measuredResult({ nativePostId: "0000000000000002", reach: 12 }),
        measuredResult({ nativePostId: "0000000000000003", reach: 1000 }),
        measuredResult({ nativePostId: "0000000000000004", reach: null, origin: "goviral-assisted" }),
        { malformed: true }
      ]
    });
    expect(baseline).toMatchObject({ status: "collecting", elapsedDays: 18, acceptedResultCount: 4, droppedResultCount: 1 });
    const ordinary = baseline.segments.find(({ originClass }) => originClass === "ordinary-personal")!;
    expect(ordinary.metrics.find(({ metric }) => metric === "reach")).toMatchObject({ median: 12, sampleSize: 3 });
    const assisted = baseline.segments.find(({ originClass }) => originClass === "goviral-assisted")!;
    expect(assisted.metrics.find(({ metric }) => metric === "reach")).toMatchObject({ median: null, sampleSize: 0, unavailableCount: 1 });
  });

  it("requests owner targets only after day 28 and never activates a number", () => {
    expect(buildPersonalGrowthBaseline({
      startsOn: "2026-08-03", evaluatedAt: new Date("2026-08-31T12:00:00.000Z"), results: []
    })).toMatchObject({
      status: "proposal-due",
      targetProposal: { required: true, ownerDecisionRequired: true, activatedTargets: 0 }
    });
  });

  it("limits live experiments to two and forces INSUFFICIENT_DATA below the preregistered sample", () => {
    const active = experiment();
    const first = measuredResult({ nativePostId: "0000000000000011", reach: 30, experimentId: active.id });
    const second = measuredResult({ nativePostId: "0000000000000012", reach: 40, experimentId: active.id });
    expect(evaluatePersonalGrowthExperiment({ experiment: active, results: [first, second], proposedVerdict: "KEEP" }))
      .toMatchObject({ verdict: "INSUFFICIENT_DATA", evidenceResultIds: [first.resultId, second.resultId].sort() });
    const third = measuredResult({ nativePostId: "0000000000000013", reach: 50, experimentId: active.id });
    expect(evaluatePersonalGrowthExperiment({ experiment: active, results: [first, second, third], proposedVerdict: "KEEP" }).verdict).toBe("KEEP");
    expect(PersonalGrowthExperimentRegisterSchema.safeParse({
      schemaVersion: "personal-growth-experiment-register/1",
      ventureId: "personal-growth",
      experiments: [active, experiment({ id: "pg-exp-language" }), experiment({ id: "pg-exp-timing" })],
      updatedAt: "2026-08-27T21:00:00.000Z"
    }).success).toBe(false);
  });

  it("seeds two zero-cost backlog experiments without activating either one", async () => {
    const register = await readPersonalGrowthExperimentRegister(stateRoot);
    expect(register.experiments).toHaveLength(2);
    expect(register.experiments.every(({ status, verdict, maxCostUsd, publishingAuthorized }) =>
      status === "backlog" && verdict === "INSUFFICIENT_DATA" && maxCostUsd === 0 && !publishingAuthorized)).toBe(true);
  });

  it("freezes a started experiment and appends result evidence", () => {
    const before = {
      schemaVersion: "personal-growth-experiment-register/1" as const,
      ventureId: "personal-growth" as const,
      experiments: [experiment()],
      updatedAt: "2026-08-27T21:00:00.000Z"
    };
    const next = structuredClone(before);
    next.experiments[0]!.evidenceResultIds.push("pg-result-0123456789abcdef");
    next.updatedAt = "2026-08-28T21:00:00.000Z";
    expect(assertPersonalGrowthExperimentRegisterUpdate(before, next).experiments[0]?.evidenceResultIds).toHaveLength(1);
    const rewritten = structuredClone(next);
    rewritten.experiments[0]!.minimumSample = 2;
    expect(() => assertPersonalGrowthExperimentRegisterUpdate(next, rewritten)).toThrow(/immutable/u);
  });

  it("feeds only bounded aggregate owner evidence back into Personal Growth", () => {
    const feedback = buildPersonalGrowthFeedback([
      measuredResult({ nativePostId: "0000000000000021", reach: 20, rating: 4 }),
      measuredResult({ nativePostId: "0000000000000022", reach: 22, rating: 5 })
    ], new Date("2026-08-27T21:00:00.000Z"));
    expect(feedback).toMatchObject({ mutatesEvidence: false, weakensPolicy: false, externalDestinations: [] });
    expect(JSON.stringify(feedback)).not.toMatch(/kvorum|social-distribution|monetization/iu);
  });

  it("registers operational KPIs in the existing quarterly evaluator", async () => {
    const set = await loadCurrentKpiSet(configRoot, new Date("2026-08-26T12:00:00.000Z"));
    const personal = set.kpis.filter(({ venture }) => venture === "personal-growth");
    expect(personal).toHaveLength(12);
    expect(personal.map(({ metric_source }) => metric_source)).toContain(
      "state/ventures/personal-growth/recommendations#manual_venture_policy_violation_count"
    );
    expect(personal.map(({ metric_source }) => metric_source)).toContain("state/ventures/personal-growth/results#unavailable_honesty_rate");
    const measurements = collectPersonalGrowthOperationalMeasurements({
      briefs: [], threadsPackets: [], instagramRecommendations: [],
      results: [measuredResult({ nativePostId: "0000000000000031", reach: null })],
      historyEvents: []
    });
    expect(measurements["state/ventures/personal-growth/results#unavailable_honesty_rate"]).toBe(1);
    expect(measurements["state/ventures/personal-growth/results#isolation_violation_count"]).toBe(0);
    expect(measurements["state/ventures/personal-growth/recommendations#manual_venture_policy_violation_count"]).toBe(0);
    const violation = collectPersonalGrowthOperationalMeasurements({
      briefs: [], threadsPackets: [],
      instagramRecommendations: [{ actionType: "owner-manual-venture-reshare", manualVentureReferenceId: null }],
      results: [], historyEvents: []
    });
    expect(violation["state/ventures/personal-growth/recommendations#policy_violation_count"]).toBe(1);
    expect(violation["state/ventures/personal-growth/recommendations#manual_venture_policy_violation_count"]).toBe(1);
  });

  it("keeps the audited Buffer adapter disabled without purchase, queueing or data loss", async () => {
    const [config, foundation] = await Promise.all([loadPersonalGrowthProviderConfig(), loadPersonalGrowthFoundation()]);
    expect(evaluatePersonalGrowthBufferQueue({ config, foundation, recommendation: null, ownerApproved: false })).toEqual({
      schemaVersion: "personal-growth-buffer-result/1",
      status: "unavailable",
      reason: "adapter-disabled",
      externalRequestMade: false,
      purchaseMade: false,
      recommendationPreserved: true
    });
    expect(config.buffer).toMatchObject({ adapterEnabled: false, purchaseAuthorized: false, publishingAuthorized: false, planAssumption: "none" });
  });
});
