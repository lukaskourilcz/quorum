import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { DateTimeSchema, EvidenceRefSchema, VentureIdSchema } from "../contracts/common.js";
import {
  SocialConnectionSchema,
  SocialProfileSchema,
  type SocialConnection,
  type SocialProfile
} from "../contracts/social-distribution.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { configRoot as defaultConfigRoot } from "../paths.js";
import { resolveVentureCapabilityInMap } from "../ventures/capabilities.js";
import type { AmplifierEligibility } from "./amplifiers.js";
import {
  CapabilityAwareQueueItemSchema,
  QueueItemSchema,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "./queue.js";

const LegacyQueueMappingSchema = z.strictObject({
  venture: VentureIdSchema,
  profileId: z.string().regex(/^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  connections: z.strictObject({
    threads: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
    instagram: z.string().regex(/^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u)
  }),
  mappingRef: EvidenceRefSchema
});

export const SocialPublisherRegistrySchema = z.strictObject({
  schemaVersion: z.literal("social-publisher-registry/1"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  providerApiVersion: z.string().regex(/^v\d+\.\d+$/u),
  updatedAt: DateTimeSchema,
  ownerDecisionRef: EvidenceRefSchema,
  profiles: z.array(SocialProfileSchema).max(100),
  connections: z.array(SocialConnectionSchema).max(200),
  legacyQueueMappings: z.array(LegacyQueueMappingSchema).max(100)
}).superRefine((registry, context) => {
  const profileIds = registry.profiles.map((profile) => profile.id);
  const connectionIds = registry.connections.map((connection) => connection.id);
  if (new Set(profileIds).size !== profileIds.length) context.addIssue({ code: "custom", message: "Publisher profile ids must be unique", path: ["profiles"] });
  if (new Set(connectionIds).size !== connectionIds.length) context.addIssue({ code: "custom", message: "Publisher connection ids must be unique", path: ["connections"] });
  const knownProfiles = new Set(profileIds);
  const profilePlatforms = new Set<string>();
  for (const [index, connection] of registry.connections.entries()) {
    if (!knownProfiles.has(connection.profileId)) context.addIssue({ code: "custom", message: "Connection references an unknown profile", path: ["connections", index, "profileId"] });
    const key = `${connection.profileId}:${connection.platform}`;
    if (profilePlatforms.has(key)) context.addIssue({ code: "custom", message: "A profile can have at most one binding per platform", path: ["connections", index] });
    profilePlatforms.add(key);
    if (connection.connector.providerId !== "direct-meta" || connection.connector.apiVersion !== registry.providerApiVersion) {
      context.addIssue({ code: "custom", message: "Core registry accepts only its explicit Direct Meta API version", path: ["connections", index, "connector"] });
    }
    if (connection.credentialRef === null || connection.nativeAccountIdRef === null || connection.nativeAccountId !== null) {
      context.addIssue({ code: "custom", message: "Publisher bindings contain allowlisted credential and native-id reference names", path: ["connections", index] });
    }
  }
  const mappings = new Set<string>();
  for (const [index, mapping] of registry.legacyQueueMappings.entries()) {
    if (mappings.has(mapping.venture)) context.addIssue({ code: "custom", message: "Legacy venture mappings must be unique", path: ["legacyQueueMappings", index] });
    mappings.add(mapping.venture);
    const profile = registry.profiles.find((candidate) => candidate.id === mapping.profileId);
    if (!profile || profile.role !== "venture-primary" || profile.ventureRef !== mapping.venture) {
      context.addIssue({ code: "custom", message: "Legacy mapping must preserve the venture's own primary profile", path: ["legacyQueueMappings", index] });
    }
    for (const [platform, connectionId] of Object.entries(mapping.connections)) {
      const connection = registry.connections.find((candidate) => candidate.id === connectionId);
      if (!connection || connection.profileId !== mapping.profileId || connection.platform !== platform) {
        context.addIssue({ code: "custom", message: "Legacy mapping must resolve the matching profile/platform connection", path: ["legacyQueueMappings", index, "connections", platform] });
      }
    }
  }
});

export type SocialPublisherRegistry = z.infer<typeof SocialPublisherRegistrySchema>;

export interface ResolvedPublisherTarget {
  profile: SocialProfile;
  connection: SocialConnection;
  credentialRef: string;
  nativeAccountIdRef: string;
  providerId: "direct-meta";
  apiVersion: string;
  providerBindingId?: string;
}

export interface PublisherTargetResolution {
  decision: "eligible" | "held" | "denied";
  reasons: string[];
  target: ResolvedPublisherTarget | null;
  authorityGranted: false;
  publishingAuthorized: false;
}

function resolution(
  decision: PublisherTargetResolution["decision"],
  reasons: string[],
  target: ResolvedPublisherTarget | null = null
): PublisherTargetResolution {
  return { decision, reasons: [...new Set(reasons)], target, authorityGranted: false, publishingAuthorized: false };
}

function exactCapabilityAllowed(
  item: CapabilityAwareQueueItem,
  capabilityMap: VentureCapabilityMap
): boolean {
  const reference = item.target.capabilityRef;
  if (!reference) return false;
  const resolved = resolveVentureCapabilityInMap(capabilityMap, {
    source: item.sourceVentureId,
    target: "social-distribution",
    capability: "approved-publish-package",
    schemaVersion: "approved-publish-package/1"
  });
  return resolved.decision === "allowed"
    && resolved.edge !== null
    && reference.mapVersion === capabilityMap.mapVersion
    && reference.source === item.sourceVentureId
    && reference.decisionReference === resolved.edge.governingReference
    && reference.dataSchemaVersion === resolved.edge.dataSchemaVersion;
}

export function migrateLegacyQueueItem(
  value: unknown,
  registryInput: SocialPublisherRegistry
): CapabilityAwareQueueItem {
  const legacy = QueueItemSchema.parse(value);
  const registry = SocialPublisherRegistrySchema.parse(registryInput);
  const mapping = registry.legacyQueueMappings.find((candidate) => candidate.venture === legacy.venture);
  if (!mapping) throw new Error(`Legacy queue venture ${legacy.venture} has no explicit migration mapping`);
  const profile = registry.profiles.find((candidate) => candidate.id === mapping.profileId);
  if (!profile) throw new Error("Legacy queue profile mapping is unavailable");
  const sourceContentHash = legacy.content.contentHash;
  const base = {
    schemaVersion: 2 as const,
    id: legacy.id,
    sourceVentureId: legacy.venture,
    releaseId: legacy.campaignId,
    campaignId: legacy.campaignId,
    experimentId: legacy.experimentId,
    target: {
      profileId: profile.id,
      profileRole: "venture-primary" as const,
      role: "primary" as const,
      connectionBindingRef: mapping.connections[legacy.channel],
      capabilityRef: null,
      amplifierEligibilityRef: null,
      campaignApprovalRef: null
    },
    action: "publish-original" as const,
    sourcePackage: null,
    locale: legacy.locale,
    variant: legacy.variant,
    channel: legacy.channel,
    objective: legacy.objective,
    audience: legacy.audience,
    destination: legacy.destination,
    utm: legacy.utm,
    content: { ...legacy.content, contentHash: "0".repeat(64) },
    publishWindow: legacy.publishWindow,
    status: legacy.status,
    checks: {
      ...legacy.checks,
      capability: "pass" as const,
      authority: "pass" as const,
      policy: "pass" as const
    },
    approvalProvenance: {
      approvalRef: mapping.mappingRef,
      selectionRef: `legacy:${legacy.selectedBy}`,
      policyRef: null
    },
    selectedBy: legacy.selectedBy,
    createdAt: legacy.createdAt,
    attempt: legacy.attempt,
    receiptId: legacy.receiptId,
    migration: {
      sourceSchemaVersion: 1 as const,
      sourceContentHash,
      mappingRef: mapping.mappingRef
    }
  };
  return CapabilityAwareQueueItemSchema.parse({
    ...base,
    content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) }
  });
}

export function resolveCapabilityAwareQueueItem(
  value: unknown,
  registry: SocialPublisherRegistry
): CapabilityAwareQueueItem {
  const version = typeof value === "object" && value !== null && "schemaVersion" in value
    ? (value as { schemaVersion?: unknown }).schemaVersion
    : null;
  return version === 2
    ? CapabilityAwareQueueItemSchema.parse(value)
    : migrateLegacyQueueItem(value, registry);
}

export function resolvePublisherTarget(input: {
  item: unknown;
  registry: unknown;
  capabilityMap: VentureCapabilityMap;
  environment: NodeJS.ProcessEnv;
  now?: Date;
  pausedProfileIds?: ReadonlySet<string>;
  pausedConnectionIds?: ReadonlySet<string>;
  amplifierEligibility?: Readonly<Record<string, AmplifierEligibility>>;
}): PublisherTargetResolution {
  const registry = SocialPublisherRegistrySchema.safeParse(input.registry);
  const item = CapabilityAwareQueueItemSchema.safeParse(input.item);
  if (!registry.success || !item.success) return resolution("denied", ["malformed-queue-or-publisher-registry"]);
  const queue = item.data;
  const profile = registry.data.profiles.find((candidate) => candidate.id === queue.target.profileId);
  const connection = registry.data.connections.find((candidate) => candidate.id === queue.target.connectionBindingRef);
  if (!profile || !connection) return resolution("denied", ["unknown-profile-or-connection"]);
  if (connection.profileId !== profile.id || connection.platform !== queue.channel) return resolution("denied", ["profile-connection-platform-mismatch"]);
  if (profile.role !== queue.target.profileRole) return resolution("denied", ["queue-profile-role-mismatch"]);
  if (profile.kind === "simulation") return resolution("denied", ["simulation-fixture"]);
  if (profile.kind === "owner-personal") return resolution("denied", ["owner-personal-non-live"]);
  if (["personal-growth", "kvorum", "goviral"].includes(queue.sourceVentureId)) return resolution("denied", ["permanently-isolated-source"]);
  if (queue.target.role === "primary" && profile.ventureRef !== queue.sourceVentureId) {
    return resolution("denied", ["primary-target-must-belong-to-source"]);
  }
  if ((queue.sourceVentureId === "booksofhistory" && profile.ventureRef === "tehdejsi-svet")
    || (queue.sourceVentureId === "tehdejsi-svet" && profile.ventureRef === "booksofhistory")) {
    return resolution("denied", ["history-venture-isolation"]);
  }
  const capabilityRequired = queue.target.role !== "primary" || ["door-money", "webdev-signal"].includes(queue.sourceVentureId);
  if (capabilityRequired && !exactCapabilityAllowed(queue, input.capabilityMap)) return resolution("denied", ["missing-stale-held-or-denied-capability"]);
  if (queue.sourceVentureId === "door-money" && queue.sourcePackage?.schemaVersion !== "approved-publish-package/1") {
    return resolution("denied", ["door-money-private-payload-forbidden"]);
  }
  if (queue.target.role === "amplifier") {
    const eligibility = input.amplifierEligibility?.[profile.id];
    if (profile.amplifierEligibility?.verdict !== "accept"
      || profile.amplifierEligibility.canonicalPolicyRef === null
      || profile.amplifierEligibility.purposeGateRef !== queue.target.amplifierEligibilityRef
      || !eligibility?.supportEligibility.eligible
      || eligibility.purposeEvidenceRef !== queue.target.amplifierEligibilityRef
      || queue.target.campaignApprovalRef === null) {
      return resolution("denied", ["amplifier-eligibility-or-campaign-approval-missing"]);
    }
  }

  const holds: string[] = [];
  const now = input.now ?? new Date();
  if (!profile.liveEligible || !["active"].includes(profile.lifecycle)) holds.push("profile-not-live-eligible");
  if (connection.mode !== "autopublish" || connection.enabledByHumanAt === null) holds.push("connection-not-human-activated");
  if (connection.health.status !== "healthy") holds.push(`connection-${connection.health.status}`);
  if (connection.tokenExpiresAt !== null && new Date(connection.tokenExpiresAt) <= now) holds.push("credential-expired");
  if (connection.appReviewExpiresAt !== null && new Date(connection.appReviewExpiresAt) <= now) holds.push("app-review-expired");
  if (input.pausedProfileIds?.has(profile.id)) holds.push("profile-paused");
  if (input.pausedConnectionIds?.has(connection.id)) holds.push("connection-paused");
  if (!connection.credentialRef || !connection.nativeAccountIdRef) return resolution("denied", ["connection-reference-missing"]);
  if (!input.environment[connection.credentialRef]?.trim()) holds.push("credential-unavailable");
  if (!input.environment[connection.nativeAccountIdRef]?.trim()) holds.push("native-account-id-unavailable");
  if (holds.length > 0) return resolution("held", holds);

  return resolution("eligible", ["independent-runtime-gates-still-required"], {
    profile,
    connection,
    credentialRef: connection.credentialRef,
    nativeAccountIdRef: connection.nativeAccountIdRef,
    providerId: "direct-meta",
    apiVersion: registry.data.providerApiVersion
  });
}

export async function loadSocialPublisherRegistry(root: string = defaultConfigRoot): Promise<SocialPublisherRegistry> {
  const source = await readFile(path.join(root, "social-publisher-registry.json"), "utf8");
  return SocialPublisherRegistrySchema.parse(JSON.parse(source) as unknown);
}
