import { createHash } from "node:crypto";
import { rawObject } from "./item";
import type { QueueActionName, QueueDeterministicCheck, QueuePlatform, QueueStatus } from "./types";
import { QUEUE_DETERMINISTIC_CHECKS, QUEUE_OWNER_CHECKS, QUEUE_STATUSES } from "./types";

/**
 * `social-queue-event/1`, the owner's decision on one queue item.
 *
 * The contract is `orchestrator/src/contracts/social-queue-event.ts` and its JSON Schema in
 * `contracts/`. This is the site's hand mirror of it, like every other admin parser: the Queue
 * validates each event it writes against this before the write, and reads back only what passes.
 */
export interface SocialQueueEventRecord {
  schemaVersion: "social-queue-event/1";
  id: string;
  at: string;
  actor: "owner";
  action: QueueActionName;
  itemId: string;
  sourceVentureId: string;
  channel: QueuePlatform;
  expectedContentHash: string;
  previousStatus: QueueStatus;
  nextStatus: QueueStatus;
  resultingContentHash: string | null;
  mode: "now" | "window" | null;
  publishWindow: { notBefore: string; notAfter: string } | null;
  deterministicChecks: Record<QueueDeterministicCheck, "pass"> | null;
  ownerEvidenceFor: Array<(typeof QUEUE_OWNER_CHECKS)[number]>;
  supersedingItemId: string | null;
  changedFields: Array<"caption" | "altText" | "frames">;
  reason: string | null;
  tasteNote: { releaseId: string; note: string } | null;
}

const ITEM_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const KEYS = [
  "schemaVersion", "id", "at", "actor", "action", "itemId", "sourceVentureId", "channel", "expectedContentHash", "previousStatus",
  "nextStatus", "resultingContentHash", "mode", "publishWindow", "deterministicChecks", "ownerEvidenceFor", "supersedingItemId",
  "changedFields", "reason", "tasteNote"
];

export function isQueueItemId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 160 && ITEM_ID.test(value);
}

/**
 * One id per item, action and shown hash, so a retried request names the same event and an
 * approval of the same copy can be recognised as already made.
 */
export function socialQueueEventId(itemId: string, action: QueueActionName, expectedContentHash: string): string {
  return `social-queue-event-${createHash("sha256").update(`${itemId}:${action}:${expectedContentHash}`).digest("hex").slice(0, 24)}`;
}

