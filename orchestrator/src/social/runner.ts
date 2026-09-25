import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialActivationSchema, SocialPostReceiptSchema, type SocialActivation } from "../contracts/autonomy.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";
import { configRoot as defaultConfigRoot, repoRoot as defaultRepoRoot, stateRoot as defaultStateRoot } from "../paths.js";
import { pragueClockParts } from "../meetings/clock.js";
import { refreshSocialActivation, pauseVentureSocial, isPublishingVenture, type SocialVenture } from "./activation.js";
import { ChannelRegistrySchema, assertLiveChannel } from "./channel-registry.js";
import { createBufferPublishAdapter } from "./buffer.js";
import { createMetaPublishAdapter } from "./meta.js";
import type { SocialAssetCommits } from "./media/assets.js";
import { gateSocialAssets } from "./media/gate.js";
import { providerMaySend, type PublishProviderId } from "./provider-platforms.js";
import { ProviderRejectedError, SocialPublishHoldError, type PublishAdapter } from "./publish.js";
import { clearPublishHold, recordPublishHold } from "./publish-holds.js";
import { loadVentureCapabilityMap } from "../ventures/capabilities.js";
import {
  loadSocialPublisherRegistry,
  resolveCapabilityAwareQueueItem,
  resolvePublisherTarget,
  type ResolvedPublisherTarget
} from "./publisher-targets.js";
import {
  assertQueueItemPublishable,
  CapabilityAwareQueueItemSchema,
  type CapabilityAwareQueueItem
} from "./queue.js";
import { checkTittyTuesdaysPost, TT_SAFETY_CHECKER_VERSION } from "./tt-safety.js";
import { loadSocialLifecycleHolds } from "./profile-lifecycle.js";
import {
  createProviderDeliveryReceipt,
  createProviderHealthSnapshot,
  loadSocialProviderRegistry,
  resolveProviderBinding,
  type ResolvedProviderBinding
} from "./providers.js";

export interface SocialPublisherOptions {
  validateOnly: boolean;
  dryIfDisabled: boolean;
  now?: Date;
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  adapter?: PublishAdapter;
  /** The git reader for committed frames; the runner's own checkout when omitted. */
  assetCommits?: SocialAssetCommits;
  /** DNS for the frame check, so a test can answer without the network. */
  resolveImpl?: (hostname: string) => Promise<string[]>;
  repoRoot?: string;
  stateRoot?: string;
  configRoot?: string;
}

export interface SocialPublisherReport {
  status: "paused" | "draft_only" | "validated" | "complete";
  queueItems: number;
  due: number;
  published: number;
  ambiguous: number;
  /** Refused by the provider before anything was created (quorum#571); failed for owner review. */
  rejected: number;
  skipped: number;
  /** Items whose frames could not be proved this run; each has a `social-asset-hold/1` record. */
  assetHeld: number;
  /** Items held before any write (a full publishing limit, a failed publishable check); each has a `social-publish-hold/1` record. */
  publishHeld: number;
}


async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

async function pauseIds(directory: string): Promise<Set<string>> {
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
  return new Set(files.filter((name) => name.endsWith(".json") || name.endsWith(".pause")).map((name) => name.replace(/\.(?:json|pause)$/u, "")));
}

function mergedIds(...sets: ReadonlySet<string>[]): Set<string> {
  return new Set(sets.flatMap((set) => [...set]));
}

export function redactSocialError(error: unknown, sensitiveValues: readonly string[] = []): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const value of sensitiveValues) {
    if (value) message = message.split(value).join("[REDACTED]").split(encodeURIComponent(value)).join("[REDACTED]");
  }
  return message
    .replace(/(access[_-]?token|authorization|cookie|client[_-]?secret)\s*[=:]\s*[^\s&]+/giu, "$1=[REDACTED]")
    .replace(/bearer\s+[a-z0-9._~+\/-]+/giu, "Bearer [REDACTED]")
    .slice(0, 500);
}

function redactedConnectorError(error: unknown, environment: NodeJS.ProcessEnv, target: ResolvedPublisherTarget): string {
  return redactSocialError(error, [environment[target.credentialRef] ?? "", environment[target.nativeAccountIdRef] ?? ""]);
}

