import "server-only";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { parseSocialConnection, parseSocialProfile, rawRecord } from "@/lib/social-profiles/model";
import { parseProviderHealth, type ProviderHealthRecord } from "@/lib/social-profiles/provider-model";
import type { QueueRegistryContext } from "./checks";
import { parseSocialQueueEvent, type SocialQueueEventRecord } from "./event";
import { parseQueueItem, type QueueItem } from "./item";

/**
 * Everything the Queue reads from the repository, read once per request.
 *
 * The page's snapshot and the actions route both start here, so the item the owner saw and the
 * item an action checks are located and parsed by the same code. File names stay on this side of
 * the boundary: `QueueEntry.file` is used to address a write and is never put in a view model.
 */
export interface QueueEntry {
  /** The file's name inside `state/social/queue/`. Server-side only. */
  file: string;
  raw: Record<string, unknown>;
  item: QueueItem;
}

export interface QueueReceipt {
  queueItemId: string;
  outcome: "published" | "failed" | "paused";
  remoteUrl: string | null;
  attemptedAt: string;
  error: string | null;
}

/**
 * Why the publisher stopped an item before sending anything (`social-asset-hold/1`,
 * `social-publish-hold/1`). Only the reason crosses: the card says it in fixed words, never the
 * record's detail, which carries provider text.
 */
export const QUEUE_HOLD_REASONS = [
  "asset-hash-mismatch",
  "asset-hash-unrecorded",
  "asset-unsupported",
  "asset-unreachable",
  "publishing-quota-exhausted",
  "publishing-quota-unreadable",
  "platform-text-limit",
  "not-publishable"
] as const;
export type QueueHoldReason = (typeof QUEUE_HOLD_REASONS)[number];

export interface QueueHold {
  queueItemId: string;
  reason: QueueHoldReason;
  checkedAt: string;
}

export interface QueueLegacyMapping {
  venture: string;
  connections: Readonly<Record<string, string>>;
}

export interface QueueState {
  entries: QueueEntry[];
  events: SocialQueueEventRecord[];
  receipts: QueueReceipt[];
  /** The newest asset or publish hold per queue item id. */
  holds: Map<string, QueueHold>;
  health: Map<string, ProviderHealthRecord>;
  registry: QueueRegistryContext;
  legacyMappings: QueueLegacyMapping[];
  channelModes: Map<string, string>;
  ventureNames: Map<string, string>;
  pauses: { global: boolean; profiles: Set<string>; connections: Set<string> };
  unreadable: number;
  dropped: { items: number; events: number; receipts: number; health: number; holds: number };
  unavailable: string[];
}

const MAX_FILES = 2_000;

export function queueRepositoryRoot(): string {
  return process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

/**
 * The JSON files of one directory, at most `MAX_FILES` of them. When there are more, the ones kept
 * are the last by name, not the first: queue items are named by date (and a supersession's `-rN`
 * sorts after its original), and events by timestamp, so the first 2,000 were the oldest and a year
 * in the Queue would have shown nothing waiting. `excluded` says how many were left out.
 */
async function jsonFiles(directory: string): Promise<{ files: Array<{ file: string; value: unknown | undefined }>; state: "present" | "missing" | "unavailable"; excluded: number }> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    return { files: [], state: (error as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "unavailable", excluded: 0 };
  }
  const candidates = names.filter((name) => name.endsWith(".json") && !name.startsWith(".")).sort();
  const excluded = Math.max(0, candidates.length - MAX_FILES);
  const files = await Promise.all(candidates.slice(excluded).map(async (file) => {
    try {
      return { file, value: JSON.parse(await readFile(path.join(directory, file), "utf8")) as unknown };
    } catch {
      return { file, value: undefined };
    }
  }));
  return { files, state: "present", excluded };
}

function excludedNote(relative: string, excluded: number): string[] {
  return excluded > 0 ? [`${relative} holds ${excluded.toLocaleString("en-GB")} more ${excluded === 1 ? "file" : "files"} than the Queue reads; the oldest by name ${excluded === 1 ? "is" : "are"} not shown`] : [];
}

