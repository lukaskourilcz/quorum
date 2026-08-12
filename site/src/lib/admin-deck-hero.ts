import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { toRenderablePng, type CarouselSummaryVenture } from "@boardlessai/carousel-studio";

/**
 * An article's hero, as PNG bytes a slide can embed.
 *
 * Heroes are stored as WebP, and librsvg draws nothing at all for a WebP data URI — no error and
 * no image, just background. So the transcode is not an optimisation, it is the difference
 * between a photograph and an empty rectangle.
 */

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

/*
 * An article is a slug *and* a date.
 *
 * Three MMA redeliveries of one event share the slug `ufc-event-ufc-fight-night-gamrot-vs-
 * salkilld`, and taking the first directory hit handed all three the same photograph — the
 * loader answered a question ("which article?") that the slug alone cannot answer. The date is
 * the rest of the identity, so it is matched too.
 */
async function heroBase64(venture: CarouselSummaryVenture, slug: string, date: string): Promise<string | null> {
  // BOOKSOFHISTORY is typographic by founding decision; even an admin seed coverRef is ignored.
  // Door Money records carry no manuscript or private source material into the public repo, and
  // its approval path currently writes text-only summaries. A missing hero is the honest result.
  if (venture === "booksofhistory" || venture === "door-money") return null;
  const directory = venture === "mma-files"
    ? path.join(repositoryRoot, "state/ventures/mma-files/articles")
    : path.join(repositoryRoot, "state/edition/outbox");
  try {
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".json")) continue;
      const raw = JSON.parse(await readFile(path.join(directory, name), "utf8")) as {
        slug?: string;
        publishAt?: string;
        date?: string;
        image?: { hero_bytes_base64?: string };
        article?: { cs?: { frontmatter?: { slug?: string } } };
      };
      const candidate = raw.slug ?? raw.article?.cs?.frontmatter?.slug;
      const candidateDate = (raw.publishAt ?? raw.date ?? "").slice(0, 10);
      if (candidate === slug && candidateDate === date && raw.image?.hero_bytes_base64) {
        return raw.image.hero_bytes_base64;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function readArticleHeroPng(
  venture: CarouselSummaryVenture,
  slug: string,
  date: string
): Promise<Buffer | null> {
  const base64 = await heroBase64(venture, slug, date);
  if (!base64) return null;
  // A hero that will not decode is a slide without a photograph, not a failed page.
  return toRenderablePng(Buffer.from(base64, "base64"));
}
