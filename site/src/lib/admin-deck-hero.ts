import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { toRenderablePng } from "@boardlessai/carousel-studio";

/**
 * An article's hero, as PNG bytes a slide can embed.
 *
 * Heroes are stored as WebP, and librsvg draws nothing at all for a WebP data URI — no error and
 * no image, just background. So the transcode is not an optimisation, it is the difference
 * between a photograph and an empty rectangle.
 */

const repositoryRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");

async function heroBase64(venture: "caught-up" | "mma-files", slug: string): Promise<string | null> {
  const directory = venture === "mma-files"
    ? path.join(repositoryRoot, "state/ventures/mma-files/articles")
    : path.join(repositoryRoot, "state/edition/outbox");
  try {
    for (const name of await readdir(directory)) {
      if (!name.endsWith(".json")) continue;
      const raw = JSON.parse(await readFile(path.join(directory, name), "utf8")) as {
        slug?: string;
        image?: { hero_bytes_base64?: string };
        article?: { cs?: { frontmatter?: { slug?: string } } };
      };
      const candidate = raw.slug ?? raw.article?.cs?.frontmatter?.slug;
      if (candidate === slug && raw.image?.hero_bytes_base64) return raw.image.hero_bytes_base64;
    }
  } catch {
    return null;
  }
  return null;
}

export async function readArticleHeroPng(
  venture: "caught-up" | "mma-files",
  slug: string
): Promise<Buffer | null> {
  const base64 = await heroBase64(venture, slug);
  if (!base64) return null;
  // A hero that will not decode is a slide without a photograph, not a failed page.
  return toRenderablePng(Buffer.from(base64, "base64"));
}
