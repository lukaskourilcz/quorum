import { promisesEngagementReward } from "@boardlessai/carousel-studio";
import { queueItemV2Hash, type QueueItemV2 } from "./item";
import type { QueueCheckState, QueueDeterministicCheck } from "./types";

/**
 * The six checks the Queue can decide by itself, run again at the moment of approval, and the one
 * copy rule no approval can waive.
 *
 * The five others (brand, claims, quill, keeper, policy) are judgements a model cannot pass for
 * itself, and the owner's approval is recorded as their evidence. These six are facts about the
 * file and the registries, so they are computed, never assumed: a draft whose checks say
 * `pending` is approved only if every one of these passes now.
 */
export interface QueueRegistryContext {
  profiles: ReadonlyMap<string, { id: string; role: string; ventureRef: string | null; supportedVentures: readonly string[]; displayLabel: string; brandRef: string | null }>;
  connections: ReadonlyMap<string, { id: string; profileId: string; platform: string; mode: string; publicHandle: string | null; enabledByHumanAt: string | null }>;
  /** Allowed `<source> -> social-distribution` edges for approved publish packages, keyed by source. */
  capabilityEdges: ReadonlyMap<string, { governingReference: string; dataSchemaVersion: string }>;
  capabilityMapVersion: string | null;
}

export type DeterministicCheckResult = {
  results: Record<QueueDeterministicCheck, QueueCheckState>;
  failures: string[];
  /** The copy rule no approval can waive, when the caption or alt text breaks it; null when it holds. */
  copyFailure: string | null;
};

/**
 * Meta and LinkedIn forbid a reward for engagement, and no owner check stands in for that: the rule
 * is the studio's, the same function the marketingShark room's gates run, so copy that reached the
 * item by an edit, a re-render or anything else is refused at approval all the same.
 */
export const ENGAGEMENT_REWARD_FAILURE = "the copy promises a reward for following, liking, sharing or commenting, which Meta and LinkedIn forbid";

export function copyBreaksEngagementRule(copy: { text: string; altText: string | null }): boolean {
  return [copy.text, copy.altText ?? ""].some(promisesEngagementReward);
}

const LIVE_STATUSES = new Set(["draft", "approved", "queued", "publishing", "published"]);

function capabilityPasses(item: QueueItemV2, context: QueueRegistryContext): boolean {
  if (item.migration !== null) return true;
  const reference = item.target.capabilityRef;
  const edge = context.capabilityEdges.get(item.sourceVentureId);
  return reference !== null && edge !== undefined && context.capabilityMapVersion !== null
    && reference.mapVersion === context.capabilityMapVersion
    && reference.source === item.sourceVentureId
    && reference.decisionReference === edge.governingReference
    && reference.dataSchemaVersion === edge.dataSchemaVersion;
}

function authorityPasses(item: QueueItemV2, context: QueueRegistryContext): boolean {
  const profile = context.profiles.get(item.target.profileId);
  const connection = context.connections.get(item.target.connectionBindingRef);
  return profile !== undefined && connection !== undefined
    && profile.role === item.target.profileRole
    && connection.profileId === profile.id
    && connection.platform === item.channel
    && (profile.ventureRef === item.sourceVentureId || profile.supportedVentures.includes(item.sourceVentureId));
}

/** Another queue item, reduced to what the duplicate check compares. A v1 item's profile comes from its mapping. */
export interface QueueSibling {
  id: string;
  status: string;
  profileId: string | null;
  text: string;
}

/** The same caption already live on the same profile, from any other item. */
function duplicatePasses(item: QueueItemV2, others: readonly QueueSibling[]): boolean {
  return !others.some((other) => other.id !== item.id
    && LIVE_STATUSES.has(other.status)
    && other.profileId === item.target.profileId
    && other.text === item.content.text);
}

export function runDeterministicChecks(item: QueueItemV2, others: readonly QueueSibling[], context: QueueRegistryContext): DeterministicCheckResult {
  const results: Record<QueueDeterministicCheck, QueueCheckState> = {
    schema: queueItemV2Hash(item) === item.content.contentHash ? "pass" : "fail",
    duplicate: duplicatePasses(item, others) ? "pass" : "fail",
    accessibility: item.content.assetPaths.length === 0 || (item.content.altText?.trim().length ?? 0) > 0 ? "pass" : "fail",
    // Every transport the Queue can reach is free (Direct Meta, Buffer's free plan), and nothing
    // in an approval calls a model, so an approval spends nothing.
    budget: "pass",
    capability: capabilityPasses(item, context) ? "pass" : "fail",
    authority: authorityPasses(item, context) ? "pass" : "fail"
  };
  const messages: Record<QueueDeterministicCheck, string> = {
    schema: "the item's content hash does not match its content",
    duplicate: "the same caption is already live on this profile",
    accessibility: "a post with images needs alt text",
    budget: "the approval would spend money",
    capability: "the capability map does not allow this venture to hand posts to Social Distribution",
    authority: "the profile or its connection does not belong to this venture and platform"
  };
  const copyFailure = copyBreaksEngagementRule(item.content) ? ENGAGEMENT_REWARD_FAILURE : null;
  const failures = [
    ...(Object.keys(results) as QueueDeterministicCheck[]).filter((id) => results[id] === "fail").map((id) => messages[id]),
    ...(copyFailure ? [copyFailure] : [])
  ];
  return { results, failures, copyFailure };
}
