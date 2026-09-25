import type { QueueItem, QueueItemV2 } from "./item";
import { QUEUE_CAPTION_LIMITS } from "./types";

/**
 * The caption limit an edit is held to, with the link LinkedIn posts carry counted (quorum#571
 * review).
 *
 * A single-image LinkedIn post through Buffer is the caption, a blank line and the item's tracked
 * link. An edit bounded by LinkedIn's 3,000 alone was accepted here and then held at send time.
 * This mirrors `orchestrator/src/social/linkedin-text.ts` by hand, because the site does not depend
 * on the orchestrator; both sides pin the tracked link of the committed LinkedIn queue fixture.
 */
export const LINKEDIN_TEXT_LIMIT = 3_000;

export function linkedinTrackedLink(item: Pick<QueueItemV2, "destination" | "utm">): string {
  const url = new URL(item.destination);
  url.searchParams.set("utm_source", item.utm.source);
  url.searchParams.set("utm_medium", item.utm.medium);
  url.searchParams.set("utm_campaign", item.utm.campaign);
  url.searchParams.set("utm_content", item.utm.content);
  return url.toString();
}

/** The longest caption the owner may save for this item. */
export function queueCaptionLimit(item: QueueItem): number {
  if (item.schemaVersion !== 2 || item.channel !== "linkedin") return QUEUE_CAPTION_LIMITS[item.channel];
  return Math.min(QUEUE_CAPTION_LIMITS.linkedin, LINKEDIN_TEXT_LIMIT - `\n\n${linkedinTrackedLink(item)}`.length);
}
