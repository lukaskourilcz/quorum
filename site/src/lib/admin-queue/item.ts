import { createHash } from "node:crypto";
import type { QueueCheckId, QueueCheckState, QueuePlatform, QueueStatus } from "./types";
import { QUEUE_CHECK_IDS, QUEUE_STATUSES } from "./types";

/**
 * The social queue item, read and rewritten by the Admin without the orchestrator's zod schemas.
 *
 * The site does not depend on the orchestrator package, so this is a hand mirror of
 * `CapabilityAwareQueueItemSchema` and `capabilityAwareQueuePayloadHash` in
 * `orchestrator/src/social/queue.ts`. A mirror drifts unless something fails when it does: the
 * committed fixtures `contracts/fixtures/social-queue-item-v2*.valid.json` carry hashes the
 * orchestrator computed, `orchestrator/tests/social-queue-event.test.ts` proves them against the
 * orchestrator's functions and `item.test.ts` proves them against these.
 *
 * The parser is stricter than zod in one way on purpose: it refuses a string that `.trim()` would
 * change instead of trimming it. The orchestrator hashes the trimmed value; a Queue that hashed
 * the raw one would bind an approval to a hash the publisher then refuses.
 */

export type QueueChecks = Record<QueueCheckId, QueueCheckState>;

export interface QueueCapabilityRef {
  mapVersion: string;
  source: string;
  target: "social-distribution";
  capability: "approved-publish-package";
  dataSchemaVersion: "approved-publish-package/1";
  decisionReference: string;
}

export interface QueueItemV2 {
  schemaVersion: 2;
  id: string;
  sourceVentureId: string;
  releaseId: string;
  campaignId: string;
  experimentId: string | null;
  target: {
    profileId: string;
    profileRole: "venture-primary" | "company-umbrella" | "owned-amplifier";
    role: "primary" | "umbrella" | "amplifier";
    connectionBindingRef: string;
    capabilityRef: QueueCapabilityRef | null;
    amplifierEligibilityRef: string | null;
    campaignApprovalRef: string | null;
  };
  action: "publish-original";
  sourcePackage: { schemaVersion: "approved-publish-package/1"; artifactRef: string; packageHash: string } | null;
  locale: "en" | "cs" | null;
  variant: "A" | "B";
  channel: QueuePlatform;
  objective: "qualified_visit" | "value_action" | "opt_in" | "monetization_intent" | "trust";
  audience: string;
  destination: string;
  utm: { source: QueuePlatform; medium: "organic_social"; campaign: string; content: string };
  content: {
    text: string;
    altText: string | null;
    assetPaths: string[];
    factualClaimRefs: string[];
    rendererVersion: "carousel-studio-1";
    contentHash: string;
  };
  publishWindow: { notBefore: string; notAfter: string };
  status: QueueStatus;
  checks: QueueChecks;
  approvalProvenance: { approvalRef: string; selectionRef: string; policyRef: string | null };
  selectedBy: "PULSE" | "MAKO" | "CAMPAIGN_RESOLVER";
  createdAt: string;
  attempt: { idempotencyKey: string; claimedAt: string; attemptCount: number; lastError: string | null } | null;
  receiptId: string | null;
  migration: { sourceSchemaVersion: 1; sourceContentHash: string; mappingRef: string } | null;
}

/** The fields of a legacy v1 item the Queue shows. Status is the only one it ever writes. */
export interface QueueItemV1 {
  schemaVersion: 1;
  id: string;
  venture: string;
  locale: "en" | "cs" | null;
  channel: "instagram" | "threads";
  content: { text: string; altText: string | null; assetPaths: string[]; contentHash: string };
  publishWindow: { notBefore: string; notAfter: string };
  status: QueueStatus;
  checks: Record<string, QueueCheckState>;
  createdAt: string;
  attempt: { lastError: string | null } | null;
  receiptId: string | null;
}

export type QueueItem = QueueItemV1 | QueueItemV2;

/** The placeholder a draft carries in `approvalRef` until the owner approves it (quorum#568). */
export const AWAITING_OWNER_APPROVAL = "awaiting-owner-approval";

const TEXT_LIMITS: Readonly<Record<QueuePlatform, number>> = { instagram: 2_200, threads: 2_200, linkedin: 3_000 };
const SHA256 = /^[a-f0-9]{64}$/u;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const ASSET_PATH = /^\/social\/[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/u;
const PROFILE_ID = /^social-profile-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONNECTION_ID = /^social-connection-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const OBJECTIVES = ["qualified_visit", "value_action", "opt_in", "monetization_intent", "trust"] as const;
const V2_KEYS = [
  "schemaVersion", "id", "sourceVentureId", "releaseId", "campaignId", "experimentId", "target", "action", "sourcePackage",
  "locale", "variant", "channel", "objective", "audience", "destination", "utm", "content", "publishWindow", "status",
  "checks", "approvalProvenance", "selectedBy", "createdAt", "attempt", "receiptId", "migration"
];

type Raw = Record<string, unknown>;

export function rawObject(value: unknown): Raw | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Raw : null;
}

