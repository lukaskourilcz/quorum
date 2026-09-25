import { access } from "node:fs/promises";
import path from "node:path";
import { SocialActivationSchema, type SocialActivation } from "../contracts/autonomy.js";
import { atomicWriteJson, readJson, withFileLock } from "../state.js";
import { configRoot as defaultConfigRoot, repoRoot as defaultRepoRoot, stateRoot as defaultStateRoot } from "../paths.js";
import { pragueClockParts } from "../meetings/clock.js";
import { refreshSocialActivation } from "./activation.js";
import { createBufferPublishAdapter } from "./buffer.js";
import { createMetaPublishAdapter } from "./meta.js";
import type { SocialAssetCommits } from "./media/assets.js";
import { gateSocialAssets } from "./media/gate.js";
import type { PublishProviderId } from "./provider-platforms.js";
import { SocialPublishHoldError, type PublishAdapter } from "./publish.js";
import { recordPublishHold } from "./publish-holds.js";
import { claimedQueueItem, claimStands, type SocialPublishClaim } from "./publish-claims.js";
import { CapabilityAwareQueueItemSchema } from "./queue.js";
import { checkTittyTuesdaysPost, TT_SAFETY_CHECKER_VERSION } from "./tt-safety.js";
import {
  insideWindow,
  isDue,
  loadPublisherContext,
  selectEligible,
  type PublisherContext,
  type QueueEntry,
  type RefusedEntry
} from "./runner-context.js";
import { deliverClaimedItem, idempotencyKey, redactedConnectorError, releaseClaim } from "./runner-delivery.js";

export { redactSocialError } from "./runner-delivery.js";

/**
 * Which half of a publisher run to do.
 *
 * - `claim` decides what is due and eligible, proves its frames, and writes each item it will send
 *   as `publishing`. It contacts no provider. The workflow pushes those claims to the branch before
 *   the send starts, so the Queue can no longer change an item a run is about to send.
 * - `send` sends only the claims the claim phase named, and only while the branch still carries
 *   them, after checking every lock again against the branch as it now stands.
 * - `all` does both in one process, with no push between: a local run and the tests.
 */
export type SocialPublisherPhase = "claim" | "send" | "all";

export interface SocialPublisherOptions {
  validateOnly: boolean;
  dryIfDisabled: boolean;
  phase?: SocialPublisherPhase;
  /** The send phase's input: what the claim phase of the same run claimed. */
  claims?: readonly SocialPublishClaim[];
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
  status: "paused" | "draft_only" | "validated" | "claimed" | "complete";
  queueItems: number;
  due: number;
  /** Items this run marked `publishing` before any provider was called. */
  claimed: number;
  published: number;
  ambiguous: number;
  /** Refused by the provider before anything was created (quorum#571); failed for owner review. */
  rejected: number;
  skipped: number;
  /** Claims put back as they were without a send: a hold, a pause or a lock that closed in between. */
  released: number;
  /** Items whose frames could not be proved this run; each has a `social-asset-hold/1` record. */
  assetHeld: number;
  /** Items held before any write (a full publishing limit, a failed publishable check); each has a `social-publish-hold/1` record. */
  publishHeld: number;
  /** What the claim phase claimed, for the send phase. Empty on every other report. */
  claims: SocialPublishClaim[];
}

function report(status: SocialPublisherReport["status"], fields: Partial<Omit<SocialPublisherReport, "status">> = {}): SocialPublisherReport {
  return {
    status,
    queueItems: 0,
    due: 0,
    claimed: 0,
    published: 0,
    ambiguous: 0,
    rejected: 0,
    skipped: 0,
    released: 0,
    assetHeld: 0,
    publishHeld: 0,
    claims: [],
    ...fields
  };
}

async function exists(filePath: string): Promise<boolean> {
  try { await access(filePath); return true; } catch { return false; }
}

interface Roots {
  now: Date;
  environment: NodeJS.ProcessEnv;
  repoRoot: string;
  stateRoot: string;
  configRoot: string;
}

function roots(options: SocialPublisherOptions): Roots {
  return {
    now: options.now ?? new Date(),
    environment: options.environment ?? process.env,
    repoRoot: options.repoRoot ?? defaultRepoRoot,
    stateRoot: options.stateRoot ?? defaultStateRoot,
    configRoot: options.configRoot ?? defaultConfigRoot
  };
}

