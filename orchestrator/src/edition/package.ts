import { createHash } from "node:crypto";
import type { ArticleFrontmatterV2 } from "../contracts/article-frontmatter.js";
import {
  EditionPackageSchema,
  type EditionPackage
} from "../contracts/edition-package.js";
import type { EditionQualityConfig } from "./config.js";
import type { WrittenArticle } from "./types.js";

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
}

function frontmatter(
  article: WrittenArticle,
  locale: "en" | "cs",
  config: EditionQualityConfig,
  context: EditionPackageContext
): ArticleFrontmatterV2 {
  const localized = article.byLocale[locale];
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
      prompt: article.illustrationPrompt,
      alt: localized.illustrationAlt
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
        writing: config.models.writing
      },
      source_candidates: context.sourceCandidates,
      cited_sources: article.sources.length,
      image_provider: "none",
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
  const preliminary = {
    schemaVersion: "edition-package/1" as const,
    date: article.date,
    idempotencyKey: "0".repeat(64),
    status: "edition" as const,
    article: {
      en: {
        frontmatter: frontmatter(article, "en", config, context),
        body: article.byLocale.en.bodyMdx
      },
      cs: {
        frontmatter: frontmatter(article, "cs", config, context),
        body: article.byLocale.cs.bodyMdx
      }
    },
    board: {
      meetingRef: context.meetingRef,
      roomUrl: context.roomUrl,
      whyThisStory: context.whyThisStory
    },
    socialPackRef: `state/social/packs/${article.date}.json`,
    generation: {
      models: {
        curation: config.models.curation,
        writing: config.models.writing
      },
      ...(context.costUsd === undefined ? {} : { costUsd: context.costUsd })
    },
    reason: `cu-edition decision ${context.meetingRef}`
  };
  const idempotencyKey = editionPackageHash(preliminary);
  preliminary.idempotencyKey = idempotencyKey;
  preliminary.article.en.frontmatter.generation.package_hash = idempotencyKey;
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
        writing: input.config.models.writing
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
