import { createHash } from "node:crypto";
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
    .sort((left, right) =>
      (right.publishedAt ?? right.fetchedAt).localeCompare(
        left.publishedAt ?? left.fetchedAt
      )
    )
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