/** `state/social/queue-events/<timestamp>-<itemId>-<action>.json`, sortable by time. */
export function socialQueueEventPath(event: Pick<SocialQueueEventRecord, "at" | "itemId" | "action">): string {
  return `state/social/queue-events/${event.at.replace(/[:.]/gu, "-")}-${event.itemId}-${event.action}.json`;
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function dateTime(value: unknown): value is string {
  return typeof value === "string" && DATE_TIME.test(value) && !Number.isNaN(Date.parse(value));
}

export function parseSocialQueueEvent(value: unknown): SocialQueueEventRecord | null {
  const raw = rawObject(value);
  if (!raw || raw.schemaVersion !== "social-queue-event/1" || !exactKeys(raw, KEYS)) return null;
  if (typeof raw.id !== "string" || !/^social-queue-event-[a-f0-9]{24}$/u.test(raw.id) || !dateTime(raw.at) || raw.actor !== "owner"
    || !oneOf(raw.action, ["approve", "edit", "hold", "reject", "rerender"] as const) || !isQueueItemId(raw.itemId)
    || typeof raw.sourceVentureId !== "string" || !ITEM_ID.test(raw.sourceVentureId) || raw.sourceVentureId.length > 80
    || !oneOf(raw.channel, ["instagram", "threads", "linkedin"] as const) || typeof raw.expectedContentHash !== "string" || !SHA256.test(raw.expectedContentHash)
    || !oneOf(raw.previousStatus, QUEUE_STATUSES) || !oneOf(raw.nextStatus, QUEUE_STATUSES)
    || (raw.resultingContentHash !== null && (typeof raw.resultingContentHash !== "string" || !SHA256.test(raw.resultingContentHash)))
    || (raw.mode !== null && !oneOf(raw.mode, ["now", "window"] as const))
    || (raw.supersedingItemId !== null && !isQueueItemId(raw.supersedingItemId))
    || (raw.reason !== null && !text(raw.reason, 500))) return null;

  const window = raw.publishWindow === null ? null : rawObject(raw.publishWindow);
  if (raw.publishWindow !== null && (!window || !exactKeys(window, ["notBefore", "notAfter"]) || !dateTime(window.notBefore) || !dateTime(window.notAfter))) return null;
  const checks = raw.deterministicChecks === null ? null : rawObject(raw.deterministicChecks);
  if (raw.deterministicChecks !== null && (!checks || !exactKeys(checks, QUEUE_DETERMINISTIC_CHECKS) || !QUEUE_DETERMINISTIC_CHECKS.every((id) => checks[id] === "pass"))) return null;
  if (!Array.isArray(raw.ownerEvidenceFor) || raw.ownerEvidenceFor.length > QUEUE_OWNER_CHECKS.length || !raw.ownerEvidenceFor.every((entry) => oneOf(entry, QUEUE_OWNER_CHECKS))) return null;
  if (!Array.isArray(raw.changedFields) || raw.changedFields.length > 3 || !raw.changedFields.every((entry) => oneOf(entry, ["caption", "altText", "frames"] as const))) return null;
  const note = raw.tasteNote === null ? null : rawObject(raw.tasteNote);
  if (raw.tasteNote !== null && (!note || !exactKeys(note, ["releaseId", "note"]) || !text(note.releaseId, 200) || !text(note.note, 500))) return null;

  const event: SocialQueueEventRecord = {
    schemaVersion: "social-queue-event/1",
    id: raw.id,
    at: raw.at,
    actor: "owner",
    action: raw.action,
    itemId: raw.itemId,
    sourceVentureId: raw.sourceVentureId,
    channel: raw.channel,
    expectedContentHash: raw.expectedContentHash,
    previousStatus: raw.previousStatus,
    nextStatus: raw.nextStatus,
    resultingContentHash: raw.resultingContentHash as string | null,
    mode: raw.mode as SocialQueueEventRecord["mode"],
    publishWindow: window ? { notBefore: window.notBefore as string, notAfter: window.notAfter as string } : null,
    deterministicChecks: checks ? Object.fromEntries(QUEUE_DETERMINISTIC_CHECKS.map((id) => [id, "pass"])) as Record<QueueDeterministicCheck, "pass"> : null,
    ownerEvidenceFor: raw.ownerEvidenceFor as SocialQueueEventRecord["ownerEvidenceFor"],
    supersedingItemId: raw.supersedingItemId as string | null,
    changedFields: raw.changedFields as SocialQueueEventRecord["changedFields"],
    reason: raw.reason as string | null,
    tasteNote: note ? { releaseId: note.releaseId as string, note: note.note as string } : null
  };
  return eventRulesHold(event) ? event : null;
}

/** The contract's cross-field rules, which the zod schema states in its `superRefine`. */
function eventRulesHold(event: SocialQueueEventRecord): boolean {
  const approving = event.action === "approve";
  const superseding = event.action === "edit" || event.action === "rerender";
  const cancelling = event.action === "hold" || event.action === "reject";
  if (approving) {
    if (!["draft", "approved"].includes(event.previousStatus) || event.nextStatus !== "queued" || event.mode === null || event.publishWindow === null
      || Date.parse(event.publishWindow.notAfter) <= Date.parse(event.publishWindow.notBefore) || event.deterministicChecks === null
      || new Set(event.ownerEvidenceFor).size !== QUEUE_OWNER_CHECKS.length || event.resultingContentHash === null) return false;
  } else if (event.mode !== null || event.publishWindow !== null || event.deterministicChecks !== null || event.ownerEvidenceFor.length > 0) {
    return false;
  }
  if (superseding) {
    const base = event.itemId.replace(/-r[1-9]\d*$/u, "");
    if (!["draft", "approved", "queued", "failed"].includes(event.previousStatus) || event.nextStatus !== "cancelled" || event.supersedingItemId === null
      || event.supersedingItemId === event.itemId || !new RegExp(`^${base}-r[1-9]\\d*$`, "u").test(event.supersedingItemId) || event.resultingContentHash === null) return false;
    if (event.action === "edit" && !event.changedFields.some((field) => field === "caption" || field === "altText")) return false;
    if (event.action === "rerender" && !event.changedFields.includes("frames")) return false;
  } else if (event.supersedingItemId !== null || event.changedFields.length > 0) {
    return false;
  }
  if (cancelling && (!["draft", "approved", "queued", "failed", "expired"].includes(event.previousStatus) || event.nextStatus !== "cancelled"
    || event.reason === null || event.resultingContentHash !== null)) return false;
  return (event.action === "reject") === (event.tasteNote !== null);
}
