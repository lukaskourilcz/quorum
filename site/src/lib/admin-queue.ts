import "server-only";
import { designLabVentureIds } from "@/lib/design-lab-ventures";
import { isQuizDraft, packageAddress, packageArticleId } from "@/lib/devshark-package";
import { runDeterministicChecks, type QueueSibling } from "@/lib/admin-queue/checks";
import type { SocialQueueEventRecord } from "@/lib/admin-queue/event";
import type { QueueItem } from "@/lib/admin-queue/item";
import { queueCaptionLimit } from "@/lib/admin-queue/linkedin";
import { queueItemTarget, queueRepositoryRoot, readQueueState, type QueueEntry, type QueueState } from "@/lib/admin-queue/state";
import {
  QUEUE_CHECK_LABELS,
  QUEUE_DETERMINISTIC_CHECKS,
  QUEUE_GROUPS,
  QUEUE_OWNER_CHECKS,
  QUEUE_PLATFORM_LABELS,
  type AdminQueueItemView,
  type AdminQueueSnapshot,
  type QueueCheckState,
  type QueueGroup
} from "@/lib/admin-queue/types";

/**
 * The Queue workspace's one read boundary (quorum#573).
 *
 * Every social post that waits for the owner, or has already moved past him, as a bounded view
 * model: v2 items as they are, v1 items through the registry's legacy mapping, with the post
 * receipts, provider health, pause files and the owner's own queue events folded in. The client
 * receives no file name, credential reference, token or raw provider payload — the failure reason
 * is one sanitised sentence, and a frame is an item id and a slide number.
 */

/** The names the owner uses, where the registry's ids differ from them. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = {
  devshark: "devShark",
  "caught-up": "DNESKAi"
};

/** devShark first, then DNESKAi, then everything else by name. */
const VENTURE_ORDER = ["devshark", "caught-up"];

const SENSITIVE = /(access[_ -]?token|client[_ -]?secret|authorization\s*[:=]|bearer\s+[a-z0-9._-]+|gh[opsu]_[a-z0-9]+|session[_ -]?cookie|api[_ -]?key)/iu;