function sourceVentureActive(item: CapabilityAwareQueueItem, activation: SocialActivation): boolean {
  return isPublishingVenture(item.sourceVentureId)
    && activation.ventures[item.sourceVentureId].status === "enabled";
}

/**
 * Whether the canonical receipt can name this item's venture and channel. Checked before a send,
 * because a receipt that fails to parse after the provider accepted a post would leave the item
 * queued and the next run would send it again.
 */
function receiptRecordable(item: CapabilityAwareQueueItem): boolean {
  return SocialPostReceiptSchema.shape.venture.safeParse(item.sourceVentureId).success
    && SocialPostReceiptSchema.shape.channel.safeParse(item.channel).success;
}

const PROVIDER_LABELS: Readonly<Record<PublishProviderId, string>> = {
  "direct-meta": "Official Meta item verified live.",
  buffer: "Buffer post verified sent to LinkedIn."
};

function receiptId(item: CapabilityAwareQueueItem): string {
  return `social-receipt-${createHash("sha256").update(`${item.sourceVentureId}:${item.target.profileId}:${item.id}:${item.content.contentHash}`).digest("hex").slice(0, 16)}`;
}

function idempotencyKey(item: CapabilityAwareQueueItem): string {
  return createHash("sha256").update(`${item.sourceVentureId}:${item.target.profileId}:${item.target.connectionBindingRef}:${item.channel}:${item.id}:${item.content.contentHash}`).digest("hex");
}

