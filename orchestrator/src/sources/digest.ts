import { createHash } from "node:crypto";
import { wrapUntrustedData } from "../security/content.js";
import type { SourceItem } from "./types.js";

export function sourceItemFingerprint(item: SourceItem): string {
  const canonical = new URL(item.url);
  canonical.hash = "";
  for (const key of [...canonical.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "ref") {
      canonical.searchParams.delete(key);
    }
  }
  return createHash("sha256")
    .update(`${canonical.toString()}\n${item.title.toLowerCase().trim()}`)
    .digest("hex");
}

export function createDigest(items: readonly SourceItem[], limit = 50): SourceItem[] {
  const seen = new Set<string>();
  return [...items]
    .sort((left, right) => {
      if (left.publishedAt && right.publishedAt) {
        const byDate = right.publishedAt.localeCompare(left.publishedAt);
        return byDate || right.weight - left.weight;
      }
      if (left.publishedAt) return -1;
      if (right.publishedAt) return 1;
      return right.weight - left.weight || right.fetchedAt.localeCompare(left.fetchedAt);
    })
    .filter((item) => {
      const fingerprint = sourceItemFingerprint(item);
      if (seen.has(fingerprint)) {
        return false;
      }
      seen.add(fingerprint);
      return true;
    })
    .slice(0, limit);
}

export function renderDigestDataBlock(items: readonly SourceItem[]): string {
  const projection = createDigest(items).map((item) => ({
    sourceId: item.sourceId,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    summary: item.summary,
    weight: item.weight,
    tags: item.tags
  }));
  return wrapUntrustedData("caught-up-source-digest", JSON.stringify(projection));
}
