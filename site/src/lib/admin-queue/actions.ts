import "server-only";
import { runDeterministicChecks, type QueueSibling } from "./checks";
import { isQueueItemId, socialQueueEventId, type SocialQueueEventRecord } from "./event";
import { approveQueueItem, parseQueueItem, parseQueueItemV2, queueItemV2Hash, rawObject, supersedingQueueItem, type QueueItem, type QueueItemV2 } from "./item";
import { queueItemTarget, queueRepositoryRoot, readQueueState, type QueueState } from "./state";
import { queueCaptionLimit } from "./linkedin";
import { rerenderQueueItem } from "./rerender";
import { QueueActionError, queueStore } from "./store";
import { freeRevisionId, validated, writeEvent } from "./writes";
import { QUEUE_ALT_TEXT_LIMIT, QUEUE_CAPTION_LIMITS, QUEUE_OWNER_CHECKS, QUEUE_PLATFORM_LABELS, type QueueActionName, type QueueDispatchView, type QueueStatus } from "./types";
import { dispatchSocialPublisher, type QueueDispatchOutcome } from "@/lib/queue-dispatch";

/**
 * The owner's five Queue actions, applied to one item (quorum#573, re-render quorum#575).
 *
 * Each accepted action appends one `social-queue-event/1` and then changes the item. The event
 * goes first, because it is the evidence the change stands on: an approval writes the event's id
 * into the item as its `approvalRef`, and an item must never point at evidence that was not
 * written. Every action is bound to the content hash the owner was shown and refused with a
 * conflict when the item has moved on since.
 *
 * Nothing here sends. `approve` makes an item `queued` with every check passing and the owner's
 * approval as provenance, then wakes the publisher (quorum#574), which still applies every lock
 * it applies today. The wake-up comes last: a run started before the item was saved on GitHub
 * would check out a queue without it.
 */
export interface QueueActionRequest {
  action: QueueActionName;
  itemId: string;
  expectedContentHash: string;
  reason: string | null;
  edits: { caption: string | null; altText: string | null } | null;
  mode: "now" | "window" | null;
}

export interface QueueActionResult {
  changed: boolean;
  itemId: string;
  supersedingItemId: string | null;
  event: { id: string; action: QueueActionName; nextStatus: QueueStatus };
  persistence: "github" | "filesystem";
  /** The publisher wake-up an approval sends; null for every other action. */
  dispatch: QueueDispatchView | null;
  message: string;
}

const HASH = /^[a-f0-9]{64}$/u;
const SENSITIVE = /(access[_ -]?token|client[_ -]?secret|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|gh[opsu]_[a-z0-9]+|session[_ -]?cookie)/iu;
const REQUEST_KEYS = new Set(["action", "itemId", "expectedContentHash", "reason", "edits", "mode"]);
const APPROVE_NOW_HOURS = 1;

/** Owner text as it will be stored: NFC, Unix line ends, trimmed; null when empty. */
function ownerText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalised = value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
  if (normalised.length === 0) return null;
  if (normalised.length > max || SENSITIVE.test(normalised)) return undefined;
  return normalised;
}

export function parseQueueActionRequest(value: unknown): QueueActionRequest | null {
  const raw = rawObject(value);
  if (!raw || Object.keys(raw).some((key) => !REQUEST_KEYS.has(key))) return null;
  const action = ["approve", "edit", "hold", "reject", "rerender"].includes(String(raw.action)) ? raw.action as QueueActionName : null;
  if (!action || !isQueueItemId(raw.itemId) || typeof raw.expectedContentHash !== "string" || !HASH.test(raw.expectedContentHash)) return null;
  const reason = ownerText(raw.reason, 500);
  const mode = raw.mode === undefined || raw.mode === null ? null : raw.mode === "now" || raw.mode === "window" ? raw.mode : undefined;
  if (reason === undefined || mode === undefined) return null;
  let edits: QueueActionRequest["edits"] = null;
  if (raw.edits !== undefined && raw.edits !== null) {
    const fields = rawObject(raw.edits);
    if (!fields || Object.keys(fields).some((key) => key !== "caption" && key !== "altText")) return null;
    const caption = ownerText(fields.caption, QUEUE_CAPTION_LIMITS.linkedin);
    const altText = ownerText(fields.altText, QUEUE_ALT_TEXT_LIMIT);
    if (caption === undefined || altText === undefined) return null;
    edits = { caption, altText };
  }
  if (action === "approve" && (mode === null || edits !== null || reason !== null)) return null;
  if (action === "edit" && (edits === null || mode !== null || (edits.caption === null && edits.altText === null))) return null;
  if ((action === "hold" || action === "reject") && (reason === null || edits !== null || mode !== null)) return null;
  if (action === "rerender" && (edits !== null || mode !== null)) return null;
  return { action, itemId: raw.itemId, expectedContentHash: raw.expectedContentHash, reason, edits, mode };
}