async function jsonConfig(root: string, relative: string, unavailable: string[]): Promise<Record<string, unknown> | null> {
  try {
    const value = rawRecord(JSON.parse(await readFile(path.join(root, relative), "utf8")) as unknown);
    if (!value) unavailable.push(`${relative} is not an object`);
    return value;
  } catch {
    unavailable.push(`${relative} could not be read`);
    return null;
  }
}

async function exists(file: string): Promise<boolean> {
  try { await access(file); return true; } catch { return false; }
}

async function pauseIds(directory: string): Promise<Set<string>> {
  const names = await readdir(directory).catch(() => [] as string[]);
  return new Set(names.filter((name) => name.endsWith(".json") || name.endsWith(".pause")).map((name) => name.replace(/\.(?:json|pause)$/u, "")));
}

function parseReceipt(value: unknown): QueueReceipt | null {
  const raw = rawRecord(value);
  if (!raw || raw.schemaVersion !== "social-post-receipt/1" || typeof raw.queueItemId !== "string" || raw.queueItemId.length === 0 || raw.queueItemId.length > 160
    || !["published", "failed", "paused"].includes(String(raw.outcome)) || typeof raw.attemptedAt !== "string" || Number.isNaN(Date.parse(raw.attemptedAt))
    || (raw.remoteUrl !== null && (typeof raw.remoteUrl !== "string" || !raw.remoteUrl.startsWith("https://")))
    || (raw.error !== null && typeof raw.error !== "string")) return null;
  return { queueItemId: raw.queueItemId, outcome: raw.outcome as QueueReceipt["outcome"], remoteUrl: raw.remoteUrl as string | null, attemptedAt: raw.attemptedAt, error: raw.error as string | null };
}

function parseHold(value: unknown): QueueHold | null {
  const raw = rawRecord(value);
  if (!raw || !["social-asset-hold/1", "social-publish-hold/1"].includes(String(raw.schemaVersion))
    || typeof raw.queueItemId !== "string" || raw.queueItemId.trim().length === 0 || raw.queueItemId.length > 160
    || !(QUEUE_HOLD_REASONS as readonly string[]).includes(String(raw.reason))
    || typeof raw.checkedAt !== "string" || Number.isNaN(Date.parse(raw.checkedAt))
    || raw.publishingAuthorized !== false) return null;
  const assetReason = String(raw.reason).startsWith("asset-");
  if (assetReason !== (raw.schemaVersion === "social-asset-hold/1")) return null;
  return { queueItemId: raw.queueItemId, reason: raw.reason as QueueHoldReason, checkedAt: raw.checkedAt };
}