async function currentActivation({ repoRoot, stateRoot, configRoot, environment, now }: Roots): Promise<SocialActivation> {
  const current = SocialActivationSchema.safeParse(await readJson<unknown>(stateRoot, "social/activation.json", null));
  const checkedToday = current.success && pragueClockParts(new Date(current.data.updatedAt)).date === pragueClockParts(now).date;
  return checkedToday ? current.data : refreshSocialActivation({
    repoRoot,
    stateRoot,
    configRoot,
    environment,
    now,
    safetyCheckerReady: TT_SAFETY_CHECKER_VERSION === "keeper-tt-1"
  });
}

async function killSwitched({ environment, stateRoot }: Roots): Promise<boolean> {
  return environment.SOCIAL_KILL_SWITCH !== "false" || await exists(path.join(stateRoot, "SOCIAL_PAUSED"));
}

async function holdRefused(context: PublisherContext, refused: readonly RefusedEntry[]): Promise<void> {
  for (const entry of refused) {
    await recordPublishHold({
      stateRoot: context.stateRoot,
      queueFileName: entry.name,
      item: entry.item,
      providerId: entry.providerId,
      hold: new SocialPublishHoldError("not-publishable", entry.reason),
      detail: entry.reason,
      now: context.now
    });
  }
}

/** The claim phase. It never calls a provider; the asset gate's HEAD requests are its only network. */
async function claimDuePosts(options: SocialPublisherOptions, base: Roots): Promise<SocialPublisherReport> {
  if (await exists(path.join(base.stateRoot, "PAUSED"))) return report("paused");
  return withFileLock(base.stateRoot, ".social-lock", async () => {
    const activation = await currentActivation(base);
    if (await killSwitched(base)) return report("paused");
    const context = await loadPublisherContext({ ...base, activation });
    const due = context.entries.filter(({ item }) => isDue(item, base.now));
    const { eligible, refused } = selectEligible(context, due);
    await holdRefused(context, refused);
    // Last gate before any provider: every frame must be committed, hash to its record and answer
    // 200 at the exact URL the platform will fetch. A miss holds the one item and writes why.
    const assetGate = await gateSocialAssets({
      entries: eligible,
      environment: base.environment,
      repoRoot: base.repoRoot,
      stateRoot: base.stateRoot,
      configRoot: base.configRoot,
      now: base.now,
      ...(options.assetCommits ? { commits: options.assetCommits } : {}),
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.resolveImpl ? { resolveImpl: options.resolveImpl } : {})
    });
    const counts = { queueItems: context.queueFiles.length, due: due.length, assetHeld: assetGate.held, publishHeld: refused.length };
    const unsent = due.length - assetGate.ready.length + context.malformed;
    if (assetGate.ready.length === 0) return report("draft_only", { ...counts, skipped: unsent });
    if (options.validateOnly) return report("validated", { ...counts, skipped: unsent });

    const claims: SocialPublishClaim[] = [];
    let safetyKilled = 0;
    for (const { name, text, item } of assetGate.ready) {
      const queued = CapabilityAwareQueueItemSchema.parse(item.status === "draft" ? { ...item, status: "queued" } : item);
      const safety = checkTittyTuesdaysPost(queued);
      if (!safety.passed) {
        await Promise.all([
          atomicWriteJson(base.stateRoot, `social/queue/${name}`, CapabilityAwareQueueItemSchema.parse({ ...queued, status: "cancelled" })),
          atomicWriteJson(base.stateRoot, `social/safety-kills/${queued.id}.json`, {
            schemaVersion: "social-safety-kill/1",
            venture: queued.sourceVentureId,
            profileId: queued.target.profileId,
            connectionId: queued.target.connectionBindingRef,
            queueItemId: queued.id,
            checkerVersion: safety.version,
            reasons: safety.reasons,
            killedAt: base.now.toISOString()
          })
        ]);
        safetyKilled += 1;
        continue;
      }
      const key = idempotencyKey(queued);
      const claimed = claimedQueueItem(queued, key, base.now);
      await atomicWriteJson(base.stateRoot, `social/queue/${name}`, claimed);
      claims.push({
        queueFile: name,
        itemId: claimed.id,
        idempotencyKey: key,
        claimedAt: claimed.attempt!.claimedAt,
        contentHash: claimed.content.contentHash,
        before: text,
        frames: (assetGate.verified.get(name) ?? []).map(({ path: framePath, url, sha256, contentType, commit, altText }) => ({ path: framePath, url, sha256, contentType, commit, altText }))
      });
    }
    return report(claims.length > 0 ? "claimed" : "draft_only", { ...counts, claimed: claims.length, skipped: unsent + safetyKilled, claims });
  });
}