function siblingsOf(state: QueueState, current: QueueItem): QueueSibling[] {
  return state.entries.map(({ item }) => {
    const live = item.id === current.id ? current : item;
    return { id: live.id, status: live.status, profileId: queueItemTarget(live, state).profileId, text: live.content.text };
  });
}

function approvedWindow(item: QueueItemV2, mode: "now" | "window", now: Date): { notBefore: string; notAfter: string } {
  if (mode === "window") return { ...item.publishWindow };
  // "Now" opens the window at this minute and never extends its end: an hour, or less when the
  // approved window closes sooner.
  const end = Math.min(Date.parse(item.publishWindow.notAfter), now.getTime() + APPROVE_NOW_HOURS * 3_600_000);
  return { notBefore: now.toISOString(), notAfter: new Date(end).toISOString() };
}

function baseEvent(request: QueueActionRequest, item: QueueItem, now: Date): SocialQueueEventRecord {
  return {
    schemaVersion: "social-queue-event/1",
    id: socialQueueEventId(item.id, request.action, request.expectedContentHash),
    at: now.toISOString(),
    actor: "owner",
    action: request.action,
    itemId: item.id,
    sourceVentureId: item.schemaVersion === 2 ? item.sourceVentureId : item.venture,
    channel: item.channel,
    expectedContentHash: request.expectedContentHash,
    previousStatus: item.status,
    nextStatus: "cancelled",
    resultingContentHash: null,
    mode: null,
    publishWindow: null,
    deterministicChecks: null,
    ownerEvidenceFor: [],
    supersedingItemId: null,
    changedFields: [],
    reason: null,
    tasteNote: null
  };
}

function requireV2(item: QueueItem, what: string): QueueItemV2 {
  if (item.schemaVersion !== 2) throw new QueueActionError("REFUSED", `A legacy v1 item cannot be ${what}; only hold and reject apply to it.`);
  return item;
}

function refuseSuperseded(state: QueueState, itemId: string): void {
  const replaced = [...state.events].reverse().find((event) => event.itemId === itemId && (event.action === "edit" || event.action === "rerender"));
  if (replaced) throw new QueueActionError("REFUSED", `This item was already replaced by ${replaced.supersedingItemId}.`);
}

