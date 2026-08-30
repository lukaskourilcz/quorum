import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Which package a magazine room most recently delivered, resolved once.
 *
 * The Facilities card and the route that serves its picture used to answer this question
 * separately: the card asked "the newest edition whose receipt says an edition was delivered",
 * the route asked "the newest file in the archive directory". On any day the desk publishes
 * nothing those two disagree, because a no-edition day still writes a delivered receipt and still
 * archives a package — one carrying no article and no image. The card then showed the previous
 * day's headline over a picture the route answered with a 404, which is a broken image on the
 * public page. One resolver, used by both, is the fix; the disagreement cannot come back.
 */

export type MagazineVenture = "caught-up" | "mma-files";

export interface LatestMagazinePackage {
  /** The delivery date, which is also how the edition archive names the package. */
  date: string;
  /** The package exactly as it was sent. */
  delivered: Record<string, unknown>;
  /** Where the magazine serves it, when the receipt wrote an address down. */
  articleUrl: string | null;
}

/** A delivery receipt, before the package it names has been looked for. */
export interface DeliveredEdition {
  date: string;
  receipt: Record<string, unknown>;
}

/** A thumbnail this site can serve: the stored bytes, and the media type they are. */
export interface PackageThumbnail {
  bytes: string;
  mediaType: string;
}

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  svg: "image/svg+xml; charset=utf-8",
  webp: "image/webp"
};

function stateRoot(): string {
  return path.join(process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), ".."), "state");
}

async function readJson(...segments: string[]): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(path.join(stateRoot(), ...segments), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function jsonFilesNewestFirst(...segments: string[]): Promise<string[]> {
  try {
    return (await readdir(path.join(stateRoot(), ...segments)))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * The picture a delivered package carries, or `null` when it carries none.
 *
 * Both halves of the claim live here: the bytes have to be there and the recorded path has to name
 * a format this site serves. Splitting those two checks across the card and the route is what let
 * the card claim a picture the route would not produce.
 */
export function packageThumbnail(delivered: Record<string, unknown>): PackageThumbnail | null {
  const image = delivered.image as { thumb_bytes_base64?: unknown; thumb_path?: unknown } | undefined;
  const bytes = image?.thumb_bytes_base64;
  const extension = typeof image?.thumb_path === "string"
    ? /\.(png|svg|webp)$/u.exec(image.thumb_path)?.[1]
    : undefined;
  if (typeof bytes !== "string" || bytes.length === 0 || !extension) return null;
  return { bytes, mediaType: MEDIA_TYPES[extension]! };
}

/**
 * The newest date whose edition receipt says an edition was actually published.
 *
 * A day with nothing worth publishing is recorded as delivered with `editionStatus: "no_edition"`,
 * and it archives a package holding neither an article nor an image. Skipping it here is what
 * makes every surface show the newest thing the desk produced rather than the newest thing it
 * wrote down.
 */
export async function newestDeliveredEdition(): Promise<DeliveredEdition | null> {
  for (const name of await jsonFilesNewestFirst("edition", "deliveries")) {
    const receipt = await readJson("edition", "deliveries", name);
    if (!receipt || receipt.status !== "delivered") continue;
    if (receipt.editionStatus === "no_edition") continue;
    return { date: name.slice(0, -5), receipt };
  }
  return null;
}

/** The package behind that receipt, when this repository still holds it. */
async function newestEdition(): Promise<LatestMagazinePackage | null> {
  const newest = await newestDeliveredEdition();
  if (!newest) return null;
  const hash = typeof newest.receipt.packageHash === "string" ? newest.receipt.packageHash : null;
  // Editions delivered before the archive existed were deleted on delivery. The receipt is all
  // there is for those, and a receipt has no picture and no headline, so the room shows nothing.
  const delivered = hash ? await readJson("edition", "archive", `${newest.date}-${hash}.json`) : null;
  if (!delivered) return null;
  return {
    date: newest.date,
    delivered,
    articleUrl: typeof newest.receipt.articleUrl === "string" ? newest.receipt.articleUrl : null
  };
}

/** The newest MMA Files article package, joined to the receipt that delivered it. */
async function newestArticle(): Promise<LatestMagazinePackage | null> {
  const file = (await jsonFilesNewestFirst("ventures", "mma-files", "articles"))[0];
  if (!file) return null;
  const delivered = await readJson("ventures", "mma-files", "articles", file);
  if (!delivered) return null;
  const hash = typeof delivered.packageHash === "string" ? delivered.packageHash : null;
  const receipt = hash
    ? await readJson("ventures", "mma-files", "deliveries", "articles", `${hash}.json`)
    : null;
  return {
    date: typeof delivered.publishAt === "string" ? delivered.publishAt.slice(0, 10) : file.slice(0, 10),
    delivered,
    articleUrl: typeof receipt?.articleUrl === "string" ? receipt.articleUrl : null
  };
}

export async function latestMagazinePackage(
  venture: MagazineVenture
): Promise<LatestMagazinePackage | null> {
  return venture === "caught-up" ? newestEdition() : newestArticle();
}
