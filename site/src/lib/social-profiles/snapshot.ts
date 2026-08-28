import "server-only";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseAmplificationPolicy, parseAmplifierPortfolio } from "./amplifier-model";
import { parseSocialCampaign, parseSocialCampaignDecision, parseSocialCampaignEvent, type SocialCampaignDecisionRecord, type SocialCampaignEventRecord, type SocialCampaignRecord } from "./campaign-model";
import { campaignTargetApprovalHash, projectAdminCampaign } from "./campaign-projection";
import { readAdminDistributionNetwork, type AdminDistributionNetworkSnapshot } from "./network-snapshot";
import { readAdminSocialProviders, type AdminSocialProviderSnapshot } from "./provider-snapshot";
import { readAdminContentRunway, type AdminContentRunwaySnapshot } from "./inventory-snapshot";
import { readAdminSocialResults, type AdminSocialResultsSnapshot } from "./results-snapshot";
import { readAdminSocialDaily, type AdminSocialDailySnapshot } from "./daily-snapshot";
import { readAdminSocialLearning, type AdminSocialLearningSnapshot } from "./learning-snapshot";
import { readAdminSocialAutomationHealth, type AdminSocialAutomationSnapshot } from "./automation-health-snapshot";
import { readAdminImplementationProgress, type AdminImplementationProgress } from "../admin-implementation-plans";
import {
  parseSocialConnection,
  parseSocialProfile,
  parseSocialProfileEvent,
  rawRecord,
  type AmplificationPolicyRecord,
  type AmplifierProposalRecord,
  type SocialConnectionRecord,
  type SocialProfileEventRecord,
  type SocialProfileLifecycle,
  type SocialProfileRecord
} from "./model";
import { createAdminSocialProfileSimulations, type SocialProfileSimulationView } from "./simulation-fixtures";

export interface SocialCapabilityView {
  decision: "allowed" | "held" | "denied" | "not-applicable";
  reason: string;
  mapVersion: string | null;
  governingReference: string | null;
}

export interface SocialConnectionView extends SocialConnectionRecord {
  currentState: "draft" | "held" | "ready" | "paused" | "disconnected" | "reauthorisation-required";
  tokenHealth: "not-configured" | "healthy" | "expiring" | "expired" | "unavailable";
  appReviewHealth: "not-configured" | "current" | "expiring" | "expired" | "unavailable";
  paused: boolean;
}

export interface SocialProfileView {
  profile: SocialProfileRecord;
  lifecycle: SocialProfileLifecycle;
  connections: SocialConnectionView[];
  capability: SocialCapabilityView;
  activation: { status: string; counter: number; required: number; reason: string; updatedAt: string } | null;
  paused: boolean;
  authority: "held";
  operationalMetrics: null;
}

export interface AmplifierProfileView {
  proposal: AmplifierProposalRecord;
  purposeVerdict: "accept" | "hold" | "reject" | "unavailable";
  purposeReason: string;
  policy: AmplificationPolicyRecord | null;
  authority: "held";
  operationalMetrics: null;
}

export interface SocialCampaignView {
  campaign: SocialCampaignRecord;
  immutableStatus: SocialCampaignRecord["status"];
  appliedEvents: number;
  rejectedEvents: number;
  targetApprovalHashes: Record<string, string>;
  operationalResults: null;
}