export async function applyQueueAction(value: unknown, options: { root?: string; now?: Date } = {}): Promise<QueueActionResult> {
  const request = parseQueueActionRequest(value);
  if (!request) throw new QueueActionError("INVALID", "The queue action is incomplete, malformed or carries an unsafe field.");
  const root = options.root ?? queueRepositoryRoot();
  const now = options.now ?? new Date();
  const store = queueStore(root);
  const state = await readQueueState(root);
  const entry = state.entries.find(({ item }) => item.id === request.itemId);
  if (!entry) throw new QueueActionError("NOT_FOUND", "No readable queue item has that id.");
  const relative = `state/social/queue/${entry.file}`;
  const stored = await store.read(relative);
  if (!stored) throw new QueueActionError("NOT_FOUND", "The queue item is gone.");
  const item = parseQueueItem(stored.value);
  if (!item || item.id !== request.itemId) throw new QueueActionError("CORRUPT", "The stored queue item no longer parses as the item that was shown.");

  const eventId = socialQueueEventId(item.id, request.action, request.expectedContentHash);
  if (request.action === "approve" && item.schemaVersion === 2 && item.status === "queued" && item.approvalProvenance.approvalRef === eventId) {
    // A deployed Queue still shows an approved item as waiting until the next deploy, so approving
    // it again is how the owner retries a wake-up that failed. The run decides; a spare one finds
    // nothing due.
    const dispatch = await wakePublisher(store.persistence, item.publishWindow, now);
    return {
      changed: false,
      itemId: item.id,
      supersedingItemId: null,
      event: { id: eventId, action: "approve", nextStatus: "queued" },
      persistence: store.persistence,
      dispatch: dispatchView(dispatch),
      message: approvalMessage("This approval was already recorded", dispatch, QUEUE_PLATFORM_LABELS[item.channel])
    };
  }
  if (item.content.contentHash !== request.expectedContentHash) {
    throw new QueueActionError("CONFLICT", "The post changed since this page loaded. Reload it and decide on the version shown.");
  }
  refuseSuperseded(state, item.id);
  const windowOpen = Date.parse(item.publishWindow.notAfter) > now.getTime();
  const event = baseEvent(request, item, now);

  if (request.action === "approve") {
    const current = requireV2(item, "approved here");
    if (current.status !== "draft" && current.status !== "approved") throw new QueueActionError("REFUSED", `Only a waiting draft can be approved; this item is ${current.status}.`);
    if (!windowOpen) throw new QueueActionError("REFUSED", "The publish window has closed, so there is nothing left to approve.");
    const checks = runDeterministicChecks(current, siblingsOf(state, current), state.registry);
    if (checks.failures.length > 0) throw new QueueActionError("REFUSED", `Not approved: ${checks.failures.join("; ")}.`);
    const publishWindow = approvedWindow(current, request.mode!, now);
    const approved = approveQueueItem(current, { eventId, publishWindow });
    const record = validated({
      ...event,
      nextStatus: "queued",
      resultingContentHash: approved.content.contentHash,
      mode: request.mode,
      publishWindow,
      deterministicChecks: { schema: "pass", duplicate: "pass", accessibility: "pass", budget: "pass", capability: "pass", authority: "pass" },
      ownerEvidenceFor: [...QUEUE_OWNER_CHECKS]
    });
    await writeEvent(store, record);
    await store.replace(relative, approved, stored.version, `admin(queue): approve ${item.id}`);
    const dispatch = await wakePublisher(store.persistence, publishWindow, now);
    return {
      changed: true,
      itemId: item.id,
      supersedingItemId: null,
      event: { id: record.id, action: "approve", nextStatus: "queued" },
      persistence: store.persistence,
      dispatch: dispatchView(dispatch),
      message: approvalMessage(request.mode === "now" ? "Queued" : "Queued for its window", dispatch, QUEUE_PLATFORM_LABELS[item.channel])
    };
  }

  if (request.action === "rerender") {
    const current = requireV2(item, "re-rendered here");
    if (!windowOpen) throw new QueueActionError("REFUSED", "The publish window has closed, so a re-rendered copy could not be sent.");
    return rerenderQueueItem({ request, current, state, store, stored, relative, root, now, event });
  }

  if (request.action === "edit") {
    const current = requireV2(item, "edited here");
    if (!["draft", "approved", "queued", "failed"].includes(current.status)) throw new QueueActionError("REFUSED", `A ${current.status} item cannot be edited.`);
    if (!windowOpen) throw new QueueActionError("REFUSED", "The publish window has closed, so an edited copy could not be sent.");
    // A field the owner left empty keeps its current text; an edit never clears alt text.
    const caption = request.edits!.caption ?? current.content.text;
    const altText = request.edits!.altText ?? current.content.altText;
    const captionLimit = queueCaptionLimit(current);
    if (caption.length > captionLimit) {
      const link = current.channel === "linkedin" ? " here, because the post also carries its tracked link" : "";
      throw new QueueActionError("INVALID", `A ${QUEUE_PLATFORM_LABELS[current.channel]} caption holds at most ${captionLimit.toLocaleString("en-GB")} characters${link}.`);
    }
    if (current.content.assetPaths.length > 0 && !altText) throw new QueueActionError("INVALID", "A post with images keeps its alt text.");
    const changedFields = [
      ...(caption !== current.content.text ? ["caption" as const] : []),
      ...(altText !== current.content.altText ? ["altText" as const] : [])
    ];
    if (changedFields.length === 0) throw new QueueActionError("INVALID", "The edit changes nothing.");
    const supersedingId = await freeRevisionId(state, store, current.id);
    const successor = supersedingQueueItem(current, { id: supersedingId, text: caption, altText, now });
    if (!parseQueueItemV2(JSON.parse(JSON.stringify(successor)) as unknown) || queueItemV2Hash(successor) !== successor.content.contentHash) {
      throw new QueueActionError("CORRUPT", "The edited copy did not validate as a queue v2 item.");
    }
    const record = validated({ ...event, supersedingItemId: supersedingId, resultingContentHash: successor.content.contentHash, changedFields });
    await writeEvent(store, record);
    if (!await store.create(`state/social/queue/${supersedingId}.json`, successor, `admin(queue): ${supersedingId} supersedes ${item.id}`)) {
      throw new QueueActionError("CONFLICT", `A queue item named ${supersedingId} already exists; reload and edit again.`);
    }
    await store.replace(relative, { ...current, status: "cancelled" }, stored.version, `admin(queue): ${item.id} superseded by ${supersedingId}`);
    return {
      changed: true,
      itemId: item.id,
      supersedingItemId: supersedingId,
      event: { id: record.id, action: "edit", nextStatus: "cancelled" },
      persistence: store.persistence,
      dispatch: null,
      message: `Saved as a new draft. The earlier version is cancelled; approve the new one when it reads right.`
    };
  }

  const cancellable = request.action === "reject" ? ["draft", "approved", "queued", "failed", "expired"] : ["draft", "approved", "queued"];
  if (!cancellable.includes(item.status)) throw new QueueActionError("REFUSED", `A ${item.status} item cannot be ${request.action === "hold" ? "held" : "rejected"}.`);
  const releaseId = item.schemaVersion === 2 ? item.releaseId : entryCampaign(stored.value) ?? item.id;
  const record = validated({
    ...event,
    reason: request.reason,
    tasteNote: request.action === "reject" ? { releaseId, note: request.reason! } : null
  });
  await writeEvent(store, record);
  // A v1 file is rewritten with only its status changed; its hash never covered the status.
  const cancelled = item.schemaVersion === 2 ? { ...item, status: "cancelled" } : { ...rawObject(stored.value)!, status: "cancelled" };
  await store.replace(relative, cancelled, stored.version, `admin(queue): ${request.action} ${item.id}`);
  return {
    changed: true,
    itemId: item.id,
    supersedingItemId: null,
    event: { id: record.id, action: request.action, nextStatus: "cancelled" },
    persistence: store.persistence,
    dispatch: null,
    message: request.action === "hold" ? "Held. It will not be sent." : "Rejected. The reason is recorded as a taste note for the venture that drafted it."
  };
}

