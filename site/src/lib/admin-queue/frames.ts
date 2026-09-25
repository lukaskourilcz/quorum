import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CAROUSEL_BRANDS, liveTemplateByReference, renderCarouselSlidePng } from "@boardlessai/carousel-studio";
import { readSocialPackVisual } from "@/lib/social-pack-visual";
import { queueRepositoryRoot, readQueueEntries } from "./state";

/**
 * One frame of one queue item, for the Queue's strip.
 *
 * The item's own asset path is the only address: a committed frame under `site/public/social/` is
 * served as it is, because those are the bytes a platform will fetch. A legacy DNESKAi item whose
 * frames were never written falls back to re-rendering the slide from its social pack. Nothing
 * else is rendered on demand; a frame that exists in neither place is a named absence.
 */
export interface QueueFrame {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: "image/png" | "image/jpeg";
}

const ASSET = /^\/social\/[a-zA-Z0-9/_-]+\.(png|jpe?g)$/u;
const LEGACY_FRAME = /^\/social\/(\d{4}-\d{2}-\d{2})\/(en|cs)\/(instagram|threads)\/frame-\d{2}\.png$/u;

async function committedFrame(root: string, asset: string): Promise<QueueFrame | null> {
  const match = ASSET.exec(asset);
  if (!match || asset.includes("..")) return null;
  const publicRoot = path.join(root, "site", "public");
  const file = path.join(publicRoot, asset);
  if (path.relative(publicRoot, file).startsWith("..")) return null;
  try {
    return { bytes: new Uint8Array(await readFile(file)), contentType: match[1] === "png" ? "image/png" : "image/jpeg" };
  } catch {
    return null;
  }
}

async function legacyPackFrame(root: string, asset: string, index: number): Promise<QueueFrame | null> {
  const match = LEGACY_FRAME.exec(asset);
  if (!match) return null;
  const [, date, locale, channel] = match;
  const visual = await readSocialPackVisual(root, { date: date!, locale: locale!, channel: channel! }).catch(() => null);
  if (!visual) return null;
  const render = await renderCarouselSlidePng({
    template: liveTemplateByReference(visual.templateId, visual.version),
    payload: { locale: visual.locale, strings: visual.strings },
    brand: CAROUSEL_BRANDS["caught-up"],
    format: channel === "instagram" ? "instagram-portrait" : "threads",
    index
  });
  return render ? { bytes: new Uint8Array(render.png), contentType: "image/png" } : null;
}

export async function readQueueFrame(itemId: string, slide: number, root = queueRepositoryRoot()): Promise<QueueFrame | null> {
  const { entries } = await readQueueEntries(root);
  const entry = entries.find(({ item }) => item.id === itemId);
  const asset = entry?.item.content.assetPaths[slide - 1];
  if (!entry || !asset) return null;
  const committed = await committedFrame(root, asset);
  if (committed) return committed;
  const legacyVenture = entry.item.schemaVersion === 1 ? entry.item.venture : entry.item.sourceVentureId;
  return legacyVenture === "caught-up" ? legacyPackFrame(root, asset, slide - 1) : null;
}
