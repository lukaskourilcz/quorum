import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CAROUSEL_BRANDS,
  articleDeckTemplate,
  articleSlideSlot,
  renderCarouselPng
} from "@boardlessai/carousel-studio";
import { ArticlePackageSchema } from "../contracts/mma-files.js";
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { repoRoot, stateRoot } from "../paths.js";
import { buildArticleDeck, reviewDeck, wordCount, type Slide } from "./slides.js";

/**
 * Render one article's carousel to look at, without publishing anything.
 *
 * This exists because "can today's article become a Threads post" is a question best answered
 * by looking at the post. It reads a package that already shipped, builds the deck, renders it,
 * and writes the PNGs somewhere outside the delivery path. It writes no queue item and touches
 * no channel, so none of the posting gates are involved — there is nothing here for them to
 * stop.
 */

const OUTRO = {
  "mma-files": "Celý ozdrojovaný text najdete v MMA Files.",
  "caught-up": "Jedno vydání a máte přehled."
} as const;

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

async function deckFromPackage(file: string): Promise<{ venture: "caught-up" | "mma-files"; slug: string; slides: Slide[] }> {
  const raw = JSON.parse(await readFile(file, "utf8")) as { schemaVersion?: unknown };
  if (String(raw.schemaVersion ?? "").startsWith("edition")) {
    const pkg = EditionPackageSchema.parse(raw);
    if (pkg.status !== "edition") throw new Error("That package carries no edition to build a deck from");
    const article = pkg.article.cs.frontmatter;
    return {
      venture: "caught-up",
      slug: article.slug,
      slides: buildArticleDeck({
        title: article.title,
        dek: article.dek,
        // The editor's own structure, in the order the editor put it: what changed, why it
        // matters, what is still open. Better slides than anything cut out of the body, and
        // an 1,100-word body would give thirty-seven of them anyway.
        points: [
          ...article.what_changed.slice(0, 3),
          ...article.why_it_matters.slice(0, 3),
          ...article.uncertainty.slice(0, 1)
        ],
        outro: OUTRO["caught-up"]
      })
    };
  }
  const pkg = ArticlePackageSchema.parse(raw);
  const cs = pkg.localizations.cs;
  return {
    venture: "mma-files",
    slug: pkg.slug,
    slides: buildArticleDeck({ title: cs.title, dek: cs.dek, bodyMdx: cs.bodyMDX, outro: OUTRO["mma-files"] })
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const file = valueAfter(args, "--package");
  if (!file) throw new Error("--package <path to an article or edition package> is required");
  const format = (valueAfter(args, "--format") ?? "instagram-portrait") as "instagram-portrait" | "instagram-square" | "threads";
  const outputRoot = valueAfter(args, "--out") ?? path.join(stateRoot, "social", "previews");

  // Resolved against the repository, so a path copied from the tree works from anywhere.
  const { venture, slug, slides } = await deckFromPackage(
    path.isAbsolute(file) ? file : path.resolve(repoRoot, file)
  );
  const review = reviewDeck(slides);
  const template = articleDeckTemplate(slides.length);
  const strings = Object.fromEntries(slides.map((slide, index) => [articleSlideSlot(index), slide.text]));
  const rendered = await renderCarouselPng({
    template,
    payload: { locale: "cs", strings },
    brand: CAROUSEL_BRANDS[venture],
    format
  });
  // A slide the renderer had to clip is a slide the reader sees cut off mid-sentence. It is
  // reported rather than left to be noticed in the image.
  const clipped = rendered.flatMap((slide) => slide.truncatedSlots);

  const directory = path.join(outputRoot, `${venture}-${slug}-${format}`);
  await mkdir(directory, { recursive: true });
  await Promise.all(rendered.map((slide) =>
    writeFile(path.join(directory, `slide-${String(slide.index + 1).padStart(2, "0")}.png`), slide.png)
  ));

  console.log(JSON.stringify({
    venture,
    slug,
    format,
    slides: slides.length,
    longestSlideWords: Math.max(...slides.map((slide) => wordCount(slide.text))),
    publishable: review.publishable && clipped.length === 0,
    problems: [...review.problems, ...clipped.map((slot) => `${slot} did not fit and was clipped.`)],
    directory,
    published: false
  }, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
