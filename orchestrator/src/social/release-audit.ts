import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { canonicalJson, sha256 } from "../hashing.js";
import { repoRoot as defaultRepoRoot } from "../paths.js";
import { readImplementationManifestRegistry } from "../programs/manifests.js";
import { buildVentureRecoveryPolicyRegistry, loadOperationsRecoveryRegistry } from "../operations/recovery-policies.js";
import { loadVentureSloRegistry } from "../operations/slo.js";
import { loadVentureCapabilityMap } from "../ventures/capabilities.js";
import { auditSocialDistributionMigration } from "./migration-audit.js";
import { loadSocialProviderRegistry } from "./providers.js";
import { loadSocialPublisherRegistry } from "./publisher-targets.js";
import { loadSocialRoutineScopeRegistry } from "./routines.js";
import { loadSocialProfileStrategies } from "./strategies.js";

export interface SocialReleaseCheck { id: string; passed: boolean; detail: string; evidenceRefs: string[] }
export interface SocialPrivacyFinding { ref: string; reason: string }
export interface SocialPrivacyAudit { scannedFiles: number; findings: SocialPrivacyFinding[]; passed: boolean }
export interface SocialReleaseAudit { schemaVersion: "social-distribution-release-audit/1"; status: "pass" | "fail"; checks: SocialReleaseCheck[]; privacy: SocialPrivacyAudit; auditHash: string }

const check = (id: string, passed: boolean, detail: string, evidenceRefs: string[]): SocialReleaseCheck => ({ id, passed, detail, evidenceRefs });

async function exists(root: string, relative: string): Promise<boolean> {
  try { await access(path.join(root, relative)); return true; } catch { return false; }
}

async function jsonFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(entry.parentPath, entry.name)).sort();
}

function inspectPrivateKeys(value: unknown, ref: string, findings: SocialPrivacyFinding[], location = "$" ): void {
  if (Array.isArray(value)) { value.forEach((entry, index) => inspectPrivateKeys(entry, ref, findings, `${location}[${index}]`)); return; }
  if (!value || typeof value !== "object") return;
  const forbidden = new Set(["accesstoken", "refreshtoken", "clientsecret", "sessioncookie", "password", "credentialvalue", "nativeaccountidvalue", "privatemessage", "audienceidentity", "visitorid", "fingerprint"]);
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
    if (forbidden.has(normalized) || (normalized === "nativeaccountid" && entry !== null)) findings.push({ ref, reason: `private field ${location}.${key}` });
    inspectPrivateKeys(entry, ref, findings, `${location}.${key}`);
  }
}

