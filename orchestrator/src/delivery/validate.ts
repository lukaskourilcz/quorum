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
  const { en, cs } = editionPackage.article;
  const errors: string[] = [];
  if (en.frontmatter.date !== editionPackage.date || cs.frontmatter.date !== editionPackage.date) {
    errors.push("localized frontmatter date differs from package date");
  }
  if (en.frontmatter.lang !== "en" || cs.frontmatter.lang !== "cs") {
    errors.push("localized frontmatter language is invalid");
  }
  if (en.frontmatter.slug !== cs.frontmatter.slug) {
    errors.push("localized slugs differ");
  }
  if (
    en.frontmatter.generation.package_hash !== editionPackage.idempotencyKey ||
    cs.frontmatter.generation.package_hash !== editionPackage.idempotencyKey
  ) {
    errors.push("localized package_hash differs from idempotencyKey");
  }
  if (editionPackage.hero) {
    if (editionPackage.hero.path !== `public/illustrations/${editionPackage.date}.webp`) {
      errors.push("hero path is outside the authorized date path");
    }
  } else if (en.frontmatter.illustration.path || cs.frontmatter.illustration.path) {
    errors.push("frontmatter illustration path requires a delivered hero");
  }
  try {
    for (const [locale, article] of [["en", en], ["cs", cs]] as const) {
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
