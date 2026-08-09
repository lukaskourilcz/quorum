import { z } from "zod";
import { DateSchema, DateTimeSchema, HttpsUrlSchema, openObject } from "./common.js";

const NonEmptyStringSchema = z.string().trim().min(1);

/** The section keys an edition may be filed under. */
export const ARTICLE_CATEGORIES = ["ai-models"] as const;
export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export const SourceRefSchema = openObject({
  id: NonEmptyStringSchema,
  url: z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  title: NonEmptyStringSchema,
  source_id: NonEmptyStringSchema.optional(),
  publisher: NonEmptyStringSchema.optional(),
  source_type: NonEmptyStringSchema.optional(),
  classification: z.enum(["primary", "secondary"]).optional(),
  published_at: DateTimeSchema.optional(),
  supports: z.array(NonEmptyStringSchema).min(1).optional()
});

const GenerationProvenanceSchema = openObject({
  generated_at: DateTimeSchema,
  human_reviewed: z.boolean(),
  models: openObject({
    curation: NonEmptyStringSchema.optional(),
    writing: NonEmptyStringSchema.optional(),
    utility: NonEmptyStringSchema.optional()
  }),
  source_candidates: z.number().int().nonnegative().optional(),
  cited_sources: z.number().int().nonnegative().optional(),
  image_provider: NonEmptyStringSchema.optional(),
  cost: openObject({
    amount: z.number().finite().nonnegative(),
    currency: z.literal("USD")
  }).optional(),
  package_hash: z.string().regex(/^[a-f0-9]{64}$/).optional()
});

export const ArticleFrontmatterV2Schema = openObject({
  schema_version: z.literal(2),
  title: NonEmptyStringSchema,
  slug: z.string().regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/),
  date: DateSchema,
  lang: z.enum(["en", "cs"]),
  dek: NonEmptyStringSchema,
  alternative_headlines: z.array(NonEmptyStringSchema).min(1).max(3).optional(),
  /**
   * The words that travel with the carousel, written by the desk that wrote the edition.
   *
   * Additive and optional: the magazine's own loaders ignore unknown frontmatter, and every
   * edition already on disk parses unchanged. The photograph's credit is deliberately not here —
   * code appends it to the rendered caption, so a caption without it cannot be built.
   */
  social_copy: openObject({
    igCaption: z.string().trim().min(1).max(500),
    hashtags: z.array(z.string().trim().min(2).max(30)).max(10),
    threadsText: z.string().trim().min(1).max(480),
    storyLine: z.string().trim().min(1).max(66)
  }).optional(),
  tags: z.array(NonEmptyStringSchema).min(1),
  /**
   * Section keys the reader routes on. English by contract and separate from
   * `tags`, which stay Czech: tags are a browsing taxonomy, a category is a
   * section the edition belongs to. Optional because an uncategorised edition
   * is correct far more often than a miscategorised one.
   */
  categories: z.array(z.enum(ARTICLE_CATEGORIES)).max(2).optional(),
  sources: z.array(SourceRefSchema),
  illustration: openObject({
    path: z.string().regex(/^\/(?:images\/[a-z0-9][a-z0-9/_-]*\.(?:webp|png|svg)|illustrations\/[a-zA-Z0-9/_-]+\.webp)$/).optional(),
    thumbnail_path: z.string().regex(/^\/images\/[a-z0-9][a-z0-9/_-]*\.(?:webp|png|svg)$/).optional(),
    // Legacy. Nothing generated an image from it, and it was the text that captioned real
    // photographs with illustrations that do not exist, so the writer stopped emitting it. Kept
    // optional so every article already on disk still parses.
    prompt: z.string().optional(),
    alt: z.string().trim().min(1).max(300),
    width: z.number().int().min(640).max(4_000).optional(),
    height: z.number().int().min(360).max(3_000).optional(),
    origin: z.enum(["photo", "svg", "illustration"]).optional(),
    attribution: openObject({
      license: NonEmptyStringSchema,
      author: NonEmptyStringSchema,
      source_url: HttpsUrlSchema,
      text: NonEmptyStringSchema
    }).optional()
  }),
  signal_strength: z.number().finite().min(0).max(100).optional(),
  why_it_matters: z.array(NonEmptyStringSchema).min(1).max(3),
  what_changed: z.array(NonEmptyStringSchema).min(1).max(4),
  uncertainty: z.array(NonEmptyStringSchema).min(1).max(3),
  corrections: z.array(openObject({
    date: DateSchema,
    description: NonEmptyStringSchema,
    section: NonEmptyStringSchema.optional()
  })).optional(),
  generation: GenerationProvenanceSchema,
  translation_of: NonEmptyStringSchema,
  sponsor: openObject({
    name: NonEmptyStringSchema,
    url: HttpsUrlSchema,
    label: NonEmptyStringSchema,
    copy: NonEmptyStringSchema,
    image: z.string().startsWith("/").optional(),
    image_alt: NonEmptyStringSchema.optional()
  }).optional(),
  dispatches: z.array(openObject({
    title: NonEmptyStringSchema,
    body: NonEmptyStringSchema,
    source_url: HttpsUrlSchema.optional(),
    topic: NonEmptyStringSchema.optional()
  })).optional(),
  wire: z.array(openObject({
    title: NonEmptyStringSchema,
    url: HttpsUrlSchema,
    source: NonEmptyStringSchema
  })).optional(),
  type: z.enum(["daily", "weekly"]).optional(),
  editors_note: NonEmptyStringSchema.optional(),
  glossary_terms: z.array(NonEmptyStringSchema).optional(),
  digest: openObject({
    from: DateSchema,
    to: DateSchema,
    covered_slugs: z.array(NonEmptyStringSchema).min(1)
  }).optional()
});

export type ArticleFrontmatterV2 = z.infer<typeof ArticleFrontmatterV2Schema>;
