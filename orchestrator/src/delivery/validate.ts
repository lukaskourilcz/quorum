import { EditionPackageSchema, type EditionPackage } from "../contracts/edition-package.js";
import { serializeMdx } from "../edition/content-write.js";
import { hasValidEditionPackageHash } from "../edition/package.js";
import YAML from "yaml";

export class DeliveryPackageError extends Error {
  constructor(readonly code: "schema_invalid" | "content_invalid", message: string) {
    super(message);
    this.name = "DeliveryPackageError";
  }
}

/**
 * Whether the whole body is one MDX expression instead of markdown.
 *
 * MDX reads a top-level `{...}` as an expression and renders its value as a single text node, so
 * a body wrapped in one compiles to no headings, no links and no paragraphs — the markdown is
 * printed rather than rendered. The desk started emitting `{` + backtick-template + `}` around
 * whole articles on 8 August; every gate passed it, because it is valid MDX and a valid string,
 * and the magazine published an unformatted wall of text with its own `##` and link syntax
 * visible. Four days later a body carried an inline code span, whose backtick closed the template
 * early, and the same wrapper failed the target build outright.
 *
 * Schema validity is not renderability. This is the cheap half of that check: the shape that
 * swallows an entire article is refused at the boundary, in the producer, where a rejected package
 * costs one edition instead of a published one nobody can read.
 */
export function isJsxExpressionBody(body: string): boolean {
  return body.trimStart().startsWith("{");
}

export function validateEditionForDelivery(value: unknown): EditionPackage {
  const parsed = EditionPackageSchema.safeParse(value);
  if (!parsed.success) {
    throw new DeliveryPackageError("schema_invalid", parsed.error.message);
  }
  const editionPackage = parsed.data;
  if (!hasValidEditionPackageHash(editionPackage)) {
    throw new DeliveryPackageError("content_invalid", "Package hash does not match canonical bytes");
  }
  if (editionPackage.status === "no_edition") return editionPackage;
  // Czech is the required locale; English is optional and on its way out. Every rule below
  // runs over the locales the package actually carries rather than a fixed pair, because
  // oldestPendingDelivery calls this without catching — one unreadable package would make
  // every later cycle throw while selecting, wedging the queue behind it.
  const { en, cs } = editionPackage.article;
  const localized = ([["en", en], ["cs", cs]] as const)
    .filter((entry): entry is readonly ["en" | "cs", NonNullable<typeof entry[1]>] => entry[1] !== undefined);
  const errors: string[] = [];
  for (const [locale, article] of localized) {
    if (article.frontmatter.date !== editionPackage.date) {
      errors.push("localized frontmatter date differs from package date");
    }
    if (article.frontmatter.lang !== locale) {
      errors.push("localized frontmatter language is invalid");
    }
    if (article.frontmatter.slug !== cs.frontmatter.slug) {
      errors.push("localized slugs differ");
    }
    if (article.frontmatter.generation.package_hash !== editionPackage.idempotencyKey) {
      errors.push("localized package_hash differs from idempotencyKey");
    }
  }
  const expectedHeroPath = editionPackage.image.hero_path.replace(/^public/u, "");
  const expectedThumbPath = editionPackage.image.thumb_path.replace(/^public/u, "");
  for (const [locale, article] of localized) {
    const deliveredPath = article.frontmatter.illustration.path;
    const legacyPath = deliveredPath?.startsWith("/illustrations/") && Boolean(editionPackage.hero);
    if (deliveredPath && deliveredPath !== expectedHeroPath && !legacyPath) {
      errors.push(`${locale} illustration path differs from the delivered image`);
    }
    if (article.frontmatter.illustration.thumbnail_path && article.frontmatter.illustration.thumbnail_path !== expectedThumbPath) {
      errors.push(`${locale} thumbnail path differs from the delivered image`);
    }
    if (article.frontmatter.illustration.origin && article.frontmatter.illustration.origin !== editionPackage.image.origin) {
      errors.push(`${locale} illustration origin differs from the delivered image`);
    }
    if (article.frontmatter.illustration.attribution?.source_url && article.frontmatter.illustration.attribution.source_url !== editionPackage.image.license.source_url) {
      errors.push(`${locale} attribution source differs from the delivered image`);
    }
    const expectedAlt = locale === "en" ? editionPackage.image.alt_en : editionPackage.image.alt_cs;
    if (article.frontmatter.illustration.origin && article.frontmatter.illustration.alt !== expectedAlt) {
      errors.push(`${locale} illustration alt text differs from the delivered image`);
    }
  }
  if (editionPackage.hero && editionPackage.hero.path !== `public/illustrations/${editionPackage.date}.webp`) {
    errors.push("legacy hero path is outside the authorized date path");
  }
  for (const [locale, article] of localized) {
    if (isJsxExpressionBody(article.body)) {
      errors.push(`${locale} body is a JSX expression rather than markdown`);
    }
  }
  try {
    for (const [locale, article] of localized) {
      const bytes = serializeMdx(article.frontmatter, article.body);
      const yaml = bytes.split("---\n", 3)[1];
      const roundTrip = YAML.parse(yaml ?? "") as {
        date?: unknown;
        generation?: { generated_at?: unknown; package_hash?: unknown };
      };
      if (roundTrip.date !== editionPackage.date) {
        errors.push(`${locale} exact MDX bytes do not preserve date as a string`);
      }
      if (typeof roundTrip.generation?.generated_at !== "string") {
        errors.push(`${locale} exact MDX bytes do not preserve generated_at as a string`);
      }
      if (roundTrip.generation?.package_hash !== editionPackage.idempotencyKey) {
        errors.push(`${locale} exact MDX bytes do not preserve package_hash`);
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "MDX serialization failed");
  }
  if (errors.length > 0) {
    throw new DeliveryPackageError("content_invalid", errors.join("; "));
  }
  return editionPackage;
}
