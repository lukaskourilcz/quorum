import { rawRecord } from "./model";

export type SocialProviderVerdict = "enabled" | "held" | "disabled" | "rejected";
export type ProviderBindingMode = "draft" | "held" | "active" | "migrating" | "paused" | "retired";
export type ProviderHealthState = "healthy" | "held" | "degraded" | "stale" | "failing" | "paused" | "setup-needed" | "unavailable";

export interface SocialProviderRecord {
  id: "direct-meta" | "buffer" | "metricool" | "n8n" | "make" | "ayrshare";
  name: string;
  role: "direct-official" | "managed-scheduler" | "notification-webhook";
  supportedPlatforms: Array<"instagram" | "threads">;
  capabilities: string[];
  implementationVersion: string;
  apiVersion: string | null;
  verdict: SocialProviderVerdict;
  lastVerifiedDate: string;
  reverifyBy: string;
  decisionRef: string;
  plan: string;
  monthlyCostPosture: string;
  exitPath: string;
  purchaseAuthorized: false;
  strategyAuthority: false;
  contentGenerationAuthority: false;
}

export interface ProviderBindingRecord {
  id: string;
  connectionId: string;
  providerId: SocialProviderRecord["id"];
  providerImplementationVersion: string;
  providerApiVersion: string | null;
  mode: ProviderBindingMode;
  capabilities: string[];
  credentialRefs: string[];
  ownerActivationRef: string | null;
  authorityRef: string | null;
  effectiveAt: string | null;
  previousBindingRef: string | null;
  supersedingBindingRef: string | null;
  migration: { state: "none" | "preparing" | "reconciling" | "ready" | "completed" | "rollback-required"; inFlightItemRefs: string[]; reconciliationRefs: string[]; rollbackRef: string | null };
  health: { state: ProviderHealthState; unavailableReason: string; lastVerifiedAt: string | null };
  bindingHash: string;
  authorityGranted: false;
  publishingAuthorized: false;
}

export interface ProviderDeliveryReceiptRecord {
  id: string;
  providerId: SocialProviderRecord["id"];
  bindingId: string;
  connectionId: string;
  profileId: string;
  itemRef: string;
  canonicalReceiptRef: string;
  state: "attempted" | "accepted" | "published" | "failed" | "ambiguous" | "reconciled";
  remoteId: string | null;
  publicUrl: string | null;
  requestedAt: string;
  respondedAt: string | null;
  status: string;
  error: string | null;
  providerImplementationVersion: string;
  providerApiVersion: string | null;
  actualCostUsd: number | null;
  reconciliationRef: string | null;
  rawPayloadExcluded: true;
  authorityGranted: false;
}

export interface ProviderHealthRecord {
  id: string;
  providerId: SocialProviderRecord["id"];
  bindingId: string | null;
  connectionId: string | null;
  state: ProviderHealthState;
  lastSuccessfulOperationAt: string | null;
  lastAttemptedOperationAt: string | null;
  lastReconciledOperationAt: string | null;
  tokenStatus: string;
  appReviewStatus: string;
  planLimitStatus: string;
  rateLimitStatus: string;
  webhookFreshness: string;
  incidentRefs: string[];
  ownerAttentionRefs: string[];
  nextSafeAction: string;
  reverifyBy: string;
  generatedAt: string;
  snapshotHash: string;
  authorityGranted: false;
}

const providerIds = ["direct-meta", "buffer", "metricool", "n8n", "make", "ayrshare"] as const;
const providerRoles = ["direct-official", "managed-scheduler", "notification-webhook"] as const;
const providerVerdicts = ["enabled", "held", "disabled", "rejected"] as const;
const bindingModes = ["draft", "held", "active", "migrating", "paused", "retired"] as const;
const healthStates = ["healthy", "held", "degraded", "stale", "failing", "paused", "setup-needed", "unavailable"] as const;
const migrationStates = ["none", "preparing", "reconciling", "ready", "completed", "rollback-required"] as const;
const receiptStates = ["attempted", "accepted", "published", "failed", "ambiguous", "reconciled"] as const;

function oneOf<T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.includes(value as T[number]);
}

