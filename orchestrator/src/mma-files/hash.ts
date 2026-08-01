import { createHash } from "node:crypto";
import type { ArticlePackage } from "../contracts/mma-files.js";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonical(entry)])
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function articlePackageHash(article: Omit<ArticlePackage, "packageHash">): string {
  return sha256(canonicalJson(article));
}

export function hasValidArticlePackageHash(article: ArticlePackage): boolean {
  const { packageHash, ...content } = article;
  return packageHash === articlePackageHash(content);
}

export function articleRef(article: ArticlePackage): string {
  return `article:${article.publishAt.slice(0, 10)}:${article.slot}:${article.slug}`;
}
