import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { configRoot, repoRoot, stateRoot } from "../paths.js";
import { storeEditionPromotion } from "./edition-promotion.js";

/**
 * Compose — and optionally draw — one edition's promotion deck, without publishing anything.
 *
 * The daily cycle writes the record and stops there, because frames no channel can consume are
 * megabytes of committed inventory. This is how a person gets the pictures: point it at an edition
 * package, add `--render`, and the five 4:5 frames land under
 * `state/ventures/carousel-studio/decks/caught-up/<date>-<slug>-promotion/`.
 *
 * It writes no queue item and touches no channel, so none of the posting gates are involved —
 * there is nothing here for them to stop.
 */

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

/** The newest edition package on disk, so the usual invocation needs no path. */
async function newestPackage(): Promise<string> {
  const directories = [path.join(stateRoot, "edition", "outbox"), path.join(stateRoot, "edition", "archive")];
  const candidates: string[] = [];
  for (const directory of directories) {
    const names = await readdir(directory).catch(() => [] as string[]);
    candidates.push(...names.filter((name) => name.endsWith(".json")).map((name) => path.join(directory, name)));
  }
  const newest = candidates.sort((left, right) => path.basename(left).localeCompare(path.basename(right))).at(-1);
  if (!newest) throw new Error("No edition package was found; pass --package <path>");
  return newest;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const file = valueAfter(args, "--package");
  const resolved = file
    ? (path.isAbsolute(file) ? file : path.resolve(repoRoot, file))
    : await newestPackage();
  const editionPackage = EditionPackageSchema.parse(JSON.parse(await readFile(resolved, "utf8")));
  if (editionPackage.status !== "edition") {
    console.log(JSON.stringify({ package: resolved, composed: false, reason: "no_edition" }, null, 2));
    return;
  }
  // The same URL the social pack points at: Czech serves at the root and /cs redirects there, and
  // a recorded destination outlives the run that wrote it.
  const baseUrl = valueAfter(args, "--site") ?? process.env.CAUGHT_UP_SITE_URL;
  if (!baseUrl) throw new Error("CAUGHT_UP_SITE_URL is not set; pass --site <https://…>");
  const editionUrl = new URL(`/articles/${editionPackage.article.cs.frontmatter.slug}`, baseUrl).toString();

  const stored = await storeEditionPromotion({
    stateRoot,
    configRoot,
    editionPackage,
    editionUrl,
    render: args.includes("--render")
  });
  if (!stored) {
    console.log(JSON.stringify({ package: resolved, composed: false, reason: "nothing to compose" }, null, 2));
    return;
  }
  console.log(JSON.stringify({
    package: resolved,
    record: stored.path,
    status: stored.record.status,
    reason: stored.record.reason,
    channel: stored.record.channel,
    cta: stored.record.cta,
    slides: stored.record.slides.length,
    render: stored.record.render,
    published: false
  }, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invoked) main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
