import { describe, expect, it } from "vitest";
import type { VentureOperationHealth } from "../src/contracts/venture-operations.js";
import {
  acquireSharedResourceLease,
  buildCapacitySnapshot,
  createEfficiencyObservation,
  planOperationsCapacity,
  type DueOperation
} from "../src/operations/capacity.js";

const A = "a".repeat(64);
const B = "b".repeat(64);

function health(nodeId: string, state: VentureOperationHealth["state"] = "healthy"): VentureOperationHealth {
  return {
    schemaVersion: "venture-operation-health/1",
    nodeId,
    displayName: nodeId,
    policyVersion: "1.0.0",
    generatedAt: "2026-08-26T09:00:00.000Z",
    observedAt: "2026-08-26T09:00:00.000Z",
    lifecycleStage: "operating",
    state,
    reason: "fixture health",
    lastAttemptedAt: "2026-08-26T09:00:00.000Z",
    lastValidAt: "2026-08-26T09:00:00.000Z",
    lastSuccessfulAt: "2026-08-26T09:00:00.000Z",
    lastNonEmptyAt: "2026-08-26T09:00:00.000Z",
    lastExternallyVerifiedAt: null,
    nextExpectedAt: null,
    dueWindow: null,
    latenessMinutes: 0,
    rollingOutcomes: { considered: 1, satisfying: 1, failed: 0, quiet: 0, held: 0, consecutiveFailures: 0 },
    dependencyHealthRefs: [],
    queue: { state: "clear", pending: 0 },
    autonomyEligible: true,
    holds: { budget: [], provider: [], source: [], credential: [], owner: [] },
    freshness: { state: "fresh", ageMinutes: 0, lastKnownGoodRef: null },
    unavailableReasons: [],
    ownerAttentionRefs: [],
    latestRunReceiptRefs: [],
    snapshotHash: A
  };
}

function job(overrides: Partial<DueOperation> = {}): DueOperation {
  return {
    jobId: "caught-up-edition",
    nodeId: "caught-up",
    phase: "edition",
    classification: "mandatory",
    dueAt: "2026-08-26T08:00:00.000Z",
    nextEligibleAt: null,
    fixedOrder: 10,
    expectedCostUsd: 0.1,
    nodeBudgetHeadroomUsd: 1,
    providerIds: ["provider:editorial"],
    writerPaths: ["state/ventures/caught-up/edition.json"],
    inputHash: A,
    configHash: B,
    modelVersion: "model-v1",
    dependencyHealthRefs: [],
    acceptedArtifactRef: null,
    domainDecision: "work",
    externalAction: "none",
    ...overrides
  };
}

function plan(jobs: DueOperation[], overrides: Partial<Parameters<typeof planOperationsCapacity>[0]> = {}) {
  return planOperationsCapacity({
    period: "2026-08-26",
    generatedAt: "2026-08-26T09:00:00.000Z",
    jobs,
    healthByNode: new Map([
      ["caught-up", health("caught-up")],
      ["mma-files", health("mma-files")],
      ["goviral", health("goviral")]
    ]),
    budget: { maximumUsd: 1, spentUsd: 0 },
    providerHeadroom: { "provider:editorial": 2, "provider:social": 1 },
    activeLeases: [],
    deployment: { guardActive: true, releaseReady: true, evidenceRef: "scripts/deploy/check.mjs" },
    ...overrides
  });
}

