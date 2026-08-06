import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface DeliveredPackage {
  /** The package as it was sent, pretty-printed for reading. */
  json: string;
  /** Where the magazine serves what was delivered, when the receipt records it. */
  articleUrl?: string;
  /** Shown above the block when the package itself is no longer on disk. */
  note?: string;
}

function stateRoot(): string {
  const repoRoot = process.env.BOARDLESSAI_REPO_ROOT ?? path.resolve(process.cwd(), "..");
  return path.join(repoRoot, "state");
}

async function readJson(...segments: string[]): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path.join(stateRoot(), ...segments), "utf8"));
  } catch {
    return null;
  }
}

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * The DNESKAi package a date delivered.
 *
 * Delivery archives the package it sent under `edition/archive/`; before that change it deleted
 * it, so for every edition delivered up to 6 August the receipt is all there is. The receipt
 * still says the true things — what was sent, when, to which repository, and now where to read
 * it — so it stands in rather than showing nothing.
 */
export async function deliveredEditionPackage(
  date: string,
  editionRef?: string
): Promise<DeliveredPackage | null> {
  const receipt = await readJson("edition", "deliveries", `${date}.json`) as
    | { status?: unknown; packageHash?: unknown; articleUrl?: unknown }
    | null;
  if (!receipt || receipt.status !== "delivered") return null;
  const hash = typeof receipt.packageHash === "string" ? receipt.packageHash : editionRef;
  const articleUrl = typeof receipt.articleUrl === "string" ? receipt.articleUrl : undefined;
  const archived = hash ? await readJson("edition", "archive", `${date}-${hash}.json`) : null;
  if (archived) {
    return { json: pretty(archived), ...(articleUrl ? { articleUrl } : {}) };
  }
  return {
    json: pretty(receipt),
    ...(articleUrl ? { articleUrl } : {}),
    note: "The package itself was deleted on delivery before this was kept. This is the receipt written for it."
  };
}

/**
 * The MMA Files article a date published, joined to the receipt that delivered it.
 *
 * The package is written under `ventures/mma-files/articles/<date>-<slot>-<slug>.json` and the
 * receipt under `ventures/mma-files/deliveries/articles/<packageHash>.json`, so the hash in the
 * package is the join.
 */
export async function deliveredArticlePackage(date: string): Promise<DeliveredPackage | null> {
  let names: string[] = [];
  try {
    names = await readdir(path.join(stateRoot(), "ventures", "mma-files", "articles"));
  } catch {
    return null;
  }
  const file = names.filter((name) => name.startsWith(`${date}-`) && name.endsWith(".json")).sort()[0];
  if (!file) return null;
  const article = await readJson("ventures", "mma-files", "articles", file) as
    | { packageHash?: unknown; status?: unknown }
    | null;
  if (!article || typeof article.packageHash !== "string") return null;
  const receipt = await readJson(
    "ventures", "mma-files", "deliveries", "articles", `${article.packageHash}.json`
  ) as { status?: unknown; articleUrl?: unknown } | null;
  if (receipt?.status !== "delivered") return null;
  const articleUrl = typeof receipt.articleUrl === "string" ? receipt.articleUrl : undefined;
  return { json: pretty(article), ...(articleUrl ? { articleUrl } : {}) };
}