export async function auditSocialPrivacy(repoRoot = defaultRepoRoot): Promise<SocialPrivacyAudit> {
  const configFiles = (await readdir(path.join(repoRoot, "config"), { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.startsWith("social-") && entry.name.endsWith(".json"))
    .map(({ name }) => path.join(repoRoot, "config", name));
  const files = [...configFiles, ...await jsonFiles(path.join(repoRoot, "state/social"))].sort();
  const findings: SocialPrivacyFinding[] = [];
  for (const file of files) {
    const ref = path.relative(repoRoot, file);
    try {
      const source = await readFile(file, "utf8");
      inspectPrivateKeys(JSON.parse(source) as unknown, ref, findings);
      if (/gh[pousr]_[a-z0-9]{20,}|bearer\s+[a-z0-9._~+\/-]{12,}|access_token=[^\s&"']{8,}/iu.test(source)) findings.push({ ref, reason: "token-shaped value" });
    } catch { findings.push({ ref, reason: "unreadable or malformed JSON" }); }
  }
  return { scannedFiles: files.length, findings, passed: findings.length === 0 };
}

export async function auditSocialRelease(repoRoot = defaultRepoRoot): Promise<SocialReleaseAudit> {
  const configRoot = path.join(repoRoot, "config");
  const [publisher, providers, strategies, routineScopes, capabilities, slos, recoveryConfig, manifest, migration, privacy, queueSource, targetSource, providerSource, runnerSource, indexSource, campaignSource, dailySource, resultsSource, learningSource, healthSource, cycleSource, adminModel, adminSnapshot, adminWorkspace, proxySource, releaseDoc, neededDoc] = await Promise.all([
    loadSocialPublisherRegistry(configRoot), loadSocialProviderRegistry(configRoot), loadSocialProfileStrategies(configRoot), loadSocialRoutineScopeRegistry(path.join(configRoot, "social-routine-scopes.json")),
    loadVentureCapabilityMap(configRoot), loadVentureSloRegistry(configRoot), loadOperationsRecoveryRegistry(configRoot), readImplementationManifestRegistry(repoRoot),
    auditSocialDistributionMigration({ repoRoot }), auditSocialPrivacy(repoRoot),
    readFile(path.join(repoRoot, "orchestrator/src/social/queue.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/social/publisher-targets.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/social/providers.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/social/runner.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/social/index.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/social/campaigns.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/social/daily.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/social/results.ts"), "utf8"),
    readFile(path.join(repoRoot, "orchestrator/src/social/learning.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/social/health.ts"), "utf8"), readFile(path.join(repoRoot, "orchestrator/src/cycle.ts"), "utf8"),
    readFile(path.join(repoRoot, "site/src/lib/social-profiles/model.ts"), "utf8"), readFile(path.join(repoRoot, "site/src/lib/social-profiles/snapshot.ts"), "utf8"), readFile(path.join(repoRoot, "site/src/components/admin/social-profiles-workspace.tsx"), "utf8"),
    readFile(path.join(repoRoot, "site/src/proxy.ts"), "utf8"), readFile(path.join(repoRoot, "docs/SOCIAL-DISTRIBUTION-RELEASE.md"), "utf8"), readFile(path.join(repoRoot, "docs/NEEDED.md"), "utf8")
  ]);
  const checks: SocialReleaseCheck[] = [];
  const simulationMatrix = JSON.parse(await readFile(path.join(repoRoot, "contracts/fixtures/social-profile-simulation-matrix.json"), "utf8")) as { schemaVersion?: unknown; count?: unknown };
  const simulationModuleRef = ["orchestrator/src/social/fixtures", "profile-simulations.ts"].join("/");
  const forbiddenSimulationImport = ["fixtures", "profile-simulations"].join("/");
  const profileVentures = publisher.profiles.map(({ ventureRef }) => ventureRef).filter((value): value is string => value !== null).sort();
  // Eight profiles across seven ventures: WebDev Signal is the one venture with two, because its
  // Czech and English editions share a brand and an evidence brief but keep their own cadence,
  // metrics and kill state. Every clause with teeth is unchanged — every profile is an owned brand
  // that is not live-eligible, and only the three legacy brands have connections, all of them held.
  checks.push(check("owned-profile-topology", publisher.profiles.length === 8 && publisher.connections.length === 6 && publisher.legacyQueueMappings.length === 3
    && canonicalJson(profileVentures) === canonicalJson(["booksofhistory", "caught-up", "door-money", "mma-files", "tehdejsi-svet", "titty-tuesdays", "webdev-signal", "webdev-signal"])
    && publisher.profiles.every(({ kind, role, liveEligible }) => kind === "owned-brand" && role === "venture-primary" && !liveEligible)
    && publisher.connections.every(({ mode, enabledByHumanAt }) => mode === "held" && enabledByHumanAt === null),
  "Eight venture-primary profiles remain distinct, WebDev Signal holding one per locale edition; only the three legacy brands have held connection references and none is live.", ["config/social-publisher-registry.json"]));

  const socialAllowed = capabilities.edges.filter(({ target, decision, capability }) => target === "social-distribution" && decision === "allowed" && capability === "approved-publish-package").map(({ source }) => source).sort();
  const isolationIds = new Set(capabilities.isolationRules.map(({ id }) => id));
  checks.push(check("exact-capability-and-isolation", canonicalJson(socialAllowed) === canonicalJson(["door-money", "webdev-signal"])
    && isolationIds.has("booksofhistory-to-tehdejsi") && isolationIds.has("tehdejsi-to-booksofhistory") && isolationIds.has("personal-growth-no-portfolio") && isolationIds.has("kvorum-outbound-isolation")
    && targetSource.includes('["personal-growth", "kvorum", "goviral"]') && targetSource.includes("door-money-private-payload-forbidden"),
  "Only exact #424 Door Money/WebDev Signal packages can cross into Social Distribution; Personal Growth, Kvórum, GoVIRAL and both history cross-targets remain denied.", ["config/venture-capabilities.json", "orchestrator/src/social/publisher-targets.ts"]));

  checks.push(check("provider-and-queue-safety", providers.providers.filter(({ id, verdict }) => id === "direct-meta" && verdict === "enabled").length === 1
    && providers.providers.filter(({ id }) => id !== "direct-meta").every(({ verdict }) => verdict !== "enabled")
    && providers.bindings.length === publisher.connections.length && providers.bindings.every(({ providerId, mode, authorityGranted, publishingAuthorized }) => providerId === "direct-meta" && mode === "held" && !authorityGranted && !publishingAuthorized)
    && queueSource.includes('action: z.literal("publish-original")') && !queueSource.includes('z.literal("sister")')
    && providerSource.includes("at most one active provider") && runnerSource.includes("findByIdempotencyKey") && runnerSource.includes("needs_reconciliation"),
  "Direct Meta is the sole held core binding; queue v2 permits original publishing only and ambiguity reconciles before any resend or failover.", ["config/social-providers.json", "orchestrator/src/social/queue.ts", "orchestrator/src/social/runner.ts"]));

  checks.push(check("strategy-inventory-daily", strategies.strategies.length === 8 && strategies.strategies.every(({ authorityGranted, queueAuthorized, publishingAuthorized }) => !authorityGranted && !queueAuthorized && !publishingAuthorized)
    && routineScopes.defaultMode === "draft-only" && routineScopes.scopes.length === 0 && campaignSource.includes("inputHash: identity.idempotencyKey")
    && dailySource.includes('finish("NO_POST"') && dailySource.includes("ambiguousDelivery") && dailySource.includes("campaignCapacityAvailable"),
  "Every real profile has a held constitution; campaigns, runway and Prague-day selection preserve NO_POST, exact scope and ambiguity/capacity gates.", ["config/social-profile-strategies.json", "config/social-routine-scopes.json", "orchestrator/src/social/campaigns.ts", "orchestrator/src/social/daily.ts"]));

  checks.push(check("metrics-learning-health", resultsSource.includes("SocialMetricObservationSchema") && learningSource.includes("minimumMeasuredPosts") && learningSource.includes("SOCIAL_LEARNING_FROZEN_GATES")
    && healthSource.includes("NO_POST") && healthSource.includes("lastKnownGoodRef") && cycleSource.includes("runSocialLearningCheckpoint") && cycleSource.includes('venturePhase === "night"'),
  "Append-only metrics, sample-aware weekly learning and canonical Operations health run through existing checkpoints without a second scheduler.", ["orchestrator/src/social/results.ts", "orchestrator/src/social/learning.ts", "orchestrator/src/social/health.ts", "orchestrator/src/cycle.ts"]));

  const mandatorySections = ["Venture Profiles", "Amplification Profiles", "Activity & setup", "Campaigns", "Providers", "Results", "Content runway", "Today", "Learning", "Automation health", "Plan & progress"];
  checks.push(check("private-admin-complete", mandatorySections.every((label) => adminModel.includes(`label: "${label}"`)) && adminSnapshot.startsWith('import "server-only"')
    && adminSnapshot.includes("readAdminImplementationProgress") && adminWorkspace.includes("cannot mutate issues, deployment, authority, accounts, queues or publishing")
    && proxySource.includes('pathname.startsWith("/admin")'),
  "The authenticated Social Profiles workspace exposes all mandatory release sections from sanitized server readers, including shared Plan & progress.", ["site/src/lib/social-profiles/model.ts", "site/src/lib/social-profiles/snapshot.ts", "site/src/components/admin/social-profiles-workspace.tsx", "site/src/proxy.ts"]));

  const mandatoryIssues = [405, 406, 407, 409, 410, 412, 413, 415, 417, 418, 433, 434];
  const socialItems = manifest.workItems.filter(({ primaryProgramId }) => primaryProgramId === "social-distribution");
  checks.push(check("implementation-program-boundary", mandatoryIssues.every((number) => socialItems.filter(({ issue }) => issue.number === number).length === 1)
    && socialItems.some(({ issue, posture }) => issue.number === 411 && posture === "optional") && socialItems.some(({ issue, posture }) => issue.number === 430 && posture === "held-optional")
    && manifest.programs.find(({ id }) => id === "social-distribution")?.finalReleaseItemId === "issue-413" && adminSnapshot.includes("readAdminImplementationProgress"),
  "#419/#431 remain the single progress owner; #411 is optional, #430 remains held-optional, and neither blocks the #413 mandatory gate.", ["config/implementation-programs.json", "site/src/lib/admin-implementation-plans.ts"]));

  const recovery = buildVentureRecoveryPolicyRegistry(recoveryConfig, capabilities).policies.find(({ nodeId }) => nodeId === "social-distribution");
  const socialSlo = slos.policies.find(({ nodeId }) => nodeId === "social-distribution");
  checks.push(check("canonical-recovery-boundary", recovery?.pauseScope === "connection" && recovery.maximumIncrementalCostUsd === 0 && recovery.prohibitedActions.includes("account") && recovery.prohibitedActions.includes("oauth-or-secret")
    && socialSlo?.lifecycleStage === "operating" && socialSlo.cadence.kind === "daily", "#427 recovery can pause only the failing Social connection at $0 and cannot touch accounts, secrets, scope, content, budget or deployment.", ["config/operations-recovery.json", "config/venture-slos.json"]));

  checks.push(check("idempotent-migration-rollback", Object.values(migration.invariants).every(Boolean) && migration.counts.migrated === 13 && migration.counts.unchanged === 3 && migration.counts.held === 16
    && migration.counts.unavailable === 0 && migration.counts.dropped === 0 && migration.counts.malformed === 0 && !migration.rollback.sourceQueueMutated,
  "The compatibility audit preserves source history/readers, exact roles, hashes, attempts, receipts and held authority with explicit outcome counts.", ["orchestrator/src/social/migration-audit.ts", "docs/SOCIAL-PUBLISHER-MIGRATION.md"]));

  checks.push(check("simulation-boundary", simulationMatrix.schemaVersion === "social-profile-simulation-matrix/1" && simulationMatrix.count === 50
    && !targetSource.includes(forbiddenSimulationImport), "Exactly 50 deterministic visual-QA simulations remain labelled, non-live and absent from production target resolution.", [simulationModuleRef, "contracts/fixtures/social-profile-simulation-matrix.json"]));

  checks.push(check("privacy-and-redaction", privacy.passed && runnerSource.includes("redactSocialError") && runnerSource.includes("[REDACTED]") && indexSource.includes("redactSocialError(error)")
    && adminWorkspace.includes("secret values and native account values never cross the server boundary"), "Production Social config/state contains no credential values, private messages, audience identities or token-shaped values; CLI and connector errors are redacted.", ["orchestrator/src/social/runner.ts", "orchestrator/src/social/index.ts", "site/src/lib/social-profiles/snapshot.ts"]));

  checks.push(check("staged-release-and-owner-actions", ["Stage 0", "Stage 1", "Stage 2", "Stage 3", "Stage 4", "Rollback", "no live credentials", "zero live connections"].every((value) => releaseDoc.includes(value))
    && neededDoc.includes("SOCIAL-DISTRIBUTION-CONNECTION-001") && neededDoc.includes("countersign") && releaseDoc.includes("#430 remains held"),
  "Release guidance keeps all connections held through validation, names one owner-only setup item, stages any future canary and preserves evidence on rollback.", ["docs/SOCIAL-DISTRIBUTION-RELEASE.md", "docs/NEEDED.md"]));

  checks.push(check("optional-absence-nonblocking", !(await exists(repoRoot, "site/src/app/admin/ventures/contest-radar/page.tsx")) && !adminModel.includes('id: "contest-radar"') && !publisher.profiles.some(({ ventureRef }) => ventureRef === "contest-radar"),
  "Contest Radar remains absent from Social profiles, Admin sections and release authority; its held optional integration does not block release.", ["config/social-publisher-registry.json", "site/src/lib/social-profiles/model.ts"]));

  const withoutHash = { schemaVersion: "social-distribution-release-audit/1" as const, status: checks.every(({ passed }) => passed) ? "pass" as const : "fail" as const, checks, privacy };
  return { ...withoutHash, auditHash: sha256(canonicalJson(withoutHash)) };
}
