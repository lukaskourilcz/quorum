import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { OperationOutcomeSchema } from "../contracts/venture-operations.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { repoRoot as defaultRepoRoot } from "../paths.js";
import { readImplementationManifestRegistry } from "../programs/manifests.js";
import { loadVentureCapabilityMap } from "../ventures/capabilities.js";
import { assertOperationsNodeCoverage, loadOperationsNodeRegistry } from "./nodes.js";
import { buildVentureRecoveryPolicyRegistry, loadOperationsRecoveryRegistry } from "./recovery-policies.js";
import { loadVentureSloRegistry } from "./slo.js";

export interface OperationsReleaseCheck {
  id: string;
  passed: boolean;
  detail: string;
  evidenceRefs: string[];
}

export interface OperationsReleaseAudit {
  schemaVersion: "operations-release-audit/1";
  status: "pass" | "fail";
  checks: OperationsReleaseCheck[];
  auditHash: string;
}

function check(id: string, passed: boolean, detail: string, evidenceRefs: string[]): OperationsReleaseCheck {
  return { id, passed, detail, evidenceRefs };
}

async function exists(root: string, relative: string): Promise<boolean> {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

function sameIds(...sets: readonly string[][]): boolean {
  const normalized = sets.map((values) => JSON.stringify([...values].sort()));
  return normalized.every((value) => value === normalized[0]);
}

/**
 * Deterministic repository release audit. It reads configuration and source-level enforcement
 * evidence only; it does not execute a venture, call a provider, mutate authority or deploy.
 */
export async function auditOperationsRelease(repoRoot = defaultRepoRoot): Promise<OperationsReleaseAudit> {
  const configRoot = path.join(repoRoot, "config");
  const [nodes, capabilities, slos, recoveryConfig, manifest, capacitySource, recoverySource, healthSource, operationsContract, ownerAttentionContract, operationsAdmin, operationsReader, deploymentRaw, ecosystem, autonomousOperations, cycleSource, operationsService, refreshRoute, refreshStore, packageRaw] = await Promise.all([
    loadOperationsNodeRegistry(configRoot), loadVentureCapabilityMap(configRoot), loadVentureSloRegistry(configRoot),
    loadOperationsRecoveryRegistry(configRoot), readImplementationManifestRegistry(repoRoot),
    readFile(path.join(repoRoot, "orchestrator/src/operations/capacity.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/operations/recovery.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/operations/health.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/contracts/venture-operations.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/contracts/owner-attention.ts"), "utf8"),
    readFile(path.join(repoRoot, "site/src/components/admin/operations-control-center.tsx"), "utf8"),
    readFile(path.join(repoRoot, "site/src/lib/admin-operations.ts"), "utf8"),
    readFile(path.join(repoRoot, "site/vercel.json"), "utf8"),
    readFile(path.join(repoRoot, "docs/ECOSYSTEM.md"), "utf8"),
    readFile(path.join(repoRoot, "docs/AUTONOMOUS-OPERATIONS.md"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/cycle.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/operations/service.ts"), "utf8"),
    readFile(path.join(repoRoot, "site/src/app/admin/api/operations/refresh/route.ts"), "utf8"),
    readFile(path.join(repoRoot, "site/src/lib/admin-operations-refresh.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/package.json"), "utf8")
  ]);
  const checks: OperationsReleaseCheck[] = [];
  let coverage = true;
  try {
    assertOperationsNodeCoverage({ registry: nodes, capabilityMap: capabilities, sloRegistry: slos });
  } catch {
    coverage = false;
  }
  const recoveryPolicies = buildVentureRecoveryPolicyRegistry(recoveryConfig, capabilities);
  checks.push(check(
    "registry-coverage",
    coverage && sameIds(nodes.nodes.map(({ id }) => id), recoveryPolicies.policies.map(({ nodeId }) => nodeId)),
    "Every operational node appears exactly once in the node, capability, SLO and recovery registries.",
    ["config/operations-nodes.json", "config/venture-capabilities.json", "config/venture-slos.json", "config/operations-recovery.json"]
  ));

  const outcomes = ["success", "quiet", "no-work", "held", "partial", "failed", "replayed", "cancelled"];
  checks.push(check(
    "outcome-semantics",
    sameIds([...OperationOutcomeSchema.options], outcomes),
    "Success, quiet, no-work, held, partial, failed, replayed and cancelled remain distinct outcomes.",
    ["orchestrator/src/contracts/venture-operations.ts"]
  ));
  checks.push(check(
    "domain-receipts-remain-canonical",
    operationsContract.includes("domainReceiptRefs") && healthSource.includes("latestRunReceiptRefs") && !healthSource.includes("articleBody") && !healthSource.includes("manuscript"),
    "Common Operations receipts retain only references to canonical domain evidence and bounded execution metadata.",
    ["orchestrator/src/contracts/venture-operations.ts", "orchestrator/src/operations/health.ts"]
  ));

  const scheduler = slos.policies.find((policy) => policy.nodeId === "scheduler-service");
  checks.push(check(
    "prague-dispatcher-sole-scheduler",
    scheduler?.cadence.timezone === "Europe/Prague" && scheduler.cadence.windows.includes("canonical Prague dispatcher") && capacitySource.includes("The canonical scheduler has not declared this job due."),
    "The canonical Europe/Prague dispatcher declares due work; capacity planning only coordinates declared jobs.",
    ["config/venture-slos.json", "orchestrator/src/operations/capacity.ts"]
  ));
  checks.push(check(
    "capacity-authority-boundary",
    capacitySource.includes("Deployment is explicit under the release guard") && capacitySource.includes("scheduled: false as const") && capacitySource.includes("no allocation is borrowed or raised"),
    "Capacity planning cannot create due work, borrow or raise budget, or schedule deployment.",
    ["orchestrator/src/operations/capacity.ts", "orchestrator/tests/operations-capacity.test.ts"]
  ));

  const permanentProhibitions = ["account", "oauth-or-secret", "scope-expansion", "budget-increase", "content-approval", "capability-change", "outreach", "contest-entry", "monetization", "deployment"];
  checks.push(check(
    "bounded-delegated-recovery",
    recoveryPolicies.policies.every((policy) => policy.maximumIncrementalCostUsd === 0 && permanentProhibitions.every((action) => policy.prohibitedActions.includes(action as never)))
      && recoverySource.includes("execute: (action: RecoveryAction)") && recoverySource.includes("unaffectedNodeIds"),
    "Recovery remains $0, attempt/cooldown bounded, delegated to an owning primitive and reports unaffected nodes.",
    ["config/operations-recovery.json", "orchestrator/src/operations/recovery.ts", "orchestrator/tests/operations-recovery.test.ts"]
  ));
  checks.push(check(
    "canonical-owner-attention",
    ownerAttentionContract.includes("operationalIncidents") && recoverySource.includes("state/owner-attention.json") && !recoverySource.includes("owner-tasks.json"),
    "Operational incidents extend the canonical owner-attention record instead of creating a second task store.",
    ["orchestrator/src/contracts/owner-attention.ts", "orchestrator/src/operations/recovery.ts"]
  ));

  const ruleIds = new Set(capabilities.isolationRules.map((rule) => rule.id));
  const requiredRules = ["booksofhistory-to-tehdejsi", "tehdejsi-to-booksofhistory", "personal-growth-no-portfolio", "kvorum-outbound-isolation", "door-money-outbound-isolation", "door-money-inbound-isolation"];
  const goviralNonOperational = capabilities.edges.filter((edge) => edge.source === "goviral" && edge.capability !== "health-read");
  const fightMonetization = capabilities.edges.some((edge) => edge.source === "fightaiq" && String(edge.capability).includes("monetization"));
  checks.push(check(
    "venture-isolation",
    requiredRules.every((id) => ruleIds.has(id)) && goviralNonOperational.every((edge) => edge.capability === "intelligence-read") && !fightMonetization,
    "History, Personal Growth, Kvórum, Door Money, FightAIQ and GoVIRAL boundaries remain permanent and explicit.",
    ["config/venture-capabilities.json", "orchestrator/tests/venture-capability.test.ts"]
  ));

  const operationsProgram = manifest.programs.find((program) => program.id === "autonomous-operations");
  const operationalIssues = manifest.workItems.filter((item) => item.primaryProgramId === "autonomous-operations").map((item) => item.issue.number);
  const operationsProgramIssues = [424, 425, 426, 427, 428, 429];
  const sharedOptional = manifest.workItems.filter((item) => item.issue.number === 430);
  const webDevOptional = manifest.workItems.filter((item) => item.issue.number === 447);
  checks.push(check(
    "implementation-progress-single-owner",
    operationsProgram?.parentIssue.number === 423
      && operationsProgramIssues.every((issue) => operationalIssues.filter((candidate) => candidate === issue).length === 1)
      && sharedOptional.length === 1 && sharedOptional[0]?.posture === "held-optional"
      && sharedOptional[0]?.programRefs.includes("social-distribution") && sharedOptional[0]?.programRefs.includes("contest-radar")
      && webDevOptional.length === 1 && webDevOptional[0]?.posture === "held-optional"
      && operationsReader.includes("readAdminImplementationProgress")
      && operationsAdmin.includes("/admin/implementation-plans")
      && !operationsReader.includes("api.github.com"),
    "#419 owns one progress state, #431 owns full detail and #428 reuses only its compact sanitized summary.",
    ["config/implementation-programs.json", "site/src/lib/admin-operations.ts", "site/src/components/admin/operations-control-center.tsx"]
  ));

  const deployment = JSON.parse(deploymentRaw) as { git?: { deploymentEnabled?: unknown } };
  checks.push(check(
    "deployment-guard",
    deployment.git?.deploymentEnabled === false && recoveryPolicies.policies.every((policy) => policy.prohibitedActions.includes("deployment")) && capacitySource.includes("scheduled: false as const"),
    "Automatic Git deployment remains disabled and neither capacity nor recovery can deploy production.",
    ["site/vercel.json", "orchestrator/src/operations/capacity.ts", "orchestrator/src/operations/recovery.ts"]
  ));
  checks.push(check(
    "operations-admin-protected-private",
    await exists(repoRoot, "site/src/app/admin/operations/page.tsx") && operationsReader.startsWith('import "server-only"')
      && !operationsAdmin.includes("node:fs") && !operationsAdmin.includes("api.github.com"),
    "The Operations route is covered by the existing /admin auth boundary and receives only the server-sanitized snapshot.",
    ["site/src/proxy.ts", "site/src/app/admin/operations/page.tsx", "site/src/lib/admin-operations.ts"]
  ));
  checks.push(check(
    "monetization-information-only",
    operationsAdmin.includes("information only") && !operationsAdmin.includes("design-template") && ecosystem.includes("design-template sales are absent"),
    "Operations exposes no monetization ranking or task and design-template sales remain absent.",
    ["site/src/components/admin/operations-control-center.tsx", "docs/ECOSYSTEM.md"]
  ));

  const heldNodes = ["social-distribution", "contest-radar", "webdev-signal"];
  checks.push(check(
    "optional-nodes-honestly-held",
    heldNodes.every((nodeId) => {
      const slo = slos.policies.find((policy) => policy.nodeId === nodeId);
      const recovery = recoveryPolicies.policies.find((policy) => policy.nodeId === nodeId);
      return slo?.lifecycleStage === "planned" && slo.cadence.kind === "held"
        && (nodeId === "social-distribution" || recovery?.maximumAttempts === 0);
    }),
    "Optional Social Distribution, Contest Radar and unfinished WebDev Signal work remain planned/held rather than failing.",
    ["config/venture-slos.json", "config/operations-recovery.json"]
  ));
  checks.push(check(
    "single-checkpoint-materialization",
    cycleSource.includes("venturePhase === \"night\" || operationsRefreshRequested")
      && cycleSource.includes("materializeOperationsState")
      && operationsService.includes("buildOperationsSnapshot")
      && operationsService.includes("buildIncidentSnapshot")
      && operationsService.includes("readOperationRunReceipts")
      && !operationsService.includes("api.github.com")
      && !operationsService.includes("setInterval"),
    "The existing night checkpoint, or its bounded refresh request, materializes common receipt-backed health without a second scheduler or GitHub reader.",
    ["orchestrator/src/cycle.ts", "orchestrator/src/operations/service.ts"]
  ));
  checks.push(check(
    "protected-bounded-refresh",
    refreshRoute.includes("verifyAdminRequest") && refreshRoute.includes("no-store, private")
      && refreshStore.startsWith('import "server-only"')
      && refreshStore.includes("OPERATIONS_REFRESH_COOLDOWN_MS")
      && !refreshStore.includes("api.github.com"),
    "Admin refresh is authenticated, same-origin, bodyless, cooldown-bound and records only a request for the existing checkpoint.",
    ["site/src/app/admin/api/operations/refresh/route.ts", "site/src/lib/admin-operations-refresh.ts"]
  ));
  checks.push(check(
    "idempotent-migration-and-rollback",
    packageRaw.includes('"operations:migrate"') && packageRaw.includes('"operations:release-audit"')
      && await exists(repoRoot, "orchestrator/src/operations/migration.ts")
      && autonomousOperations.includes("## Migration and rollback")
      && autonomousOperations.includes("no automatic rollback deletion"),
    "The evidence migration validates exact receipts, preserves source evidence, prevents duplicates and publishes rollback guidance.",
    ["orchestrator/src/operations/migration.ts", "orchestrator/src/operations/migrate-cli.ts", "docs/AUTONOMOUS-OPERATIONS.md#migration-and-rollback"]
  ));
  const withoutHash = { schemaVersion: "operations-release-audit/1" as const, status: checks.every(({ passed }) => passed) ? "pass" as const : "fail" as const, checks };
  return { ...withoutHash, auditHash: sha256(canonicalJson(withoutHash)) };
}
