import { createHash } from "node:crypto";
import type { ArticleFrontmatterV2 } from "../contracts/article-frontmatter.js";
import {
  EditionPackageSchema,
  type EditionPackage
} from "../contracts/edition-package.js";
import type { EditionQualityConfig } from "./config.js";
import type { WrittenArticle } from "./types.js";
import { deterministicArticleImage } from "../images/article-image.js";
import type { ArticleImage } from "../contracts/autonomy.js";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function hashView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(hashView);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "idempotencyKey" && key !== "package_hash")
      .map(([key, child]) => [key, hashView(child)])
  );
}

export function editionPackageHash(value: unknown): string {
  return createHash("sha256").update(canonical(hashView(value))).digest("hex");
}

interface EditionPackageContext {
  meetingRef: string;
  roomUrl: string;
  whyThisStory: string;
  generatedAt: Date;
  sourceCandidates: number;
  signalStrength: number;
  costUsd: number | undefined;
  socialPackEnabled?: boolean;
  image?: ArticleImage;
  /** Set only when the article shipped over findings the review left open. */
  unresolvedReview?: { notice: string; findings: string[] };
  hero?: {
    bytes: Buffer;
    alt: string;
    composerVersion: string;
    inputsHash: string;
  };
}

function frontmatter(
  article: WrittenArticle,
  locale: "en" | "cs",
  config: EditionQualityConfig,
  context: EditionPackageContext,
  image: ArticleImage
): ArticleFrontmatterV2 {
  // Czech is the locale the desk writes; a caller asking for one the article does not have
  // is a bug in the caller, not something to paper over with the other language's words.
  const localized = article.byLocale[locale];
  if (!localized) throw new Error(`edition package: article has no ${locale} locale`);
  return {
    schema_version: 2,
    title: localized.title,
    slug: article.slug,
    date: article.date,
    lang: locale,
    dek: localized.dek,
    alternative_headlines: localized.alternativeHeadlines,
    tags: article.tags,
    sources: article.sources,
    illustration: {
      path: image.hero_path.replace(/^public/u, ""),
      thumbnail_path: image.thumb_path.replace(/^public/u, ""),
      alt: (locale === "en" ? image.alt_en : image.alt_cs) ?? image.alt_cs,
      width: image.width,
      height: image.height,
      origin: image.origin,
      attribution: {
        license: image.license.name,
        author: image.license.author,
        source_url: image.license.source_url,
        text: image.license.attribution_html
      }
    },
    signal_strength: context.signalStrength,
    why_it_matters: localized.whyItMatters,
    what_changed: localized.whatChanged,
    uncertainty: localized.uncertainty,
    generation: {
      generated_at: context.generatedAt.toISOString(),
      human_reviewed: false,
      models: {
        curation: config.models.curation,
        writing: config.models.writing,
      },
      source_candidates: context.sourceCandidates,
      cited_sources: article.sources.length,
      image_provider: image.origin === "photo" ? image.license.name : "BoardlessAI FRAME",
      ...(context.costUsd === undefined
        ? {}
        : { cost: { amount: context.costUsd, currency: "USD" as const } })
    },
    translation_of: article.slug,
    dispatches: localized.dispatches,
    wire: article.wire,
    type: "daily"
  };
}

export function buildEditionPackage(
  article: WrittenArticle,
  config: EditionQualityConfig,
  context: EditionPackageContext
): EditionPackage {
  const image = context.image ?? deterministicArticleImage({
    venture: "caught-up",
    slug: article.slug,
    // The cover fingerprint is seeded from the title, so taking it from Czech re-seeds it and
    // future covers get a different bar pattern. Nothing published is invalidated by that.
    title: article.byLocale.cs.title,
    date: article.date,
    tags: article.tags
  });
  const preliminary = {
    schemaVersion: "edition-package/1" as const,
    date: article.date,
    idempotencyKey: "0".repeat(64),
    status: "edition" as const,
    image,
    article: {
      ...(article.byLocale.en
        ? {
            en: {
              frontmatter: frontmatter(article, "en", config, context, image),
              body: article.byLocale.en.bodyMdx
            }
          }
        : {}),
      cs: {
        frontmatter: frontmatter(article, "cs", config, context, image),
        body: article.byLocale.cs.bodyMdx
      }
    },
    board: {
      meetingRef: context.meetingRef,
      roomUrl: context.roomUrl,
      whyThisStory: context.whyThisStory
    },
    ...(context.socialPackEnabled === false
      ? {}
      : { socialPackRef: `state/social/packs/${article.date}.json` }),
    // Part of the hashed package, so the findings cannot be edited off a delivered edition
    // without the delivery validator refusing it.
    ...(context.unresolvedReview ? { unresolvedReview: context.unresolvedReview } : {}),
    ...(context.hero
      ? {
          hero: {
            path: `public/illustrations/${article.date}.webp`,
            bytesBase64: context.hero.bytes.toString("base64"),
            alt: context.hero.alt,
            provenance: {
              method: "composed" as const,
              composerVersion: context.hero.composerVersion,
              inputsHash: context.hero.inputsHash
            }
          }
        }
      : {}),
    generation: {
      models: {
        curation: config.models.curation,
        writing: config.models.writing,
      },
      ...(context.costUsd === undefined ? {} : { costUsd: context.costUsd })
    },
    reason: `cu-edition decision ${context.meetingRef}`
  };
  const idempotencyKey = editionPackageHash(preliminary);
  preliminary.idempotencyKey = idempotencyKey;
  if (preliminary.article.en) preliminary.article.en.frontmatter.generation.package_hash = idempotencyKey;
  preliminary.article.cs.frontmatter.generation.package_hash = idempotencyKey;
  return EditionPackageSchema.parse(preliminary);
}

export function buildNoEditionPackage(input: {
  date: string;
  meetingRef: string;
  roomUrl: string;
  reason: string;
  config: EditionQualityConfig;
  costUsd?: number;
}): EditionPackage {
  const preliminary = {
    schemaVersion: "edition-package/1" as const,
    date: input.date,
    idempotencyKey: "0".repeat(64),
    status: "no_edition" as const,
    board: {
      meetingRef: input.meetingRef,
      roomUrl: input.roomUrl,
      noEditionReason: input.reason.slice(0, 280)
    },
    generation: {
      models: {
        curation: input.config.models.curation,
        writing: input.config.models.writing,
      },
      ...(input.costUsd === undefined ? {} : { costUsd: input.costUsd })
    },
    reason: `cu-edition decision ${input.meetingRef}`
  };
  preliminary.idempotencyKey = editionPackageHash(preliminary);
  return EditionPackageSchema.parse(preliminary);
}

export function hasValidEditionPackageHash(value: EditionPackage): boolean {
  return value.idempotencyKey === editionPackageHash(value);
}
