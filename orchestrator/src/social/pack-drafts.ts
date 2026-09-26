import type { SocialPack } from "../contracts/social-pack.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { SOCIAL_DECISION_REFERENCE } from "./activation.js";
import {
  AWAITING_OWNER_APPROVAL,
  CapabilityAwareQueueItemSchema,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "./queue.js";

type SocialLocale = "en" | "cs";
type PackChannel = "instagram" | "threads";

export function deterministicVariant(value: string): "A" | "B" {
  return Number.parseInt(sha256(value).slice(0, 2), 16) % 2 === 0 ? "A" : "B";
}

/** Where a day's pack is written, as a repository path: what a draft's `sourcePackage` names. */
export function socialPackArtifactRef(date: string): string {
  return `state/social/packs/${date}.json`;
}

/**
 * The hash a draft binds its pack to: the pack as written, canonically serialised. The asset gate
 * (`readRecordedAssetHashes`) reads the file back and trusts nothing it records unless it still
 * hashes to this.
 */
export function socialPackHash(pack: SocialPack): string {
  return sha256(canonicalJson(pack));
}

function draftAltText(pack: SocialPack, locale: SocialLocale, channel: PackChannel): string {
  const frames = pack.byLocale[locale]![channel].frames;
  // A Threads item carries no frames at all, so it has nothing to describe. The schema still
  // wants a sentence; the honest one says the post is words.
  if (frames.length === 0) {
    return locale === "cs" ? "Textový příspěvek bez obrázku." : "A text post with no image.";
  }
  return frames
    .map((frame, index) => `Frame ${index + 1}: ${pack.altTexts[frame]}`)
    .join(" ")
    .slice(0, 1_000);
}

/**
 * One DNESKAi draft for the Queue, as a capability-aware queue v2 item (quorum#583).
 *
 * Until #583 the pack wrote queue v1 with every check `pass`, which broke two contracts at once. A
 * v1 draft whose checks pass is due without the owner's approval, and the migration audit counts
 * every v1 file as legacy, so each published edition moved the pinned totals and failed the
 * post-cycle gate. This item is bound to DNESKAi's own profile and connection for its channel,
 * carries its pack by hash as marketingShark's drafts carry their package, and grants nothing:
 * it is a `draft`, which the runner never treats as due; every check is `pending`, which
 * `assertQueueItemPublishable` refuses; and the connection stays held until the owner activates
 * it. The owner's approval in the Queue is what makes it `queued`.
 */
export function buildPackDraft(input: {
  pack: SocialPack;
  /** `socialPackHash` of the pack the draft was composed from. */
  packageHash: string;
  locale: SocialLocale;
  channel: PackChannel;
  /** DNESKAi's own profile and connection on this channel, from the publisher registry. */
  target: { profileId: string; connectionBindingRef: string };
  destination: string;
  evidenceRefs: string[];
  /** The edition meeting that chose the story: `state/meetings/<date>-cu-edition.json`. */
  selectionRef: string;
  now: Date;
  framesHosted: boolean;
}): CapabilityAwareQueueItem {
  const notBefore = input.now.toISOString();
  const notAfter = new Date(input.now.getTime() + 72 * 60 * 60 * 1_000).toISOString();
  const localized = input.pack.byLocale[input.locale]!;
  const platform = localized[input.channel];
  const id = `caught-up-${input.pack.date}-${input.locale}-${input.channel}`;
  const variant = deterministicVariant(id);
  // The release and campaign ids the migration gives a v1 draft of the same day, so a rejection's
  // taste note names a DNESKAi release the same way whichever writer drafted it.
  const campaignId = `caught-up-${input.pack.date}-${input.locale}`;
  const base = {
    schemaVersion: 2 as const,
    id,
    sourceVentureId: "caught-up",
    releaseId: campaignId,
    campaignId,
    experimentId: null,
    target: {
      profileId: input.target.profileId,
      profileRole: "venture-primary" as const,
      role: "primary" as const,
      connectionBindingRef: input.target.connectionBindingRef,
      // A venture posting to its own primary profile crosses no capability edge; only Door Money,
      // WebDev Signal and marketingShark need one there (`resolvePublisherTarget`).
      capabilityRef: null,
      amplifierEligibilityRef: null,
      campaignApprovalRef: null
    },
    action: "publish-original" as const,
    sourcePackage: {
      schemaVersion: "approved-publish-package/1" as const,
      artifactRef: socialPackArtifactRef(input.pack.date),
      packageHash: input.packageHash
    },
    locale: input.locale,
    variant,
    channel: input.channel,
    objective: "trust" as const,
    audience: `Caught Up readers (${input.locale})`,
    destination: input.destination,
    utm: {
      source: input.channel,
      medium: "organic_social" as const,
      campaign: campaignId,
      content: `edition-carousel-${input.locale}`
    },
    content: {
      text: input.channel === "instagram" ? localized.instagram.variants[variant] : localized.threads.variants[variant],
      altText: draftAltText(input.pack, input.locale, input.channel),
      // DNESKAi's Threads post is text and a link, and its frames belong to the carousel, which
      // is Instagram's. The connector has taken Threads images since #572; DNESKAi renders no
      // Threads deck to give it.
      //
      // An Instagram draft composed while no channel is enabled carries no image either: its
      // frames were rendered for the manifest and never written under `site/public/social`, so
      // there is nothing hosted to point at. `assertQueueItemPublishable` refuses an Instagram
      // item without one, approved or not, so this item can be reviewed and copied from the admin
      // but never sent.
      assetPaths: input.channel === "threads" || !input.framesHosted ? [] : platform.frames,
      factualClaimRefs: input.evidenceRefs,
      rendererVersion: "carousel-studio-1" as const,
      contentHash: "0".repeat(64)
    },
    publishWindow: { notBefore, notAfter },
    status: "draft" as const,
    checks: {
      schema: "pending" as const,
      brand: "pending" as const,
      claims: "pending" as const,
      quill: "pending" as const,
      keeper: "pending" as const,
      duplicate: "pending" as const,
      accessibility: "pending" as const,
      budget: "pending" as const,
      capability: "pending" as const,
      authority: "pending" as const,
      policy: "pending" as const
    },
    approvalProvenance: {
      approvalRef: AWAITING_OWNER_APPROVAL,
      selectionRef: input.selectionRef,
      // The decision DNESKAi's social activation record is kept under.
      policyRef: SOCIAL_DECISION_REFERENCE
    },
    selectedBy: "PULSE" as const,
    createdAt: notBefore,
    attempt: null,
    receiptId: null,
    migration: null
  };
  return CapabilityAwareQueueItemSchema.parse({
    ...base,
    content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) }
  });
}
