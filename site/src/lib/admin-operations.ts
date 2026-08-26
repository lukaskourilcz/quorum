import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readAdminImplementationProgress } from "./admin-implementation-plans";
import {
  CADENCE_KINDS,
  HEALTH_STATES,
  LIFECYCLE_STAGES,
  emptyCapacity,
  emptyIncidents,
  exactCoverage,
  id,
  integer,
  number,
  object,
  oneOf,
  parseCapabilityEdge,
  parseCapacity,
  parseHealth,
  parseIncident,
  parseIsolationRule,
  parseOwnerIncidents,
  safeText,
  strings
} from "./admin-operations-parse";
import type {
  AdminOperationCapabilityEdge,
  AdminOperationHealth,
  AdminOperationNode,
  AdminOperationsSnapshot
} from "./admin-operations-types";

export type {
  AdminOperationCapacityJob,
  AdminOperationCapabilityEdge,
  AdminOperationHealth,
  AdminOperationIncident,
  AdminOperationLifecycle,
  AdminOperationNode,
  AdminOperationsSnapshot
} from "./admin-operations-types";

type JsonState = { state: "present"; value: unknown } | { state: "missing" | "malformed"; value: null };

function repositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

async function readJson(root: string, relative: string): Promise<JsonState> {
  try {
    return { state: "present", value: JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown };
  } catch (error) {
    return { state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "malformed", value: null };
  }
}