/** Put back every claim that still stands on the branch; nothing was sent for any of them. */
async function releaseStanding(context: PublisherContext, claims: readonly SocialPublishClaim[]): Promise<number> {
  let released = 0;
  for (const claim of claims) {
    const entry = context.entries.find(({ name }) => name === claim.queueFile);
    if (!entry || !claimStands(entry.item, claim)) continue;
    await releaseClaim(context.stateRoot, claim);
    released += 1;
  }
  return released;
}

/** The send phase: only this run's claims, re-checked against the branch as it stands now. */
async function sendClaimedPosts(options: SocialPublisherOptions, base: Roots, claims: readonly SocialPublishClaim[]): Promise<SocialPublisherReport> {
  if (claims.length === 0) return report("draft_only");
  return withFileLock(base.stateRoot, ".social-lock", async () => {
    const activation = await currentActivation(base);
    const context = await loadPublisherContext({ ...base, activation });
    // A pause that reached the branch between the claim and the send wins: nothing is sent, and
    // every claim still standing goes back to what it was.
    if (await exists(path.join(base.stateRoot, "PAUSED")) || await killSwitched(base)) {
      return report("paused", { released: await releaseStanding(context, claims) });
    }

    const byName = new Map(claims.map((claim) => [claim.queueFile, claim]));
    // A claim the branch no longer carries was overtaken; it is not this run's to send or release.
    const standing: QueueEntry[] = context.entries.filter(({ name, item }) => {
      const claim = byName.get(name);
      return claim !== undefined && claimStands(item, claim) && idempotencyKey(item) === claim.idempotencyKey;
    });
    const open = standing.filter(({ item }) => insideWindow(item, base.now));
    const { eligible, refused } = selectEligible(context, open);
    await holdRefused(context, refused);
    const sendable = new Set(eligible.map(({ name }) => name));
    let released = 0;
    for (const { name } of standing) {
      if (sendable.has(name)) continue;
      await releaseClaim(base.stateRoot, byName.get(name)!);
      released += 1;
    }

    const adapters = new Map<PublishProviderId, PublishAdapter>();
    const adapterFor = (providerId: PublishProviderId): PublishAdapter => {
      if (options.adapter) return options.adapter;
      const known = adapters.get(providerId);
      if (known) return known;
      const created = providerId === "buffer"
        ? createBufferPublishAdapter(base.environment, options.fetchImpl)
        : createMetaPublishAdapter(base.environment, options.fetchImpl);
      adapters.set(providerId, created);
      return created;
    };
    const outcomes = { published: 0, ambiguous: 0, rejected: 0, held: 0 };
    for (const entry of eligible) {
      const outcome = await deliverClaimedItem({
        entry,
        claim: byName.get(entry.name)!,
        adapter: adapterFor(entry.target.providerId as PublishProviderId),
        environment: base.environment,
        stateRoot: base.stateRoot,
        now: base.now
      }).catch(async (error: unknown) => {
        // Nothing past the adapter may cost the other claims. The item keeps its claim, so it is
        // never resent by itself, and the error says why in the run's log.
        console.error(redactedConnectorError(error, base.environment, entry.target));
        return "ambiguous" as const;
      });
      outcomes[outcome] += 1;
    }
    return report("complete", {
      queueItems: context.queueFiles.length,
      due: claims.length,
      claimed: claims.length,
      published: outcomes.published,
      ambiguous: outcomes.ambiguous,
      rejected: outcomes.rejected,
      skipped: claims.length - standing.length,
      released: released + outcomes.held,
      publishHeld: refused.length + outcomes.held
    });
  });
}

export async function runSocialPublisher(options: SocialPublisherOptions): Promise<SocialPublisherReport> {
  const base = roots(options);
  const phase = options.phase ?? "all";
  if (phase === "send") return sendClaimedPosts(options, base, options.claims ?? []);
  const claimed = await claimDuePosts(options, base);
  if (phase === "claim" || claimed.status !== "claimed") return claimed;
  const sent = await sendClaimedPosts(options, base, claimed.claims);
  return {
    ...sent,
    queueItems: claimed.queueItems,
    due: claimed.due,
    skipped: claimed.skipped + sent.skipped,
    assetHeld: claimed.assetHeld,
    publishHeld: claimed.publishHeld + sent.publishHeld,
    claims: []
  };
}
