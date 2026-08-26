import { describe, expect, it, vi } from "vitest";
import type { OwnerAttention } from "../src/contracts/owner-attention.js";
import type { VentureOperationHealth } from "../src/contracts/venture-operations.js";
import type { VentureRecoveryAttempt } from "../src/contracts/venture-recovery.js";
import { configRoot } from "../src/paths.js";
import {
  buildIncidentSnapshot,
  evaluateRecovery,
  upsertOperationalIncident,
  type RecoveryRequest
} from "../src/operations/recovery.js";
import {
  buildVentureRecoveryPolicyRegistry,
  loadOperationsRecoveryRegistry
} from "../src/operations/recovery-policies.js";
import { loadVentureCapabilityMap } from "../src/ventures/capabilities.js";

const HASH = "a".repeat(64);

function health(nodeId = "caught-up", state: VentureOperationHealth["state"] = "failing"): VentureOperationHealth {
  return {
    schemaVersion: "venture-operation-health/1",
    nodeId,
    displayName: nodeId,
    policyVersion: "1.0.0",
    generatedAt: "2026-08-26T09:00:00.000Z",
    observedAt: "2026-08-26T09:00:00.000Z",
    lifecycleStage: "operating",
    state,
    reason: "recovery fixture",
    lastAttemptedAt: "2026-08-26T09:00:00.000Z",
    lastValidAt: "2026-08-26T09:00:00.000Z",
    lastSuccessfulAt: null,
    lastNonEmptyAt: null,
    lastExternallyVerifiedAt: null,
    nextExpectedAt: null,
    dueWindow: null,
    latenessMinutes: 0,
    rollingOutcomes: { considered: 3, satisfying: 0, failed: 3, quiet: 0, held: 0, consecutiveFailures: 3 },
    dependencyHealthRefs: [],
    queue: { state: "clear", pending: 0 },
    autonomyEligible: false,
    holds: { budget: [], provider: [], source: [], credential: [], owner: [] },
    freshness: { state: "fresh", ageMinutes: 0, lastKnownGoodRef: null },
    unavailableReasons: [],
    ownerAttentionRefs: [],
    latestRunReceiptRefs: [],
    snapshotHash: HASH
  };
}

function request(overrides: Partial<RecoveryRequest> = {}): RecoveryRequest {
  return {
    attemptId: "attempt-caught-up-2026-08-26",
    idempotencyKey: "caught-up:delivery:2026-08-26",
    nodeId: "caught-up",
    phase: "routine",
    jobId: "caught-up-delivery",
    itemRef: "state/ventures/caught-up/delivery/item.json",
    affectedScope: "Caught Up delivery item",
    unaffectedScope: "All other ventures and Caught Up editorial preparation continue.",
    conditionKey: "caught-up.delivery.missing-receipt",
    action: "reconcile-ambiguous",
    mode: "live",
    health: health(),
    triggerHealthRef: "state/operations/health/caught-up/current.json",
    triggerSloRef: "config/operations-nodes.json#caught-up",
    evidenceRefs: ["state/operations/health/caught-up/current.json"],
    beforeStateHash: HASH,
    expectedSafeOutcome: "Reconcile the same immutable delivery without sending twice.",
    now: "2026-08-26T09:00:00.000Z",
    previousAttempts: [],
    ambiguousExistingWork: true,
    leaseGranted: true,
    transientConditionCleared: false,
    currentAuthorityPresent: true,
    activeKillSwitches: new Set(),
    incrementalCostUsd: 0,
    exactOwnerAction: "Verify the existing delivery in the provider dashboard.",
    impact: "One delivery remains unverified.",
    retryCondition: "Retry only after delivery absence is confirmed.",
    ...overrides
  };
}

async function policies() {
  const [registry, capabilityMap] = await Promise.all([
    loadOperationsRecoveryRegistry(configRoot),
    loadVentureCapabilityMap(configRoot)
  ]);
  return buildVentureRecoveryPolicyRegistry(registry, capabilityMap);
}