function registryContext(registry: Record<string, unknown> | null, capabilities: Record<string, unknown> | null): { context: QueueRegistryContext; legacyMappings: QueueLegacyMapping[] } {
  const profiles = new Map<string, QueueRegistryContext["profiles"] extends ReadonlyMap<string, infer V> ? V : never>();
  for (const value of Array.isArray(registry?.profiles) ? registry.profiles : []) {
    const profile = parseSocialProfile(value);
    if (profile) profiles.set(profile.id, { id: profile.id, role: profile.role, ventureRef: profile.ventureRef, supportedVentures: profile.supportedVentures, displayLabel: profile.displayLabel, brandRef: profile.brandRef });
  }
  const connections = new Map<string, QueueRegistryContext["connections"] extends ReadonlyMap<string, infer V> ? V : never>();
  for (const value of Array.isArray(registry?.connections) ? registry.connections : []) {
    const connection = parseSocialConnection(value);
    if (connection) connections.set(connection.id, { id: connection.id, profileId: connection.profileId, platform: connection.platform, mode: connection.mode, publicHandle: connection.publicHandle, enabledByHumanAt: connection.enabledByHumanAt });
  }
  const legacyMappings: QueueLegacyMapping[] = [];
  for (const value of Array.isArray(registry?.legacyQueueMappings) ? registry.legacyQueueMappings : []) {
    const mapping = rawRecord(value);
    const mapped = rawRecord(mapping?.connections);
    if (typeof mapping?.venture === "string" && mapped && Object.values(mapped).every((entry) => typeof entry === "string")) {
      legacyMappings.push({ venture: mapping.venture, connections: mapped as Record<string, string> });
    }
  }
  const capabilityEdges = new Map<string, { governingReference: string; dataSchemaVersion: string }>();
  for (const value of Array.isArray(capabilities?.edges) ? capabilities.edges : []) {
    const edge = rawRecord(value);
    if (edge?.target === "social-distribution" && edge.capability === "approved-publish-package" && edge.dataSchemaVersion === "approved-publish-package/1"
      && edge.decision === "allowed" && typeof edge.source === "string" && typeof edge.governingReference === "string") {
      capabilityEdges.set(edge.source, { governingReference: edge.governingReference, dataSchemaVersion: edge.dataSchemaVersion });
    }
  }
  const mapVersion = typeof capabilities?.mapVersion === "string" ? capabilities.mapVersion : null;
  return { context: { profiles, connections, capabilityEdges, capabilityMapVersion: mapVersion }, legacyMappings };
}

/** Only the queue items, for a caller that needs one item's frames and nothing around it. */
export async function readQueueEntries(root = queueRepositoryRoot()): Promise<{ entries: QueueEntry[]; unreadable: number; dropped: number; excluded: number; listing: "present" | "missing" | "unavailable" }> {
  const queue = await jsonFiles(path.join(root, "state", "social", "queue"));
  let unreadable = 0;
  let dropped = 0;
  const entries: QueueEntry[] = [];
  const seen = new Set<string>();
  for (const { file, value } of queue.files) {
    if (value === undefined) { unreadable += 1; continue; }
    const item = parseQueueItem(value);
    const raw = rawRecord(value);
    // Two files claiming one id cannot both be the item an approval binds to, so neither is.
    if (!item || !raw || seen.has(item.id)) { dropped += 1; continue; }
    seen.add(item.id);
    entries.push({ file, raw, item });
  }
  return { entries, unreadable, dropped, excluded: queue.excluded, listing: queue.state };
}

