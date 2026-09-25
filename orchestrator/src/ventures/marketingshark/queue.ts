import type { SocialCapabilityRef } from "../../contracts/social-distribution.js";
import type { VentureCapabilityMap } from "../../contracts/venture-capability.js";
import { canonicalJson, sha256 } from "../../hashing.js";
import {
  CapabilityAwareQueueItemSchema,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "../../social/queue.js";
import { resolveVentureCapabilityInMap } from "../capabilities.js";
import type { Brand } from "./config.js";
import { isPostPackage, packagePath, type AnyMarketingSharkPackage } from "./package.js";

/**
 * Stands in `approvalProvenance.approvalRef` until the owner approves an item in the Queue
 * workspace (quorum#573), which replaces it with the approval event's id. Not an approval: every
 * check is still pending and the publisher refuses the item on those alone.
 */
export const AWAITING_OWNER_APPROVAL = "awaiting-owner-approval";

/** One draft per platform, in the order the Queue workspace lists them. */
export const MARKETINGSHARK_PLATFORMS = ["linkedin", "instagram", "threads"] as const;
export type MarketingSharkPlatform = (typeof MARKETINGSHARK_PLATFORMS)[number];

/**
 * devShark's own profile and connection on each platform.
 *
 * The ids are the ones quorum#569 (B2) registers in `config/social-publisher-registry.json`. Until
 * that registry carries them, `resolvePublisherTarget` answers `denied` for an unknown profile;
 * after it, `held` until the owner activates the connection. Neither is `eligible`.
 */
export const DEVSHARK_SOCIAL_TARGETS: Readonly<Record<MarketingSharkPlatform, { profileId: string; connectionBindingRef: string }>> = {
  linkedin: { profileId: "social-profile-devshark-linkedin", connectionBindingRef: "social-connection-devshark-linkedin" },
  instagram: { profileId: "social-profile-devshark-instagram", connectionBindingRef: "social-connection-devshark-instagram" },
  threads: { profileId: "social-profile-devshark-threads", connectionBindingRef: "social-connection-devshark-threads" }
};

export function queueItemPath(date: string, brandId: string, locale: "cs" | "en", channel: MarketingSharkPlatform): string {
  return `social/queue/${date}-${brandId}-${locale}-${channel}.json`;
}

/** The hash a queue item binds to: the committed package, canonically serialised. */
export function marketingSharkPackageHash(built: AnyMarketingSharkPackage): string {
  return sha256(canonicalJson(built));
}

/**
 * The exact reference to marketingShark's edge into Social Distribution, or null when the map does
 * not allow it. A null reference means no queue item is written at all: the handoff is the edge.
 */
export function marketingSharkCapabilityRef(map: VentureCapabilityMap): SocialCapabilityRef | null {
  const resolved = resolveVentureCapabilityInMap(map, {
    source: "marketingshark",
    target: "social-distribution",
    capability: "approved-publish-package",
    schemaVersion: "approved-publish-package/1"
  });
  if (resolved.decision !== "allowed" || !resolved.edge) return null;
  return {
    mapVersion: map.mapVersion,
    source: "marketingshark",
    target: "social-distribution",
    capability: "approved-publish-package",
    dataSchemaVersion: "approved-publish-package/1",
    decisionReference: resolved.edge.governingReference
  };
}

function captionFor(built: AnyMarketingSharkPackage, platform: MarketingSharkPlatform): string {
  const withTags = (text: string, tags: readonly string[]) => (tags.length > 0 ? `${text}\n\n${tags.join(" ")}` : text);
  switch (platform) {
    case "linkedin":
      return withTags(built.descriptions.linkedin.en, built.hashtags.linkedin.en);
    case "instagram":
      return withTags(built.descriptions.instagram.en, built.hashtags.instagram.en);
    case "threads":
      return built.descriptions.threads.en;
  }
}

/**
 * The frames a platform's item points at, from the package's own record of them.
 *
 * Instagram takes JPEG only, so it gets the JPEG copies. LinkedIn and Threads get the PNGs the
 * gates reviewed: Threads takes JPEG or PNG, and the Direct Meta adapter posts them as a Threads
 * carousel since quorum#572.
 */
function assetPathsFor(built: AnyMarketingSharkPackage, platform: MarketingSharkPlatform): string[] {
  const english = built.render.frames.filter((frame) => frame.locale === "en").sort((a, b) => a.slide - b.slide);
  return platform === "instagram" ? english.map((frame) => frame.jpeg.path) : english.map((frame) => frame.png.path);
}

/**
 * Three queue v2 drafts per package, one per platform, English only, and nothing that can publish.
 *
 * Each item is bound to devShark's own profile on its platform and carries the package as an
 * `approved-publish-package/1` reference with the package's hash, so an approval binds exactly the
 * copy and the frames that were reviewed. What keeps them off the wire, precisely:
 *
 *  - every one of the eleven checks is `pending`, and `assertQueueItemPublishable` refuses an item
 *    with any check unpassed;
 *  - the devShark connections are `held` (B2) and the channels are `draft` with
 *    `enabledByHumanAt: null`, so `resolvePublisherTarget` never answers `eligible`;
 *  - marketingShark owns no activation record, so the runner does not treat its items as due;
 *  - a LinkedIn item is refused by name until the LinkedIn transport exists (B4).
 *
 * `SOCIAL_KILL_SWITCH` sits above all of it as the global stop.
 *
 * English only: the three profiles are English, and devShark writes English. A brand that also
 * writes Czech keeps its Czech carousel in the package for review; nothing queues it until a Czech
 * profile exists to receive it.
 */
/** Who a kind's post is for, as the queue records it. The quiz's line predates the rotation. */
const AUDIENCES = {
  quiz: "Working developers who want one real question a day",
  "feature-spotlight": "Working developers choosing where to practise web development",
  "challenge-teaser": "Working developers who want a small coding challenge",
  "this-week": "Working developers who follow devShark through the week",
  announcement: "Working developers who follow devShark"
} as const;

/**
 * What a package's post is about, as the queue cites it: the question for the quiz, the subject
 * the other kinds record. The Queue offers Design Lab editing only for a question-cited post.
 */
export function queueSubject(built: AnyMarketingSharkPackage): { claimRef: string; utmContent: string; audience: string } {
  if (!isPostPackage(built)) {
    return { claimRef: `marketingshark:question:${built.question.id}`, utmContent: `${built.date}-en-${built.question.id}`, audience: AUDIENCES.quiz };
  }
  const subjectId = built.subject.ref.split(":").at(-1) ?? built.kind;
  return { claimRef: built.subject.ref, utmContent: `${built.date}-en-${built.kind}-${subjectId}`.slice(0, 200), audience: AUDIENCES[built.kind] };
}

export function buildQueueItems(input: {
  built: AnyMarketingSharkPackage;
  brand: Brand;
  now: Date;
  /** From `marketingSharkCapabilityRef`; the caller writes no items when it is null. */
  capabilityRef: SocialCapabilityRef;
}): Array<{ relative: string; item: CapabilityAwareQueueItem }> {
  const { built, brand } = input;
  const locale = "en" as const;
  const createdAt = input.now.toISOString();
  const notBefore = new Date(`${built.date}T06:00:00.000Z`).toISOString();
  const notAfter = new Date(`${built.date}T21:00:00.000Z`).toISOString();
  const english = built.carousels.en;
  const packageHash = marketingSharkPackageHash(built);
  const subject = queueSubject(built);

  return MARKETINGSHARK_PLATFORMS.map((channel) => {
    const target = DEVSHARK_SOCIAL_TARGETS[channel];
    const base = {
      schemaVersion: 2 as const,
      id: `ms-${built.date}-${brand.id}-${locale}-${channel}`,
      sourceVentureId: "marketingshark",
      releaseId: built.id,
      campaignId: built.id,
      // The B hook is recorded on the package rather than as a second queue item: SPLIT is
      // retired and nothing measures, so a second item would imply a test that does not exist.
      experimentId: null,
      target: {
        profileId: target.profileId,
        profileRole: "venture-primary" as const,
        role: "primary" as const,
        connectionBindingRef: target.connectionBindingRef,
        capabilityRef: input.capabilityRef,
        amplifierEligibilityRef: null,
        campaignApprovalRef: null
      },
      action: "publish-original" as const,
      sourcePackage: {
        schemaVersion: "approved-publish-package/1" as const,
        artifactRef: `state/${packagePath(built.date, brand.id)}`,
        packageHash
      },
      locale,
      variant: "A" as const,
      channel,
      objective: "value_action" as const,
      audience: subject.audience,
      destination: brand.productUrl,
      utm: {
        source: channel,
        medium: "organic_social" as const,
        campaign: `marketingshark-${brand.id}`,
        content: subject.utmContent
      },
      content: {
        text: captionFor(built, channel),
        // The five slides' alt text, joined the way the alt-total gate measured it.
        altText: english.slides.map((slide) => slide.alt).join(" "),
        assetPaths: assetPathsFor(built, channel),
        factualClaimRefs: [subject.claimRef],
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
        selectionRef: `state/meetings/${built.date}-ms-daily.json`,
        // The record that governs the edge: state/decisions/2026-09-26-devshark-social-queue.md.
        policyRef: input.capabilityRef.decisionReference
      },
      selectedBy: "MAKO" as const,
      createdAt,
      attempt: null,
      receiptId: null,
      migration: null
    };
    const item = CapabilityAwareQueueItemSchema.parse({
      ...base,
      content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) }
    });
    return { relative: queueItemPath(built.date, brand.id, locale, channel), item };
  });
}
