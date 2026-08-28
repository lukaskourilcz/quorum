import {
  SocialConnectionSchema,
  SocialProfileSchema,
  type SocialCampaign,
  type SocialConnection,
  type SocialProfile
} from "../contracts/social-distribution.js";
import { SocialCampaignSchema } from "../contracts/social-distribution.js";
import {
  SocialPreparedCandidateSchema,
  SocialProfileOperationSchema,
  type SocialPreparedCandidate,
  type SocialProfileOperation
} from "../contracts/social-operations.js";
import {
  SocialProfileInventorySchema,
  SocialProfileStrategySchema,
  type SocialInventoryCandidate,
  type SocialProfileInventory,
  type SocialProfileStrategy
} from "../contracts/social-inventory.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { pragueClockParts } from "../meetings/clock.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";
import { resolveProviderBinding, type SocialProviderRegistry } from "./providers.js";
import {
  CapabilityAwareQueueItemSchema,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "./queue.js";
import { resolvePublisherTarget, type SocialPublisherRegistry } from "./publisher-targets.js";
import { matchSocialRoutineScope, SocialRoutineScopeRegistrySchema, type SocialRoutineScopeRegistry } from "./routines.js";
import type { AmplifierEligibility } from "./amplifiers.js";

type OperationReason = SocialProfileOperation["reasons"][number];
type Gate = SocialProfileOperation["gates"][number];

export interface SocialDailyDecisionResult {
  operation: SocialProfileOperation;
  queueItem: CapabilityAwareQueueItem | null;
  replayed: boolean;
}

export interface SocialDailyPolicyState {
  originalSupportRatioEligible: boolean;
  cooldownClear: boolean;
  campaignCapacityAvailable: boolean;
  budgetRemainingUsd: number;
  runwayComplete: boolean;
}

export interface SocialDailySelectionInput {
  profile: unknown;
  connection: unknown;
  strategy: unknown;
  inventory: unknown;
  campaigns: readonly unknown[];
  preparedCandidates: readonly unknown[];
  routineScopes: unknown;
  publisherRegistry: SocialPublisherRegistry;
  providerRegistry: SocialProviderRegistry;
  capabilityMap: VentureCapabilityMap;
  environment: NodeJS.ProcessEnv;
  now: Date;
  policy: SocialDailyPolicyState;
  sent: { sentToday: number; lastSentAt: string | null; similarityHashes: readonly string[] };
  kills: { global: boolean; profile: boolean; connection: boolean };
  ambiguousDelivery: boolean;
  amplifierEligibility?: Readonly<Record<string, AmplifierEligibility>>;
  existingOperation?: unknown;
}

const ALL_GATES = ["real-profile", "connection", "inventory", "freshness", "expiry", "duplicate", "capability", "ratio", "runway", "cooldown", "campaign-capacity", "content", "claims", "accessibility", "budget", "provider", "authority", "routine-scope", "kill-switch"] as const;

function gateSet(): Map<Gate["gate"], Gate> {
  return new Map(ALL_GATES.map((gate) => [gate, { gate, status: "pass", reason: `${gate} gate passed.`, evidenceRef: null }]));
}

function mark(gates: Map<Gate["gate"], Gate>, gate: Gate["gate"], status: Gate["status"], reason: string, evidenceRef: string | null = null) {
  gates.set(gate, { gate, status, reason, evidenceRef });
}

function dayWindow(date: string): { notBefore: string; notAfter: string } {
  return { notBefore: `${date}T00:00:00.000Z`, notAfter: `${date}T23:59:59.999Z` };
}

function candidateRef(candidate: SocialInventoryCandidate): string { return `state/social/inventory-candidates/${candidate.id}.json`; }
function campaignRef(campaign: SocialCampaign): string { return `state/social/campaigns/${campaign.id}.json`; }

function campaignAccepted(candidate: SocialInventoryCandidate, campaigns: readonly SocialCampaign[], now: Date): boolean {
  if (candidate.sourceKind !== "accepted-campaign") return true;
  const campaign = campaigns.find((entry) => campaignRef(entry) === candidate.campaignRef);
  return Boolean(campaign && ["approved", "partially-approved", "queued", "in-progress"].includes(campaign.status)
    && campaign.channelItems.some(({ status, approval, window }) => ["approved", "queued", "publishing", "published"].includes(status) && approval.status === "approved" && Date.parse(window.notAfter) > now.getTime()));
}

function preparedCampaignApprovalCurrent(
  candidate: SocialInventoryCandidate,
  prepared: SocialPreparedCandidate,
  campaigns: readonly SocialCampaign[],
  now: Date
): boolean {
  if (candidate.sourceKind !== "accepted-campaign") return true;
  const campaign = campaigns.find((entry) => campaignRef(entry) === candidate.campaignRef);
  if (!campaign || campaign.id !== prepared.campaignId || campaign.releaseId !== prepared.releaseId
    || campaign.sourceVentureId !== prepared.sourceVentureId
    || campaign.sourcePackage.artifactRef !== prepared.sourcePackage.artifactRef
    || campaign.sourcePackage.packageHash !== prepared.sourcePackage.packageHash) return false;
  const target = campaign.targets.find((entry) => entry.profileId === prepared.target.profileId
    && entry.role === prepared.target.role
    && (entry.capabilityRef?.decisionReference === prepared.target.capabilityRef?.decisionReference
      || (entry.role === "primary" && campaign.sourceCapabilityRef.decisionReference === prepared.target.capabilityRef?.decisionReference))
    && entry.amplifierEligibilityRef === prepared.target.amplifierEligibilityRef);
  if (!target) return false;
  return campaign.channelItems.some((item) => item.targetId === target.id
    && item.connectionRef === prepared.target.connectionId
    && item.channel === candidate.platform
    && item.locale === candidate.locale
    && item.status === "approved"
    && item.approval.status === "approved"
    && item.approval.approvalRef === prepared.target.campaignApprovalRef
    && item.approval.approvalRef === prepared.approvalRef
    && item.copy.text === prepared.content.text
    && item.copy.destination === prepared.destination
    && item.window.notBefore === prepared.publishWindow.notBefore
    && item.window.notAfter === prepared.publishWindow.notAfter
    && item.utm.source === prepared.utm.source
    && item.utm.medium === prepared.utm.medium
    && item.utm.campaign === prepared.utm.campaign
    && item.utm.content === prepared.utm.content
    && Date.parse(item.window.notAfter) > now.getTime());
}

function exactCapabilityReferenceCurrent(sourceVentureId: string, reference: SocialInventoryCandidate["capabilityRef"], map: VentureCapabilityMap): boolean {
  if (!reference) return false;
  const resolved = resolveVentureCapabilityInMap(map, { source: sourceVentureId, target: "social-distribution", capability: "approved-publish-package", schemaVersion: "approved-publish-package/1" });
  return resolved.decision === "allowed" && resolved.edge !== null && reference.mapVersion === map.mapVersion && reference.source === sourceVentureId && reference.decisionReference === resolved.edge.governingReference && reference.dataSchemaVersion === resolved.edge.dataSchemaVersion;
}

function candidateCapabilityCurrent(candidate: SocialInventoryCandidate, profile: SocialProfile, map: VentureCapabilityMap, campaigns: readonly SocialCampaign[]): boolean {
  if (["personal-growth", "kvorum", "contest-radar"].includes(candidate.sourceVentureId ?? "")) return false;
  if (candidate.sourceVentureId === "goviral") return false;
  if ((candidate.sourceVentureId === "booksofhistory" && profile.ventureRef === "tehdejsi-svet") || (candidate.sourceVentureId === "tehdejsi-svet" && profile.ventureRef === "booksofhistory")) return false;
  if (candidate.sourceKind === "accepted-campaign" && candidate.sourceVentureId) {
    const campaign = campaigns.find((entry) => campaignRef(entry) === candidate.campaignRef);
    const reference = candidate.capabilityRef ?? campaign?.sourceCapabilityRef ?? null;
    return exactCapabilityReferenceCurrent(candidate.sourceVentureId, reference, map);
  }
  if (!candidate.capabilityRef) return candidate.sourceKind === "strategy-owned" || (candidate.sourceVentureId === profile.ventureRef && !["door-money", "webdev-signal"].includes(candidate.sourceVentureId ?? ""));
  return exactCapabilityReferenceCurrent(candidate.sourceVentureId!, candidate.capabilityRef, map);
}

function candidatePriority(candidate: SocialInventoryCandidate): number {
  return { original: 0, campaign: 1, reserve: 2, recurring: 3 }[candidate.candidateType];
}

function exactPrepared(candidate: SocialInventoryCandidate, values: readonly unknown[]): SocialPreparedCandidate | null {
  for (const value of values) {
    const parsed = SocialPreparedCandidateSchema.safeParse(value);
    if (parsed.success && parsed.data.candidateId === candidate.id) return parsed.data;
  }
  return null;
}

function queueItem(input: {
  prepared: SocialPreparedCandidate;
  candidate: SocialInventoryCandidate;
  operationId: string;
  scopeRef: string;
  now: Date;
}): CapabilityAwareQueueItem {
  const prepared = input.prepared;
  const target = {
    profileId: prepared.target.profileId,
    profileRole: prepared.target.profileRole,
    role: prepared.target.role,
    connectionBindingRef: prepared.target.connectionId,
    capabilityRef: prepared.target.capabilityRef,
    amplifierEligibilityRef: prepared.target.role === "amplifier" ? prepared.target.amplifierEligibilityRef : null,
    campaignApprovalRef: prepared.target.role === "amplifier" ? prepared.target.campaignApprovalRef : null
  };
  const id = `social-daily-${prepared.target.profileId.replace(/^social-profile-/u, "")}-${input.candidate.usefulWindow.earliest.slice(0, 10)}-${prepared.candidateId.slice(-8)}`;
  const base = {
    schemaVersion: 2 as const,
    id,
    sourceVentureId: prepared.sourceVentureId,
    releaseId: prepared.releaseId,
    campaignId: prepared.campaignId,
    experimentId: null,
    target,
    action: "publish-original" as const,
    sourcePackage: prepared.sourcePackage,
    locale: input.candidate.locale,
    variant: "A" as const,
    channel: input.candidate.platform,
    objective: prepared.objective,
    audience: prepared.audience,
    destination: prepared.destination,
    utm: prepared.utm,
    content: { ...prepared.content, contentHash: "0".repeat(64) },
    publishWindow: prepared.publishWindow,
    status: "queued" as const,
    checks: { ...prepared.checks, authority: "pass" as const },
    approvalProvenance: { approvalRef: prepared.approvalRef, selectionRef: `state/social/profile-operations/${input.operationId}.json`, policyRef: input.scopeRef },
    selectedBy: "PULSE" as const,
    createdAt: input.now.toISOString(),
    attempt: null,
    receiptId: null,
    migration: null
  };
  return CapabilityAwareQueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } });
}

