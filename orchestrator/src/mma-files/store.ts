import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { ArticlePackageSchema, SocialVariantPackSchema, type ArticlePackage, type SocialVariantPack } from "../contracts/mma-files.js";
import { atomicWriteBuffer, atomicWriteJson } from "../state.js";
import { atomicWriteText } from "../state.js";
import { articleRef, hasValidArticlePackageHash } from "./hash.js";
import type { SocialRender } from "./frame.js";

export class ArticleSlotConflictError extends Error {}

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
): Promise<{ path: string; idempotent: boolean }> {
  const article = ArticlePackageSchema.parse(input);
  if (!hasValidArticlePackageHash(article)) throw new Error("Article package hash is invalid");
  const directory = path.join(root, "ventures", "mma-files", "articles");
  const prefix = `${article.publishAt.slice(0, 10)}-${article.slot}-`;
  for (const filename of await directoryFiles(directory)) {
    if (!filename.startsWith(prefix)) continue;
    const existing = ArticlePackageSchema.parse(JSON.parse(await readFile(path.join(directory, filename), "utf8")));
    if (existing.packageHash === article.packageHash) {
      return { path: `ventures/mma-files/articles/${filename}`, idempotent: true };
    }
    throw new ArticleSlotConflictError(`Article slot ${prefix.slice(0, -1)} already contains a different package`);
  }
  const relative = articleRelativePath(article);
  await atomicWriteJson(root, relative, article);
  return { path: relative, idempotent: false };
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