describe("operations capacity coordination", () => {
  it("orders mandatory work first and defers a colliding optional job without changing scheduler authority", () => {
    const mandatory = job();
    const optional = job({
      jobId: "mma-social",
      nodeId: "mma-files",
      classification: "optional",
      fixedOrder: 1,
      writerPaths: ["state/ventures/caught-up/edition.json"],
      providerIds: ["provider:social"]
    });
    const result = plan([optional, mandatory]);
    expect(result.selectedExecutionOrder).toEqual([mandatory.jobId]);
    expect(result.jobs.find((candidate) => candidate.jobId === optional.jobId)?.decision).toBe("deferred");
    expect(result.collisionGroups).toEqual([{
      resourceKey: "state/ventures/caught-up/edition.json",
      jobIds: ["caught-up-edition", "mma-social"]
    }]);
  });

  it("reuses exact accepted artifacts and never schedules deployment", () => {
    const result = plan([
      job({ acceptedArtifactRef: "state/ventures/caught-up/accepted/edition.json" }),
      job({
        jobId: "release",
        phase: "release",
        expectedCostUsd: 0,
        providerIds: [],
        writerPaths: [],
        inputHash: B,
        externalAction: "deployment"
      })
    ]);
    expect(result.jobs.find((candidate) => candidate.jobId === "caught-up-edition")?.decision).toBe("reuse");
    expect(result.jobs.find((candidate) => candidate.jobId === "release")?.decision).toBe("held");
    expect(result.deployment).toMatchObject({ guardActive: true, scheduled: false });
  });

  it("never reuses an accepted artifact across venture boundaries and respects numeric provider headroom", () => {
    const accepted = job({ acceptedArtifactRef: "state/ventures/caught-up/accepted/edition.json" });
    const other = job({
      jobId: "mma-edition",
      nodeId: "mma-files",
      writerPaths: ["state/ventures/mma-files/edition.json"]
    });
    const result = plan([accepted, other]);
    expect(result.jobs.find((candidate) => candidate.jobId === accepted.jobId)?.decision).toBe("reuse");
    expect(result.jobs.find((candidate) => candidate.jobId === other.jobId)?.decision).toBe("run");
  });

  it("degrades within existing provider and budget envelopes without borrowing", () => {
    const mandatory = job({ expectedCostUsd: 0.8 });
    const optional = job({
      jobId: "goviral-overlay",
      nodeId: "goviral",
      classification: "optional",
      expectedCostUsd: 0.3,
      providerIds: ["provider:social"],
      writerPaths: ["state/ventures/goviral/overlay.json"]
    });
    const result = plan([optional, mandatory], { budget: { maximumUsd: 1, spentUsd: 0 } });
    expect(result.jobs.find((candidate) => candidate.jobId === mandatory.jobId)?.decision).toBe("run");
    expect(result.jobs.find((candidate) => candidate.jobId === optional.jobId)?.decision).toBe("deferred");
    expect(result.budget.reservedUsd).toBe(0.8);
    expect(result.budget.maximumUsd).toBe(1);

    const providerHeld = plan([mandatory], { providerHeadroom: { "provider:editorial": 0 } });
    expect(providerHeld.jobs[0]?.decision).toBe("held");

    const nodeHeld = plan([job({ expectedCostUsd: 0.2, nodeBudgetHeadroomUsd: 0.1 })]);
    expect(nodeHeld.jobs[0]?.decision).toBe("held");
  });

  it("honors domain NO_WORK without manufacturing agenda or spending capacity", () => {
    const result = plan([job({ domainDecision: "no-work" })]);
    expect(result.jobs[0]?.decision).toBe("skipped");
    expect(result.budget.reservedUsd).toBe(0);
    expect(result.counts.skipped).toBe(1);
  });

  it("holds stale or unavailable work and leaves private content outside the plan", () => {
    const privateJob = job({ nodeId: "door-money", jobId: "door-money-private" });
    const result = plan([privateJob], {
      healthByNode: new Map([["door-money", health("door-money", "stale")]])
    });
    expect(result.jobs[0]?.decision).toBe("held");
    expect(JSON.stringify(result)).not.toContain("manuscript");
    expect(JSON.stringify(result)).not.toContain("monetization");
  });

  it("acquires expiring idempotent leases without granting authority or the deployment gate", () => {
    const request = {
      existing: [],
      resourceType: "writer-path" as const,
      resourceKey: "state/ventures/caught-up/edition.json",
      holderNodeId: "caught-up",
      holderJobId: "caught-up-edition",
      idempotencyKey: "caught-up:2026-08-26",
      acquiredAt: "2026-08-26T09:00:00.000Z",
      ttlSeconds: 600
    };
    const acquired = acquireSharedResourceLease(request);
    expect(acquired.decision).toBe("acquired");
    expect(acquired.lease).toMatchObject({ authorityGranted: false, contentAccessGranted: false, spendAuthorized: false });
    expect(acquireSharedResourceLease({ ...request, existing: [acquired.lease] }).decision).toBe("replayed");
    expect(acquireSharedResourceLease({
      ...request,
      existing: [acquired.lease],
      holderJobId: "different-job",
      idempotencyKey: "different"
    }).decision).toBe("held");
    expect(acquireSharedResourceLease({ ...request, resourceType: "deployment-gate" }).decision).toBe("held");
  });

  it("summarizes measured reuse, duplicate prevention and actual cost for Admin", () => {
    const capacityPlan = plan([job({ acceptedArtifactRef: "state/ventures/caught-up/accepted/edition.json" })]);
    const observation = createEfficiencyObservation({
      schemaVersion: "operations-efficiency-observation/1",
      observationId: "caught-up.2026-08-26",
      nodeId: "caught-up",
      phase: "edition",
      jobId: "caught-up-edition",
      inputHash: A,
      configHash: B,
      modelVersion: "model-v1",
      cacheResult: "hit",
      artifactsReused: 1,
      providerCallsAvoided: 1,
      providerCallsMade: 0,
      modelCallsAvoided: 1,
      modelCallsMade: 0,
      duplicateRunPrevented: true,
      bytesProcessed: null,
      recordsProcessed: 1,
      durationMs: 5,
      actualCostUsd: 0,
      validityRef: "state/ventures/caught-up/accepted/edition.json",
      noOptimizationReason: null,
      source: "cache",
      observedAt: "2026-08-26T09:00:00.000Z"
    });
    const snapshot = buildCapacitySnapshot({
      plan: capacityPlan,
      observations: [observation],
      generatedAt: "2026-08-26T09:01:00.000Z",
      freshness: "fresh"
    });
    expect(snapshot).toMatchObject({ artifactsReused: 2, duplicateRunsPrevented: 1, providerCallsAvoided: 1, actualCostUsd: 0 });
  });
});
