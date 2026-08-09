import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * What shipped on each of the last three days.
 *
 * A read-time window over records that already exist — no new store, no cleanup job. "Keep only
 * the last three days" is therefore a filter rather than a retention policy: nothing is written,
 * so nothing accumulates, and every older receipt stays exactly where it is as canonical state.
 *
 * The share preview is built from the recorded package and never from the published page. Fetching
 * the live URL would show what the site says now rather than what was delivered, and would put a
 * network call on an admin page render. When the package recorded no bytes this system holds, the
 * card says so instead of showing an image it cannot prove.
 */
export interface RenderedArticle {
  ventureId: string;
  ventureName: string;
  title: string;
  description: string | null;
  url: string | null;
  /** An authed admin media path this system can actually serve, or null. */
  imageHref: string | null;
  imageAlt: string | null;
  /** Why there is no image, when there is none. */
  imageNote: string | null;
}

export interface RenderedDay {
  date: string;
  articles: RenderedArticle[];
  datasets: Array<{ ventureId: string; dataset: string; added: number }>;
  streams: Array<{ stream: string; added: number }>;
  designs: Array<{ ventureId: string; note: string }>;
  /** True when the day produced nothing at all. Said out loud, never left blank. */
  empty: boolean;
}

export interface RenderedDesk {
  days: RenderedDay[];
  unreadable: number;
}

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

const VENTURE_NAME: Readonly<Record<string, string>> = {
  "caught-up": "DNESKAi",
  "mma-files": "MMA Files"
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value.trim()
    : null;
}

/** Today and the two days before it, newest first. */
export function deskWindow(today: string): string[] {
  return [0, 1, 2].map((back) => {
    const day = new Date(`${today}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() - back);
    return day.toISOString().slice(0, 10);
  });
}

export async function readRenderedDesk(
  today = new Date().toISOString().slice(0, 10),
  root = repositoryRoot
): Promise<RenderedDesk> {
  const stateRoot = path.join(root, "state");
  let unreadable = 0;

  const json = async (file: string): Promise<unknown> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as unknown;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") unreadable += 1;
      return null;
    }
  };

  const names = async (directory: string): Promise<string[]> => {
    try {
      return (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
    } catch {
      return [];
    }
  };

  const days = await Promise.all(deskWindow(today).map(async (date): Promise<RenderedDay> => {
    const articles: RenderedArticle[] = [];

    // DNESKAi: the archived package holds the prose, the delivery holds the published URL.
    const delivery = record(await json(path.join(stateRoot, "edition", "deliveries", `${date}.json`)));
    if (delivery && delivery.editionStatus !== "no_edition") {
      for (const name of await names(path.join(stateRoot, "edition", "archive"))) {
        if (!name.startsWith(date)) continue;
        const pkg = record(await json(path.join(stateRoot, "edition", "archive", name)));
        const frontmatter = record(record(record(pkg?.article)?.cs)?.frontmatter);
        const title = text(frontmatter?.title, 300);
        if (!title) continue;
        const image = record(pkg?.image);
        articles.push({
          ventureId: "caught-up",
          ventureName: VENTURE_NAME["caught-up"]!,
          title,
          description: text(frontmatter?.dek, 400),
          url: text(delivery.articleUrl, 2_000),
          // The edition's picture is delivered into the magazine's repository, not kept here, so
          // this system has the record of it but not the bytes.
          imageHref: null,
          imageAlt: text(image?.alt_cs, 400),
          imageNote: image
            ? "The picture was delivered with the article and lives in the magazine, not here."
            : "No picture was recorded for this article."
        });
      }
    }

    // MMA Files: the bytes are in state, so the authed media route can serve the real thumbnail.
    for (const name of await names(path.join(stateRoot, "ventures", "mma-files", "articles"))) {
      if (!name.startsWith(date)) continue;
      const pkg = record(await json(path.join(stateRoot, "ventures", "mma-files", "articles", name)));
      if (!pkg || pkg.status !== "published") continue;
      const localizations = record(pkg.localizations);
      const first = localizations ? record(Object.values(localizations)[0]) : null;
      const title = text(first?.title, 300) ?? text(pkg.slug, 300);
      if (!title) continue;
      const image = record(pkg.image);
      const thumb = text(image?.thumb_path, 400) ?? text(image?.hero_path, 400);
      // Only a path this system holds and the media route will serve. Anything else is a claim.
      const held = thumb && /^ventures\/mma-files\/media\/[A-Za-z0-9/-]+\.(png|svg|webp)$/u.test(thumb)
        ? thumb
        : null;
      articles.push({
        ventureId: "mma-files",
        ventureName: VENTURE_NAME["mma-files"]!,
        title,
        description: text(first?.dek, 400) ?? text(first?.description, 400),
        url: text(pkg.publishedUrl, 2_000),
        imageHref: held ? `/admin/api/mma-files/media?path=${encodeURIComponent(held)}` : null,
        imageAlt: text(image?.alt, 400) ?? text(image?.alt_en, 400),
        imageNote: held ? null : "No picture is stored here for this article."
      });
    }

    const datasets: RenderedDay["datasets"] = [];
    for (const ventureId of ["caught-up", "mma-files"]) {
      const directory = path.join(stateRoot, "ventures", ventureId, "datasets");
      for (const name of await names(directory)) {
        if (!name.startsWith(date)) continue;
        const receipt = record(await json(path.join(directory, name)));
        const dataset = text(receipt?.dataset, 80);
        if (!dataset) continue;
        datasets.push({
          ventureId,
          dataset,
          added: Array.isArray(receipt?.appendedIds) ? receipt.appendedIds.length : 0
        });
      }
    }

    const streams: RenderedDay["streams"] = [];
    for (const name of await names(path.join(stateRoot, "ventures", "caught-up", "streams"))) {
      if (!name.startsWith(date)) continue;
      const receipt = record(await json(path.join(stateRoot, "ventures", "caught-up", "streams", name)));
      const stream = text(receipt?.stream, 80);
      if (!stream) continue;
      streams.push({ stream, added: Array.isArray(receipt?.added) ? receipt.added.length : 0 });
    }

    const designs: RenderedDay["designs"] = [];
    const proposals = record(await json(
      path.join(stateRoot, "ventures", "titty-tuesdays", "design-proposals", `${date}.json`)
    ));
    if (proposals && Array.isArray(proposals.variants)) {
      designs.push({
        ventureId: "titty-tuesdays",
        note: `${proposals.variants.length} image${proposals.variants.length === 1 ? "" : "s"} proposed`
      });
    }

    return {
      date,
      articles,
      datasets,
      streams,
      designs,
      empty: articles.length + datasets.length + streams.length + designs.length === 0
    };
  }));

  return { days, unreadable };
}