function inputIdentity(input: SocialDailySelectionInput, profile: SocialProfile, connection: SocialConnection, strategy: SocialProfileStrategy | null, inventory: SocialProfileInventory | null, campaigns: readonly SocialCampaign[], scopes: SocialRoutineScopeRegistry | null, prepared: readonly SocialPreparedCandidate[]) {
  const targetDate = pragueClockParts(input.now).date;
  const inputHash = sha256(canonicalJson({
    profile: { id: profile.id, updatedAt: profile.updatedAt, lifecycle: profile.lifecycle, liveEligible: profile.liveEligible },
    connection: { id: connection.id, mode: connection.mode, health: connection.health, approvedScopes: connection.approvedScopes, enabledByHumanAt: connection.enabledByHumanAt },
    strategy: strategy ? { id: strategy.id, version: strategy.version, reviewDate: strategy.reviewDate } : null,
    inventory: inventory ? { id: inventory.id, inputHash: inventory.inputHash, generatedAt: inventory.generatedAt } : null,
    campaigns: campaigns.map(({ id, inputHash: hash, status, updatedAt }) => ({ id, inputHash: hash, status, updatedAt })),
    scopes: scopes ? { version: scopes.version, values: scopes.scopes.map(({ id, version, status, history }) => ({ id, version, status, revision: history.at(-1)?.revision })) } : null,
    prepared: prepared.map(({ candidateId, preparedHash }) => ({ candidateId, preparedHash })),
    policy: input.policy,
    sent: input.sent,
    kills: input.kills,
    ambiguousDelivery: input.ambiguousDelivery,
    environmentAvailable: [connection.credentialRef, connection.nativeAccountIdRef].map((ref) => [ref, Boolean(ref && input.environment[ref]?.trim())])
  }));
  const idempotencyKey = sha256(`${profile.id}:${connection.id}:${targetDate}:${inputHash}`);
  return { targetDate, inputHash, idempotencyKey, id: `social-profile-operation-${idempotencyKey.slice(0, 20)}` };
}

