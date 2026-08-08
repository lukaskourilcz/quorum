import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ArticlePackageSchema, type ArticlePackage } from "../contracts/mma-files.js";
import { heroAltCs } from "../images/alt.js";
import { ILLUSTRATIVE_SPORT_PHOTOGRAPHS, illustrativeRotation, illustrativeSportPhoto } from "../images/illustrative.js";
import { materializeLicensedPhoto } from "../images/licensed.js";
import { stateRoot } from "../paths.js";
import { checkImageCorrection } from "./correction.js";
import { articlePackageHash } from "./hash.js";
import { loadArticlePackages, storeArticlePackage } from "./store.js";

/**
 * Replace the photograph above an already-published article, and nothing else about it.
 *
 * Two articles shipped in the first week under pictures of the wrong thing: an Argentinian
 * government official above an OKTAGON bantamweight, and a firearms range above a fighter's
 * retirement trilogy. Both were found by the text-matching search this programme replaced, and
 * both are still the live assets on the magazine. A published package is immutable by date and
 * slot on both sides of the delivery, so there was no way to fix either without weakening that
 * guard or editing the consumer repository by hand.
 *
 * This is neither. It produces a package carrying an `article-image-correction/1` block naming
 * the hash it replaces; the store and the consumer each check, independently and from canonical
 * bytes, that nothing but the picture differs. The article's words go out exactly as they were
 * read.
 *
 * What it may attach is bounded to the curated set — `--file` must name an entry in
 * `ILLUSTRATIVE_SPORT_PHOTOGRAPHS`, and there is no branch here that can reach a search. Those
 * files are the hand-reviewed rung: each was opened at 640px, by a person, before it was written
 * down, and the operator running this names the one they looked at. Licence, author and
 * dimensions are still read live from Commons at fetch time, as everywhere else, because a
 * licence recorded in code is a licence that has stopped being checked.
 *
 *   pnpm -C orchestrator recall:image -- --slug <slug> --plan
 *   pnpm -C orchestrator recall:image -- --slug <slug> --file "<Commons file.jpg>" --reason "..."
 */

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

function required(args: string[], name: string): string {
  const value = valueAfter(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function articleFor(slug: string): Promise<ArticlePackage> {
  const article = (await loadArticlePackages(stateRoot)).find((entry) => entry.slug === slug);
  if (!article) throw new Error(`No stored article has the slug ${slug}`);
  if (article.status !== "published") throw new Error(`${slug} is ${article.status}, so there is nothing to correct`);
  return article;
}

/** The rotation this article's refs produce, so the operator knows which files to look at. */
function plan(article: ArticlePackage): string[] {
  return illustrativeRotation(article.fighterRefs.join("|")).map((photo) => photo.file);
}

async function main(): Promise<void> {
  const raw = process.argv.slice(2);
  const args = raw[0] === "--" ? raw.slice(1) : raw;
  const slug = required(args, "--slug");
  const article = await articleFor(slug);

  if (args.includes("--plan")) {
    console.log(JSON.stringify({
      slug,
      packageHash: article.packageHash,
      currentImage: {
        origin: article.image.origin,
        license: article.image.license.name,
        author: article.image.license.author,
        sourceUrl: article.image.license.source_url,
        altCs: article.image.alt_cs
      },
      rotation: plan(article)
    }, null, 2));
    return;
  }

  const file = required(args, "--file");
  const scene = ILLUSTRATIVE_SPORT_PHOTOGRAPHS.find((photo) => photo.file === file);
  if (!scene) throw new Error(`${file} is not in the curated set, so it cannot be attached here`);
  const reason = required(args, "--reason");

  // Resolved through the curated rung's own code, so the licence, author, dimensions and the
  // no-name alt text all come from where they always come from.
  const candidate = await illustrativeSportPhoto({
    seed: article.fighterRefs.join("|"),
    accept: async (resolved) => resolved.title === file
  });
  if (!candidate) throw new Error(`${file} could not be resolved on Commons`);

  const image = await materializeLicensedPhoto({
    candidate,
    venture: "mma-files",
    slug: article.slug,
    // The illustrative constructor's own text, which cannot take a name. The writer's line is
    // unreachable for such a candidate, and that is the guarantee the recall exists to restore.
    altCs: heroAltCs(candidate, undefined, `Ilustrační fotografie k článku ${article.localizations.cs.title}`)
  });

  const { packageHash: _previous, ...content } = article;
  const corrected = {
    ...content,
    image,
    correction: {
      schemaVersion: "article-image-correction/1" as const,
      supersedesPackageHash: article.packageHash,
      reason,
      correctedAt: new Date().toISOString()
    }
  };
  const replacement = ArticlePackageSchema.parse({
    ...corrected,
    packageHash: articlePackageHash(corrected)
  });
  const check = checkImageCorrection({ current: article, replacement });
  if (!check.ok) throw new Error(`Refusing to store: ${check.problems.join(", ")}`);

  const stored = await storeArticlePackage(stateRoot, replacement);
  const outFile = valueAfter(args, "--write-package");
  if (outFile) await writeFile(path.resolve(outFile), `${JSON.stringify(replacement, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    slug,
    supersedes: article.packageHash,
    packageHash: replacement.packageHash,
    file,
    license: image.license.name,
    author: image.license.author,
    altCs: image.alt_cs,
    storedAt: stored.path
  }, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

export { articleFor, plan };
