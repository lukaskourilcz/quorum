import path from "node:path";
import type { ArticlePackage } from "../contracts/mma-files.js";
import { atomicWriteJson, readJson } from "../state.js";
import { articleRef, hasValidArticlePackageHash } from "./hash.js";
import { loadArticlePackages } from "./store.js";

export interface ArticleDeliveryReceipt {
  adapter: string;
  articleRef: string;
  packageHash: string;
  status: "delivered";
  idempotent: boolean;
  deliveredAt: string;
}

export interface ArticleDeliveryAdapter {
  readonly id: string;
  deliver(article: ArticlePackage): Promise<ArticleDeliveryReceipt>;
}

export class LocalStoreDelivery implements ArticleDeliveryAdapter {
  readonly id = "local-store";

  constructor(
    private readonly targetRoot: string,
    private readonly now: () => Date = () => new Date()
  ) {}

  async deliver(article: ArticlePackage): Promise<ArticleDeliveryReceipt> {
    if (!hasValidArticlePackageHash(article)) throw new Error("Delivery rejected an invalid article package hash");
    const reference = articleRef(article);
    const relative = `mma-files-delivery/packages/${article.publishAt.slice(0, 10)}-${article.slot}-${article.slug}.json`;
    const current = await readJson<ArticlePackage | null>(this.targetRoot, relative, null);
    if (current && current.packageHash !== article.packageHash) {
      throw new Error(`Delivery target already has a different package for ${reference}`);
    }
    if (!current) await atomicWriteJson(this.targetRoot, relative, article);
    const receipt: ArticleDeliveryReceipt = {
      adapter: this.id,
      articleRef: reference,
      packageHash: article.packageHash,
      status: "delivered",
      idempotent: Boolean(current),
      deliveredAt: this.now().toISOString()
    };
    await atomicWriteJson(
      this.targetRoot,
      `mma-files-delivery/receipts/${article.packageHash}.json`,
      receipt
    );
    return receipt;
  }
}

export async function shipArticleBacklog(input: {
  sourceRoot: string;
  adapter: ArticleDeliveryAdapter;
}): Promise<ArticleDeliveryReceipt[]> {
  const articles = (await loadArticlePackages(input.sourceRoot))
    .filter((article) => article.status === "published")
    .sort((left, right) => left.publishAt.localeCompare(right.publishAt) || left.slot.localeCompare(right.slot));
  const receipts: ArticleDeliveryReceipt[] = [];
  for (const article of articles) receipts.push(await input.adapter.deliver(article));
  return receipts;
}

export function localDeliveryRoot(repoRoot: string): string {
  return path.join(repoRoot, "tmp", "mma-files-site");
}
