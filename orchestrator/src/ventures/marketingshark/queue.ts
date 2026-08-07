import { QueueItemSchema, queuePayloadHash, type QueueItem } from "../../social/queue.js";
import type { Brand } from "./config.js";
import type { MarketingSharkPackage } from "./package.js";

export function queueItemPath(date: string, brandId: string, locale: "cs" | "en", channel: "instagram" | "threads"): string {
  return `social/queue/${date}-${brandId}-${locale}-${channel}.json`;
}

/**
 * One draft queue item per language per channel, and nothing that could publish.
 *
 * Two things keep these off the wire, and it is worth being exact about which:
 *
 *  - marketingShark is not a publishing venture. The runner only considers items whose venture
 *    owns an activation record, and this one has none, so its items are never even examined.
 *  - Every approval check is `pending`, and `assertQueueItemPublishable` refuses an item with any
 *    check unpassed. That holds even if the venture were somehow activated.
 *
 * `status: "draft"` is NOT one of them, and an earlier version of this comment claimed it was.
 * The runner treats a draft as due work and promotes it to `queued` itself -- that is how every
 * publishing venture's items reach the wire. Draft is a statement about review, not a lock.
 *
 * `SOCIAL_KILL_SWITCH` sits above all of it as the global stop, but it is not specific to this
 * venture and is not what makes these items safe.
 *
 * `assetPaths` is deliberately empty. The rendered SVGs live in state beside the package, not
 * under `site/public/social`, so an Instagram item could not become publishable without a person
 * placing hosted assets first. That is the correct shape for a venture with no credentials, no
 * channel and no publishing path.
 */
export function buildQueueItems(input: {
  built: MarketingSharkPackage;
  brand: Brand;
  now: Date;
}): Array<{ relative: string; item: QueueItem }> {
  const { built, brand } = input;
  const createdAt = input.now.toISOString();
  const notBefore = new Date(`${built.date}T06:00:00.000Z`).toISOString();
  const notAfter = new Date(`${built.date}T21:00:00.000Z`).toISOString();

  return (["cs", "en"] as const).flatMap((locale) =>
    (["instagram", "threads"] as const).map((channel) => {
      const text = channel === "instagram"
        ? `${built.descriptions.instagram[locale]}\n\n${built.hashtags.instagram[locale].join(" ")}`
        : built.descriptions.threads[locale];
      const draft = {
        schemaVersion: 1 as const,
        id: `ms-${built.date}-${brand.id}-${locale}-${channel}`,
        venture: "marketingshark" as const,
        locale,
        variant: "A" as const,
        campaignId: `marketingshark-${built.date}-${brand.id}`,
        // The B hook is recorded on the package rather than as a second queue item: SPLIT is
        // retired and nothing measures, so a second item would imply a test that does not exist.
        experimentId: null,
        channel,
        objective: "value_action" as const,
        audience: brand.tone === "dev" ? "Working developers who want one real question a day" : "People who enjoy geography",
        destination: brand.productUrl,
        utm: {
          source: channel,
          medium: "organic_social" as const,
          campaign: `marketingshark-${brand.id}`,
          content: `${built.date}-${locale}-${built.question.id}`
        },
        content: {
          text,
          altText: built.carousels[locale].slides.map((slide) => slide.alt).join(" "),
          assetPaths: [],
          factualClaimRefs: [`marketingshark:question:${built.question.id}`],
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
          budget: "pending" as const
        },
        selectedBy: "MAKO" as const,
        createdAt,
        attempt: null,
        receiptId: null
      };
      const item = QueueItemSchema.parse({
        ...draft,
        content: { ...draft.content, contentHash: queuePayloadHash(draft) }
      });
      return { relative: queueItemPath(built.date, brand.id, locale, channel), item };
    })
  );
}