export async function runSocialPublisher(options: SocialPublisherOptions): Promise<SocialPublisherReport> {
  const now = options.now ?? new Date();
  const environment = options.environment ?? process.env;
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const stateRoot = options.stateRoot ?? defaultStateRoot;
  const configRoot = options.configRoot ?? defaultConfigRoot;
  if (await exists(path.join(stateRoot, "PAUSED"))) {
    return { status: "paused", queueItems: 0, due: 0, published: 0, ambiguous: 0, rejected: 0, skipped: 0, assetHeld: 0, publishHeld: 0 };
  }

  return withFileLock(stateRoot, ".social-lock", async () => {
    const current = SocialActivationSchema.safeParse(await readJson<unknown>(stateRoot, "social/activation.json", null));
    const checkedToday = current.success && pragueClockParts(new Date(current.data.updatedAt)).date === pragueClockParts(now).date;
    const activation = checkedToday ? current.data : await refreshSocialActivation({
      repoRoot,
      stateRoot,
      configRoot,
      environment,
      now,
      safetyCheckerReady: TT_SAFETY_CHECKER_VERSION === "keeper-tt-1"
    });
    if (environment.SOCIAL_KILL_SWITCH !== "false" || await exists(path.join(stateRoot, "SOCIAL_PAUSED"))) {
      return { status: "paused", queueItems: 0, due: 0, published: 0, ambiguous: 0, rejected: 0, skipped: 0, assetHeld: 0, publishHeld: 0 };
    }
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
    const pausedProfileIds = mergedIds(...profilePauseSets, lifecycleHolds.pausedProfileIds);
    const pausedConnectionIds = mergedIds(...connectionPauseSets, lifecycleHolds.pausedConnectionIds);
    const rawEntries = await Promise.all(queueFiles.map(async (name) => ({
      name,
      raw: JSON.parse(await readFile(path.join(queueDirectory, name), "utf8")) as unknown
    })));
    const entries: Array<{ name: string; item: CapabilityAwareQueueItem }> = [];
    let malformed = lifecycleHolds.malformed;
    for (const entry of rawEntries) {
      try {
        entries.push({ name: entry.name, item: resolveCapabilityAwareQueueItem(entry.raw, publisherRegistry) });
      } catch {
        malformed += 1;
      }
    }
    // Keyed by string: a queue item may name a platform (LinkedIn) that has no global channel yet,
    // and the lookup below refuses it by name instead of the types pretending it cannot happen.
    const channels = new Map<string, (typeof channelRegistry.channels)[number]>(channelRegistry.channels.map((channel) => [channel.id, channel]));
    // Due means approved: `queued` (the Queue's approval, quorum#573), or a legacy v1 draft. A v2
    // draft waits for the owner and is never promoted by the runner itself. A v1 draft (DNESKAi's
    // pack writes every check `pass`) predates the Queue and sends once its connection is live.
    const due = entries.filter(({ item }) =>
      (item.status === "queued" || (item.status === "draft" && item.migration !== null)) &&
      new Date(item.publishWindow.notBefore).getTime() <= now.getTime() &&
      new Date(item.publishWindow.notAfter).getTime() >= now.getTime()
    );
    const targetResolved = due.map((entry) => {
      const resolution = resolvePublisherTarget({
        item: entry.item,
        registry: publisherRegistry,
        capabilityMap,
        environment,
        now,
        pausedProfileIds,
        pausedConnectionIds
      });
      const providerResolution = resolution.target
        ? resolveProviderBinding({
            registry: providerRegistry,
            publisherRegistry,
            connectionId: resolution.target.connection.id,
            environment,
            requiredCapability: "publish-original"
          })
        : null;
      return { ...entry, resolution, providerResolution };
    });
    const eligibleDue: Array<{ name: string; item: CapabilityAwareQueueItem; target: ResolvedPublisherTarget; provider: ResolvedProviderBinding }> = [];
    let refusedBeforeSend = 0;
    const cadenceTimes = new Map<string, Date[]>();
    for (const { item } of entries) {
      if (item.status !== "published" || !item.attempt) continue;
      const values = cadenceTimes.get(item.target.connectionBindingRef) ?? [];
      values.push(new Date(item.attempt.claimedAt));
      cadenceTimes.set(item.target.connectionBindingRef, values);
    }
    for (const entry of targetResolved) {
      if (entry.resolution.decision !== "eligible"
        || !entry.resolution.target
        || entry.providerResolution?.decision !== "eligible"
        || !entry.providerResolution.target
        || !sourceVentureActive(entry.item, activation)
        || !receiptRecordable(entry.item)) continue;
      const provider = entry.providerResolution.target;
      const providerId = provider.provider.id;
      // Direct Meta sends Instagram and Threads; Buffer sends LinkedIn and nothing else (quorum#571).
      if (!providerMaySend(providerId, entry.item.channel) || providerId !== entry.resolution.target.providerId || provider.provider.apiVersion === null) continue;
      // Each of these costs its own item, never the run: a channel still in draft skips it, and an
      // item that fails the publishable check is held with the reason written down.
      const channel = channels.get(entry.item.channel);
      if (!channel) continue;
      try {
        assertLiveChannel(channel, environment);
      } catch {
        continue;
      }
      try {
        assertQueueItemPublishable(entry.item.status === "draft" ? { ...entry.item, status: "queued" as const } : entry.item);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await recordPublishHold({ stateRoot, queueFileName: entry.name, item: entry.item, providerId, hold: new SocialPublishHoldError("not-publishable", detail), detail, now });
        refusedBeforeSend += 1;
        continue;
      }
      const target: ResolvedPublisherTarget = {
        ...entry.resolution.target,
        providerId,
        apiVersion: provider.provider.apiVersion,
        providerBindingId: provider.binding.id
      };
      const times = cadenceTimes.get(target.connection.id) ?? [];
      const today = pragueClockParts(now).date;
      if (times.filter((time) => pragueClockParts(time).date === today).length >= target.connection.cadence.maxOrganicPostsPerDay) continue;
      const last = times.sort((a, b) => b.getTime() - a.getTime())[0];
      if (last && now.getTime() - last.getTime() < target.connection.cadence.minHoursBetweenPosts * 3_600_000) continue;
      eligibleDue.push({ name: entry.name, item: entry.item, target, provider });
      times.push(now);
      cadenceTimes.set(target.connection.id, times);
    }

    // Last gate before any provider: every frame must be committed, hash to its record and answer
    // 200 at the exact URL the platform will fetch. A miss holds the one item and writes why.
    const assetGate = await gateSocialAssets({
      entries: eligibleDue,
      environment,
      repoRoot,
      stateRoot,
      configRoot,
      now,
      ...(options.assetCommits ? { commits: options.assetCommits } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.resolveImpl ? { resolveImpl: options.resolveImpl } : {})
    });
    eligibleDue.splice(0, eligibleDue.length, ...assetGate.ready);
    const assetHeld = assetGate.held;
    if (eligibleDue.length === 0) {
      return { status: "draft_only", queueItems: queueFiles.length, due: due.length, published: 0, ambiguous: 0, rejected: 0, skipped: due.length + malformed, assetHeld, publishHeld: refusedBeforeSend };
    }
    if (options.validateOnly) {
      return { status: "validated", queueItems: queueFiles.length, due: due.length, published: 0, ambiguous: 0, rejected: 0, skipped: due.length - eligibleDue.length + malformed, assetHeld, publishHeld: refusedBeforeSend };
    }

    const adapters = new Map<PublishProviderId, PublishAdapter>();
    const adapterFor = (providerId: PublishProviderId): PublishAdapter => {
      if (options.adapter) return options.adapter;
      const known = adapters.get(providerId);
      if (known) return known;
      const created = providerId === "buffer"
        ? createBufferPublishAdapter(environment, options.fetchImpl)
        : createMetaPublishAdapter(environment, options.fetchImpl);
      adapters.set(providerId, created);
      return created;
    };
    let published = 0;
    let ambiguous = 0;
    let rejected = 0;
    let safetyKilled = 0;
    let publishHeld = refusedBeforeSend;
    for (const { name, item, target, provider } of eligibleDue) {
      const channel = channels.get(item.channel)!;
      const key = idempotencyKey(item);
      const queued = CapabilityAwareQueueItemSchema.parse(item.status === "draft" ? { ...item, status: "queued" } : item);
      const safety = checkTittyTuesdaysPost(queued);
      if (!safety.passed) {
        const killed = CapabilityAwareQueueItemSchema.parse({ ...queued, status: "cancelled" });
        await Promise.all([
          atomicWriteJson(stateRoot, `social/queue/${name}`, killed),
          atomicWriteJson(stateRoot, `social/safety-kills/${queued.id}.json`, {
            schemaVersion: "social-safety-kill/1",
            venture: queued.sourceVentureId,
            profileId: queued.target.profileId,
            connectionId: queued.target.connectionBindingRef,
            queueItemId: queued.id,
            checkerVersion: safety.version,
            reasons: safety.reasons,
            killedAt: now.toISOString()
          })
        ]);
        safetyKilled += 1;
        continue;
      }
      const adapter = adapterFor(target.providerId);
      let remoteId: string | null = null;
      let remoteUrl: string | null = null;
      let errorMessage: string | null = null;
      // Set only when the provider refused before creating anything: the item fails for owner
      // review instead of waiting on reconciliation, and still never resends by itself.
      let rejection: ProviderRejectedError | null = null;
      let verificationAttempts = 0;
      let hold: SocialPublishHoldError | null = null;
      try {
        const existing = await adapter.findByIdempotencyKey?.(channel, key, target);
        remoteId = existing?.remoteId ?? (await adapter.publish(channel, queued, key, target, assetGate.verified.get(name) ?? [])).remoteId;
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          verificationAttempts = attempt;
          try {
          const verified = await adapter.verify(channel, queued, remoteId, target);
          remoteUrl = verified.remoteUrl;
          errorMessage = null;
          break;
          } catch (error) {
            errorMessage = redactedConnectorError(error, environment, target);
          }
        }
      } catch (error) {
        // Hold first (refused before any write, the item stays as it was), then a definite refusal
        // (nothing created, the item fails), and anything else is ambiguous.
        if (error instanceof SocialPublishHoldError) hold = error;
        else {
          errorMessage = redactedConnectorError(error, environment, target);
          if (remoteId === null && error instanceof ProviderRejectedError) rejection = error;
        }
      }
      // Refused before any write: the item stays exactly as it was and stays due, like an asset
      // hold. No receipt, no pause; the record says why and goes once the item gets past the check.
      if (hold) {
        await recordPublishHold({ stateRoot, queueFileName: name, item: queued, providerId: target.providerId, hold, detail: redactedConnectorError(hold, environment, target), now });
        publishHeld += 1;
        continue;
      }
      await clearPublishHold(stateRoot, name);
      const succeeded = remoteId !== null && remoteUrl !== null && errorMessage === null;
      const deliveryState = succeeded ? "published" as const : rejection ? "failed" as const : "ambiguous" as const;
      const id = receiptId(queued);
      const providerReceipt = createProviderDeliveryReceipt({
        item: queued,
        provider: provider.provider,
        binding: provider.binding,
        canonicalReceiptId: id,
        idempotencyHash: key,
        state: deliveryState,
        remoteId,
        publicUrl: remoteUrl,
        requestedAt: now,
        respondedAt: succeeded || remoteId !== null || rejection ? now : null,
        status: succeeded
          ? PROVIDER_LABELS[target.providerId]
          : rejection
            ? "Provider refused the request and created nothing; owner review before any new attempt."
            : "Provider outcome is ambiguous and requires reconciliation before any resend.",
        error: succeeded ? null : (errorMessage ?? "Post did not verify live")
      });
      const providerHealth = createProviderHealthSnapshot({
        provider: provider.provider,
        binding: provider.binding,
        generatedAt: now,
        lastSuccessfulOperationAt: succeeded ? now.toISOString() : null,
        lastAttemptedOperationAt: now.toISOString(),
        incidentRefs: succeeded ? [] : [`state/social/provider-receipts/${providerReceipt.id}.json`],
        observedLimit: rejection?.reason === "rate-limited" || rejection?.reason === "plan-limit" ? rejection.reason : null
      });
      const attemptCount = Math.max(1, verificationAttempts) as 1 | 2;
      const receipt = SocialPostReceiptSchema.parse({
        schemaVersion: "social-post-receipt/1",
        id,
        venture: queued.sourceVentureId,
        queueItemId: queued.id,
        profileId: queued.target.profileId,
        connectionId: queued.target.connectionBindingRef,
        providerId: target.providerId,
        providerApiVersion: target.apiVersion,
        providerBindingId: provider.binding.id,
        providerDeliveryReceiptRef: `state/social/provider-receipts/${providerReceipt.id}.json`,
        targetRole: queued.target.role,
        channel: queued.channel,
        variant: queued.variant,
        idempotencyKey: key,
        contentHash: queued.content.contentHash,
        rendererVersion: queued.content.rendererVersion,
        outcome: succeeded ? "published" : rejection ? "failed" : "paused",
        remoteId,
        remoteUrl,
        verifiedLive: succeeded,
        attemptCount,
        attemptedAt: now.toISOString(),
        verifiedAt: succeeded ? now.toISOString() : null,
        error: succeeded ? null : (errorMessage ?? "Post did not verify live").slice(0, 500)
      });
      const updated = CapabilityAwareQueueItemSchema.parse({
        ...queued,
        status: succeeded ? "published" : rejection ? "failed" : "needs_reconciliation",
        attempt: { idempotencyKey: key, claimedAt: now.toISOString(), attemptCount, lastError: receipt.error },
        receiptId: id
      });
      await Promise.all([
        atomicWriteJson(stateRoot, `social/queue/${name}`, updated),
        atomicWriteJson(stateRoot, `social/posts/${id}.json`, receipt),
        atomicWriteJson(stateRoot, `social/provider-receipts/${providerReceipt.id}.json`, providerReceipt),
        atomicWriteJson(stateRoot, `social/provider-health/${providerHealth.id}.json`, providerHealth)
      ]);
      if (succeeded) published += 1;
      else {
        if (rejection) rejected += 1;
        else ambiguous += 1;
        const reason = rejection
          ? `Post ${queued.id} was refused by its provider: ${receipt.error}`
          : `Post ${queued.id} has an ambiguous provider outcome: ${receipt.error}`;
        await Promise.all([
          atomicWriteJson(stateRoot, `social/pauses/connections/${target.connection.id}.json`, {
            schemaVersion: "social-connection-pause/1",
            connectionId: target.connection.id,
            profileId: target.profile.id,
            reason,
            pausedAt: now.toISOString()
          }),
          pauseVentureSocial({ stateRoot, venture: queued.sourceVentureId as SocialVenture, reason, now })
        ]);
      }
    }
    return { status: "complete", queueItems: queueFiles.length, due: due.length, published, ambiguous, rejected, skipped: due.length - eligibleDue.length + safetyKilled + malformed, assetHeld, publishHeld };
  });
}
