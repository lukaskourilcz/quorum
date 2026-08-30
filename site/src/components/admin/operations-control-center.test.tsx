import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { AdminOperationsSnapshot } from "@/lib/admin-operations";
import { OperationsControlCenter } from "./operations-control-center";

function snapshot(): AdminOperationsSnapshot {
  return {
    state: "partial", generatedAt: "2026-08-26T09:00:00.000Z", snapshotHash: "a".repeat(64), unreadableRecords: 1,
    sourceStates: { registry: "present", capabilities: "present", slos: "present", recovery: "present", health: "present", capacity: "present", incidents: "present", ownerAttention: "present", implementationProgress: "present", deployment: "present" },
    healthCounts: { healthy: 1, quiet: 0, held: 1, degraded: 0, stale: 0, failing: 0, paused: 0, "setup-needed": 0, unavailable: 0 },
    nodes: [
      {
        id: "caught-up", displayName: "Caught Up", classification: "content-venture", lifecycleStage: "operating", cadence: { kind: "daily", windows: ["morning"], timezone: "Europe/Prague" },
        health: "healthy", reason: "Valid evidence.", sloState: "satisfied", freshnessState: "fresh", dueWindow: "morning", rollingOutcomes: { considered: 3, satisfying: 3, failed: 0, quiet: 1, held: 0, consecutiveFailures: 0 }, unavailableReasons: [], slo: { policyVersion: "1.0.0", maximumLatenessMinutes: 60, maximumStalenessMinutes: 120, rollingValidRunTarget: 0.95, recoveryTargetMinutes: 60 },
        lastValidAt: "2026-08-26T09:00:00.000Z", nextExpectedAt: "2026-08-27T09:00:00.000Z", queue: { state: "clear", pending: 0 }, autonomyEligible: true, dependencyNodeIds: [], dependencyHealthRefs: [],
        holds: { budget: 0, provider: 0, source: 0, credential: 0, owner: 0 }, recovery: { maximumAttempts: 2, cooldownMinutes: 30, permittedActions: ["reuse-last-valid"], automaticResume: false },
        ownerAttentionRefs: [], evidenceRefs: ["state/operations/run-receipts/caught-up/example.json"], capability: { authorityRequirement: "decision-and-runtime-gates", privacyClassification: "public", dataActionClasses: ["content"], inboundAllowed: 0, inboundHeld: 0, outboundAllowed: 0, outboundHeld: 0 }, implementation: null, recordState: "present"
      },
      {
        id: "webdev-signal", displayName: "WebDev Signal", classification: "content-venture", lifecycleStage: "planned", cadence: { kind: "held", windows: ["held until adapters land"], timezone: "Europe/Prague" },
        health: "held", reason: "The node is registered but held from live operation.", sloState: "unavailable", freshnessState: "unavailable", dueWindow: "held until adapters land", rollingOutcomes: null, unavailableReasons: ["No live receipt exists."], slo: { policyVersion: "1.0.0", maximumLatenessMinutes: null, maximumStalenessMinutes: null, rollingValidRunTarget: 1, recoveryTargetMinutes: null },
        lastValidAt: null, nextExpectedAt: null, queue: { state: "unavailable", pending: null }, autonomyEligible: null, dependencyNodeIds: ["design-lab"], dependencyHealthRefs: [], holds: null,
        recovery: { maximumAttempts: 0, cooldownMinutes: 30, permittedActions: [], automaticResume: false }, ownerAttentionRefs: [], evidenceRefs: [], capability: { authorityRequirement: "decision-and-runtime-gates", privacyClassification: "internal", dataActionClasses: ["content"], inboundAllowed: 0, inboundHeld: 2, outboundAllowed: 2, outboundHeld: 0 }, implementation: { programId: "webdev-signal", currentItemId: "issue-435", state: "in-progress" }, recordState: "missing"
      }
    ],
    capacity: { state: "present", generatedAt: "2026-08-26T09:00:00.000Z", period: "2026-08-26", budget: { maximumUsd: 1, spentUsd: 0.2, reservedUsd: 0.1, headroomUsd: 0.7 }, counts: { due: 2, running: 1, reused: 0, skipped: 0, held: 1, deferred: 0 }, collisionCount: 0, activeLeaseRefs: [], providerHeadroom: [{ providerId: "provider:test", remaining: 1 }], jobs: [{ id: "caught-up-daily", nodeId: "caught-up", phase: "edition", classification: "mandatory", dueAt: "2026-08-26T08:00:00.000Z", decision: "run", reason: "The owning runner may execute.", expectedCostUsd: 0.1, nodeBudgetHeadroomUsd: 1, providerIds: ["provider:test"], acceptedArtifactRef: null, nextEligibleAt: null }] },
    incidents: { state: "present", generatedAt: "2026-08-26T09:00:00.000Z", activeCount: 1, nextRetryAt: null, recentAttemptRefs: ["state/operations/recovery/attempt-one.json"], pausedScopes: [], exactOwnerActions: ["Verify delivery in the provider dashboard."], affectedNodeIds: ["caught-up"], unaffectedNodeIds: ["webdev-signal"], policyVersions: ["1.0.0"], killSwitchActive: false, statistics: { consideredAttempts: 1, recovered: 0, failed: 1, ambiguous: 0, ownerRequired: 1, meanRecoveryMinutes: null, costUsd: 0 }, records: [{ id: "incident-one", nodeId: "caught-up", affectedScope: "One delivery", unaffectedScope: "All editorial work", impact: "Delivery is unverified.", exactOwnerAction: "Verify delivery in the provider dashboard.", retryCondition: "Retry only after absence is confirmed.", sourcePolicyRef: "config/operations-recovery.json#caught-up:routine", firstSeenAt: "2026-08-26T09:00:00.000Z", lastSeenAt: "2026-08-26T09:00:00.000Z", status: "active", correctionCount: 0, evidenceRefs: [] }] },
    capabilities: { mapVersion: "1.1.0", defaultPosture: "deny", allowed: 1, held: 0, denied: 0, edges: [{ source: "goviral", target: "caught-up", capability: "intelligence-read", dataSchemaVersion: "goviral-intelligence-packet/1", decision: "allowed", reason: "Only bounded intelligence crosses this edge.", governingReference: "GitHub #424", runtimeEnforcementPoint: "orchestrator/src/ventures/capabilities.ts", testProbeReference: "orchestrator/tests/venture-capability.test.ts" }], isolationRules: [{ id: "private-boundary", reason: "Private data stays within its owning venture.", governingReference: "GitHub #424" }] },
    implementation: { state: "present", generatedAt: "2026-08-26T09:00:00.000Z", sourceFreshness: "fresh", programs: 6, mandatoryCompleted: 20, mandatoryTotal: 60, ownerActions: 2, evidenceRisks: 1, unreadableItems: 0, currentProgramId: "autonomous-operations", currentItemId: "issue-428", currentItemState: "in-progress", finalGateReady: false, nextUnblockedItemIds: ["issue-429"], ownerWaitingItemIds: [] },
    deployment: { state: "present", gitDeploymentEnabled: false, scheduledByOperations: false, posture: "Git-triggered deployment is disabled; Operations never deploys.", evidenceRef: "site/vercel.json" },
    monetizationPosture: "information-only"
  };
}