/** The approval is saved by now, so nothing about the wake-up may turn it into an error. */
async function wakePublisher(persistence: "github" | "filesystem", publishWindow: QueueItemV2["publishWindow"], now: Date): Promise<QueueDispatchOutcome> {
  try {
    return await dispatchSocialPublisher({ persistence, publishWindow, now });
  } catch {
    return { state: "failed", reason: "unreachable", runUrl: null, detail: "The publisher could not be started." };
  }
}

function dispatchView(dispatch: QueueDispatchOutcome): QueueDispatchView {
  return { state: dispatch.state, reason: dispatch.reason, runUrl: dispatch.runUrl };
}

function approvalMessage(lead: string, dispatch: QueueDispatchOutcome, platform: string): string {
  if (dispatch.state === "dispatched") return `${lead}. ${dispatch.detail} It sends the post only while its ${platform} connection and channel are live.`;
  if (dispatch.state === "failed") {
    return `${lead}, but the publisher did not start. ${dispatch.detail} The post stays queued: the next approval, or a run of the publisher from GitHub Actions, sends it inside its window.`;
  }
  return `${lead}. ${dispatch.detail}`;
}

function entryCampaign(value: unknown): string | null {
  const campaign = rawObject(value)?.campaignId;
  return typeof campaign === "string" && campaign.trim().length > 0 && campaign.length <= 200 ? campaign.trim() : null;
}