function exactKeys(value: Raw, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** A string the orchestrator's `.trim().min(1).max(n)` would accept unchanged. */
function trimmed(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function plain(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function dateTime(value: unknown): value is string {
  return typeof value === "string" && DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function nullableRef(value: unknown): value is string | null {
  return value === null || plain(value, 1, 160);
}

function url(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { new URL(value); return true; } catch { return false; }
}

function checks(value: unknown, ids: readonly string[]): Record<string, QueueCheckState> | null {
  const raw = rawObject(value);
  if (!raw) return null;
  const result: Record<string, QueueCheckState> = {};
  for (const id of ids) {
    const state = raw[id];
    if (!oneOf(state, ["pending", "pass", "fail"] as const)) return null;
    result[id] = state;
  }
  return result;
}

function window(value: unknown): { notBefore: string; notAfter: string } | null {
  const raw = rawObject(value);
  if (!raw || !dateTime(raw.notBefore) || !dateTime(raw.notAfter) || Date.parse(raw.notAfter) <= Date.parse(raw.notBefore)) return null;
  return { notBefore: raw.notBefore, notAfter: raw.notAfter };
}

function attempt(value: unknown): QueueItemV2["attempt"] | undefined {
  if (value === null) return null;
  const raw = rawObject(value);
  if (!raw || typeof raw.idempotencyKey !== "string" || !SHA256.test(raw.idempotencyKey) || !dateTime(raw.claimedAt)
    || !Number.isInteger(raw.attemptCount) || (raw.attemptCount as number) < 1 || (raw.lastError !== null && typeof raw.lastError !== "string")) return undefined;
  return { idempotencyKey: raw.idempotencyKey, claimedAt: raw.claimedAt, attemptCount: raw.attemptCount as number, lastError: raw.lastError as string | null };
}

function capabilityRef(value: unknown): QueueCapabilityRef | null | undefined {
  if (value === null) return null;
  const raw = rawObject(value);
  if (!raw || !exactKeys(raw, ["mapVersion", "source", "target", "capability", "dataSchemaVersion", "decisionReference"])
    || typeof raw.mapVersion !== "string" || !/^\d+\.\d+\.\d+$/u.test(raw.mapVersion) || typeof raw.source !== "string" || !SLUG.test(raw.source) || raw.source.length > 80
    || raw.target !== "social-distribution" || raw.capability !== "approved-publish-package" || raw.dataSchemaVersion !== "approved-publish-package/1"
    || !plain(raw.decisionReference, 1, 160)) return undefined;
  return { mapVersion: raw.mapVersion, source: raw.source, target: "social-distribution", capability: "approved-publish-package", dataSchemaVersion: "approved-publish-package/1", decisionReference: raw.decisionReference };
}

function target(value: unknown): QueueItemV2["target"] | null {
  const raw = rawObject(value);
  if (!raw || !exactKeys(raw, ["profileId", "profileRole", "role", "connectionBindingRef", "capabilityRef", "amplifierEligibilityRef", "campaignApprovalRef"])) return null;
  const capability = capabilityRef(raw.capabilityRef);
  if (typeof raw.profileId !== "string" || !PROFILE_ID.test(raw.profileId) || raw.profileId.length > 120
    || !oneOf(raw.profileRole, ["venture-primary", "company-umbrella", "owned-amplifier"] as const) || !oneOf(raw.role, ["primary", "umbrella", "amplifier"] as const)
    || typeof raw.connectionBindingRef !== "string" || !CONNECTION_ID.test(raw.connectionBindingRef) || raw.connectionBindingRef.length > 140
    || capability === undefined || !nullableRef(raw.amplifierEligibilityRef) || !nullableRef(raw.campaignApprovalRef)) return null;
  const expectedRole = { primary: "venture-primary", umbrella: "company-umbrella", amplifier: "owned-amplifier" } as const;
  if (raw.profileRole !== expectedRole[raw.role]) return null;
  if (raw.role === "primary" && (raw.amplifierEligibilityRef !== null || raw.campaignApprovalRef !== null)) return null;
  if (raw.role === "umbrella" && (capability === null || raw.amplifierEligibilityRef !== null || raw.campaignApprovalRef !== null)) return null;
  if (raw.role === "amplifier" && (capability === null || raw.amplifierEligibilityRef === null || raw.campaignApprovalRef === null)) return null;
  return {
    profileId: raw.profileId,
    profileRole: raw.profileRole,
    role: raw.role,
    connectionBindingRef: raw.connectionBindingRef,
    capabilityRef: capability,
    amplifierEligibilityRef: raw.amplifierEligibilityRef,
    campaignApprovalRef: raw.campaignApprovalRef
  };
}

function content(value: unknown, channel: QueuePlatform): QueueItemV2["content"] | null {
  const raw = rawObject(value);
  if (!raw || !plain(raw.text, 1, TEXT_LIMITS[channel]) || (raw.altText !== null && !plain(raw.altText, 1, 1_000))
    || !Array.isArray(raw.assetPaths) || raw.assetPaths.length > 10 || !raw.assetPaths.every((entry) => typeof entry === "string" && ASSET_PATH.test(entry))
    || !Array.isArray(raw.factualClaimRefs) || !raw.factualClaimRefs.every((entry) => plain(entry, 1, Number.MAX_SAFE_INTEGER))
    || raw.rendererVersion !== "carousel-studio-1" || typeof raw.contentHash !== "string" || !SHA256.test(raw.contentHash)) return null;
  return {
    text: raw.text,
    altText: raw.altText as string | null,
    assetPaths: [...raw.assetPaths as string[]],
    factualClaimRefs: [...raw.factualClaimRefs as string[]],
    rendererVersion: "carousel-studio-1",
    contentHash: raw.contentHash
  };
}

export function parseQueueItemV2(value: unknown): QueueItemV2 | null {
  const raw = rawObject(value);
  if (!raw || raw.schemaVersion !== 2 || !exactKeys(raw, V2_KEYS)) return null;
  if (!oneOf(raw.channel, ["instagram", "threads", "linkedin"] as const)) return null;
  const parsedTarget = target(raw.target);
  const parsedContent = content(raw.content, raw.channel);
  const parsedWindow = window(raw.publishWindow);
  const parsedChecks = checks(raw.checks, QUEUE_CHECK_IDS);
  const provenance = rawObject(raw.approvalProvenance);
  const utm = rawObject(raw.utm);
  const source = raw.sourcePackage === null ? null : rawObject(raw.sourcePackage);
  const migration = raw.migration === null ? null : rawObject(raw.migration);
  const parsedAttempt = attempt(raw.attempt);
  if (!trimmed(raw.id, 160) || typeof raw.sourceVentureId !== "string" || !SLUG.test(raw.sourceVentureId) || raw.sourceVentureId.length > 80
    || !trimmed(raw.releaseId, 200) || !trimmed(raw.campaignId, 200) || (raw.experimentId !== null && !trimmed(raw.experimentId, 200))
    || !parsedTarget || raw.action !== "publish-original" || (raw.locale !== null && !oneOf(raw.locale, ["en", "cs"] as const))
    || !oneOf(raw.variant, ["A", "B"] as const) || !oneOf(raw.objective, OBJECTIVES) || !trimmed(raw.audience, 500) || !url(raw.destination)
    || !utm || !exactKeys(utm, ["source", "medium", "campaign", "content"]) || utm.source !== raw.channel || utm.medium !== "organic_social"
    || !trimmed(utm.campaign, 200) || !trimmed(utm.content, 200) || !parsedContent || !parsedWindow || !exactKeys(rawObject(raw.publishWindow)!, ["notBefore", "notAfter"])
    || !oneOf(raw.status, QUEUE_STATUSES) || !parsedChecks || !exactKeys(rawObject(raw.checks)!, QUEUE_CHECK_IDS)
    || !provenance || !exactKeys(provenance, ["approvalRef", "selectionRef", "policyRef"]) || !plain(provenance.approvalRef, 1, 160)
    || !plain(provenance.selectionRef, 1, 160) || !nullableRef(provenance.policyRef)
    || !oneOf(raw.selectedBy, ["PULSE", "MAKO", "CAMPAIGN_RESOLVER"] as const) || !dateTime(raw.createdAt) || parsedAttempt === undefined
    || (raw.receiptId !== null && typeof raw.receiptId !== "string")) return null;
  if (raw.sourcePackage !== null && (!source || !exactKeys(source, ["schemaVersion", "artifactRef", "packageHash"]) || source.schemaVersion !== "approved-publish-package/1"
    || !plain(source.artifactRef, 1, 160) || typeof source.packageHash !== "string" || !SHA256.test(source.packageHash))) return null;
  if (raw.migration !== null && (!migration || !exactKeys(migration, ["sourceSchemaVersion", "sourceContentHash", "mappingRef"]) || migration.sourceSchemaVersion !== 1
    || typeof migration.sourceContentHash !== "string" || !SHA256.test(migration.sourceContentHash) || !plain(migration.mappingRef, 1, 160))) return null;
  if (raw.migration === null && raw.sourcePackage === null) return null;
  if (raw.sourceVentureId === "door-money" && raw.sourcePackage === null) return null;
  return {
    schemaVersion: 2,
    id: raw.id,
    sourceVentureId: raw.sourceVentureId,
    releaseId: raw.releaseId,
    campaignId: raw.campaignId,
    experimentId: raw.experimentId as string | null,
    target: parsedTarget,
    action: "publish-original",
    sourcePackage: source ? { schemaVersion: "approved-publish-package/1", artifactRef: source.artifactRef as string, packageHash: source.packageHash as string } : null,
    locale: raw.locale as QueueItemV2["locale"],
    variant: raw.variant,
    channel: raw.channel,
    objective: raw.objective,
    audience: raw.audience,
    destination: raw.destination,
    utm: { source: raw.channel, medium: "organic_social", campaign: utm.campaign as string, content: utm.content as string },
    content: parsedContent,
    publishWindow: parsedWindow,
    status: raw.status,
    checks: parsedChecks as QueueChecks,
    approvalProvenance: { approvalRef: provenance.approvalRef as string, selectionRef: provenance.selectionRef as string, policyRef: provenance.policyRef as string | null },
    selectedBy: raw.selectedBy,
    createdAt: raw.createdAt,
    attempt: parsedAttempt,
    receiptId: raw.receiptId as string | null,
    migration: migration ? { sourceSchemaVersion: 1, sourceContentHash: migration.sourceContentHash as string, mappingRef: migration.mappingRef as string } : null
  };
}

/** The legacy shape, with the defaults `QueueItemSchema` applies. */
export function parseQueueItemV1(value: unknown): QueueItemV1 | null {
  const raw = rawObject(value);
  if (!raw || raw.schemaVersion !== 1 || !plain(raw.id, 1, 200) || !oneOf(raw.channel, ["instagram", "threads"] as const)) return null;
  const venture = raw.venture ?? "caught-up";
  const locale = raw.locale ?? null;
  const parsedContent = rawObject(raw.content);
  const parsedWindow = window(raw.publishWindow);
  const parsedChecks = checks(raw.checks, ["schema", "brand", "claims", "quill", "keeper", "duplicate", "accessibility", "budget"]);
  if (!oneOf(venture, ["caught-up", "mma-files", "titty-tuesdays", "marketingshark"] as const) || (locale !== null && !oneOf(locale, ["en", "cs"] as const))
    || !parsedContent || !plain(parsedContent.text, 1, 2_200) || (parsedContent.altText !== null && !plain(parsedContent.altText, 1, 1_000))
    || !Array.isArray(parsedContent.assetPaths) || parsedContent.assetPaths.length > 10 || !parsedContent.assetPaths.every((entry) => typeof entry === "string" && ASSET_PATH.test(entry))
    || typeof parsedContent.contentHash !== "string" || !SHA256.test(parsedContent.contentHash) || !parsedWindow || !oneOf(raw.status, QUEUE_STATUSES)
    || !parsedChecks || !dateTime(raw.createdAt) || (raw.receiptId !== null && typeof raw.receiptId !== "string")) return null;
  const legacyAttempt = raw.attempt === null ? null : rawObject(raw.attempt);
  if (raw.attempt !== null && (!legacyAttempt || (legacyAttempt.lastError !== null && typeof legacyAttempt.lastError !== "string"))) return null;
  return {
    schemaVersion: 1,
    id: raw.id,
    venture,
    locale,
    channel: raw.channel,
    content: { text: parsedContent.text, altText: parsedContent.altText as string | null, assetPaths: [...parsedContent.assetPaths as string[]], contentHash: parsedContent.contentHash },
    publishWindow: parsedWindow,
    status: raw.status,
    checks: parsedChecks,
    createdAt: raw.createdAt,
    attempt: legacyAttempt ? { lastError: legacyAttempt.lastError as string | null } : null,
    receiptId: raw.receiptId as string | null
  };
}

export function parseQueueItem(value: unknown): QueueItem | null {
  const version = rawObject(value)?.schemaVersion;
  return version === 2 ? parseQueueItemV2(value) : version === 1 ? parseQueueItemV1(value) : null;
}

/**
 * `capabilityAwareQueuePayloadHash`, field for field and in its order.
 *
 * Every nested object is rebuilt here in its schema's key order rather than serialised as it came
 * off disk: zod returns shape order, and a file written in any other order would otherwise hash
 * differently on the two sides of the boundary.
 */
export function queueItemV2Hash(item: QueueItemV2): string {
  const capability = item.target.capabilityRef;
  return createHash("sha256").update(JSON.stringify({
    schemaVersion: item.schemaVersion,
    id: item.id,
    sourceVentureId: item.sourceVentureId,
    releaseId: item.releaseId,
    campaignId: item.campaignId,
    experimentId: item.experimentId,
    target: {
      profileId: item.target.profileId,
      profileRole: item.target.profileRole,
      role: item.target.role,
      connectionBindingRef: item.target.connectionBindingRef,
      capabilityRef: capability === null ? null : {
        mapVersion: capability.mapVersion,
        source: capability.source,
        target: capability.target,
        capability: capability.capability,
        dataSchemaVersion: capability.dataSchemaVersion,
        decisionReference: capability.decisionReference
      },
      amplifierEligibilityRef: item.target.amplifierEligibilityRef,
      campaignApprovalRef: item.target.campaignApprovalRef
    },
    action: item.action,
    sourcePackage: item.sourcePackage === null ? null : {
      schemaVersion: item.sourcePackage.schemaVersion,
      artifactRef: item.sourcePackage.artifactRef,
      packageHash: item.sourcePackage.packageHash
    },
    locale: item.locale,
    variant: item.variant,
    channel: item.channel,
    objective: item.objective,
    audience: item.audience,
    destination: item.destination,
    utm: { source: item.utm.source, medium: item.utm.medium, campaign: item.utm.campaign, content: item.utm.content },
    content: {
      text: item.content.text,
      altText: item.content.altText,
      assetPaths: item.content.assetPaths,
      factualClaimRefs: item.content.factualClaimRefs,
      rendererVersion: item.content.rendererVersion
    },
    publishWindow: { notBefore: item.publishWindow.notBefore, notAfter: item.publishWindow.notAfter },
    approvalProvenance: {
      approvalRef: item.approvalProvenance.approvalRef,
      selectionRef: item.approvalProvenance.selectionRef,
      policyRef: item.approvalProvenance.policyRef
    },
    selectedBy: item.selectedBy,
    migration: item.migration === null ? null : {
      sourceSchemaVersion: item.migration.sourceSchemaVersion,
      sourceContentHash: item.migration.sourceContentHash,
      mappingRef: item.migration.mappingRef
    }
  })).digest("hex");
}

function withHash(item: QueueItemV2): QueueItemV2 {
  return { ...item, content: { ...item.content, contentHash: queueItemV2Hash(item) } };
}

function allChecks(state: QueueCheckState): QueueChecks {
  return Object.fromEntries(QUEUE_CHECK_IDS.map((id) => [id, state])) as QueueChecks;
}

/**
 * The owner's approval, applied: every check passes, the approval event is the provenance, and
 * the hash is recomputed over the approved window and provenance, so the publisher's own hash
 * check accepts exactly this item and nothing edited after it.
 */
export function approveQueueItem(item: QueueItemV2, input: { eventId: string; publishWindow: { notBefore: string; notAfter: string } }): QueueItemV2 {
  return withHash({
    ...item,
    publishWindow: { ...input.publishWindow },
    status: "queued",
    checks: allChecks("pass"),
    approvalProvenance: { ...item.approvalProvenance, approvalRef: input.eventId }
  });
}

/** A new draft that replaces `item`: fresh checks, no approval, its own hash. The original is never touched here. */
export function supersedingQueueItem(item: QueueItemV2, input: { id: string; text: string; altText: string | null; now: Date }): QueueItemV2 {
  return withHash({
    ...item,
    id: input.id,
    content: { ...item.content, text: input.text, altText: input.altText },
    status: "draft",
    checks: allChecks("pending"),
    approvalProvenance: { ...item.approvalProvenance, approvalRef: AWAITING_OWNER_APPROVAL },
    createdAt: input.now.toISOString(),
    attempt: null,
    receiptId: null
  });
}

/** `<id>-r<n>`: the next revision of an item, counted over every revision that already exists. */
export function nextRevisionId(itemId: string, existingIds: Iterable<string>): string {
  const base = itemId.replace(/-r[1-9]\d*$/u, "");
  let highest = 0;
  for (const id of existingIds) {
    const match = id.startsWith(`${base}-r`) ? /^-r([1-9]\d*)$/u.exec(id.slice(base.length)) : null;
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${base}-r${highest + 1}`;
}