function text(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function nullableText(value: unknown, max = 500): value is string | null {
  return value === null || text(value, max);
}

function stringArray(value: unknown, max = 100): string[] | null {
  if (!Array.isArray(value) || value.length > max || !value.every((entry) => text(entry, 300))) return null;
  return value as string[];
}

export function parseSocialProvider(value: unknown): SocialProviderRecord | null {
  const item = rawRecord(value); const cost = rawRecord(item?.cost); const healthPolicy = rawRecord(item?.healthPolicy);
  const platforms = stringArray(item?.supportedPlatforms, 2); const capabilities = stringArray(item?.capabilities, 8);
  if (item?.schemaVersion !== "social-provider/1" || !oneOf(item.id, providerIds) || !text(item.name, 100) || !oneOf(item.role, providerRoles)
    || !platforms || !platforms.every((platform) => platform === "instagram" || platform === "threads") || !capabilities
    || !text(item.implementationVersion, 80) || !nullableText(item.apiVersion, 80) || !oneOf(item.verdict, providerVerdicts)
    || !text(item.lastVerifiedDate, 20) || !text(item.decisionRef, 160) || !cost || !healthPolicy || !text(healthPolicy.reverifyBy, 20)
    || !text(cost.plan, 120) || !text(cost.monthlyCostPosture, 160) || !text(cost.exitPath, 300) || cost.purchaseAuthorized !== false
    || item.strategyAuthority !== false || item.contentGenerationAuthority !== false) return null;
  if (item.role === "notification-webhook" && capabilities.includes("publish-original")) return null;
  return {
    id: item.id, name: item.name, role: item.role, supportedPlatforms: platforms as SocialProviderRecord["supportedPlatforms"], capabilities,
    implementationVersion: item.implementationVersion, apiVersion: item.apiVersion as string | null, verdict: item.verdict,
    lastVerifiedDate: item.lastVerifiedDate, reverifyBy: healthPolicy.reverifyBy as string, decisionRef: item.decisionRef,
    plan: cost.plan as string, monthlyCostPosture: cost.monthlyCostPosture as string, exitPath: cost.exitPath as string,
    purchaseAuthorized: false, strategyAuthority: false, contentGenerationAuthority: false
  };
}

export function parseProviderBinding(value: unknown): ProviderBindingRecord | null {
  const item = rawRecord(value); const migration = rawRecord(item?.migration); const health = rawRecord(item?.health);
  const capabilities = stringArray(item?.capabilities, 8); const credentialRefs = stringArray(item?.credentialRefs, 12);
  const inFlight = stringArray(migration?.inFlightItemRefs, 100); const reconciliations = stringArray(migration?.reconciliationRefs, 100);
  if (item?.schemaVersion !== "provider-connection-binding/1" || !text(item.id, 180) || !text(item.connectionId, 160) || !oneOf(item.providerId, providerIds)
    || !text(item.providerImplementationVersion, 80) || !nullableText(item.providerApiVersion, 80) || !oneOf(item.mode, bindingModes)
    || !capabilities || !credentialRefs || !credentialRefs.every((ref) => /^[A-Z][A-Z0-9_]{2,100}$/u.test(ref))
    || !nullableText(item.ownerActivationRef, 160) || !nullableText(item.authorityRef, 160) || !nullableText(item.effectiveAt, 60)
    || !nullableText(item.previousBindingRef, 180) || !nullableText(item.supersedingBindingRef, 180) || !migration || !oneOf(migration.state, migrationStates)
    || !inFlight || !reconciliations || !nullableText(migration.rollbackRef, 180) || !health || !oneOf(health.state, healthStates)
    || !text(health.unavailableReason, 100) || !nullableText(health.lastVerifiedAt, 60) || typeof item.bindingHash !== "string" || !/^[a-f0-9]{64}$/u.test(item.bindingHash)
    || item.authorityGranted !== false || item.publishingAuthorized !== false) return null;
  return {
    id: item.id, connectionId: item.connectionId, providerId: item.providerId, providerImplementationVersion: item.providerImplementationVersion,
    providerApiVersion: item.providerApiVersion as string | null, mode: item.mode, capabilities, credentialRefs,
    ownerActivationRef: item.ownerActivationRef as string | null, authorityRef: item.authorityRef as string | null, effectiveAt: item.effectiveAt as string | null,
    previousBindingRef: item.previousBindingRef as string | null, supersedingBindingRef: item.supersedingBindingRef as string | null,
    migration: { state: migration.state, inFlightItemRefs: inFlight, reconciliationRefs: reconciliations, rollbackRef: migration.rollbackRef as string | null },
    health: { state: health.state, unavailableReason: health.unavailableReason, lastVerifiedAt: health.lastVerifiedAt as string | null },
    bindingHash: item.bindingHash, authorityGranted: false, publishingAuthorized: false
  };
}

export function parseProviderDeliveryReceipt(value: unknown): ProviderDeliveryReceiptRecord | null {
  const item = rawRecord(value);
  if (item?.schemaVersion !== "provider-delivery-receipt/1" || !text(item.id, 100) || !oneOf(item.providerId, providerIds) || !text(item.bindingId, 180)
    || !text(item.connectionId, 160) || !text(item.profileId, 160) || !text(item.itemRef, 160) || !text(item.canonicalReceiptRef, 160)
    || !oneOf(item.state, receiptStates) || !nullableText(item.remoteId, 240) || !nullableText(item.publicUrl, 500) || !text(item.requestedAt, 60)
    || !nullableText(item.respondedAt, 60) || !text(item.status, 500) || !nullableText(item.error, 500) || !text(item.providerImplementationVersion, 80)
    || !nullableText(item.providerApiVersion, 80) || !(item.actualCostUsd === null || typeof item.actualCostUsd === "number") || !nullableText(item.reconciliationRef, 160)
    || item.rawPayloadExcluded !== true || item.authorityGranted !== false || "rawPayload" in item) return null;
  return {
    id: item.id, providerId: item.providerId, bindingId: item.bindingId, connectionId: item.connectionId, profileId: item.profileId,
    itemRef: item.itemRef, canonicalReceiptRef: item.canonicalReceiptRef, state: item.state, remoteId: item.remoteId as string | null,
    publicUrl: item.publicUrl as string | null, requestedAt: item.requestedAt, respondedAt: item.respondedAt as string | null, status: item.status,
    error: item.error as string | null, providerImplementationVersion: item.providerImplementationVersion, providerApiVersion: item.providerApiVersion as string | null,
    actualCostUsd: item.actualCostUsd as number | null, reconciliationRef: item.reconciliationRef as string | null, rawPayloadExcluded: true, authorityGranted: false
  };
}

export function parseProviderHealth(value: unknown): ProviderHealthRecord | null {
  const item = rawRecord(value); const incidents = stringArray(item?.incidentRefs, 100); const attention = stringArray(item?.ownerAttentionRefs, 100);
  if (item?.schemaVersion !== "provider-health/1" || !text(item.id, 180) || !oneOf(item.providerId, providerIds) || !nullableText(item.bindingId, 180)
    || !nullableText(item.connectionId, 160) || !oneOf(item.state, healthStates) || !nullableText(item.lastSuccessfulOperationAt, 60)
    || !nullableText(item.lastAttemptedOperationAt, 60) || !nullableText(item.lastReconciledOperationAt, 60) || !text(item.tokenStatus, 40)
    || !text(item.appReviewStatus, 40) || !text(item.planLimitStatus, 40) || !text(item.rateLimitStatus, 40) || !text(item.webhookFreshness, 40)
    || !incidents || !attention || !text(item.nextSafeAction, 300) || !text(item.reverifyBy, 20) || !text(item.generatedAt, 60)
    || typeof item.snapshotHash !== "string" || !/^[a-f0-9]{64}$/u.test(item.snapshotHash) || item.authorityGranted !== false) return null;
  return {
    id: item.id, providerId: item.providerId, bindingId: item.bindingId as string | null, connectionId: item.connectionId as string | null,
    state: item.state, lastSuccessfulOperationAt: item.lastSuccessfulOperationAt as string | null, lastAttemptedOperationAt: item.lastAttemptedOperationAt as string | null,
    lastReconciledOperationAt: item.lastReconciledOperationAt as string | null, tokenStatus: item.tokenStatus, appReviewStatus: item.appReviewStatus,
    planLimitStatus: item.planLimitStatus, rateLimitStatus: item.rateLimitStatus, webhookFreshness: item.webhookFreshness, incidentRefs: incidents,
    ownerAttentionRefs: attention, nextSafeAction: item.nextSafeAction, reverifyBy: item.reverifyBy, generatedAt: item.generatedAt,
    snapshotHash: item.snapshotHash, authorityGranted: false
  };
}
