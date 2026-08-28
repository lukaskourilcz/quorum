import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { SocialActivationSchema, SocialPostReceiptSchema, type SocialActivation } from "../contracts/autonomy.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";
import { configRoot as defaultConfigRoot, repoRoot as defaultRepoRoot, stateRoot as defaultStateRoot } from "../paths.js";
import { pragueClockParts } from "../meetings/clock.js";
import { refreshSocialActivation, pauseVentureSocial, isPublishingVenture, type SocialVenture } from "./activation.js";
import { ChannelRegistrySchema, assertLiveChannel } from "./channel-registry.js";
import { createMetaPublishAdapter } from "./meta.js";
import type { PublishAdapter } from "./publish.js";
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

export interface SocialPublisherOptions {
  validateOnly: boolean;
  dryIfDisabled: boolean;
  now?: Date;
  environment?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  adapter?: PublishAdapter;
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
  skipped: number;
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

function redactedConnectorError(error: unknown, environment: NodeJS.ProcessEnv, target: ResolvedPublisherTarget): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const reference of [target.credentialRef, target.nativeAccountIdRef]) {
    const value = environment[reference];
    if (value) message = message.split(value).join("[REDACTED]");
  }
  return message
    .replace(/(access[_-]?token|authorization|cookie|client[_-]?secret)\s*[=:]\s*[^\s&]+/giu, "$1=[REDACTED]")
    .slice(0, 500);
}