export interface AdminSocialProfilesSnapshot {
  schemaVersion: "admin-social-profiles/1";
  generatedAt: string;
  ventureProfiles: SocialProfileView[];
  amplificationProfiles: AmplifierProfileView[];
  campaigns: SocialCampaignView[];
  network: AdminDistributionNetworkSnapshot;
  providerControl: AdminSocialProviderSnapshot;
  contentRunway: AdminContentRunwaySnapshot;
  socialResults: AdminSocialResultsSnapshot;
  today: AdminSocialDailySnapshot;
  learning: AdminSocialLearningSnapshot;
  automationHealth: AdminSocialAutomationSnapshot;
  implementationProgress: AdminImplementationProgress;
  campaignDecisions: SocialCampaignDecisionRecord[];
  campaignActivity: SocialCampaignEventRecord[];
  activity: SocialProfileEventRecord[];
  simulations: SocialProfileSimulationView[];
  simulationsIncluded: boolean;
  posture: {
    globalKillSwitch: "engaged" | "released";
    repositoryPause: boolean;
    ownerDecisionRef: string;
    liveAuthorityGranted: false;
  };
  dropped: { profiles: number; connections: number; amplifierProposals: number; events: number; campaigns: number; campaignDecisions: number; campaignEvents: number; networkContacts: number; networkContactEvents: number; networkShareKits: number; networkShareKitEvents: number; providerRecords: number; providerBindings: number; providerReceipts: number; providerHealth: number; inventoryStrategies: number; inventories: number; inventoryReceipts: number; inventoryIncidents: number; resultObservations: number; attributionEvents: number; resultBaselines: number; resultExperiments: number; boostProposals: number; dailyOperations: number; routineScopes: number; learningRecords: number; pauseRecords: number };
  unavailable: string[];
  excluded: { ownerPersonal: number; simulations: number; forbiddenVentureProfiles: number; orphanConnections: number };
}

type CapabilityEdge = { source: string; decision: "allowed" | "held" | "denied"; reason: string; governingReference: string; mapVersion: string; dataSchemaVersion: string };
type Activation = Record<string, { status: string; counter: number; required: number; reason: string; updatedAt: string }>;

async function jsonFile(root: string, relative: string): Promise<{ value: unknown | null; state: "present" | "missing" | "malformed" }> {
  try {
    const raw = await readFile(path.join(root, relative), "utf8");
    try { return { value: JSON.parse(raw) as unknown, state: "present" }; } catch { return { value: null, state: "malformed" }; }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { value: null, state: "missing" };
    return { value: null, state: "malformed" };
  }
}

async function existing(root: string, relative: string): Promise<boolean> {
  try { await access(path.join(root, relative)); return true; } catch { return false; }
}

