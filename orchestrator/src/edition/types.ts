import { z } from "zod";
import { SourceRefSchema } from "../contracts/article-frontmatter.js";

export const EvidenceClassSchema = z.enum([
  "confirmed_fact",
  "company_claim",
  "analysis",
  "speculation",
  "open_question"
]);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

/**
 * Every stage that can still spend money in an edition run: HERALD's curation call, and STET's
 * one writing call plus the regeneration it may cost. It is a runtime list, not only a type, so
 * the budget ledger can be checked against the stages a run actually emits.
 *
 * `localize` and `localize_rewrite` were here until the second model call — the one that rebuilt
 * the article in Czech — was removed. Nothing has emitted them since, and this list is the WRITE
 * side only: it is not a parser. Run reports written before the removal still carry
 * `"stage": "localize"` (see state/edition/runs/2026-08-02-a7b2d65…json and
 * 2026-08-03-fb3c9b6…json), and nothing parses those files back into this type. Nothing reads
 * that directory at all: the two sibling directories are machine-read — state/edition/deliveries
 * by the quarterly collector, the social activation gate, the autonomy signals and the site, and
 * state/edition/outbox by the delivery step and the admin deck reader — while `runs/` is written,
 * committed by the cycle workflow and read only by the person NEEDED.md sends there when a day
 * produced no edition. The budget ledger stores `agent`, never `stage`, so no stored entry parses
 * through here either. Narrowing this therefore retires the stages without dropping any history.
 */
export const EDITION_USAGE_STAGES = ["curate", "write", "rewrite"] as const;
export type EditionUsageStage = (typeof EDITION_USAGE_STAGES)[number];

export interface EditionUsage {
  provider: "anthropic";
  model: string;
  stage: EditionUsageStage;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export interface CuratedBrief {
  date: string;
  headline: string;
  angle: string;
  picks: Array<{
    itemId: string;
    why: string;
    evidence: EvidenceClass;
    topic?: string;
  }>;
  usage: EditionUsage;
}

export const DispatchSchema = z.object({
  title: z.string().trim().min(1),
  body: z.string().trim().min(1),
  source_url: z.string().url().startsWith("https://").optional(),
  topic: z.string().trim().min(1).optional()
});

export const WireItemSchema = z.object({
  title: z.string().trim().min(1),
  url: z.string().url().startsWith("https://"),
  source: z.string().trim().min(1)
});

export interface LocalizedContent {
  title: string;
  dek: string;
  alternativeHeadlines: string[];
  bodyMdx: string;
  illustrationAlt: string;
  dispatches: z.infer<typeof DispatchSchema>[];
  whyItMatters: string[];
  whatChanged: string[];
  uncertainty: string[];
}

export interface WrittenArticle {
  slug: string;
  date: string;
  tags: string[];
  wire: z.infer<typeof WireItemSchema>[];
  sources: z.infer<typeof SourceRefSchema>[];
  selectedImageCandidateIndex?: number;
  /** Czech is what the desk writes. English is optional and no longer produced. */
  byLocale: { en?: LocalizedContent; cs: LocalizedContent };
  usage: EditionUsage[];
}

/** What one writing call returns: the article, in the one language it was written in. */
export interface CzechArticle {
  slug: string;
  date: string;
  tags: string[];
  /** The Czech "why this story" sentence, when the write call returned one. */
  whyThisStory?: string;
  wire: z.infer<typeof WireItemSchema>[];
  sources: z.infer<typeof SourceRefSchema>[];
  selectedImageCandidateIndex?: number;
  cs: LocalizedContent;
  usage: EditionUsage[];
}

export interface StructuredToolRequest<T> {
  model: string;
  stage: EditionUsage["stage"];
  maxOutputTokens: number;
  system: string;
  user: string;
  tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
  parse: (value: unknown) => T;
}

export interface EditionModelGateway {
  invoke<T>(request: StructuredToolRequest<T>): Promise<{ value: T; usage: EditionUsage }>;
}
