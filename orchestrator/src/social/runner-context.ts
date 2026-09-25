import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialPostReceiptSchema, type SocialActivation } from "../contracts/autonomy.js";
import { pragueClockParts } from "../meetings/clock.js";
import type { VentureCapabilityMap } from "../contracts/venture-capability.js";
import { loadVentureCapabilityMap } from "../ventures/capabilities.js";
import { isPublishingVenture } from "./activation.js";
import { assertLiveChannel, ChannelRegistrySchema, type Channel } from "./channel-registry.js";
import { loadSocialLifecycleHolds } from "./profile-lifecycle.js";
import { providerMaySend } from "./provider-platforms.js";
import {
  loadSocialProviderRegistry,
  resolveProviderBinding,
  type ResolvedProviderBinding,
  type SocialProviderRegistry
} from "./providers.js";
import {
  loadSocialPublisherRegistry,
  resolveCapabilityAwareQueueItem,
  resolvePublisherTarget,
  type ResolvedPublisherTarget,
  type SocialPublisherRegistry
} from "./publisher-targets.js";
import { assertQueueItemPublishable, CapabilityAwareQueueItemSchema, type CapabilityAwareQueueItem } from "./queue.js";

/**
 * What one publisher phase reads before it decides anything: the registries, the pauses and every
 * queue file, each with its exact text so a claim can be put back byte for byte.
 */
export interface PublisherContext {
  now: Date;
  environment: NodeJS.ProcessEnv;
  stateRoot: string;
  activation: SocialActivation;
  channels: ReadonlyMap<string, Channel>;
  publisherRegistry: SocialPublisherRegistry;
  providerRegistry: SocialProviderRegistry;
  capabilityMap: VentureCapabilityMap;
  pausedProfileIds: ReadonlySet<string>;
  pausedConnectionIds: ReadonlySet<string>;
  queueFiles: string[];
  entries: QueueEntry[];
  malformed: number;
}

export interface QueueEntry {
  name: string;
  text: string;
  item: CapabilityAwareQueueItem;
}

export interface EligibleEntry extends QueueEntry {
  channel: Channel;
  target: ResolvedPublisherTarget;
  provider: ResolvedProviderBinding;
}

/** An item that reached every lock and then failed the publishable check: held, never thrown. */
export interface RefusedEntry extends QueueEntry {
  providerId: string;
  reason: string;
}

async function pauseIds(directory: string): Promise<Set<string>> {
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  return new Set(files.filter((name) => name.endsWith(".json") || name.endsWith(".pause")).map((name) => name.replace(/\.(?:json|pause)$/u, "")));
}

