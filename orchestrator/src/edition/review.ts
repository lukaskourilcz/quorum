import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { EditorialDecisionSchema, EditorialReviewSchema, type EditorialReview } from "../contracts/editorial-review.js";
import type { EditionPackage } from "../contracts/edition-package.js";
import { atomicWriteJson, readJson } from "../state.js";
import { editionPackageHash, hasValidEditionPackageHash } from "./package.js";
import { validateEditionForDelivery } from "../delivery/validate.js";

export function editorialReviewHash(review: EditorialReview): string {
  return createHash("sha256").update(JSON.stringify(review)).digest("hex");
}

export async function storeEditorialReview(root: string, edition: EditionPackage, images: EditorialReview["images"], now: Date): Promise<string | null> {
  if (edition.status !== "edition") return null;
  const relative = `editorial/reviews/${edition.idempotencyKey}.json`;
  const existing = await readJson<unknown>(root, relative, null);
  if (existing !== null) {
    EditorialReviewSchema.parse(existing);
    return relative;
  }
  const review = EditorialReviewSchema.parse({
    schemaVersion: images.length === 4 ? "editorial-review/2" : "editorial-review/1", id: edition.idempotencyKey, createdAt: now.toISOString(),
    package: edition,
    titles: [...new Set([edition.article.cs.frontmatter.title, ...(edition.article.cs.frontmatter.alternative_headlines ?? [])])].slice(0, 4),
    images
  });
  await atomicWriteJson(root, relative, review);
  return relative;
}

export async function reviewFiles(root: string): Promise<string[]> {
  return (await readdir(path.join(root, "editorial/reviews")).catch(() => []))
    .filter(name => /^[a-f0-9]{64}\.json$/u.test(name)).sort();
}

/** A decision cannot approve another package or a candidate changed after the owner saw it. */
export function approvedEditorialPackage(rawReview: unknown, rawDecision: unknown): EditionPackage | null {
  const parsed = EditorialReviewSchema.safeParse(rawReview);
  const decision = EditorialDecisionSchema.safeParse(rawDecision);
  if (!parsed.success || !decision.success) return null;
  const review = parsed.data;
  const selection = decision.data;
  if (review.schemaVersion === "editorial-review/2" &&
      (new Set(review.titles.map(title => title.normalize("NFC").trim().toLocaleLowerCase("cs"))).size !== 4 ||
       review.images.some(slot => !slot.image) ||
       new Set(review.images.map(slot => slot.image?.hero_bytes_base64)).size !== 4)) return null;
  if (selection.action !== "approve" || selection.reviewId !== review.id || selection.reviewHash !== editorialReviewHash(review)) return null;
  if (!hasValidEditionPackageHash(review.package) || review.package.status !== "edition") return null;
  const image = review.images.find(candidate => candidate.id === selection.imageId)?.image;
  if (!image) return null;
  const approved = structuredClone(review.package);
  approved.image = image;
  // Older packages carried a second hero; retaining it would deliver two different selections.
  delete approved.hero;
  for (const article of [approved.article.cs, approved.article.en]) {
    if (!article) continue;
    if (article.frontmatter.lang === "cs") article.frontmatter.title = selection.title;
    article.frontmatter.generation.human_reviewed = true;
    article.frontmatter.illustration = {
      path: image.hero_path.replace(/^public/u, ""), thumbnail_path: image.thumb_path.replace(/^public/u, ""),
      alt: article.frontmatter.lang === "en" ? image.alt_en ?? image.alt_cs : image.alt_cs, width: image.width, height: image.height, origin: image.origin,
      attribution: { license: image.license.name, author: image.license.author, source_url: image.license.source_url, text: image.license.attribution_html }
    };
  }
  approved.idempotencyKey = editionPackageHash(approved);
  for (const article of [approved.article.cs, approved.article.en]) {
    if (article) article.frontmatter.generation.package_hash = approved.idempotencyKey;
  }
  try { return validateEditionForDelivery(approved); } catch { return null; }
}

/** Fail closed even for packages left in the old automatic outbox before owner review existed. */
export async function hasEditorialApproval(root: string, edition: EditionPackage): Promise<boolean> {
  if (edition.status !== "edition") return true;
  for (const file of await reviewFiles(root)) {
    const review = await readJson<unknown>(root, `editorial/reviews/${file}`, null);
    const decision = await readJson<unknown>(root, `editorial/decisions/${file}`, null);
    const approved = approvedEditorialPackage(review, decision);
    if (approved?.idempotencyKey === edition.idempotencyKey) return true;
  }
  return false;
}