export async function readQueueState(root = queueRepositoryRoot()): Promise<QueueState> {
  const unavailable: string[] = [];
  const socialRoot = path.join(root, "state", "social");
  const [queue, events, receipts, health, assetHolds, publishHolds, registry, capabilities, channels, ventures, globalPause, socialPause, profilePauses, connectionPauses, profileKills, connectionKills] = await Promise.all([
    readQueueEntries(root),
    jsonFiles(path.join(socialRoot, "queue-events")),
    jsonFiles(path.join(socialRoot, "posts")),
    jsonFiles(path.join(socialRoot, "provider-health")),
    jsonFiles(path.join(socialRoot, "asset-holds")),
    jsonFiles(path.join(socialRoot, "publish-holds")),
    jsonConfig(root, "config/social-publisher-registry.json", unavailable),
    jsonConfig(root, "config/venture-capabilities.json", unavailable),
    jsonConfig(root, "config/channels.json", unavailable),
    jsonConfig(root, "config/ventures.json", unavailable),
    exists(path.join(root, "state", "PAUSED")),
    exists(path.join(root, "state", "SOCIAL_PAUSED")),
    pauseIds(path.join(socialRoot, "pauses", "profiles")),
    pauseIds(path.join(socialRoot, "pauses", "connections")),
    pauseIds(path.join(socialRoot, "kill-switches", "profiles")),
    pauseIds(path.join(socialRoot, "kill-switches", "connections"))
  ]);
  if (queue.listing === "unavailable") unavailable.push("state/social/queue could not be listed");
  if (events.state === "unavailable") unavailable.push("state/social/queue-events could not be listed");
  unavailable.push(
    ...excludedNote("state/social/queue", queue.excluded),
    ...excludedNote("state/social/queue-events", events.excluded),
    ...excludedNote("state/social/posts", receipts.excluded),
    ...excludedNote("state/social/provider-health", health.excluded),
    ...excludedNote("state/social/asset-holds", assetHolds.excluded),
    ...excludedNote("state/social/publish-holds", publishHolds.excluded)
  );
  if (assetHolds.state === "unavailable") unavailable.push("state/social/asset-holds could not be listed");
  if (publishHolds.state === "unavailable") unavailable.push("state/social/publish-holds could not be listed");

  const unreadable = queue.unreadable;
  const dropped = { items: queue.dropped, events: 0, receipts: 0, health: 0, holds: 0 };
  const entries = queue.entries;
  const parsedEvents: SocialQueueEventRecord[] = [];
  for (const { value } of events.files) {
    const event = value === undefined ? null : parseSocialQueueEvent(value);
    if (event) parsedEvents.push(event); else dropped.events += 1;
  }
  const parsedReceipts: QueueReceipt[] = [];
  for (const { value } of receipts.files) {
    const receipt = value === undefined ? null : parseReceipt(value);
    if (receipt) parsedReceipts.push(receipt); else dropped.receipts += 1;
  }
  const holds = new Map<string, QueueHold>();
  for (const { value } of [...assetHolds.files, ...publishHolds.files]) {
    const hold = value === undefined ? null : parseHold(value);
    if (!hold) { dropped.holds += 1; continue; }
    const previous = holds.get(hold.queueItemId);
    if (!previous || previous.checkedAt < hold.checkedAt) holds.set(hold.queueItemId, hold);
  }
  const latestHealth = new Map<string, ProviderHealthRecord>();
  for (const { value } of health.files) {
    const record = value === undefined ? null : parseProviderHealth(value);
    if (!record) { dropped.health += 1; continue; }
    const previous = record.connectionId ? latestHealth.get(record.connectionId) : undefined;
    if (record.connectionId && (!previous || previous.generatedAt < record.generatedAt)) latestHealth.set(record.connectionId, record);
  }

  const { context, legacyMappings } = registryContext(registry, capabilities);
  const channelModes = new Map<string, string>();
  for (const value of Array.isArray(channels?.channels) ? channels.channels : []) {
    const channel = rawRecord(value);
    if (typeof channel?.id === "string" && typeof channel.mode === "string") channelModes.set(channel.id, channel.mode);
  }
  const ventureNames = new Map<string, string>();
  for (const value of Array.isArray(ventures?.ventures) ? ventures.ventures : []) {
    const venture = rawRecord(value);
    if (typeof venture?.id === "string" && typeof venture.name === "string") ventureNames.set(venture.id, venture.name);
  }

  return {
    entries,
    events: parsedEvents.sort((left, right) => left.at.localeCompare(right.at)),
    receipts: parsedReceipts.sort((left, right) => left.attemptedAt.localeCompare(right.attemptedAt)),
    holds,
    health: latestHealth,
    registry: context,
    legacyMappings,
    channelModes,
    ventureNames,
    pauses: {
      global: globalPause || socialPause,
      profiles: new Set([...profilePauses, ...profileKills]),
      connections: new Set([...connectionPauses, ...connectionKills])
    },
    unreadable,
    dropped,
    unavailable
  };
}

/** The profile and connection an item speaks through: its own target, or its v1 mapping. */
export function queueItemTarget(item: QueueItem, state: Pick<QueueState, "legacyMappings" | "registry">): { profileId: string | null; connectionId: string | null } {
  if (item.schemaVersion === 2) return { profileId: item.target.profileId, connectionId: item.target.connectionBindingRef };
  const mapping = state.legacyMappings.find((candidate) => candidate.venture === item.venture);
  const connectionId = mapping?.connections[item.channel] ?? null;
  const connection = connectionId ? state.registry.connections.get(connectionId) : undefined;
  return { profileId: connection?.profileId ?? null, connectionId };
}