export async function loadPublisherContext(input: {
  now: Date;
  environment: NodeJS.ProcessEnv;
  stateRoot: string;
  configRoot: string;
  activation: SocialActivation;
}): Promise<PublisherContext> {
  const { stateRoot, configRoot } = input;
  const channelRegistry = ChannelRegistrySchema.parse(JSON.parse(await readFile(path.join(configRoot, "channels.json"), "utf8")) as unknown);
  const queueDirectory = path.join(stateRoot, "social", "queue");
  const files = await readdir(queueDirectory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  const queueFiles = files.filter((name) => name.endsWith(".json")).sort();
  const [publisherRegistry, providerRegistry, capabilityMap, profilePauseSets, connectionPauseSets, lifecycleHolds] = await Promise.all([
    loadSocialPublisherRegistry(configRoot),
    loadSocialProviderRegistry(configRoot),
    loadVentureCapabilityMap(configRoot),
    Promise.all([
      pauseIds(path.join(stateRoot, "social", "pauses", "profiles")),
      pauseIds(path.join(stateRoot, "social", "kill-switches", "profiles"))
    ]),
    Promise.all([
      pauseIds(path.join(stateRoot, "social", "pauses", "connections")),
      pauseIds(path.join(stateRoot, "social", "kill-switches", "connections"))
    ]),
    loadSocialLifecycleHolds(stateRoot)
  ]);
  const entries: QueueEntry[] = [];
  let malformed = lifecycleHolds.malformed;
  for (const name of queueFiles) {
    const text = await readFile(path.join(queueDirectory, name), "utf8");
    try {
      entries.push({ name, text, item: resolveCapabilityAwareQueueItem(JSON.parse(text) as unknown, publisherRegistry) });
    } catch {
      malformed += 1;
    }
  }
  return {
    now: input.now,
    environment: input.environment,
    stateRoot,
    activation: input.activation,
    // Keyed by string: a queue item may name a platform that has no global channel yet, and the
    // lookup refuses it by name instead of the types pretending it cannot happen.
    channels: new Map<string, Channel>(channelRegistry.channels.map((channel) => [channel.id, channel])),
    publisherRegistry,
    providerRegistry,
    capabilityMap,
    pausedProfileIds: new Set([...profilePauseSets.flatMap((set) => [...set]), ...lifecycleHolds.pausedProfileIds]),
    pausedConnectionIds: new Set([...connectionPauseSets.flatMap((set) => [...set]), ...lifecycleHolds.pausedConnectionIds]),
    queueFiles,
    entries,
    malformed
  };
}

export function insideWindow(item: CapabilityAwareQueueItem, now: Date): boolean {
  return new Date(item.publishWindow.notBefore).getTime() <= now.getTime()
    && new Date(item.publishWindow.notAfter).getTime() >= now.getTime();
}

/**
 * Whether an item is waiting to be sent: `queued` (the Queue's approval, quorum#573), or a legacy
 * v1 draft. A v2 `draft` is never due: its checks wait for the owner, and the runner no longer
 * promotes it to `queued` by itself. A v1 draft (DNESKAi's pack writes every check `pass`) predates
 * the Queue and sends once its connection is live, as it always would have; the Queue says so.
 */
export function isDue(item: CapabilityAwareQueueItem, now: Date): boolean {
  const approved = item.status === "queued" || (item.status === "draft" && item.migration !== null);
  return approved && insideWindow(item, now);
}

function sourceVentureActive(item: CapabilityAwareQueueItem, activation: SocialActivation): boolean {
  return isPublishingVenture(item.sourceVentureId)
    && activation.ventures[item.sourceVentureId].status === "enabled";
}

/**
 * Whether the canonical receipt can name this item's venture and channel. Checked before a send,
 * because a receipt that fails to parse after the provider accepted a post would leave the item
 * claimed and nothing could record what happened.
 */
function receiptRecordable(item: CapabilityAwareQueueItem): boolean {
  return SocialPostReceiptSchema.shape.venture.safeParse(item.sourceVentureId).success
    && SocialPostReceiptSchema.shape.channel.safeParse(item.channel).success;
}

/**
 * Everything that may already be on a connection's feed, for cadence: what was published, what a
 * run claimed and never finished, and what waits on reconciliation. A stale claim therefore holds
 * its connection's cadence rather than letting a second post through beside it.
 */
function cadenceTimes(context: PublisherContext, exclude: ReadonlySet<string>): Map<string, Date[]> {
  const times = new Map<string, Date[]>();
  for (const { name, item } of context.entries) {
    if (exclude.has(name) || !item.attempt || !["published", "publishing", "needs_reconciliation"].includes(item.status)) continue;
    const values = times.get(item.target.connectionBindingRef) ?? [];
    values.push(new Date(item.attempt.claimedAt));
    times.set(item.target.connectionBindingRef, values);
  }
  return times;
}

/**
 * The candidates that pass every lock, in order, with the target and provider each will use.
 *
 * Each check costs one item and never the run: a held connection, an inactive venture, a channel
 * still in draft, a failed publishable check or a spent cadence skips that item and the next one
 * is still considered. A candidate that reaches the publishable check and fails it is returned as
 * refused, so the runner can record why.
 */
export function selectEligible(context: PublisherContext, candidates: readonly QueueEntry[]): { eligible: EligibleEntry[]; refused: RefusedEntry[] } {
  const { now, environment } = context;
  const eligible: EligibleEntry[] = [];
  const refused: RefusedEntry[] = [];
  const times = cadenceTimes(context, new Set(candidates.map(({ name }) => name)));
  const today = pragueClockParts(now).date;
  for (const entry of candidates) {
    const { item } = entry;
    const resolution = resolvePublisherTarget({
      item,
      registry: context.publisherRegistry,
      capabilityMap: context.capabilityMap,
      environment,
      now,
      pausedProfileIds: context.pausedProfileIds,
      pausedConnectionIds: context.pausedConnectionIds
    });
    if (resolution.decision !== "eligible" || !resolution.target) continue;
    const providerResolution = resolveProviderBinding({
      registry: context.providerRegistry,
      publisherRegistry: context.publisherRegistry,
      connectionId: resolution.target.connection.id,
      environment,
      requiredCapability: "publish-original"
    });
    if (providerResolution.decision !== "eligible" || !providerResolution.target) continue;
    if (!sourceVentureActive(item, context.activation) || !receiptRecordable(item)) continue;
    const provider = providerResolution.target;
    const providerId = provider.provider.id;
    // Direct Meta sends Instagram and Threads; Buffer sends LinkedIn and nothing else (quorum#571).
    if (!providerMaySend(providerId, item.channel) || providerId !== resolution.target.providerId || provider.provider.apiVersion === null) continue;
    const channel = context.channels.get(item.channel);
    if (!channel) continue;
    try {
      assertLiveChannel(channel, environment);
    } catch {
      continue;
    }
    try {
      assertQueueItemPublishable(CapabilityAwareQueueItemSchema.parse(item.status === "draft" ? { ...item, status: "queued" } : item));
    } catch (error) {
      refused.push({ ...entry, providerId, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }
    const target: ResolvedPublisherTarget = {
      ...resolution.target,
      providerId,
      apiVersion: provider.provider.apiVersion,
      providerBindingId: provider.binding.id
    };
    const used = times.get(target.connection.id) ?? [];
    if (used.filter((time) => pragueClockParts(time).date === today).length >= target.connection.cadence.maxOrganicPostsPerDay) continue;
    const last = [...used].sort((a, b) => b.getTime() - a.getTime())[0];
    if (last && now.getTime() - last.getTime() < target.connection.cadence.minHoursBetweenPosts * 3_600_000) continue;
    eligible.push({ ...entry, channel, target, provider });
    used.push(now);
    times.set(target.connection.id, used);
  }
  return { eligible, refused };
}