describe("OperationsControlCenter", () => {
  it("renders portfolio health and the information-only guardrails", () => {
    const html = renderToStaticMarkup(<OperationsControlCenter snapshot={snapshot()} />);
    expect(html).toContain("Operations evidence is partial");
    expect(html).toContain("Ventures and services (2)");
    expect(html).toContain("WebDev Signal");
    expect(html).toContain("information only");
    expect(html).toContain("Copy diagnostics");
  });

  it("renders bounded node, capacity, incident, capability and progress views", () => {
    const node = renderToStaticMarkup(<OperationsControlCenter selectedNodeId="caught-up" selectedView="nodes" snapshot={snapshot()} />);
    expect(node).toContain("SLO and cadence");
    expect(node).toContain("Bounded recovery");
    const capacity = renderToStaticMarkup(<OperationsControlCenter selectedView="schedule" snapshot={snapshot()} />);
    expect(capacity).toContain("Europe/Prague dispatcher remains the sole scheduler");
    expect(capacity).toContain("Capacity decisions (1)");
    const incidents = renderToStaticMarkup(<OperationsControlCenter selectedView="incidents" snapshot={snapshot()} />);
    expect(incidents).toContain("Verify delivery in the provider dashboard.");
    expect(incidents).toContain("All editorial work");
    expect(incidents).toContain("Recent attempts: 1");
    expect(incidents).toContain("unaffected nodes: webdev-signal");
    const capabilities = renderToStaticMarkup(<OperationsControlCenter selectedView="capabilities" snapshot={snapshot()} />);
    expect(capabilities).toContain("Deny by default");
    expect(capabilities).toContain("Registered capability edges (1)");
    expect(capabilities).toContain("goviral-intelligence-packet/1");
    expect(capabilities).toContain("Private data stays within its owning venture.");
    const plans = renderToStaticMarkup(<OperationsControlCenter selectedView="plans" snapshot={snapshot()} />);
    expect(plans).toContain("A short version of one progress snapshot");
    expect(plans).toContain("Open Implementation Plans");
  });

  it("shows explicit unavailable states and rejects unknown node selections", () => {
    const unavailable = snapshot();
    unavailable.capacity = { ...unavailable.capacity, state: "missing", budget: null, counts: null, jobs: [] };
    expect(renderToStaticMarkup(<OperationsControlCenter selectedView="schedule" snapshot={unavailable} />)).toContain("Capacity plan unavailable");
    expect(renderToStaticMarkup(<OperationsControlCenter selectedNodeId="unknown" selectedView="nodes" snapshot={snapshot()} />)).toContain("Operational node not found");
  });

  it("keeps all-healthy and isolated-failure portfolios distinct", () => {
    const allHealthy = snapshot();
    allHealthy.state = "present";
    allHealthy.unreadableRecords = 0;
    allHealthy.nodes = allHealthy.nodes.map((node) => ({ ...node, health: "healthy", reason: "Valid current evidence.", recordState: "present", sloState: "satisfied" }));
    allHealthy.healthCounts = { healthy: 2, quiet: 0, held: 0, degraded: 0, stale: 0, failing: 0, paused: 0, "setup-needed": 0, unavailable: 0 };
    const healthyHtml = renderToStaticMarkup(<OperationsControlCenter snapshot={allHealthy} />);
    expect(healthyHtml).not.toContain("Operations evidence is partial");
    expect(healthyHtml).toContain("Healthy: 2");

    const isolated = snapshot();
    isolated.nodes[0] = { ...isolated.nodes[0]!, health: "failing", reason: "Delivery evidence failed." };
    isolated.healthCounts = { ...isolated.healthCounts, healthy: 0, failing: 1 };
    const isolatedHtml = renderToStaticMarkup(<OperationsControlCenter snapshot={isolated} />);
    expect(isolatedHtml).toContain("Failing");
    expect(isolatedHtml).toContain("Delivery evidence failed.");
    expect(isolatedHtml).toContain("WebDev Signal");
  });
});
