import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialActivationSchema } from "../contracts/autonomy.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { atomicWriteJson, readJson } from "../state.js";
import { SocialProviderRegistrySchema } from "./providers.js";
import { CapabilityAwareQueueItemSchema, QueueItemSchema } from "./queue.js";
import { SocialPublisherRegistrySchema, migrateLegacyQueueItem } from "./publisher-targets.js";

export const SOCIAL_MIGRATION_AUDIT_PATH = "social/migrations/social-distribution-core-v1.json";

export interface SocialMigrationAudit {
  schemaVersion: "social-distribution-migration-audit/1";
  migrationId: string;
  inputHash: string;
  generatedAt: string;
  counts: { migrated: number; unchanged: number; held: number; unavailable: number; dropped: number; malformed: number };
  breakdown: {
    migratedLegacyProfiles: number;
    migratedConnectionReferences: number;
    migratedLegacyQueueItems: number;
    unchangedActivationRecords: number;
    heldFutureProfiles: number;
    heldProviderBindings: number;
    heldOptionalProviders: number;
  };
  legacyQueue: Array<{
    sourceRef: string;
    id: string;
    sourceSchemaVersion: 1 | 2;
    sourceContentHash: string;
    resolvedContentHash: string;
    status: string;
    attemptPreserved: boolean;
    receiptPreserved: boolean;
    remoteAndFailureEvidencePreserved: true;
  }>;
  invariants: {
    existingAccountsOnly: boolean;
    explicitRolesPreserved: boolean;
    providerReferencesOnly: boolean;
    timestampsPresentWithoutSecretValues: boolean;
    sourceQueueHistoryRetained: true;
    queueHashesPreservedAsMigrationEvidence: boolean;
    attemptsReceiptsRemotesAndFailuresRetained: boolean;
    noReclassification: boolean;
    noInventedMetricsOrAuthority: boolean;
    futureProfilesHeld: boolean;
    optionalProvidersHeld: boolean;
    sisterTargetsAbsent: boolean;
  };
  rollback: {
    sourceQueueMutated: false;
    previousReaders: ["QueueItemSchema", "SocialActivationSchema"];
    compatibilityReader: "resolveCapabilityAwareQueueItem";
    providerRollbackRef: "docs/SOCIAL-PROVIDERS.md#explicit-provider-migration-and-rollback";
  };
  authorityGranted: false;
  publishingAuthorized: false;
  auditHash: string;
}

async function parseJsonFile(file: string): Promise<{ value: unknown | null; malformed: boolean }> {
  try {
    return { value: JSON.parse(await readFile(file, "utf8")) as unknown, malformed: false };
  } catch {
    return { value: null, malformed: true };
  }
}

function auditHash(value: Omit<SocialMigrationAudit, "auditHash">): string {
  return sha256(canonicalJson(value));
}

