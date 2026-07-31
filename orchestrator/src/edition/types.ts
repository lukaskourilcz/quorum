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

export interface EditionUsage {
  provider: "anthropic";
  model: string;
  stage: "curate" | "write" | "rewrite";
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
  illustrationPrompt: string;
  wire: z.infer<typeof WireItemSchema>[];
  sources: z.infer<typeof SourceRefSchema>[];
  byLocale: { en: LocalizedContent; cs: LocalizedContent };
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
