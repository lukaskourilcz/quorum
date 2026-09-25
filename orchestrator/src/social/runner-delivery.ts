import { createHash } from "node:crypto";
import { SocialPostReceiptSchema } from "../contracts/autonomy.js";
import { atomicWriteJson, atomicWriteText } from "../state.js";
import { pauseVentureSocial, type SocialVenture } from "./activation.js";
import type { PublishProviderId } from "./provider-platforms.js";
import { createProviderDeliveryReceipt, createProviderHealthSnapshot } from "./providers.js";
import { ProviderRejectedError, SocialPublishHoldError, type PublishAdapter } from "./publish.js";
import { clearPublishHold, recordPublishHold } from "./publish-holds.js";
import { claimedFrames, type SocialPublishClaim } from "./publish-claims.js";
import type { ResolvedPublisherTarget } from "./publisher-targets.js";
import { CapabilityAwareQueueItemSchema, type CapabilityAwareQueueItem } from "./queue.js";
import type { EligibleEntry } from "./runner-context.js";

export type DeliveryOutcome = "published" | "ambiguous" | "rejected" | "held";

const PROVIDER_LABELS: Readonly<Record<PublishProviderId, string>> = {
  "direct-meta": "Official Meta item verified live.",
  buffer: "Buffer post verified sent to LinkedIn."
};

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

export function redactedConnectorError(error: unknown, environment: NodeJS.ProcessEnv, target: ResolvedPublisherTarget): string {
  return redactSocialError(error, [environment[target.credentialRef] ?? "", environment[target.nativeAccountIdRef] ?? ""]);
}

function receiptId(item: CapabilityAwareQueueItem): string {
  return `social-receipt-${createHash("sha256").update(`${item.sourceVentureId}:${item.target.profileId}:${item.id}:${item.content.contentHash}`).digest("hex").slice(0, 16)}`;
}

export function idempotencyKey(item: CapabilityAwareQueueItem): string {
  return createHash("sha256").update(`${item.sourceVentureId}:${item.target.profileId}:${item.target.connectionBindingRef}:${item.channel}:${item.id}:${item.content.contentHash}`).digest("hex");
}

/** Put a claim back exactly as the file read before it was claimed: nothing was sent. */
export async function releaseClaim(stateRoot: string, claim: SocialPublishClaim): Promise<void> {
  await atomicWriteText(stateRoot, `social/queue/${claim.queueFile}`, claim.before);
}

/**
 * Send one claimed item and record what became of it.
 *
 * A hold (the adapter refused before any write) releases the claim and records why, so the item is
 * due again on the next run. Anything else ends the claim: `published`, `failed` when the provider's
 * own answer proves nothing was created, or `needs_reconciliation`, which pauses the connection and
 * the venture and is never resent by itself.
 */
export async function deliverClaimedItem(input: {
  entry: EligibleEntry;
  claim: SocialPublishClaim;
  adapter: PublishAdapter;
  environment: NodeJS.ProcessEnv;
  stateRoot: string;
  now: Date;
}): Promise<DeliveryOutcome> {
  const { entry, claim, adapter, environment, stateRoot, now } = input;
  const { name, item: claimed, channel, target, provider } = entry;
  const key = claim.idempotencyKey;
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
    remoteId = existing?.remoteId ?? (await adapter.publish(channel, claimed, key, target, claimedFrames(claim))).remoteId;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      verificationAttempts = attempt;
      try {
        const verified = await adapter.verify(channel, claimed, remoteId, target);
        remoteUrl = verified.remoteUrl;
        errorMessage = null;
        break;
      } catch (error) {
        errorMessage = redactedConnectorError(error, environment, target);
      }
    }
  } catch (error) {
    // Hold first (refused before any write), then a definite refusal (nothing created, the item
    // fails), and anything else is ambiguous.
    if (error instanceof SocialPublishHoldError) hold = error;
    else {
      errorMessage = redactedConnectorError(error, environment, target);
      if (remoteId === null && error instanceof ProviderRejectedError) rejection = error;
    }
  }
  if (hold) {
    await releaseClaim(stateRoot, claim);
    await recordPublishHold({ stateRoot, queueFileName: name, item: claimed, providerId: target.providerId, hold, detail: redactedConnectorError(hold, environment, target), now });
    return "held";
  }
  await clearPublishHold(stateRoot, name);
  const succeeded = remoteId !== null && remoteUrl !== null && errorMessage === null;
  const deliveryState = succeeded ? "published" as const : rejection ? "failed" as const : "ambiguous" as const;
  const id = receiptId(claimed);
  const providerReceipt = createProviderDeliveryReceipt({
    item: claimed,
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
      ? PROVIDER_LABELS[target.providerId as PublishProviderId]
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
    venture: claimed.sourceVentureId,
    queueItemId: claimed.id,
    profileId: claimed.target.profileId,
    connectionId: claimed.target.connectionBindingRef,
    providerId: target.providerId,
    providerApiVersion: target.apiVersion,
    providerBindingId: provider.binding.id,
    providerDeliveryReceiptRef: `state/social/provider-receipts/${providerReceipt.id}.json`,
    targetRole: claimed.target.role,
    channel: claimed.channel,
    variant: claimed.variant,
    idempotencyKey: key,
    contentHash: claimed.content.contentHash,
    rendererVersion: claimed.content.rendererVersion,
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
    ...claimed,
    status: succeeded ? "published" : rejection ? "failed" : "needs_reconciliation",
    attempt: { idempotencyKey: key, claimedAt: claim.claimedAt, attemptCount, lastError: receipt.error },
    receiptId: id
  });
  await Promise.all([
    atomicWriteJson(stateRoot, `social/queue/${name}`, updated),
    atomicWriteJson(stateRoot, `social/posts/${id}.json`, receipt),
    atomicWriteJson(stateRoot, `social/provider-receipts/${providerReceipt.id}.json`, providerReceipt),
    atomicWriteJson(stateRoot, `social/provider-health/${providerHealth.id}.json`, providerHealth)
  ]);
  if (succeeded) return "published";
  const reason = rejection
    ? `Post ${claimed.id} was refused by its provider: ${receipt.error}`
    : `Post ${claimed.id} has an ambiguous provider outcome: ${receipt.error}`;
  await Promise.all([
    atomicWriteJson(stateRoot, `social/pauses/connections/${target.connection.id}.json`, {
      schemaVersion: "social-connection-pause/1",
      connectionId: target.connection.id,
      profileId: target.profile.id,
      reason,
      pausedAt: now.toISOString()
    }),
    pauseVentureSocial({ stateRoot, venture: claimed.sourceVentureId as SocialVenture, reason, now })
  ]);
  return rejection ? "rejected" : "ambiguous";
}