function sanitiseReason(value: string | null | undefined): string | null {
  if (!value) return null;
  const flat = value.replace(/\s+/gu, " ").trim();
  if (!flat) return null;
  if (SENSITIVE.test(flat)) return "The provider's answer held credential-like text, so only its receipt keeps the detail.";
  // A provider payload starts at its first bracket; the sentence before it is the part meant for people.
  const sentence = flat.split(/[{[]/u)[0]!.replace(/(https?:\/\/[^\s?#]+)[?#]\S*/gu, "$1").trim();
  if (!sentence) return "The provider refused the request; its receipt keeps the answer.";
  return sentence.length > 240 ? `${sentence.slice(0, 239)}…` : sentence;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Prague" }).format(new Date(value));
}

function lastEvent(events: readonly SocialQueueEventRecord[], itemId: string, actions: readonly string[]): SocialQueueEventRecord | null {
  return [...events].reverse().find((event) => event.itemId === itemId && actions.includes(event.action)) ?? null;
}

/**
 * A legacy v1 draft whose checks all passed before the Queue existed. The publisher treats it as
 * approved (its due rule, quorum#573 review): it sends by itself once its connection is live, so it
 * is scheduled, not waiting for an approval it cannot receive here.
 */
function sendsWithoutApproval(item: QueueItem): boolean {
  return item.schemaVersion === 1 && item.status === "draft" && Object.values(item.checks).every((state) => state === "pass");
}

function groupOf(item: QueueItem, gatePaused: boolean, now: Date): QueueGroup {
  const closed = Date.parse(item.publishWindow.notAfter) < now.getTime();
  switch (item.status) {
    case "published": return "sent";
    case "publishing": return "sending";
    case "failed":
    case "needs_reconciliation": return "failed";
    case "cancelled":
    case "expired": return "held";
    case "draft":
      if (closed) return "held";
      if (!sendsWithoutApproval(item)) return "waiting";
      return gatePaused ? "held" : "scheduled";
    case "approved":
    case "queued": return closed || gatePaused ? "held" : "scheduled";
  }
}

/** What stands between an item and the platform, in the owner's words, for a waiting or scheduled card. */
function gateNote(item: QueueItem, gate: Gate): string | null {
  if (!sendsWithoutApproval(item)) return gate.setup;
  const platform = QUEUE_PLATFORM_LABELS[item.channel];
  return gate.setup
    ? `This legacy post needs no approval: it sends by itself once its ${platform} connection and channel are live. Hold or reject it to stop it.`
    : "This legacy post needs no approval and sends on the next publisher run inside its window. Hold or reject it to stop it.";
}

interface Gate { paused: string | null; setup: string | null }

function gateFor(item: QueueItem, state: QueueState, target: { profileId: string | null; connectionId: string | null }): Gate {
  const platform = QUEUE_PLATFORM_LABELS[item.channel];
  if (state.pauses.global) return { paused: "Social publishing is paused for the whole company.", setup: null };
  if (target.profileId && state.pauses.profiles.has(target.profileId)) return { paused: "This profile is paused, so nothing sends from it.", setup: null };
  if (target.connectionId && state.pauses.connections.has(target.connectionId)) return { paused: `The ${platform} connection is paused, so nothing sends through it.`, setup: null };
  const connection = target.connectionId ? state.registry.connections.get(target.connectionId) : undefined;
  if (!connection) return { paused: null, setup: `No ${platform} connection is registered for this profile, so an approval queues the post and nothing sends.` };
  if (connection.mode !== "autopublish" || connection.enabledByHumanAt === null) {
    return { paused: null, setup: `The ${platform} connection is not activated yet, so an approval queues the post and nothing sends.` };
  }
  if (state.channelModes.get(item.channel) !== "autopublish") return { paused: null, setup: `The ${platform} channel is still in draft, so an approval queues the post and nothing sends.` };
  return { paused: null, setup: null };
}

function ownerChecks(item: QueueItem): QueueCheckState {
  const states = QUEUE_OWNER_CHECKS.map((id) => item.checks[id]);
  if (states.some((state) => state === "fail")) return "fail";
  return states.every((state) => state === "pass") ? "pass" : "pending";
}

function reasonFor(item: QueueItem, state: QueueState, gate: Gate, group: QueueGroup, now: Date): string | null {
  if (item.status === "failed") {
    const receipt = [...state.receipts].reverse().find((candidate) => candidate.queueItemId === item.id);
    return sanitiseReason(receipt?.error ?? item.attempt?.lastError) ?? "The publisher recorded a failure without a reason.";
  }
  if (item.status === "needs_reconciliation") return "The publisher could not confirm whether the post went out.";
  if (item.status === "expired") return "The publish window closed before it was sent.";
  if (item.status === "cancelled") {
    const event = lastEvent(state.events, item.id, ["hold", "reject", "edit", "rerender"]);
    if (!event) return "Cancelled before this workspace recorded why.";
    if (event.action === "hold") return `Held by the owner: ${event.reason}`;
    if (event.action === "reject") return `Rejected: ${event.reason}`;
    return `Replaced by ${event.supersedingItemId}.`;
  }
  if (group === "held" && Date.parse(item.publishWindow.notAfter) < now.getTime()) {
    return `The publish window closed on ${formatDate(item.publishWindow.notAfter)} before it was ${item.status === "draft" ? "approved" : "sent"}.`;
  }
  return gate.paused;
}

function nextSafeAction(item: QueueItem, supersededBy: string | null): string | null {
  if (supersededBy) return null;
  if (item.status === "failed") return "Nothing was published. Edit it to draft a corrected copy, or reject it.";
  if (item.status === "needs_reconciliation") return "Check the profile for this post before anything else; the publisher will not send it again on its own.";
  return null;
}

/**
 * The devShark package a marketingShark quiz draft was built from, when it names one. The other
 * post kinds link to the brand's Design Lab section and are not re-rendered from it.
 */
function packageOf(item: QueueItem): { slug: string; date: string } | null {
  return item.schemaVersion === 2 && item.sourceVentureId === "marketingshark" && isQuizDraft(item.content.factualClaimRefs)
    ? packageAddress(item.releaseId)
    : null;
}

/**
 * The brand's Design Lab section, and for a package-built post the package itself: the
 * `article=` deep link opens it selected (quorum#575).
 */
function designLabHref(brand: string, pkg: { slug: string; date: string } | null): string {
  const query = new URLSearchParams({ venture: "design-lab", tab: "studio", brand });
  if (pkg) query.set("article", packageArticleId(pkg.slug, pkg.date));
  return `/admin?${query}`;
}

function itemView(entry: QueueEntry, siblings: readonly QueueSibling[], state: QueueState, labLabels: ReadonlySet<string>, now: Date): AdminQueueItemView {
  const { item } = entry;
  const target = queueItemTarget(item, state);
  const profile = target.profileId ? state.registry.profiles.get(target.profileId) : undefined;
  const connection = target.connectionId ? state.registry.connections.get(target.connectionId) : undefined;
  const sourceVentureId = item.schemaVersion === 2 ? item.sourceVentureId : item.venture;
  const ventureKey = profile?.brandRef ?? sourceVentureId;
  const gate = gateFor(item, state, target);
  const group = groupOf(item, gate.paused !== null, now);
  const supersededBy = lastEvent(state.events, item.id, ["edit", "rerender"])?.supersedingItemId ?? null;
  const supersedes = state.events.find((event) => event.supersedingItemId === item.id)?.itemId ?? null;
  const open = Date.parse(item.publishWindow.notAfter) > now.getTime() && !supersededBy;
  const reviewable = item.status === "draft" || item.status === "approved";
  const review = item.schemaVersion === 2 && reviewable ? runDeterministicChecks(item, siblings, state.registry) : null;
  const computed = review?.results ?? null;
  const receipt = [...state.receipts].reverse().find((candidate) => candidate.queueItemId === item.id && candidate.outcome === "published");
  const assets = item.content.assetPaths;
  return {
    id: item.id,
    sourceVentureId,
    ventureKey,
    ventureLabel: DISPLAY_NAMES[ventureKey] ?? state.ventureNames.get(ventureKey) ?? ventureKey,
    platform: item.channel,
    profileLabel: profile?.displayLabel ?? `${DISPLAY_NAMES[ventureKey] ?? ventureKey} on ${QUEUE_PLATFORM_LABELS[item.channel]}`,
    handle: connection?.publicHandle ?? null,
    locale: item.locale,
    contentKind: assets.length > 1 ? "carousel" : assets.length === 1 ? "image" : "text",
    caption: item.content.text,
    captionLimit: queueCaptionLimit(item),
    altText: item.content.altText,
    hashtags: [...new Set(item.content.text.match(/#[\p{L}\p{N}_]+/gu) ?? [])],
    frameCount: assets.length,
    frameHrefs: assets.map((_, index) => `/admin/api/queue/frame/${encodeURIComponent(item.id)}/${index + 1}`),
    publishWindow: { ...item.publishWindow },
    status: item.status,
    group,
    checks: QUEUE_DETERMINISTIC_CHECKS.map((id) => ({ id, label: QUEUE_CHECK_LABELS[id], state: computed?.[id] ?? (item.checks[id] ?? "pending") })),
    ownerChecks: ownerChecks(item),
    contentHash: item.content.contentHash,
    supersedes,
    supersededBy,
    designLabHref: labLabels.has(ventureKey) ? designLabHref(ventureKey, packageOf(item)) : null,
    permalink: receipt?.remoteUrl ?? null,
    // Copy an approval would refuse is named before the owner tries: no approval waives this rule.
    reason: review?.copyFailure ? `Not approvable as written: ${review.copyFailure}. Edit it first.` : reasonFor(item, state, gate, group, now),
    nextSafeAction: nextSafeAction(item, supersededBy),
    gate: group === "waiting" || group === "scheduled" ? gateNote(item, gate) : null,
    schemaVersion: item.schemaVersion,
    createdAt: item.createdAt,
    actions: {
      approve: item.schemaVersion === 2 && reviewable && open,
      edit: item.schemaVersion === 2 && (reviewable || item.status === "queued" || item.status === "failed") && open,
      hold: (reviewable || item.status === "queued") && !supersededBy,
      reject: (reviewable || ["queued", "failed", "expired"].includes(item.status)) && !supersededBy,
      // A marketingShark carousel is redrawn from the slides saved in the Design Lab (quorum#575).
      rerender: packageOf(item) !== null && assets.length > 0 && (reviewable || item.status === "queued" || item.status === "failed") && open
    }
  };
}

function ventureRank(key: string): number {
  const index = VENTURE_ORDER.indexOf(key);
  return index === -1 ? VENTURE_ORDER.length : index;
}

export function buildAdminQueueSnapshot(state: QueueState, now: Date): AdminQueueSnapshot {
  const siblings: QueueSibling[] = state.entries.map(({ item }) => ({
    id: item.id,
    status: item.status,
    profileId: queueItemTarget(item, state).profileId,
    text: item.content.text
  }));
  const labLabels = new Set<string>(designLabVentureIds());
  const items = state.entries
    .map((entry) => itemView(entry, siblings, state, labLabels, now))
    .sort((left, right) => {
      const rank = ventureRank(left.ventureKey) - ventureRank(right.ventureKey) || left.ventureLabel.localeCompare(right.ventureLabel)
        || QUEUE_GROUPS.indexOf(left.group) - QUEUE_GROUPS.indexOf(right.group);
      if (rank !== 0) return rank;
      const ascending = left.group === "waiting" || left.group === "scheduled" || left.group === "sending";
      const order = left.publishWindow.notBefore.localeCompare(right.publishWindow.notBefore) || left.id.localeCompare(right.id);
      return ascending ? order : -order;
    });
  const counts = Object.fromEntries(QUEUE_GROUPS.map((group) => [group, items.filter((item) => item.group === group).length])) as Record<QueueGroup, number>;
  const ventures = [...new Map(items.map((item) => [item.ventureKey, item.ventureLabel])).entries()]
    .sort(([left, leftLabel], [right, rightLabel]) => ventureRank(left) - ventureRank(right) || leftLabel.localeCompare(rightLabel))
    .map(([id, label]) => ({ id, label, count: items.filter((item) => item.ventureKey === id).length }));
  return {
    items,
    counts,
    ventures,
    unreadable: state.unreadable,
    dropped: { ...state.dropped },
    unavailable: [...state.unavailable],
    generatedAt: now.toISOString()
  };
}

export async function readAdminQueue(root = queueRepositoryRoot(), options: { now?: Date } = {}): Promise<AdminQueueSnapshot> {
  return buildAdminQueueSnapshot(await readQueueState(root), options.now ?? new Date());
}

/** The badge on the navigation and the Overview's line: posts that wait for the owner. */
export async function readAdminQueueWaitingCount(root = queueRepositoryRoot()): Promise<number | null> {
  try {
    return (await readAdminQueue(root)).counts.waiting;
  } catch {
    return null;
  }
}