function sourceVentureActive(item: CapabilityAwareQueueItem, activation: SocialActivation): boolean {
  return isPublishingVenture(item.sourceVentureId)
    && activation.ventures[item.sourceVentureId].status === "enabled";
}

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
    return { status: "paused", queueItems: 0, due: 0, published: 0, ambiguous: 0, skipped: 0 };
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
      return { status: "paused", queueItems: 0, due: 0, published: 0, ambiguous: 0, skipped: 0 };
    }
    const channelRegistry = ChannelRegistrySchema.parse(JSON.parse(await readFile(path.join(configRoot, "channels.json"), "utf8")) as unknown);
    const queueDirectory = path.join(stateRoot, "social", "queue");
    const files = await readdir(queueDirectory).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? [] : Promise.reject(error));
    const queueFiles = files.filter((name) => name.endsWith(".json")).sort();
    const [publisherRegistry, capabilityMap, profilePauseSets, connectionPauseSets] = await Promise.all([
      loadSocialPublisherRegistry(configRoot),
      loadVentureCapabilityMap(configRoot),
      Promise.all([
        pauseIds(path.join(stateRoot, "social", "pauses", "profiles")),
        pauseIds(path.join(stateRoot, "social", "kill-switches", "profiles"))
      ]),
      Promise.all([
        pauseIds(path.join(stateRoot, "social", "pauses", "connections")),
        pauseIds(path.join(stateRoot, "social", "kill-switches", "connections"))
      ])
    ]);
    const pausedProfileIds = mergedIds(...profilePauseSets);
    const pausedConnectionIds = mergedIds(...connectionPauseSets);
    const rawEntries = await Promise.all(queueFiles.map(async (name) => ({
      name,
      raw: JSON.parse(await readFile(path.join(queueDirectory, name), "utf8")) as unknown
    })));
    const entries: Array<{ name: string; item: CapabilityAwareQueueItem }> = [];
    let malformed = 0;
    for (const entry of rawEntries) {
      try {
        entries.push({ name: entry.name, item: resolveCapabilityAwareQueueItem(entry.raw, publisherRegistry) });
      } catch {
        malformed += 1;
      }
    }
    const channels = new Map(channelRegistry.channels.map((channel) => [channel.id, channel]));
    const due = entries.filter(({ item }) =>
      ["draft", "queued"].includes(item.status) &&
      new Date(item.publishWindow.notBefore).getTime() <= now.getTime() &&
      new Date(item.publishWindow.notAfter).getTime() >= now.getTime()
    );
    const targetResolved = due.map((entry) => ({
      ...entry,
      resolution: resolvePublisherTarget({
        item: entry.item,
        registry: publisherRegistry,
        capabilityMap,
        environment,
        now,
        pausedProfileIds,
        pausedConnectionIds
      })
    }));
    const eligibleDue: Array<{ name: string; item: CapabilityAwareQueueItem; target: ResolvedPublisherTarget }> = [];
    const cadenceTimes = new Map<string, Date[]>();
    for (const { item } of entries) {
      if (item.status !== "published" || !item.attempt) continue;
      const values = cadenceTimes.get(item.target.connectionBindingRef) ?? [];
      values.push(new Date(item.attempt.claimedAt));
      cadenceTimes.set(item.target.connectionBindingRef, values);
    }
    for (const entry of targetResolved) {
      if (entry.resolution.decision !== "eligible" || !entry.resolution.target || !sourceVentureActive(entry.item, activation)) continue;
      const target = entry.resolution.target;
      const times = cadenceTimes.get(target.connection.id) ?? [];
      const today = pragueClockParts(now).date;
      if (times.filter((time) => pragueClockParts(time).date === today).length >= target.connection.cadence.maxOrganicPostsPerDay) continue;
      const last = times.sort((a, b) => b.getTime() - a.getTime())[0];
      if (last && now.getTime() - last.getTime() < target.connection.cadence.minHoursBetweenPosts * 3_600_000) continue;
      eligibleDue.push({ name: entry.name, item: entry.item, target });
      times.push(now);
      cadenceTimes.set(target.connection.id, times);
    }

    for (const { item } of eligibleDue) {
      const queued = item.status === "draft" ? { ...item, status: "queued" as const } : item;
      assertQueueItemPublishable(queued);
      const channel = channels.get(item.channel);
      if (!channel) throw new Error(`No global connector capability exists for ${item.channel}`);
      assertLiveChannel(channel, environment);
    }
    if (eligibleDue.length === 0) {
      return { status: "draft_only", queueItems: queueFiles.length, due: due.length, published: 0, ambiguous: 0, skipped: due.length + malformed };
    }
    if (options.validateOnly) {
      return { status: "validated", queueItems: queueFiles.length, due: due.length, published: 0, ambiguous: 0, skipped: due.length - eligibleDue.length + malformed };
    }

    const adapter = options.adapter ?? createMetaPublishAdapter(environment, options.fetchImpl);
    let published = 0;
    let failed = 0;
    let safetyKilled = 0;
    for (const { name, item, target } of eligibleDue) {
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
      let remoteId: string | null = null;
      let remoteUrl: string | null = null;
      let errorMessage: string | null = null;
      let attemptCount: 1 | 2 = 1;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        attemptCount = attempt as 1 | 2;
        try {
          const existing = await adapter.findByIdempotencyKey?.(channel, key, target);
          remoteId = existing?.remoteId ?? (await adapter.publish(channel, queued, key, target)).remoteId;
          const verified = await adapter.verify(channel, queued, remoteId, target);
          remoteUrl = verified.remoteUrl;
          errorMessage = null;
          break;
        } catch (error) {
          errorMessage = redactedConnectorError(error, environment, target);
        }
      }
      const succeeded = remoteId !== null && remoteUrl !== null && errorMessage === null;
      const id = receiptId(queued);
      const receipt = SocialPostReceiptSchema.parse({
        schemaVersion: "social-post-receipt/1",
        id,
        venture: queued.sourceVentureId,
        queueItemId: queued.id,
        profileId: queued.target.profileId,
        connectionId: queued.target.connectionBindingRef,
        providerId: target.providerId,
        providerApiVersion: target.apiVersion,
        targetRole: queued.target.role,
        channel: queued.channel,
        variant: queued.variant,
        idempotencyKey: key,
        contentHash: queued.content.contentHash,
        rendererVersion: queued.content.rendererVersion,
        outcome: succeeded ? "published" : "paused",
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
        status: succeeded ? "published" : "needs_reconciliation",
        attempt: { idempotencyKey: key, claimedAt: now.toISOString(), attemptCount, lastError: receipt.error },
        receiptId: id
      });
      await Promise.all([
        atomicWriteJson(stateRoot, `social/queue/${name}`, updated),
        atomicWriteJson(stateRoot, `social/posts/${id}.json`, receipt)
      ]);
      if (succeeded) published += 1;
      else {
        failed += 1;
        await Promise.all([
          atomicWriteJson(stateRoot, `social/pauses/connections/${target.connection.id}.json`, {
            schemaVersion: "social-connection-pause/1",
            connectionId: target.connection.id,
            profileId: target.profile.id,
            reason: `Post ${queued.id} failed twice: ${receipt.error}`,
            pausedAt: now.toISOString()
          }),
          pauseVentureSocial({ stateRoot, venture: queued.sourceVentureId as SocialVenture, reason: `Post ${queued.id} failed twice: ${receipt.error}`, now })
        ]);
      }
    }
    return { status: "complete", queueItems: queueFiles.length, due: due.length, published, ambiguous: failed, skipped: due.length - eligibleDue.length + safetyKilled + malformed };
  });
}