async function idFiles(root: string, relative: string): Promise<{ ids: Set<string>; dropped: number }> {
  const directory = path.join(root, relative);
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { ids: new Set(), dropped: 1 };
  const ids = new Set<string>(); let dropped = 0;
  for (const file of files) {
    const match = /^(social-(?:profile|connection)-[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.json|\.pause)$/u.exec(file);
    if (match?.[1]) ids.add(match[1]); else if (!file.startsWith(".")) dropped += 1;
  }
  return { ids, dropped };
}

async function events(root: string): Promise<{ accepted: SocialProfileEventRecord[]; dropped: number }> {
  const directory = path.join(root, "state/social/profile-events");
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  if (files === null) return { accepted: [], dropped: 1 };
  const accepted: SocialProfileEventRecord[] = []; let dropped = 0;
  for (const file of files.filter((name) => name.endsWith(".json")).sort().slice(0, 2_000)) {
    try {
      const parsed = parseSocialProfileEvent(JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown);
      if (parsed) accepted.push(parsed); else dropped += 1;
    } catch { dropped += 1; }
  }
  return { accepted: accepted.sort((left, right) => right.at.localeCompare(left.at)), dropped };
}

async function campaignEvidence(root: string): Promise<{ campaigns: SocialCampaignRecord[]; decisions: SocialCampaignDecisionRecord[]; events: SocialCampaignEventRecord[]; dropped: { campaigns: number; decisions: number; events: number } }> {
  const campaignDirectory = path.join(root, "state/social/campaigns"); const eventDirectory = path.join(root, "state/social/campaign-events");
  const campaignFiles = await readdir(campaignDirectory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  const eventFiles = await readdir(eventDirectory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : null);
  const campaigns: SocialCampaignRecord[] = []; const decisions: SocialCampaignDecisionRecord[] = []; const acceptedEvents: SocialCampaignEventRecord[] = [];
  let droppedCampaigns = campaignFiles === null ? 1 : 0; let droppedDecisions = 0; let droppedEvents = eventFiles === null ? 1 : 0;
  for (const file of (campaignFiles ?? []).filter((name) => name.endsWith(".json")).sort().slice(0, 4_000)) {
    try {
      const value = JSON.parse(await readFile(path.join(campaignDirectory, file), "utf8")) as unknown;
      if (file.endsWith(".decision.json")) { const parsed = parseSocialCampaignDecision(value); if (parsed) decisions.push(parsed); else droppedDecisions += 1; }
      else { const parsed = parseSocialCampaign(value); if (parsed) campaigns.push(parsed); else droppedCampaigns += 1; }
    } catch { if (file.endsWith(".decision.json")) droppedDecisions += 1; else droppedCampaigns += 1; }
  }
  for (const file of (eventFiles ?? []).filter((name) => name.endsWith(".json")).sort().slice(0, 4_000)) {
    try { const parsed = parseSocialCampaignEvent(JSON.parse(await readFile(path.join(eventDirectory, file), "utf8")) as unknown); if (parsed) acceptedEvents.push(parsed); else droppedEvents += 1; } catch { droppedEvents += 1; }
  }
  return { campaigns, decisions: decisions.sort((left, right) => right.decidedAt.localeCompare(left.decidedAt)), events: acceptedEvents.sort((left, right) => right.at.localeCompare(left.at)), dropped: { campaigns: droppedCampaigns, decisions: droppedDecisions, events: droppedEvents } };
}

function capabilityMap(value: unknown): { version: string | null; edges: CapabilityEdge[] } {
  const item = rawRecord(value); const version = typeof item?.mapVersion === "string" ? item.mapVersion : null;
  if (item?.schemaVersion !== "venture-capability-map/1" || !version || !Array.isArray(item.edges)) return { version: null, edges: [] };
  return {
    version,
    edges: item.edges.flatMap((raw): CapabilityEdge[] => {
      const edge = rawRecord(raw);
      return edge?.target === "social-distribution" && edge.capability === "approved-publish-package" && typeof edge.source === "string" && ["allowed", "held", "denied"].includes(String(edge.decision)) && typeof edge.reason === "string" && typeof edge.governingReference === "string" && typeof edge.dataSchemaVersion === "string"
        ? [{ source: edge.source, decision: edge.decision as CapabilityEdge["decision"], reason: edge.reason, governingReference: edge.governingReference, mapVersion: version, dataSchemaVersion: edge.dataSchemaVersion }]
        : [];
    })
  };
}

function capabilityView(profile: SocialProfileRecord, map: ReturnType<typeof capabilityMap>): SocialCapabilityView {
  if (profile.role === "owner-personal") return { decision: "not-applicable", reason: "Owner-personal records cannot receive portfolio distribution packages.", mapVersion: map.version, governingReference: "GitHub #424" };
  const sources = profile.supportedVentures.length > 0 ? profile.supportedVentures : profile.ventureRef ? [profile.ventureRef] : [];
  if (sources.length === 0) return { decision: "not-applicable", reason: "This profile has no venture package relationship.", mapVersion: map.version, governingReference: null };
  const decisions = sources.map((source) => {
    const reference = profile.capabilityRefs.find((candidate) => candidate.source === source);
    const edge = map.edges.find((candidate) => candidate.source === source);
    if (!reference || !edge) return { decision: "denied" as const, reason: `No exact #424 approved-publish-package edge is recorded for ${source}.`, governingReference: "GitHub #424" };
    if (reference.mapVersion !== map.version || reference.decisionReference !== edge.governingReference || edge.dataSchemaVersion !== reference.dataSchemaVersion) return { decision: "denied" as const, reason: `The #424 reference for ${source} is stale or mismatched.`, governingReference: edge.governingReference };
    return edge;
  });
  const selected = decisions.find(({ decision }) => decision === "denied") ?? decisions.find(({ decision }) => decision === "held") ?? decisions[0]!;
  return { decision: selected.decision, reason: selected.reason, mapVersion: map.version, governingReference: selected.governingReference };
}

function activation(value: unknown): Activation {
  const item = rawRecord(value); const ventures = rawRecord(item?.ventures); if (item?.schemaVersion !== "social-activation/1" || !ventures) return {};
  return Object.fromEntries(Object.entries(ventures).flatMap(([id, raw]) => {
    const row = rawRecord(raw);
    return row && typeof row.status === "string" && Number.isInteger(row.counter) && Number.isInteger(row.required) && typeof row.reason === "string" && typeof row.updatedAt === "string"
      ? [[id, { status: row.status, counter: row.counter as number, required: row.required as number, reason: row.reason, updatedAt: row.updatedAt }]] : [];
  }));
}

function reducedLifecycle(profile: SocialProfileRecord, history: readonly SocialProfileEventRecord[]): SocialProfileLifecycle {
  const latest = history.find((event) => event.profileId === profile.id && event.connectionId === null && event.action !== "corrected");
  if (!latest) return profile.lifecycle;
  if (latest.action === "proposed") return "proposed";
  if (latest.action === "setup-requested") return "setup-needed";
  if (latest.action === "activated") return "active";
  if (["paused", "retired", "rejected"].includes(latest.action)) return latest.action as "paused" | "retired" | "rejected";
  return profile.lifecycle;
}

function expiry(value: string | null, now: Date): "not-configured" | "healthy" | "expiring" | "expired" {
  if (!value) return "not-configured";
  const remaining = new Date(value).getTime() - now.getTime();
  return remaining <= 0 ? "expired" : remaining <= 14 * 86_400_000 ? "expiring" : "healthy";
}

function connectionView(connection: SocialConnectionRecord, history: readonly SocialProfileEventRecord[], paused: ReadonlySet<string>, now: Date): SocialConnectionView {
  const latest = history.find((event) => event.connectionId === connection.id && event.action !== "corrected");
  const isPaused = paused.has(connection.id) || latest?.action === "paused";
  const currentState = latest?.action === "disconnected" ? "disconnected" : latest?.action === "reauthorisation-requested" ? "reauthorisation-required" : isPaused ? "paused" : connection.mode === "autopublish" && connection.health.status === "healthy" ? "ready" : connection.mode === "draft" ? "draft" : "held";
  const unavailable = connection.health.status === "unavailable" ? "unavailable" as const : null;
  const appReview = unavailable ?? expiry(connection.appReviewExpiresAt, now);
  return { ...connection, currentState, tokenHealth: unavailable ?? expiry(connection.tokenExpiresAt, now), appReviewHealth: appReview === "healthy" ? "current" : appReview, paused: isPaused };
}

export async function readAdminSocialProfiles(root = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."), options: { includeSimulations?: boolean; now?: Date; environment?: NodeJS.ProcessEnv } = {}): Promise<AdminSocialProfilesSnapshot> {
  const now = options.now ?? new Date(); const environment = options.environment ?? process.env;
  const [registryFile, portfolioFile, policyFile, capabilityFile, activationFile, eventState, campaignState, network, providerControl, contentRunwayState, automationHealth, implementationProgress, profilePauses, profileKills, connectionPauses, connectionKills, repoPause] = await Promise.all([
    jsonFile(root, "config/social-publisher-registry.json"), jsonFile(root, "state/social/amplifiers/portfolio.json"), jsonFile(root, "config/social-amplification-policy.json"), jsonFile(root, "config/venture-capabilities.json"), jsonFile(root, "state/social/activation.json"), events(root), campaignEvidence(root), readAdminDistributionNetwork(root, now), readAdminSocialProviders(root), readAdminContentRunway(root), readAdminSocialAutomationHealth(root), readAdminImplementationProgress(root), idFiles(root, "state/social/pauses/profiles"), idFiles(root, "state/social/kill-switches/profiles"), idFiles(root, "state/social/pauses/connections"), idFiles(root, "state/social/kill-switches/connections"), existing(root, "state/social/SOCIAL_PAUSED")
  ]);
  const unavailable: string[] = [];
  for (const [label, file] of [["publisher registry", registryFile], ["amplifier portfolio", portfolioFile], ["amplification policy", policyFile], ["capability map", capabilityFile], ["activation state", activationFile]] as const) if (file.state !== "present") unavailable.push(`${label}: ${file.state}`);
  unavailable.push(...providerControl.unavailable);
  unavailable.push(...contentRunwayState.unavailable);
  unavailable.push(...automationHealth.unavailable);
  const registry = rawRecord(registryFile.value); const rawProfiles = registry?.schemaVersion === "social-publisher-registry/1" && Array.isArray(registry.profiles) ? registry.profiles.slice(0, 200) : []; const rawConnections = registry?.schemaVersion === "social-publisher-registry/1" && Array.isArray(registry.connections) ? registry.connections.slice(0, 400) : [];
  const parsedProfiles = rawProfiles.map(parseSocialProfile); const parsedConnections = rawConnections.map(parseSocialConnection); const acceptedProfiles = parsedProfiles.filter((entry): entry is SocialProfileRecord => entry !== null); const acceptedConnections = parsedConnections.filter((entry): entry is SocialConnectionRecord => entry !== null);
  const allowedProfiles = acceptedProfiles.filter((profile) => profile.ventureRef !== "personal-growth" && profile.ventureRef !== "kvorum"); const ownerPersonal = allowedProfiles.filter((profile) => profile.kind === "owner-personal"); const realProfiles = allowedProfiles.filter((profile) => profile.kind === "owned-brand" && ["venture-primary", "company-umbrella"].includes(profile.role)); const storedSimulations = acceptedProfiles.filter((profile) => profile.kind === "simulation");
  const knownIds = new Set(acceptedProfiles.map(({ id }) => id)); const orphanConnections = acceptedConnections.filter((connection) => !knownIds.has(connection.profileId)); const connections = acceptedConnections.filter((connection) => knownIds.has(connection.profileId));
  const profilePaused = new Set([...profilePauses.ids, ...profileKills.ids]); const connectionPaused = new Set([...connectionPauses.ids, ...connectionKills.ids]); const map = capabilityMap(capabilityFile.value); const activationState = activation(activationFile.value);
  const ventureProfiles = realProfiles.map((profile): SocialProfileView => ({ profile, lifecycle: reducedLifecycle(profile, eventState.accepted), connections: connections.filter((connection) => connection.profileId === profile.id).map((connection) => connectionView(connection, eventState.accepted, connectionPaused, now)), capability: capabilityView(profile, map), activation: profile.ventureRef ? activationState[profile.ventureRef] ?? null : null, paused: profilePaused.has(profile.id), authority: "held", operationalMetrics: null }));
  const portfolio = parseAmplifierPortfolio(portfolioFile.value); const policy = parseAmplificationPolicy(policyFile.value); const amplificationProfiles = (portfolio.portfolio?.proposals ?? []).map((proposal): AmplifierProfileView => ({ proposal, purposeVerdict: proposal.ownerDecision?.verdict ?? "unavailable", purposeReason: proposal.ownerDecision?.reason ?? "The #415 owner purpose verdict has not been recorded.", policy, authority: "held", operationalMetrics: null }));
  const runwayProfileIds = new Set([...realProfiles.map(({ id }) => id), ...amplificationProfiles.map(({ proposal }) => proposal.profileId)]);
  const runwayProfiles = contentRunwayState.profiles.filter(({ strategy }) => runwayProfileIds.has(strategy.profileId));
  const runwayReceipts = contentRunwayState.receipts.filter(({ profileId }) => runwayProfileIds.has(profileId));
  const runwayIncidents = contentRunwayState.incidents.filter(({ profileId }) => runwayProfileIds.has(profileId));
  const contentRunway: AdminContentRunwaySnapshot = {
    ...contentRunwayState,
    profiles: runwayProfiles,
    receipts: runwayReceipts,
    incidents: runwayIncidents,
    summary: {
      strategies: runwayProfiles.length,
      healthy: runwayProfiles.filter(({ state }) => state === "healthy").length,
      lowOrNoRunway: runwayProfiles.filter(({ state }) => state === "low-runway" || state === "no-candidate").length,
      unavailable: runwayProfiles.filter(({ state }) => state === "unavailable").length,
      actualCostUsd: runwayReceipts.reduce((total, receipt) => total + receipt.actualCostUsd, 0)
    },
    dropped: {
      ...contentRunwayState.dropped,
      orphanRecords: contentRunwayState.dropped.orphanRecords
        + contentRunwayState.profiles.length - runwayProfiles.length
        + contentRunwayState.receipts.length - runwayReceipts.length
        + contentRunwayState.incidents.length - runwayIncidents.length
    }
  };
  const knownConnectionIds = new Set(connections.filter(({ profileId }) => runwayProfileIds.has(profileId)).map(({ id }) => id));
  const [socialResults, today, learning] = await Promise.all([
    readAdminSocialResults(
      root,
      runwayProfileIds,
      new Set(campaignState.campaigns.map(({ id }) => `state/social/campaigns/${id}.json`))
    ),
    readAdminSocialDaily(root, runwayProfileIds, knownConnectionIds, now),
    readAdminSocialLearning(root, runwayProfileIds)
  ]);
  unavailable.push(...socialResults.unavailable);
  unavailable.push(...today.unavailable);
  unavailable.push(...learning.unavailable);
  const campaigns = campaignState.campaigns.map((immutable): SocialCampaignView => {
    const projected = projectAdminCampaign(immutable, campaignState.events);
    return { campaign: projected.campaign, immutableStatus: immutable.status, appliedEvents: projected.appliedEventIds.length, rejectedEvents: projected.rejectedEventIds.length, targetApprovalHashes: Object.fromEntries(projected.campaign.targets.map((target) => [target.id, campaignTargetApprovalHash(projected.campaign.channelItems.filter((item) => item.targetId === target.id))])), operationalResults: null };
  }).sort((left, right) => right.campaign.updatedAt.localeCompare(left.campaign.updatedAt));
  const simulationsIncluded = options.includeSimulations === true && environment.NODE_ENV !== "production";
  return { schemaVersion: "admin-social-profiles/1", generatedAt: now.toISOString(), ventureProfiles, amplificationProfiles, campaigns, network, providerControl, contentRunway, socialResults, today, learning, automationHealth, implementationProgress, campaignDecisions: campaignState.decisions, campaignActivity: campaignState.events, activity: eventState.accepted, simulations: simulationsIncluded ? createAdminSocialProfileSimulations() : [], simulationsIncluded, posture: { globalKillSwitch: environment.SOCIAL_KILL_SWITCH === "false" ? "released" : "engaged", repositoryPause: repoPause, ownerDecisionRef: "state/decisions/2026-08-27-social-distribution-operating-decision.md", liveAuthorityGranted: false }, dropped: { profiles: parsedProfiles.length - acceptedProfiles.length, connections: parsedConnections.length - acceptedConnections.length, amplifierProposals: portfolio.droppedProposals, events: eventState.dropped, campaigns: campaignState.dropped.campaigns, campaignDecisions: campaignState.dropped.decisions, campaignEvents: campaignState.dropped.events, networkContacts: network.dropped.contacts, networkContactEvents: network.dropped.contactEvents, networkShareKits: network.dropped.shareKits, networkShareKitEvents: network.dropped.shareKitEvents, providerRecords: providerControl.dropped.providers, providerBindings: providerControl.dropped.bindings + providerControl.dropped.orphanBindings, providerReceipts: providerControl.dropped.receipts, providerHealth: providerControl.dropped.health, inventoryStrategies: contentRunway.dropped.strategies + contentRunway.dropped.orphanRecords, inventories: contentRunway.dropped.inventories, inventoryReceipts: contentRunway.dropped.receipts, inventoryIncidents: contentRunway.dropped.incidents, resultObservations: socialResults.dropped.observations + socialResults.dropped.orphanRecords, attributionEvents: socialResults.dropped.attribution, resultBaselines: socialResults.dropped.baselines, resultExperiments: socialResults.dropped.experiments, boostProposals: socialResults.dropped.boostProposals, dailyOperations: today.dropped.operations + today.dropped.orphanRecords, routineScopes: today.dropped.routineScopes, learningRecords: Object.values(learning.dropped).reduce((total, value) => total + value, 0), pauseRecords: profilePauses.dropped + profileKills.dropped + connectionPauses.dropped + connectionKills.dropped }, unavailable, excluded: { ownerPersonal: ownerPersonal.length, simulations: storedSimulations.length, forbiddenVentureProfiles: acceptedProfiles.length - allowedProfiles.length, orphanConnections: orphanConnections.length } };
}
