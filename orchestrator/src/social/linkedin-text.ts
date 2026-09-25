import type { RuntimeQueueItem } from "./queue.js";

/**
 * How long a LinkedIn caption may be once the link Buffer adds is counted (quorum#571 review).
 *
 * LinkedIn takes 3,000 characters, and Buffer counts UTF-16 units, which is what `length` counts. A
 * single-image post through Buffer is the caption, a blank line and the item's tracked link, unless
 * the caption already carries the destination. A caption bounded by 3,000 alone therefore passed
 * the room's gate and the Queue's editor and was then refused at send time. Every place that bounds
 * a LinkedIn caption budgets for the link through these helpers; the site mirrors them by hand in
 * `site/src/lib/admin-queue/linkedin.ts`, and both sides pin the same fixture's link.
 */
export const LINKEDIN_TEXT_LIMIT = 3_000;

/** The longest `utm_content` a queue v2 item carries: the schema's own cap. */
export const LINKEDIN_UTM_CONTENT_MAX = 200;

/**
 * What the marketingShark room keeps free for the link, whatever the day's `utm_content`: its
 * LinkedIn cap is `LINKEDIN_TEXT_LIMIT` minus this. `marketingshark-gates.test.ts` proves every
 * LinkedIn brand's longest tracked link, with its blank line, fits inside it.
 */
export const LINKEDIN_LINK_RESERVE = 400;

type Linked = Pick<RuntimeQueueItem, "destination" | "utm">;

/** The item's own destination with its own UTM fields, so attribution reads LinkedIn traffic. */
export function linkedinTrackedLink(item: Linked): string {
  const url = new URL(item.destination);
  url.searchParams.set("utm_source", item.utm.source);
  url.searchParams.set("utm_medium", item.utm.medium);
  url.searchParams.set("utm_campaign", item.utm.campaign);
  url.searchParams.set("utm_content", item.utm.content);
  return url.toString();
}

/**
 * Whether the caption already names the destination. A full link to it counts; a bare
 * "devshark.app" in a signature does not, because it carries no UTM fields and attribution would
 * lose the post.
 */
export function linkedinCaptionCarriesLink(text: string, destination: string): boolean {
  const url = new URL(destination);
  return text.includes(`${url.origin}${url.pathname}`.replace(/\/$/u, ""));
}

/** The longest caption without the link that still fits LinkedIn once the link is appended. */
export function linkedinCaptionLimit(item: Linked): number {
  return LINKEDIN_TEXT_LIMIT - `\n\n${linkedinTrackedLink(item)}`.length;
}
