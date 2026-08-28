import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SocialDistributionExperimentRegisterSchema, type SocialDistributionExperiment } from "../src/contracts/social-results.js";
import {
  assertSocialExperimentRegisterUpdate,
  buildSocialDistributionBaseline,
  createHeldBoostProposal,
  evaluateSocialDistributionExperiment,
  loadSocialResultsPolicy
} from "../src/social/experiments.js";
import { createSocialMetricObservation } from "../src/social/results.js";

async function fixture() {
  return JSON.parse(await readFile(path.resolve(process.cwd(), "../contracts/fixtures/social-results-contracts.valid.json"), "utf8")) as { observation: unknown; experiment: SocialDistributionExperiment };
}

describe("Social Distribution baseline, experiments and held boost proposals", () => {
  it("collects honestly until the complete 28-day organic baseline", async () => {
    const { observation } = await fixture();
    const collecting = buildSocialDistributionBaseline({ startsOn: "2026-08-01", evaluatedAt: new Date("2026-08-20T12:00:00.000Z"), observations: [observation, { malformed: true }], attributions: [] });
    expect(collecting).toMatchObject({ status: "collecting", elapsedDays: 19, acceptedObservationCount: 1, droppedObservationCount: 1, metricsAvailable: false });
    const complete = buildSocialDistributionBaseline({ startsOn: "2026-08-01", evaluatedAt: new Date("2026-08-29T12:00:00.000Z"), observations: [observation], attributions: [] });
    expect(complete).toMatchObject({ status: "complete", elapsedDays: 28, ownerDecisionRequired: true, authorityGranted: false });
  });

  it("requires a complete baseline, freezes started fields and preserves append-only evidence", async () => {
    const { experiment } = await fixture();
    const complete = buildSocialDistributionBaseline({ startsOn: "2026-08-01", evaluatedAt: new Date("2026-08-29T12:00:00.000Z"), observations: [], attributions: [] });
    const active = { ...experiment, status: "active" as const, baselineRef: `state/social/results/baselines/${complete.id}.json` };
    const previous = SocialDistributionExperimentRegisterSchema.parse({ schemaVersion: "social-distribution-experiment-register/1", experiments: [{ ...active, status: "proposed" }], updatedAt: "2026-08-29T12:00:00.000Z", authorityGranted: false });
    const next = SocialDistributionExperimentRegisterSchema.parse({ ...previous, experiments: [active], updatedAt: "2026-08-29T13:00:00.000Z" });
    expect(assertSocialExperimentRegisterUpdate({ previous, next, baselines: [complete] }).experiments[0]?.status).toBe("active");
    const rewritten = SocialDistributionExperimentRegisterSchema.parse({ ...next, experiments: [{ ...active, minimumSample: active.minimumSample + 1 }], updatedAt: "2026-08-29T14:00:00.000Z" });
    expect(() => assertSocialExperimentRegisterUpdate({ previous: next, next: rewritten, baselines: [complete] })).toThrow(/immutable/u);
    expect(() => assertSocialExperimentRegisterUpdate({ previous, next, baselines: [] })).toThrow(/28-day baseline/u);
  });

  it("returns INSUFFICIENT_DATA until the preregistered measured sample exists", async () => {
    const { experiment, observation } = await fixture();
    expect(evaluateSocialDistributionExperiment({ experiment, observations: [observation], proposedVerdict: "KEEP" })).toMatchObject({ verdict: "INSUFFICIENT_DATA", evidenceObservationRefs: [] });
    const { schemaVersion: _schemaVersion, id: _id, idempotencyHash: _idempotencyHash, snapshotHash: _snapshotHash, audienceIdentityExcluded: _audienceIdentityExcluded, privateMessageExcluded: _privateMessageExcluded, rawProviderPayloadExcluded: _rawProviderPayloadExcluded, authorityGranted: _authorityGranted, ...base } = observation as Parameters<typeof createSocialMetricObservation>[0] & Record<string, unknown>;
    const measured = ["2026-08-27T09:00:00.000Z", "2026-08-27T10:00:00.000Z"].map((observedAt) => createSocialMetricObservation({ ...base, observedAt, metrics: [{ name: "qualified_actions", value: 2, unavailableReason: null }], unavailableReason: null }));
    expect(evaluateSocialDistributionExperiment({ experiment: { ...experiment, minimumSample: 2 }, observations: measured, proposedVerdict: "KEEP" }).verdict).toBe("KEEP");
  });

  it("creates only a held owner proposal after the versioned organic threshold", async () => {
    const policy = await loadSocialResultsPolicy();
    const baseline = buildSocialDistributionBaseline({ startsOn: "2026-08-01", evaluatedAt: new Date("2026-08-29T12:00:00.000Z"), observations: [], attributions: [] });
    const proposal = createHeldBoostProposal({ policy, baseline, contentRef: "state/social/posts/example.json", destinationRef: "https://example.com/release", metric: "qualified_actions", observedValue: 4, observationRefs: ["state/social/results/observations/a.json", "state/social/results/observations/b.json"], contentChecksPassed: true, destinationChecksPassed: true, budgetAuthorityRef: "state/BUDGETS.md", proposedAt: new Date("2026-08-29T12:00:00.000Z") });
    expect(proposal).toMatchObject({ status: "held-owner-proposal", ownerDecisionRequired: true, adApiCalled: false, purchaseAuthorized: false, spendAuthorized: false, publishingAuthorized: false });
    expect(() => createHeldBoostProposal({ policy, baseline, contentRef: "state/social/posts/example.json", destinationRef: "https://example.com/release", metric: "qualified_actions", observedValue: 2, observationRefs: ["a", "b"], contentChecksPassed: true, destinationChecksPassed: true, budgetAuthorityRef: "state/BUDGETS.md", proposedAt: new Date() })).toThrow(/threshold/u);
  });
});