describe("isolated operations recovery", () => {
  it("registers one exact $0 policy for every capability node", async () => {
    const [registry, capabilityMap] = await Promise.all([
      loadOperationsRecoveryRegistry(configRoot),
      loadVentureCapabilityMap(configRoot)
    ]);
    const resolved = buildVentureRecoveryPolicyRegistry(registry, capabilityMap);
    expect(resolved.policies).toHaveLength(capabilityMap.nodes.length);
    expect(resolved.policies.every((policy) => policy.maximumIncrementalCostUsd === 0)).toBe(true);
    expect(resolved.policies.every((policy) => policy.prohibitedActions.includes("deployment"))).toBe(true);
    expect(resolved.policies.find((policy) => policy.nodeId === "webdev-signal")?.maximumAttempts).toBe(0);
  });

  it("reconciles an ambiguous result once through the owning primitive", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const execute = vi.fn(async () => ({
      result: "recovered" as const,
      endedAt: "2026-08-26T09:01:00.000Z",
      afterStateRef: "state/ventures/caught-up/delivery/reconciled.json",
      receiptRefs: ["state/ventures/caught-up/delivery/receipt.json"],
      error: null,
      nextEligibleAt: null
    }));
    const result = await evaluateRecovery({ request: request(), policy, execute });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith("reconcile-ambiguous");
    expect(result.attempt).toMatchObject({ result: "recovered", actualCostUsd: 0, ownerAttentionRef: null });
  });

  it("requires reconciliation before replay and respects exact kill switches and leases", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const execute = vi.fn();
    const replay = await evaluateRecovery({ request: request({ action: "replay-idempotent-job" }), policy, execute });
    expect(replay.reason).toContain("reconcile");
    expect(execute).not.toHaveBeenCalled();
    const killed = await evaluateRecovery({
      request: request({ activeKillSwitches: new Set(["BOARDLESSAI_RECOVERY_KILL"]) }),
      policy,
      execute
    });
    expect(killed.reason).toContain("kill switch");
    const unlocked = await evaluateRecovery({ request: request({ leaseGranted: false }), policy, execute });
    expect(unlocked.reason).toContain("lease");
  });

  it("does not execute the same idempotent attempt twice and enforces the policy cooldown", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const first = await evaluateRecovery({
      request: request(),
      policy,
      execute: async () => ({
        result: "failed",
        endedAt: "2026-08-26T09:01:00.000Z",
        afterStateRef: null,
        receiptRefs: [],
        error: "transient",
        nextEligibleAt: null
      })
    });
    const execute = vi.fn();
    const duplicate = await evaluateRecovery({
      request: request({ previousAttempts: [first.attempt] }),
      policy,
      execute
    });
    expect(duplicate.reason).toContain("already recorded");
    const cooldown = await evaluateRecovery({
      request: request({
        idempotencyKey: "caught-up:delivery:second",
        now: "2026-08-26T09:10:00.000Z",
        previousAttempts: [first.attempt]
      }),
      policy,
      execute
    });
    expect(cooldown.reason).toContain("cooldown");
    expect(execute).not.toHaveBeenCalled();
  });

  it("turns a credential setup hold into one exact owner incident without executing", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const setup = health("caught-up", "setup-needed");
    setup.holds.credential = ["Provider credential is missing."];
    const execute = vi.fn();
    const result = await evaluateRecovery({ request: request({ health: setup }), policy, execute });
    expect(result.decision).toBe("held");
    expect(result.ownerIncident?.conditionKey).toBe("caught-up.delivery.missing-receipt");
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects deployment, spend and non-authorised content-style recovery", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const execute = vi.fn();
    const deployment = await evaluateRecovery({ request: request({ action: "deployment" }), policy, execute });
    expect(deployment.decision).toBe("rejected");
    const spend = await evaluateRecovery({ request: request({ incrementalCostUsd: 0.01 }), policy, execute });
    expect(spend.decision).toBe("rejected");
    expect(spend.ownerIncident?.exactOwnerAction).toContain("provider dashboard");
    const designPolicy = (await policies()).policies.find((candidate) => candidate.nodeId === "design-lab")!;
    const replay = await evaluateRecovery({
      request: request({
        nodeId: "design-lab",
        health: health("design-lab"),
        action: "replay-idempotent-job",
        ambiguousExistingWork: false
      }),
      policy: designPolicy,
      execute
    });
    expect(replay.decision).toBe("rejected");
    expect(execute).not.toHaveBeenCalled();
  });

  it("automatically resumes only an explicitly cleared transient scheduler condition", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "scheduler-service")!;
    const execute = vi.fn(async () => ({
      result: "recovered" as const,
      endedAt: "2026-08-26T09:00:01.000Z",
      afterStateRef: "state/operations/scheduler/resumed.json",
      receiptRefs: [],
      error: null,
      nextEligibleAt: null
    }));
    const base = request({
      nodeId: "scheduler-service",
      health: health("scheduler-service", "degraded"),
      action: "resume-transient",
      ambiguousExistingWork: false
    });
    expect((await evaluateRecovery({ request: base, policy, execute })).decision).toBe("held");
    const resumed = await evaluateRecovery({
      request: { ...base, transientConditionCleared: true, currentAuthorityPresent: true },
      policy,
      execute
    });
    expect(resumed.attempt?.result).toBe("recovered");
  });

  it("delegates stale-lock recovery to the scheduler primitive and never executes dry evaluation", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "scheduler-service")!;
    const execute = vi.fn(async () => ({
      result: "recovered" as const,
      endedAt: "2026-08-26T09:00:01.000Z",
      afterStateRef: "state/operations/scheduler/lock-released.json",
      receiptRefs: [],
      error: null,
      nextEligibleAt: null
    }));
    const staleLock = request({
      nodeId: "scheduler-service",
      health: health("scheduler-service", "degraded"),
      action: "release-stale-lock",
      ambiguousExistingWork: false
    });
    expect((await evaluateRecovery({ request: staleLock, policy, execute })).attempt?.result).toBe("recovered");
    expect(execute).toHaveBeenCalledOnce();
    const dry = await evaluateRecovery({
      request: { ...staleLock, attemptId: "dry-stale-lock", idempotencyKey: "dry-stale-lock", mode: "dry" },
      policy,
      execute
    });
    expect(dry.attempt).toMatchObject({ mode: "dry", result: "unchanged" });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("stops at the exact attempt limit and escalates without invoking a third recovery", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const baseAttempt = (await evaluateRecovery({
      request: request(),
      policy,
      execute: async () => ({
        result: "failed",
        endedAt: "2026-08-26T09:01:00.000Z",
        afterStateRef: null,
        receiptRefs: [],
        error: "transient",
        nextEligibleAt: null
      })
    })).attempt!;
    const previous = [baseAttempt, {
      ...baseAttempt,
      attemptId: "attempt-caught-up-second",
      idempotencyKey: "caught-up:delivery:second",
      startedAt: "2026-08-26T10:00:00.000Z",
      endedAt: "2026-08-26T10:01:00.000Z"
    }];
    const execute = vi.fn();
    const result = await evaluateRecovery({
      request: request({
        attemptId: "attempt-caught-up-third",
        idempotencyKey: "caught-up:delivery:third",
        now: "2026-08-26T11:00:00.000Z",
        previousAttempts: previous
      }),
      policy,
      execute
    });
    expect(result.reason).toContain("maximum automatic attempts");
    expect(result.ownerIncident).not.toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it("deduplicates operational owner attention by stable condition key", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const result = await evaluateRecovery({
      request: request({ incrementalCostUsd: 1 }),
      policy,
      execute: vi.fn()
    });
    const base: OwnerAttention = {
      schemaVersion: "owner-attention/1",
      generatedAt: "2026-08-26T09:00:00.000Z",
      approvals: [],
      manualTasks: []
    };
    const first = upsertOperationalIncident(base, result.ownerIncident!);
    const second = upsertOperationalIncident(first, {
      ...result.ownerIncident!,
      lastSeenAt: "2026-08-26T10:00:00.000Z",
      evidenceRefs: ["state/operations/recovery/later.json"]
    });
    expect(second.operationalIncidents).toHaveLength(1);
    expect(second.operationalIncidents?.[0]).toMatchObject({
      firstSeenAt: "2026-08-26T09:00:00.000Z",
      lastSeenAt: "2026-08-26T10:00:00.000Z"
    });
    expect(second.operationalIncidents?.[0]?.evidenceRefs).toHaveLength(2);
  });

  it("keeps unrelated nodes unaffected and excludes dry or fixture attempts from statistics", async () => {
    const policy = (await policies()).policies.find((candidate) => candidate.nodeId === "caught-up")!;
    const live = await evaluateRecovery({
      request: request(),
      policy,
      execute: async () => ({
        result: "owner-required",
        endedAt: "2026-08-26T09:01:00.000Z",
        afterStateRef: null,
        receiptRefs: [],
        error: "credential expired",
        nextEligibleAt: null
      })
    });
    const fixture = { ...live.attempt, attemptId: "fixture-attempt", mode: "fixture" } as VentureRecoveryAttempt;
    const snapshot = buildIncidentSnapshot({
      generatedAt: "2026-08-26T09:02:00.000Z",
      attempts: [live.attempt, fixture],
      incidents: [live.ownerIncident!],
      allNodeIds: ["caught-up", "door-money", "kvorum"],
      killSwitchActive: false
    });
    expect(snapshot.statistics.consideredAttempts).toBe(1);
    expect(snapshot.statistics.ownerRequired).toBe(1);
    expect(snapshot.affectedNodeIds).toEqual(["caught-up"]);
    expect(snapshot.unaffectedNodeIds).toEqual(["door-money", "kvorum"]);
    expect(snapshot.statistics.costUsd).toBe(0);
  });
});