export function decideSocialProfileDay(input: SocialDailySelectionInput): SocialDailyDecisionResult {
  const profile = SocialProfileSchema.parse(input.profile); const connection = SocialConnectionSchema.parse(input.connection);
  if (connection.profileId !== profile.id) throw new Error("Daily operation profile and connection do not match");
  const strategyParsed = SocialProfileStrategySchema.safeParse(input.strategy); const inventoryParsed = SocialProfileInventorySchema.safeParse(input.inventory);
  const strategy = strategyParsed.success ? strategyParsed.data : null; const inventory = inventoryParsed.success ? inventoryParsed.data : null;
  const campaigns = input.campaigns.flatMap((value) => { const parsed = SocialCampaignSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const scopesParsed = SocialRoutineScopeRegistrySchema.safeParse(input.routineScopes); const scopes = scopesParsed.success ? scopesParsed.data : null;
  const prepared = input.preparedCandidates.flatMap((value) => { const parsed = SocialPreparedCandidateSchema.safeParse(value); return parsed.success ? [parsed.data] : []; });
  const identity = inputIdentity(input, profile, connection, strategy, inventory, campaigns, scopes, prepared);
  const existing = SocialProfileOperationSchema.safeParse(input.existingOperation);
  if (existing.success && existing.data.idempotencyKey === identity.idempotencyKey) return { operation: existing.data, queueItem: null, replayed: true };
  const gates = gateSet(); const baseCandidateRefs = inventory?.candidates.map(candidateRef) ?? [];
  const common = {
    schemaVersion: "social-profile-operation/1" as const, id: identity.id, idempotencyKey: identity.idempotencyKey, inputHash: identity.inputHash, supersedesOperationRef: null,
    profileId: profile.id, connectionId: connection.id, strategyRef: strategy ? `config/social-profile-strategies.json#${strategy.id}` : "config/social-profile-strategies.json",
    inventoryRef: `state/social/inventory/${profile.id}/current.json`, campaignRefs: campaigns.map(campaignRef), targetDate: identity.targetDate, timezone: "Europe/Prague" as const,
    candidateRefs: baseCandidateRefs, candidateSetHash: sha256(canonicalJson(baseCandidateRefs)), actualCostUsd: 0, reuseRefs: [], incidentRefs: [], ownerAttentionRefs: [], replayed: false,
    createdAt: input.now.toISOString(), authorityGranted: false as const, publishingAuthorized: false as const
  };
  const finish = (outcome: SocialProfileOperation["outcome"], reasons: OperationReason[], options: { selected?: SocialInventoryCandidate | null; scopeRef?: string | null; scopeState?: SocialProfileOperation["routineScopeState"]; providerState?: SocialProfileOperation["providerConnectionState"]; queue?: CapabilityAwareQueueItem | null; attention?: string[]; incidents?: string[] } = {}): SocialDailyDecisionResult => {
    const selected = options.selected ?? null; const queue = options.queue ?? null;
    const immutableHashes = queue ? { targetHash: sha256(canonicalJson(queue.target)), contentHash: queue.content.contentHash, assetHash: sha256(canonicalJson({ assetPaths: queue.content.assetPaths, altText: queue.content.altText })), windowHash: sha256(canonicalJson(queue.publishWindow)) } : null;
    const operation = SocialProfileOperationSchema.parse({
      ...common,
      selectionWindow: selected
        ? { notBefore: selected.usefulWindow.earliest, notAfter: selected.usefulWindow.latest }
        : dayWindow(identity.targetDate),
      selectedCandidateRef: selected ? candidateRef(selected) : null,
      immutableHashes,
      gates: [...gates.values()], routineScopeRef: options.scopeRef ?? null, routineScopeState: options.scopeState ?? (scopes?.defaultMode ?? "missing"),
      queue: queue ? { itemId: queue.id, itemRef: `state/social/queue/${queue.id}.json`, payloadHash: queue.content.contentHash, status: "queued" } : null,
      outcome, reasons: [...new Set(reasons)], providerConnectionState: options.providerState ?? "unavailable", actualCostUsd: queue ? (prepared.find(({ candidateId }) => candidateId === selected?.id)?.estimatedCostUsd ?? 0) : 0,
      incidentRefs: options.incidents ?? [], ownerAttentionRefs: options.attention ?? []
    });
    return { operation, queueItem: queue, replayed: false };
  };

  if (input.kills.global || input.kills.profile || input.kills.connection) {
    mark(gates, "kill-switch", "fail", "Global, profile or connection kill state is engaged.");
    return finish("paused", ["kill-switch", input.kills.connection ? "connection-paused" : "profile-paused"], { scopeState: scopes?.defaultMode ?? "missing", providerState: "held", attention: ["state/social/kill-switches"] });
  }
  if (profile.kind !== "owned-brand" || !["venture-primary", "company-umbrella", "owned-amplifier"].includes(profile.role)) {
    mark(gates, "real-profile", "fail", "Simulation, contact and owner-personal records cannot enter the live queue.");
    return finish("held", ["missing-authority"], { providerState: "held", attention: ["admin:social-profiles"] });
  }
  if (!strategy || !inventory || strategy.profileId !== profile.id || inventory.profileId !== profile.id || inventory.strategyId !== strategy.id) {
    mark(gates, "inventory", "fail", "Strategy or inventory is malformed or mismatched.");
    return finish("held", ["malformed-strategy-inventory"], { providerState: "held", incidents: ["state/social/inventory-incidents"] });
  }
  const horizonEnd = new Date(Date.parse(`${inventory.horizonStart}T00:00:00.000Z`) + inventory.horizonDays * 86_400_000).toISOString().slice(0, 10);
  if (identity.targetDate < inventory.horizonStart || identity.targetDate >= horizonEnd) {
    mark(gates, "freshness", "fail", "The current inventory does not cover the Prague target date.");
    return finish("held", ["stale-inventory"], { providerState: "held", incidents: ["state/social/inventory-incidents"] });
  }
  if (input.ambiguousDelivery) {
    mark(gates, "provider", "hold", "An ambiguous delivery must reconcile through #409/#417 before selection can continue.");
    return finish("held", ["ambiguous-delivery-reconciliation"], { providerState: "ambiguous", attention: ["state/social/provider-receipts"] });
  }
  const sentHashes = new Set(input.sent.similarityHashes);
  const inWindow = inventory.candidates.filter((candidate) => candidate.state === "eligible" && Date.parse(candidate.usefulWindow.expiresAt) > input.now.getTime() && candidate.usefulWindow.earliest.slice(0, 10) <= identity.targetDate && candidate.usefulWindow.latest.slice(0, 10) >= identity.targetDate)
    .filter((candidate) => !sentHashes.has(candidate.similarityHash));
  const campaignCurrent = inWindow.filter((candidate) => campaignAccepted(candidate, campaigns, input.now));
  const capabilityCurrent = campaignCurrent.filter((candidate) => candidateCapabilityCurrent(candidate, profile, input.capabilityMap, campaigns));
  const due = capabilityCurrent
    .filter((candidate) => candidate.classification === "original" || (input.policy.originalSupportRatioEligible && input.policy.cooldownClear && input.policy.campaignCapacityAvailable && input.policy.runwayComplete))
    .sort((left, right) => candidatePriority(left) - candidatePriority(right) || left.usefulWindow.earliest.localeCompare(right.usefulWindow.earliest) || left.id.localeCompare(right.id));
  const activeScope = scopes?.scopes.find((scope) => scope.status === "active"
    && scope.profileId === profile.id
    && scope.connectionId === connection.id
    && identity.targetDate >= scope.effectiveOn
    && identity.targetDate < scope.expiresOn);
  const maximumPosts = Math.min(connection.cadence.maxOrganicPostsPerDay, activeScope?.bounds.maximumPostsPerDay ?? Number.POSITIVE_INFINITY);
  const minimumHours = Math.max(connection.cadence.minHoursBetweenPosts, activeScope?.bounds.minimumHoursBetweenPosts ?? 0);
  if (input.sent.sentToday >= maximumPosts || (input.sent.lastSentAt && input.now.getTime() - Date.parse(input.sent.lastSentAt) < minimumHours * 3_600_000)) {
    mark(gates, "connection", "hold", "Connection cadence requires a rest window.");
    return finish("NO_POST", ["rest-cadence-window"], { providerState: "held" });
  }
  if (!due.length) {
    const hasDuplicate = inventory.candidates.some(({ similarityHash }) => sentHashes.has(similarityHash));
    const hasSupport = inventory.candidates.some(({ classification, state }) => classification === "support" && state === "eligible");
    const hasDeniedCapability = campaignCurrent.some((candidate) => !candidateCapabilityCurrent(candidate, profile, input.capabilityMap, campaigns));
    const hasExpiredCampaign = inWindow.some((candidate) => candidate.sourceKind === "accepted-campaign" && campaigns.some((campaign) => campaignRef(campaign) === candidate.campaignRef && (campaign.status === "expired" || campaign.channelItems.every(({ window }) => Date.parse(window.notAfter) <= input.now.getTime()))));
    if (hasDeniedCapability) {
      mark(gates, "capability", "fail", "A due candidate carries a denied, missing or stale capability edge.");
      return finish("held", ["denied-capability"], { providerState: "held", attention: ["config/venture-capabilities.json"] });
    }
    const reasons: OperationReason[] = hasDuplicate ? ["duplicate-similarity"] : hasExpiredCampaign ? ["expired-campaign"] : hasSupport && !input.policy.originalSupportRatioEligible ? ["original-support-ratio"] : hasSupport && !input.policy.cooldownClear ? ["cooldown"] : hasSupport && !input.policy.runwayComplete ? ["incomplete-runway"] : hasSupport && !input.policy.campaignCapacityAvailable ? ["campaign-capacity"] : ["no-due-useful-candidate"];
    const blockedGate: Gate["gate"] = hasDuplicate ? "duplicate" : hasExpiredCampaign ? "expiry" : hasSupport && !input.policy.cooldownClear ? "cooldown" : hasSupport && !input.policy.runwayComplete ? "runway" : hasSupport && !input.policy.campaignCapacityAvailable ? "campaign-capacity" : hasSupport ? "ratio" : "expiry";
    mark(gates, blockedGate, "hold", "No useful due candidate remains after deterministic filters.");
    return finish("NO_POST", reasons, { providerState: "unavailable" });
  }
  const selected = due[0]!; const preparedItem = exactPrepared(selected, input.preparedCandidates);
  if (!preparedItem) {
    mark(gates, "content", "hold", "The inventory brief has no exact prepared final content handoff.");
    return finish("review", ["prepared-item-missing"], { selected, scopeState: scopes?.defaultMode ?? "missing", providerState: "unavailable", attention: ["admin:social-profiles?section=today"] });
  }
  if (preparedItem.target.profileId !== profile.id || preparedItem.target.connectionId !== connection.id || preparedItem.utm.source !== selected.platform || preparedItem.publishWindow.notBefore !== selected.usefulWindow.earliest || preparedItem.publishWindow.notAfter !== selected.usefulWindow.latest) {
    mark(gates, "content", "fail", "Prepared target/platform/window does not match the selected inventory candidate.");
    return finish("review", ["evidence-failure"], { selected, providerState: "unavailable", attention: [preparedItem.approvalRef] });
  }
  if (!preparedCampaignApprovalCurrent(selected, preparedItem, campaigns, input.now)) {
    mark(gates, "authority", "fail", "The prepared campaign handoff no longer matches one exact approved #410 target and channel item.", selected.campaignRef);
    return finish("review", [Date.parse(preparedItem.publishWindow.notAfter) <= input.now.getTime() ? "expired-campaign" : "missing-authority"], { selected, providerState: "unavailable", attention: [selected.campaignRef ?? preparedItem.approvalRef] });
  }
  if (preparedItem.riskClass !== "low") {
    mark(gates, "authority", "hold", "Sensitive, political, novel, paid or policy-changing content remains review-only.");
    return finish("review", ["sensitive-review"], { selected, providerState: "unavailable", attention: [preparedItem.approvalRef] });
  }
  if (preparedItem.estimatedCostUsd > input.policy.budgetRemainingUsd) {
    mark(gates, "budget", "hold", "The exact item exceeds remaining approved budget.");
    return finish("held", ["budget-exhausted"], { selected, providerState: "held" });
  }
  const scopeMatch = matchSocialRoutineScope({ registry: input.routineScopes, candidate: selected, prepared: preparedItem, connectionId: connection.id, targetDate: identity.targetDate, sentToday: input.sent.sentToday, lastSentAt: input.sent.lastSentAt, now: input.now });
  const scopeRef = scopeMatch.scope ? `config/social-routine-scopes.json#${scopeMatch.scope.id}` : null;
  if (scopeMatch.state !== "matched" || !scopeMatch.scope) {
    mark(gates, "routine-scope", "hold", scopeMatch.reasons.join("; "), scopeRef);
    return finish("review", [scopeMatch.state === "draft-only" ? "draft-only" : "routine-scope-mismatch"], { selected, scopeRef, scopeState: scopeMatch.state, providerState: "unavailable", attention: ["docs/NEEDED.md#social-distribution-connection-001"] });
  }
  const proposedQueue = queueItem({ prepared: preparedItem, candidate: selected, operationId: identity.id, scopeRef: scopeRef!, now: input.now });
  const target = resolvePublisherTarget({ item: proposedQueue, registry: input.publisherRegistry, capabilityMap: input.capabilityMap, environment: input.environment, now: input.now, pausedProfileIds: input.kills.profile ? new Set([profile.id]) : new Set(), pausedConnectionIds: input.kills.connection ? new Set([connection.id]) : new Set(), amplifierEligibility: input.amplifierEligibility });
  if (target.decision !== "eligible" || !target.target) {
    mark(gates, target.reasons.some((reason) => reason.includes("capability")) ? "capability" : "connection", target.decision === "denied" ? "fail" : "hold", target.reasons.join("; "));
    return finish("held", [target.reasons.some((reason) => reason.includes("capability")) ? "denied-capability" : "connection-held"], { selected, scopeRef, scopeState: "matched", providerState: "held", attention: ["docs/NEEDED.md#social-distribution-connection-001"] });
  }
  const provider = resolveProviderBinding({ registry: input.providerRegistry, publisherRegistry: input.publisherRegistry, connectionId: connection.id, environment: input.environment, requiredCapability: "publish-original" });
  if (provider.decision !== "eligible") {
    mark(gates, "provider", provider.decision === "denied" ? "fail" : "hold", provider.reasons.join("; "));
    return finish("held", ["provider-held"], { selected, scopeRef, scopeState: "matched", providerState: "held", attention: ["docs/NEEDED.md#social-distribution-connection-001"] });
  }
  mark(gates, "routine-scope", "pass", "Exact countersigned scope matches candidate, content, source, cadence, cost and dates.", scopeRef);
  mark(gates, "provider", "pass", "Exact #417 provider binding is eligible.", provider.target?.binding.id ?? null);
  mark(gates, "authority", "pass", "Routine scope authorizes queue handoff only; publishing gates remain with #409.", scopeMatch.scope.countersignatureRef);
  return finish("queued", ["selected"], { selected, scopeRef, scopeState: "matched", providerState: "ready", queue: proposedQueue });
}