export async function readAdminOperations(root = repositoryRoot()): Promise<AdminOperationsSnapshot> {
  const [registryFile, capabilityFile, sloFile, recoveryFile, capacityFile, incidentFile, attentionFile, deploymentFile, implementation] = await Promise.all([
    readJson(root, "config/operations-nodes.json"), readJson(root, "config/venture-capabilities.json"),
    readJson(root, "config/venture-slos.json"), readJson(root, "config/operations-recovery.json"),
    readJson(root, "state/operations/capacity/current.json"), readJson(root, "state/operations/incidents/current.json"),
    readJson(root, "state/owner-attention.json"), readJson(root, "site/vercel.json"), readAdminImplementationProgress(root)
  ]);
  let unreadableRecords = 0;
  const registry = object(registryFile.value);
  const capabilities = object(capabilityFile.value);
  const slos = object(sloFile.value);
  const recovery = object(recoveryFile.value);
  const rawNodes = registry?.schemaVersion === "operations-node-registry/1" && Array.isArray(registry.nodes) && registry.nodes.length <= 100 ? registry.nodes : [];
  const capabilityNodes = capabilities?.schemaVersion === "venture-capability-map/1" && Array.isArray(capabilities.nodes) && capabilities.nodes.length <= 100 ? capabilities.nodes : [];
  const capabilityEdges = capabilities?.schemaVersion === "venture-capability-map/1" && Array.isArray(capabilities.edges) && capabilities.edges.length <= 1_000 ? capabilities.edges : [];
  const sloPolicies = slos?.schemaVersion === "venture-slo-registry/1" && Array.isArray(slos.policies) && slos.policies.length <= 100 ? slos.policies : [];
  const recoveryDefaults = object(recovery?.defaults);
  const recoveryNodes = recovery?.schemaVersion === "operations-recovery-registry/1" && Array.isArray(recovery.nodes) && recovery.nodes.length <= 100 ? recovery.nodes : [];
  const nodes: AdminOperationNode[] = [];
  const healthGenerated: string[] = [];
  const registeredIds = rawNodes.flatMap((raw) => {
    const nodeId = id(object(raw)?.id);
    return nodeId ? [nodeId] : [];
  });
  const knownNodeIds = new Set(registeredIds);
  const parsedCapabilityEdges = capabilityEdges.map((edge) => parseCapabilityEdge(edge, knownNodeIds));
  const rawIsolationRules = Array.isArray(capabilities?.isolationRules) && capabilities.isolationRules.length <= 100 ? capabilities.isolationRules : [];
  const parsedIsolationRules = rawIsolationRules.map(parseIsolationRule);
  const registryValid = registeredIds.length === rawNodes.length && new Set(registeredIds).size === registeredIds.length
    && rawNodes.every((raw) => Boolean(safeText(object(raw)?.displayName, 120)));
  const capabilityValid = exactCoverage(registeredIds, capabilityNodes, "id") && parsedCapabilityEdges.every(Boolean)
    && rawIsolationRules.length > 0 && parsedIsolationRules.every(Boolean)
    && capabilityNodes.every((raw) => {
      const node = object(raw);
      return Boolean(safeText(node?.classification, 80) && safeText(node?.authorityRequirement, 80)
        && safeText(node?.privacyClassification, 40) && strings(node?.dataActionClasses, 10));
    });
  const sloValid = exactCoverage(registeredIds, sloPolicies, "nodeId") && sloPolicies.every((raw) => {
    const slo = object(raw);
    const cadence = object(slo?.cadence);
    const target = number(slo?.rollingValidRunTarget);
    const dependencies = strings(slo?.dependencyNodeIds, 12);
    return Boolean(safeText(slo?.policyVersion, 40) && oneOf(slo?.lifecycleStage, LIFECYCLE_STAGES)
      && oneOf(cadence?.kind, CADENCE_KINDS) && cadence?.timezone === "Europe/Prague" && strings(cadence?.windows, 14, 80)
      && target !== null && target <= 1 && dependencies && dependencies.every((nodeId) => knownNodeIds.has(nodeId)));
  });
  const recoveryValid = exactCoverage(registeredIds, recoveryNodes, "nodeId") && Boolean(recoveryDefaults)
    && recoveryNodes.every((raw) => {
      const node = object(raw);
      return integer(node?.maximumAttempts ?? recoveryDefaults?.maximumAttempts) !== null
        && integer(node?.cooldownMinutes ?? recoveryDefaults?.cooldownMinutes) !== null
        && Boolean(strings(node?.permittedActions ?? recoveryDefaults?.permittedActions, 16))
        && typeof (node?.automaticResume ?? recoveryDefaults?.automaticResume) === "boolean";
    });

  for (const raw of rawNodes) {
    const registryNode = object(raw);
    const nodeId = id(registryNode?.id);
    const displayName = safeText(registryNode?.displayName, 120);
    if (!nodeId || !displayName) { unreadableRecords += 1; continue; }
    const capability = capabilityNodes.map(object).find((entry) => entry?.id === nodeId);
    const slo = sloPolicies.map(object).find((entry) => entry?.nodeId === nodeId);
    const recoveryNode = recoveryNodes.map(object).find((entry) => entry?.nodeId === nodeId);
    const cadence = object(slo?.cadence);
    const lifecycleStage = oneOf(slo?.lifecycleStage, LIFECYCLE_STAGES) ?? "setup-needed";
    const healthFile = await readJson(root, `state/operations/health/${nodeId}/current.json`);
    const health = healthFile.state === "present" ? parseHealth(healthFile.value, nodeId) : null;
    if (health) healthGenerated.push(health.generatedAt);
    else if (healthFile.state === "malformed" || healthFile.state === "present") unreadableRecords += 1;
    const edges = parsedCapabilityEdges.filter((edge): edge is AdminOperationCapabilityEdge => Boolean(edge));
    const allowedInbound = capability && capabilityValid ? edges.filter((edge) => edge.target === nodeId && edge.decision === "allowed").length : null;
    const heldInbound = capability && capabilityValid ? edges.filter((edge) => edge.target === nodeId && edge.decision === "held").length : null;
    const allowedOutbound = capability && capabilityValid ? edges.filter((edge) => edge.source === nodeId && edge.decision === "allowed").length : null;
    const heldOutbound = capability && capabilityValid ? edges.filter((edge) => edge.source === nodeId && edge.decision === "held").length : null;
    const permittedActions = strings(recoveryNode?.permittedActions ?? recoveryDefaults?.permittedActions, 16) ?? [];
    nodes.push({
      id: nodeId, displayName,
      classification: safeText(capability?.classification, 80) ?? "unavailable",
      lifecycleStage: health?.lifecycleStage ?? lifecycleStage,
      cadence: { kind: safeText(cadence?.kind, 40) ?? "unavailable", windows: strings(cadence?.windows, 14) ?? [], timezone: "Europe/Prague" },
      health: health?.state ?? (lifecycleStage === "planned" || cadence?.kind === "held" ? "held" : "unavailable"),
      reason: health?.reason ?? (lifecycleStage === "planned" || cadence?.kind === "held" ? "The node is registered but held from live operation." : "No valid current health record is available."),
      sloState: health?.sloState ?? "unavailable",
      freshnessState: health?.freshnessState ?? "unavailable",
      dueWindow: health?.dueWindow ?? null,
      rollingOutcomes: health?.rollingOutcomes ?? null,
      unavailableReasons: health?.unavailableReasons ?? [],
      slo: {
        policyVersion: safeText(slo?.policyVersion, 40) ?? "unavailable",
        maximumLatenessMinutes: slo?.maximumLatenessMinutes === null ? null : integer(slo?.maximumLatenessMinutes),
        maximumStalenessMinutes: slo?.maximumStalenessMinutes === null ? null : integer(slo?.maximumStalenessMinutes),
        rollingValidRunTarget: number(slo?.rollingValidRunTarget),
        recoveryTargetMinutes: slo?.recoveryTargetMinutes === null ? null : integer(slo?.recoveryTargetMinutes)
      },
      lastValidAt: health?.lastValidAt ?? null,
      nextExpectedAt: health?.nextExpectedAt ?? null,
      queue: health?.queue ?? { state: "unavailable", pending: null },
      autonomyEligible: health?.autonomyEligible ?? null,
      dependencyNodeIds: strings(slo?.dependencyNodeIds, 12) ?? [],
      dependencyHealthRefs: health?.dependencyHealthRefs ?? [],
      holds: health?.holds ?? null,
      recovery: {
        maximumAttempts: integer(recoveryNode?.maximumAttempts ?? recoveryDefaults?.maximumAttempts),
        cooldownMinutes: integer(recoveryNode?.cooldownMinutes ?? recoveryDefaults?.cooldownMinutes),
        permittedActions,
        automaticResume: typeof recoveryNode?.automaticResume === "boolean"
          ? recoveryNode.automaticResume
          : typeof recoveryDefaults?.automaticResume === "boolean" ? recoveryDefaults.automaticResume : null
      },
      ownerAttentionRefs: health?.ownerAttentionRefs ?? [], evidenceRefs: health?.evidenceRefs ?? [],
      capability: {
        authorityRequirement: safeText(capability?.authorityRequirement, 80) ?? "unavailable",
        privacyClassification: safeText(capability?.privacyClassification, 40) ?? "unavailable",
        dataActionClasses: strings(capability?.dataActionClasses, 10) ?? [],
        inboundAllowed: allowedInbound, inboundHeld: heldInbound, outboundAllowed: allowedOutbound, outboundHeld: heldOutbound
      },
      implementation: (() => {
        const program = implementation.programs.find((candidate) => candidate.id === nodeId);
        if (!program) return null;
        const current = program.currentItemId ? implementation.items.find((item) => item.id === program.currentItemId) : null;
        return { programId: program.id, currentItemId: program.currentItemId, state: program.finalGateComplete ? "complete" : current?.state ?? "release-gated" };
      })(),
      recordState: health ? "present" : healthFile.state === "present" ? "malformed" : healthFile.state
    });
  }

  const capacityParsed = capacityFile.state === "present" ? parseCapacity(capacityFile.value) : null;
  if (capacityFile.state === "present" && !capacityParsed) unreadableRecords += 1;
  const capacity = capacityParsed ?? emptyCapacity(capacityFile.state === "present" ? "malformed" : capacityFile.state);
  const incidentParsed = incidentFile.state === "present" ? parseIncident(incidentFile.value) : null;
  if (incidentFile.state === "present" && !incidentParsed) unreadableRecords += 1;
  const ownerIncidents = attentionFile.state === "present" ? parseOwnerIncidents(attentionFile.value) : null;
  if (attentionFile.state === "present" && !ownerIncidents) unreadableRecords += 1;
  const incidents = incidentParsed
    ? { ...incidentParsed, records: ownerIncidents ?? [] }
    : { ...emptyIncidents(incidentFile.state === "present" ? "malformed" : incidentFile.state), records: ownerIncidents ?? [] };
  const parsedEdges = parsedCapabilityEdges.filter((edge): edge is AdminOperationCapabilityEdge => Boolean(edge));
  const isolationRules = parsedIsolationRules.filter((entry): entry is { id: string; reason: string; governingReference: string } => Boolean(entry));
  const deploymentConfig = object(deploymentFile.value);
  const git = object(deploymentConfig?.git);
  const deploymentValid = deploymentFile.state === "present" && git?.deploymentEnabled === false;
  if (deploymentFile.state === "present" && !deploymentValid) unreadableRecords += 1;
  const implementationAvailable = implementation.state !== "missing";
  const operationsProgram = implementationAvailable ? implementation.programs.find((program) => program.id === "autonomous-operations") : null;
  const operationsItem = operationsProgram?.currentItemId ? implementation.items.find((item) => item.id === operationsProgram.currentItemId) : null;
  const implementationSummary = {
    state: implementation.state, generatedAt: implementation.generatedAt, sourceFreshness: implementation.sourceFreshness,
    programs: implementationAvailable ? implementation.programs.length : null,
    mandatoryCompleted: implementationAvailable ? implementation.programs.reduce((sum, program) => sum + program.mandatoryCompleted, 0) : null,
    mandatoryTotal: implementationAvailable ? implementation.programs.reduce((sum, program) => sum + program.mandatoryTotal, 0) : null,
    ownerActions: implementationAvailable ? implementation.items.filter((item) => item.state === "owner-action").length : null,
    evidenceRisks: implementationAvailable ? implementation.items.filter((item) => item.state === "stale" || item.state === "inconsistent").length : null,
    unreadableItems: implementationAvailable ? implementation.unreadableItems : null,
    currentProgramId: operationsProgram?.id ?? null,
    currentItemId: operationsProgram?.currentItemId ?? null,
    currentItemState: operationsItem?.state ?? null,
    finalGateReady: operationsProgram ? operationsProgram.finalGateReady : null,
    nextUnblockedItemIds: operationsProgram?.nextUnblockedItemIds ?? [],
    ownerWaitingItemIds: operationsProgram?.ownerWaitingItemIds ?? []
  };
  const healthCounts = Object.fromEntries(HEALTH_STATES.map((state) => [state, nodes.filter((node) => node.health === state).length])) as Record<AdminOperationHealth, number>;
  const configInvalid = !rawNodes.length || !registryValid || !capabilityValid || !sloValid || !recoveryValid;
  const sourceStates = {
    registry: rawNodes.length && registryValid ? "present" as const : registryFile.state === "present" ? "malformed" as const : registryFile.state,
    capabilities: capabilityNodes.length && capabilityValid ? "present" as const : capabilityFile.state === "present" ? "malformed" as const : capabilityFile.state,
    slos: sloPolicies.length && sloValid ? "present" as const : sloFile.state === "present" ? "malformed" as const : sloFile.state,
    recovery: recoveryNodes.length && recoveryValid ? "present" as const : recoveryFile.state === "present" ? "malformed" as const : recoveryFile.state,
    health: nodes.some((node) => node.recordState === "present") ? "present" as const : nodes.some((node) => node.recordState === "malformed") ? "malformed" as const : "missing" as const,
    capacity: capacity.state,
    incidents: incidents.state,
    ownerAttention: ownerIncidents ? "present" as const : attentionFile.state === "present" ? "malformed" as const : attentionFile.state,
    implementationProgress: implementation.state,
    deployment: deploymentValid ? "present" as const : deploymentFile.state === "present" ? "malformed" as const : deploymentFile.state
  };
  const generatedAt = [...healthGenerated, capacity.generatedAt, incidents.generatedAt, implementation.generatedAt].filter((entry): entry is string => Boolean(entry)).sort().at(-1) ?? null;
  const withoutHash = {
    state: configInvalid ? "unavailable" as const : Object.values(sourceStates).every((source) => source === "present") && unreadableRecords === 0 ? "present" as const : "partial" as const,
    generatedAt, sourceStates, unreadableRecords, nodes, healthCounts, capacity, incidents,
    capabilities: {
      mapVersion: safeText(capabilities?.mapVersion, 40), defaultPosture: "deny" as const,
      allowed: capabilityValid ? parsedEdges.filter((edge) => edge.decision === "allowed").length : null,
      held: capabilityValid ? parsedEdges.filter((edge) => edge.decision === "held").length : null,
      denied: capabilityValid ? parsedEdges.filter((edge) => edge.decision === "denied").length : null,
      edges: parsedEdges, isolationRules
    },
    implementation: implementationSummary,
    deployment: {
      state: deploymentValid ? "present" as const : deploymentFile.state === "present" ? "malformed" as const : deploymentFile.state,
      gitDeploymentEnabled: deploymentValid ? false as const : null,
      scheduledByOperations: false as const,
      posture: deploymentValid ? "Git-triggered deployment is disabled; Operations observes release readiness and never deploys." : "Deployment posture is unavailable; Operations still cannot schedule deployment.",
      evidenceRef: "site/vercel.json"
    },
    monetizationPosture: "information-only" as const
  };
  return { ...withoutHash, snapshotHash: createHash("sha256").update(JSON.stringify(withoutHash)).digest("hex") };
}
