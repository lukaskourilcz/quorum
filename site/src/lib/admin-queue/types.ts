/**
 * The Queue workspace's view model: what crosses from the server to the owner's browser.
 *
 * Everything here is plain JSON built by `readAdminQueue`. No file name, credential reference,
 * token value or raw provider payload has a field to travel in; frames are addressed by item id
 * and slide number, and the route behind that address resolves the file on the server.
 */

export const QUEUE_PLATFORMS = ["linkedin", "instagram", "threads"] as const;
export type QueuePlatform = (typeof QUEUE_PLATFORMS)[number];

export const QUEUE_STATUSES = [
  "draft",
  "approved",
  "queued",
  "publishing",
  "published",
  "failed",
  "expired",
  "needs_reconciliation",
  "cancelled"
] as const;
export type QueueStatus = (typeof QUEUE_STATUSES)[number];

export const QUEUE_GROUPS = ["waiting", "scheduled", "sending", "sent", "failed", "held"] as const;
export type QueueGroup = (typeof QUEUE_GROUPS)[number];

export const QUEUE_GROUP_LABELS: Readonly<Record<QueueGroup, string>> = {
  waiting: "Waiting",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
  held: "Held"
};

export const QUEUE_PLATFORM_LABELS: Readonly<Record<QueuePlatform, string>> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  threads: "Threads"
};

/**
 * What each platform accepts in one post, which is what the caption editor bounds.
 *
 * The queue v2 schema lets Threads hold 2,200 characters, the limit the v1 schema always applied.
 * Threads itself takes 500, so an owner edit is held to what the platform will accept rather than
 * to what the file can store.
 */
export const QUEUE_CAPTION_LIMITS: Readonly<Record<QueuePlatform, number>> = {
  linkedin: 3_000,
  instagram: 2_200,
  threads: 500
};

export const QUEUE_ALT_TEXT_LIMIT = 1_000;

export const QUEUE_CHECK_IDS = [
  "schema",
  "brand",
  "claims",
  "quill",
  "keeper",
  "duplicate",
  "accessibility",
  "budget",
  "capability",
  "authority",
  "policy"
] as const;
export type QueueCheckId = (typeof QUEUE_CHECK_IDS)[number];
export type QueueCheckState = "pending" | "pass" | "fail";

/** The six checks the Queue runs itself. The other five are the owner's approval. */
export const QUEUE_DETERMINISTIC_CHECKS = ["schema", "duplicate", "accessibility", "budget", "capability", "authority"] as const;
export type QueueDeterministicCheck = (typeof QUEUE_DETERMINISTIC_CHECKS)[number];
export const QUEUE_OWNER_CHECKS = ["brand", "claims", "quill", "keeper", "policy"] as const;

export const QUEUE_CHECK_LABELS: Readonly<Record<QueueDeterministicCheck, string>> = {
  schema: "Schema",
  duplicate: "Duplicate",
  accessibility: "Alt text",
  budget: "Budget",
  capability: "Capability",
  authority: "Authority"
};

export type QueueActionName = "approve" | "edit" | "hold" | "reject" | "rerender";

/**
 * What became of the publisher wake-up an approval sends (quorum#574), as the action response
 * carries it. `skipped` is a wake-up that could not help: the approval was saved to a local
 * checkout the publisher never reads, or its window is not open. `failed` leaves the item
 * `queued` for the next run. `runUrl` is GitHub's page for the run it started, when it named one.
 */
export type QueueDispatchState = "dispatched" | "failed" | "skipped";
export type QueueDispatchReason =
  | "started"
  | "local-checkout"
  | "window-not-open"
  | "window-closed"
  | "unconfigured"
  | "refused"
  | "not-found"
  | "rejected"
  | "remote"
  | "unreachable";

export interface QueueDispatchView {
  state: QueueDispatchState;
  reason: QueueDispatchReason;
  runUrl: string | null;
}

export interface AdminQueueCheckView {
  id: QueueDeterministicCheck;
  label: string;
  state: QueueCheckState;
}

export interface AdminQueueItemView {
  id: string;
  sourceVentureId: string;
  /** The filter key: the brand a profile speaks for, or the venture when it has no brand. */
  ventureKey: string;
  /** The name the owner reads: devShark for marketingShark's brand, DNESKAi for caught-up. */
  ventureLabel: string;
  platform: QueuePlatform;
  profileLabel: string;
  /** The public handle once the owner connects the profile; null while it does not exist. */
  handle: string | null;
  locale: "en" | "cs" | null;
  contentKind: "carousel" | "image" | "text";
  caption: string;
  captionLimit: number;
  altText: string | null;
  hashtags: string[];
  frameCount: number;
  /** `/admin/api/queue/frame/<id>/<n>` for every frame, in slide order. */
  frameHrefs: string[];
  publishWindow: { notBefore: string; notAfter: string };
  status: QueueStatus;
  group: QueueGroup;
  checks: AdminQueueCheckView[];
  /** Whether the owner's approval already stands in for brand, claims, quill, keeper and policy. */
  ownerChecks: QueueCheckState;
  contentHash: string;
  supersedes: string | null;
  supersededBy: string | null;
  designLabHref: string | null;
  permalink: string | null;
  /** One sanitised sentence: why it failed, was held, or was cancelled. */
  reason: string | null;
  /** One sentence the owner can act on, for an item that needs one. */
  nextSafeAction: string | null;
  /** What still stands between an approved item and the platform, in the owner's words. */
  gate: string | null;
  schemaVersion: 1 | 2;
  createdAt: string;
  actions: Readonly<Record<QueueActionName, boolean>>;
}

export interface AdminQueueVentureOption {
  id: string;
  label: string;
  count: number;
}

export interface AdminQueueSnapshot {
  items: AdminQueueItemView[];
  counts: Readonly<Record<QueueGroup, number>>;
  ventures: AdminQueueVentureOption[];
  /** Files that could not be read as JSON at all. */
  unreadable: number;
  /** Records that parsed as JSON but not as a queue item, an event, a receipt, health or a hold. */
  dropped: { items: number; events: number; receipts: number; health: number; holds: number };
  /** Sources the snapshot could not read, named. An empty list means every source was read. */
  unavailable: string[];
  generatedAt: string;
}
