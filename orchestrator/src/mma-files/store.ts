import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { ArticlePackageSchema, SocialVariantPackSchema, type ArticlePackage, type SocialVariantPack } from "../contracts/mma-files.js";
import { atomicWriteBuffer, atomicWriteJson } from "../state.js";
import { atomicWriteText } from "../state.js";
import { articleRef, hasValidArticlePackageHash } from "./hash.js";
import type { SocialRender } from "./frame.js";

export class ArticleSlotConflictError extends Error {}

export const ARTICLE_INDEX_PATH = "ventures/mma-files/articles/INDEX.md";

// The two magazine rooms read this index as their entire "what we already published" context.
// `composePortfolioContext` appends it last in a packet cut at 18,000 characters, after the
// stylebook, the bridge and the day's slate — so a growing index evicts nothing ahead of it and
// instead absorbs the cut itself: the table would end mid-row, with the count line under it
// gone. Bounding the render here drops whole rows, oldest first, and keeps the count.
const MAX_ARTICLE_INDEX_CHARS = 6_000;

function articleRelativePath(article: ArticlePackage): string {
  return `ventures/mma-files/articles/${article.publishAt.slice(0, 10)}-${article.slot}-${article.slug}.json`;
}

async function directoryFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter((entry) => entry.endsWith(".json")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function storeArticlePackage(
  root: string,
  input: ArticlePackage
): Promise<{ path: string; idempotent: boolean; supersededHash?: string }> {
  const article = ArticlePackageSchema.parse(input);
  if (!hasValidArticlePackageHash(article)) throw new Error("Article package hash is invalid");
  const directory = path.join(root, "ventures", "mma-files", "articles");
  const prefix = `${article.publishAt.slice(0, 10)}-${article.slot}-`;
  const superseded: Array<{ filename: string; hash: string }> = [];
  for (const filename of await directoryFiles(directory)) {
    if (!filename.startsWith(prefix)) continue;
    const existing = ArticlePackageSchema.parse(JSON.parse(await readFile(path.join(directory, filename), "utf8")));
    if (existing.packageHash === article.packageHash) {
      return { path: `ventures/mma-files/articles/${filename}`, idempotent: true };
    }
    // A slot that holds a publishable package is immutable, and stays that way: rewriting a
    // published or draft article under the same date and slot is how a delivered piece gets
    // quietly swapped, which is exactly what this guard exists to stop.
    if (existing.status !== "blocked" && existing.status !== "killed") {
      throw new ArticleSlotConflictError(`Article slot ${prefix.slice(0, -1)} already contains a different package`);
    }
    // A blocked or killed package is a rejected draft, not an artifact. Treating it as one
    // meant a single failed gate poisoned the slot for good: after the cause was fixed the
    // retry aborted on the rejected attempt it was meant to replace, so the day could never
    // produce an article no matter what changed. The superseded hash rides out with the
    // result so the run record keeps the trail.
    superseded.push({ filename, hash: existing.packageHash });
  }
  for (const { filename } of superseded) await rm(path.join(directory, filename), { force: true });
  const relative = articleRelativePath(article);
  await atomicWriteJson(root, relative, article);
  return {
    path: relative,
    idempotent: false,
    ...(superseded[0] ? { supersededHash: superseded[0].hash } : {})
  };
}

export async function storeSocialVariantPack(
  root: string,
  input: SocialVariantPack
): Promise<string> {
  const pack = SocialVariantPackSchema.parse(input);
  const safeRef = pack.articleRef.replaceAll(":", "-");
  const relative = `ventures/mma-files/social/packs/${safeRef}.json`;
  await atomicWriteJson(root, relative, pack);
  return relative;
}

export async function storeArticleMedia(
  root: string,
  article: ArticlePackage,
  socialRenders: readonly SocialRender[]
): Promise<string[]> {
  const base = `ventures/mma-files/media/${article.publishAt.slice(0, 10)}-${article.slot}-${article.slug}`;
  const heroExtension = article.image.hero_path.split(".").at(-1) ?? "webp";
  const thumbExtension = article.image.thumb_path.split(".").at(-1) ?? "webp";
  const paths = [
    `${base}/hero.${heroExtension}`,
    `${base}/thumb.${thumbExtension}`,
    ...socialRenders.map((render) => `${base}/social-${render.key}.svg`)
  ];
  await Promise.all([
    atomicWriteBuffer(root, paths[0]!, Buffer.from(article.image.hero_bytes_base64, "base64")),
    atomicWriteBuffer(root, paths[1]!, Buffer.from(article.image.thumb_bytes_base64, "base64")),
    ...socialRenders.map((render, index) => atomicWriteText(root, paths[index + 2]!, render.svg))
  ]);
  return paths;
}

export async function loadArticlePackages(root: string): Promise<ArticlePackage[]> {
  const directory = path.join(root, "ventures", "mma-files", "articles");
  const packages: ArticlePackage[] = [];
  for (const filename of await directoryFiles(directory)) {
    const article = ArticlePackageSchema.parse(JSON.parse(await readFile(path.join(directory, filename), "utf8")));
    if (!hasValidArticlePackageHash(article)) throw new Error(`Stored article ${filename} has an invalid hash`);
    packages.push(article);
  }
  return packages.sort((left, right) => left.publishAt.localeCompare(right.publishAt) || left.slot.localeCompare(right.slot));
}

export function storedArticleRef(article: ArticlePackage): string {
  return articleRef(article);
}

function indexCell(value: string, limit: number): string {
  // A pipe inside a Czech title would split the row into extra columns and silently shift every
  // later field one place left, so the table is built from flattened cells rather than raw copy.
  const flat = value.replaceAll("|", "/").replace(/\s+/gu, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1).trimEnd()}…` : flat;
}

/**
 * The published-work table both magazine rooms are given.
 *
 * Newest first, because a repeat is nearly always a repeat of something recent, and the rows
 * that get dropped when the index outgrows its budget are the oldest ones.
 */
export function renderArticleIndex(articles: readonly ArticlePackage[]): string {
  let rows = [...articles]
    .sort((left, right) => right.publishAt.localeCompare(left.publishAt) || right.slot.localeCompare(left.slot))
    .map((article) => {
      // The subject column carries every ref the package declared, not just its headline
      // subject: that is the same set mag-editorial excludes from selection, so a room reading
      // this index and the code picking a fallback subject agree on what "already covered" means.
      const subjects = [...(article.eventRef ? [article.eventRef] : []), ...article.fighterRefs].join(" ");
      return `| ${article.publishAt.slice(0, 10)} | ${article.slot} | ${article.status} | ${article.format} | ${indexCell(article.localizations.cs.title, 70)} | ${indexCell(subjects, 160)} |`;
    });
  const render = () => [
    "# MMA Files article index",
    "",
    "> Generated from the stored article packages, at the start and end of every article slot. This is the desk's record of what has already been published: a subject listed here is not fresh.",
    "",
    "| Published | Slot | Status | Format | Czech title | Subjects covered |",
    "| --- | --- | --- | --- | --- | --- |",
    rows.length ? rows.join("\n") : "| — | — | — | — | No article stored yet | — |",
    "",
    `Articles on file: ${articles.length}. Rows shown: ${rows.length}.`,
    ""
  ].join("\n");
  let rendered = render();
  while (rendered.length > MAX_ARTICLE_INDEX_CHARS && rows.length > 1) {
    rows = rows.slice(0, -1);
    rendered = render();
  }
  return rendered;
}

/**
 * Rewrite the index from the packages on disk.
 *
 * `composePortfolioContext` loads `ventures/mma-files/articles/INDEX.md` into both the
 * mag-editorial and mag-desk packets, and nothing had ever written the file — so the rooms were
 * handed an empty string and told, in effect, that the desk had never published anything. VAULT
 * judges a subject repeat against this list, which is how a subject already on file can be
 * assigned a second time.
 *
 * Both callers are in `runLiveArticleProduction`: once before the slot runs, so the file is
 * current for the next room even when the slot dies, and once after a package is stored.
 */
export async function regenerateArticleIndex(root: string): Promise<string> {
  await atomicWriteText(root, ARTICLE_INDEX_PATH, renderArticleIndex(await loadArticlePackages(root)));
  return ARTICLE_INDEX_PATH;
}
