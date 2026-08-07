import { z } from "zod";
import { DateSchema, openObject } from "./common.js";

/**
 * The append-only datasets behind the magazines' daily widgets: AI facts and the
 * AI lesson curriculum on DNESKAi, MMA facts on MMA Files.
 *
 * These are content, not configuration, so they cross the same content-only
 * delivery boundary as an edition — but they differ from an edition in one way
 * that shapes everything here. An edition is written once for one date and is
 * then immutable. A dataset is one file that grows: array order is the reveal
 * order, `entries[0]` is day zero, and the modulo over the array length is what
 * turns a publication date into today's entry. Appending therefore extends the
 * cycle, and rewriting or reordering silently changes which entry every future
 * day resolves to. `verifyDatasetAppend` in `orchestrator/src/datasets/` is what
 * enforces that; this file only describes a valid dataset.
 */

const DATASETS = ["ai-facts", "mma-facts", "ai-lessons"] as const;

const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);

const LocalizedTextSchema = openObject({
  /** One line. A fragment, so it ends without a period. */
  short: z.string().trim().min(1).max(140),
  /** One to three sentences: the complete, checkable statement. */
  full: z.string().trim().min(1).max(600)
});

const CategoryLabelSchema = openObject({
  en: z.string().trim().min(1).max(60),
  cs: z.string().trim().min(1).max(60)
});

export const DatasetEntrySchema = openObject({
  /** Zero-padded, append-only, never reused — not even after a removal. */
  id: z.string().regex(/^(?:ai|mma|lex)-\d{3,}$/),
  slug: SlugSchema,
  category: SlugSchema,
  /** `mma-facts` only. `cross` = Czech and Slovak fighters competing in the UFC. */
  promotion: z.enum(["ufc", "oktagon", "cross"]).optional(),
  /** `ai-lessons` only: the display form of the term. */
  term: z.string().trim().min(1).max(80).optional(),
  en: LocalizedTextSchema,
  cs: LocalizedTextSchema,
  /** YYYY-MM-DD — when a human last checked this entry against its source. */
  verified: DateSchema,
  /**
   * Where a human can check it again. Not required to be a URL, but required to
   * name something findable, so it must carry either a proper noun or a number —
   * a publication, an author and year, a record book, an event number. Every
   * shipped source clears this comfortably; the shortest real ones are
   * "UFC record book" and "Hu et al., 2021". A bare "a source" does not, which
   * is the point: a receipt nobody can follow is not a receipt.
   */
  source: z
    .string()
    .trim()
    .min(12)
    .max(200)
    .refine((value) => /[A-Z]/.test(value) || /\d/.test(value), {
      message: "source must name something findable — a publication, author and year, or record"
    })
});

export type DatasetEntry = z.infer<typeof DatasetEntrySchema>;

export const BoardlessDatasetSchema = openObject({
  schemaVersion: z.literal("boardless-dataset/1"),
  dataset: z.enum(DATASETS),
  /** YYYY-MM-DD; origin of the daily index. `entries[0]` is revealed on it. */
  anchor: DateSchema,
  categories: z.record(SlugSchema, CategoryLabelSchema),
  entries: z.array(DatasetEntrySchema).min(1)
}).superRefine((file, context) => {
  const ids = new Set<string>();
  const slugs = new Set<string>();

  file.entries.forEach((entry, index) => {
    const at = ["entries", index] as const;

    if (ids.has(entry.id)) {
      context.addIssue({ code: "custom", path: [...at, "id"], message: `duplicate id ${entry.id}` });
    }
    ids.add(entry.id);

    if (slugs.has(entry.slug)) {
      context.addIssue({ code: "custom", path: [...at, "slug"], message: `duplicate slug ${entry.slug}` });
    }
    slugs.add(entry.slug);

    if (!Object.hasOwn(file.categories, entry.category)) {
      context.addIssue({
        code: "custom",
        path: [...at, "category"],
        message: `category ${entry.category} is not declared in this file`
      });
    }

    // The two dataset-specific fields. Requiring them here rather than in three
    // near-identical schemas keeps one shape for the consumers to read.
    if (file.dataset === "mma-facts" && entry.promotion === undefined) {
      context.addIssue({ code: "custom", path: [...at, "promotion"], message: "mma-facts entries require a promotion" });
    }
    if (file.dataset !== "mma-facts" && entry.promotion !== undefined) {
      context.addIssue({ code: "custom", path: [...at, "promotion"], message: `promotion belongs to mma-facts, not ${file.dataset}` });
    }
    if (file.dataset === "ai-lessons" && entry.term === undefined) {
      context.addIssue({ code: "custom", path: [...at, "term"], message: "ai-lessons entries require a term" });
    }
    if (file.dataset !== "ai-lessons" && entry.term !== undefined) {
      context.addIssue({ code: "custom", path: [...at, "term"], message: `term belongs to ai-lessons, not ${file.dataset}` });
    }

    if (entry.verified < file.anchor && entry.verified < "2020-01-01") {
      context.addIssue({ code: "custom", path: [...at, "verified"], message: "verified date is implausibly old" });
    }
  });
});

export type BoardlessDataset = z.infer<typeof BoardlessDatasetSchema>;

/** Which repository and path each dataset is delivered to. */
export const DATASET_TARGETS = {
  "ai-facts": { repo: "aifirst", path: "data/ai-facts.json" },
  "ai-lessons": { repo: "aifirst", path: "data/ai-lessons.json" },
  "mma-facts": { repo: "mma-files", path: "src/data/mma-facts.json" }
} as const satisfies Record<(typeof DATASETS)[number], { repo: string; path: string }>;

export type DatasetName = keyof typeof DATASET_TARGETS;