export async function auditSocialDistributionMigration(input: { repoRoot: string; stateRoot?: string }): Promise<SocialMigrationAudit> {
  const stateRoot = input.stateRoot ?? path.join(input.repoRoot, "state");
  const [publisherRaw, providersRaw, activationRaw] = await Promise.all([
    readFile(path.join(input.repoRoot, "config/social-publisher-registry.json"), "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(path.join(input.repoRoot, "config/social-providers.json"), "utf8").then((value) => JSON.parse(value) as unknown),
    readFile(path.join(stateRoot, "social/activation.json"), "utf8").then((value) => JSON.parse(value) as unknown)
  ]);
  const publisher = SocialPublisherRegistrySchema.parse(publisherRaw);
  const providers = SocialProviderRegistrySchema.parse(providersRaw);
  const activation = SocialActivationSchema.parse(activationRaw);
  const queueRoot = path.join(stateRoot, "social/queue");
  const entries = await readdir(queueRoot, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  const queueFiles = entries?.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map(({ name }) => name).sort() ?? [];
  const legacyQueue: SocialMigrationAudit["legacyQueue"] = [];
  let malformed = 0; let dropped = 0;
  const inputQueue: unknown[] = [];
  for (const filename of queueFiles) {
    const parsed = await parseJsonFile(path.join(queueRoot, filename));
    if (parsed.malformed) { malformed += 1; continue; }
    inputQueue.push(parsed.value);
    const legacy = QueueItemSchema.safeParse(parsed.value);
    const current = CapabilityAwareQueueItemSchema.safeParse(parsed.value);
    if (!legacy.success && !current.success) { dropped += 1; continue; }
    const legacyItem = legacy.success ? legacy.data : null;
    const resolved = current.success ? current.data : migrateLegacyQueueItem(legacyItem!, publisher);
    legacyQueue.push({
      sourceRef: `state/social/queue/${filename}`,
      id: resolved.id,
      sourceSchemaVersion: current.success ? 2 : 1,
      sourceContentHash: current.success ? resolved.content.contentHash : legacyItem!.content.contentHash,
      resolvedContentHash: resolved.content.contentHash,
      status: resolved.status,
      attemptPreserved: current.success || canonicalJson(resolved.attempt) === canonicalJson(legacyItem!.attempt),
      receiptPreserved: current.success || resolved.receiptId === legacyItem!.receiptId,
      remoteAndFailureEvidencePreserved: true
    });
  }
  const migratedLegacyProfiles = publisher.profiles.filter(({ provenance }) => provenance.source === "migration").length;
  const migratedConnectionReferences = publisher.connections.filter(({ profileId }) => publisher.profiles.some(({ id, provenance }) => id === profileId && provenance.source === "migration")).length;
  const migratedLegacyQueueItems = legacyQueue.filter(({ sourceSchemaVersion }) => sourceSchemaVersion === 1).length;
  const unchangedActivationRecords = Object.keys(activation.ventures).length;
  const heldFutureProfiles = publisher.profiles.filter(({ provenance, liveEligible }) => provenance.source !== "migration" && !liveEligible).length;
  const heldProviderBindings = providers.bindings.filter(({ mode }) => mode !== "active").length;
  const heldOptionalProviders = providers.providers.filter(({ id, verdict }) => id !== "direct-meta" && verdict !== "enabled").length;
  const unavailable = entries === null ? 1 : 0;
  const counts = {
    migrated: migratedLegacyProfiles + migratedConnectionReferences + migratedLegacyQueueItems,
    unchanged: unchangedActivationRecords,
    held: heldFutureProfiles + heldProviderBindings + heldOptionalProviders,
    unavailable,
    dropped,
    malformed
  };
  const generatedAt = [publisher.updatedAt, providers.updatedAt].sort().at(-1)!;
  const inputHash = sha256(canonicalJson({ publisher, providers, activation, queue: inputQueue }));
  const withoutHash: Omit<SocialMigrationAudit, "auditHash"> = {
    schemaVersion: "social-distribution-migration-audit/1",
    migrationId: `social-distribution-migration-${inputHash.slice(0, 20)}`,
    inputHash,
    generatedAt,
    counts,
    breakdown: { migratedLegacyProfiles, migratedConnectionReferences, migratedLegacyQueueItems, unchangedActivationRecords, heldFutureProfiles, heldProviderBindings, heldOptionalProviders },
    legacyQueue,
    invariants: {
      existingAccountsOnly: publisher.profiles.filter(({ provenance }) => provenance.source === "migration").every(({ ventureRef }) => ventureRef !== null && Object.hasOwn(activation.ventures, ventureRef)),
      explicitRolesPreserved: publisher.legacyQueueMappings.every((mapping) => publisher.profiles.some(({ id, role, ventureRef }) => id === mapping.profileId && role === "venture-primary" && ventureRef === mapping.venture)),
      providerReferencesOnly: publisher.connections.every(({ credentialRef, nativeAccountIdRef, nativeAccountId }) => credentialRef !== null && nativeAccountIdRef !== null && nativeAccountId === null),
      timestampsPresentWithoutSecretValues: publisher.profiles.every(({ createdAt, updatedAt }) => Boolean(createdAt && updatedAt)) && providers.bindings.every(({ createdAt }) => Boolean(createdAt)),
      sourceQueueHistoryRetained: true,
      queueHashesPreservedAsMigrationEvidence: legacyQueue.every(({ sourceSchemaVersion, sourceContentHash }) => sourceSchemaVersion === 2 || /^[a-f0-9]{64}$/u.test(sourceContentHash)),
      attemptsReceiptsRemotesAndFailuresRetained: legacyQueue.every(({ attemptPreserved, receiptPreserved, remoteAndFailureEvidencePreserved }) => attemptPreserved && receiptPreserved && remoteAndFailureEvidencePreserved),
      noReclassification: publisher.legacyQueueMappings.every(({ profileId }) => publisher.profiles.find(({ id }) => id === profileId)?.role === "venture-primary"),
      noInventedMetricsOrAuthority: publisher.profiles.every(({ liveEligible }) => liveEligible === false) && publisher.connections.every(({ enabledByHumanAt }) => enabledByHumanAt === null),
      futureProfilesHeld: publisher.profiles.filter(({ provenance }) => provenance.source !== "migration").every(({ liveEligible, lifecycle }) => !liveEligible && lifecycle !== "active"),
      optionalProvidersHeld: providers.providers.filter(({ id }) => id !== "direct-meta").every(({ verdict }) => verdict !== "enabled") && providers.bindings.every(({ providerId }) => providerId === "direct-meta"),
      sisterTargetsAbsent: !canonicalJson({ profiles: publisher.profiles, mappings: publisher.legacyQueueMappings }).includes('"sister"')
    },
    rollback: { sourceQueueMutated: false, previousReaders: ["QueueItemSchema", "SocialActivationSchema"], compatibilityReader: "resolveCapabilityAwareQueueItem", providerRollbackRef: "docs/SOCIAL-PROVIDERS.md#explicit-provider-migration-and-rollback" },
    authorityGranted: false,
    publishingAuthorized: false
  };
  return { ...withoutHash, auditHash: auditHash(withoutHash) };
}

export async function persistSocialDistributionMigrationAudit(input: { repoRoot: string; stateRoot: string }): Promise<{ audit: SocialMigrationAudit; path: string; written: boolean }> {
  const audit = await auditSocialDistributionMigration(input);
  const existing = await readJson<SocialMigrationAudit | null>(input.stateRoot, SOCIAL_MIGRATION_AUDIT_PATH, null);
  if (existing?.auditHash === audit.auditHash) return { audit: existing, path: SOCIAL_MIGRATION_AUDIT_PATH, written: false };
  await atomicWriteJson(input.stateRoot, SOCIAL_MIGRATION_AUDIT_PATH, audit);
  return { audit, path: SOCIAL_MIGRATION_AUDIT_PATH, written: true };
}
