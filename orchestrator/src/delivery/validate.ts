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
