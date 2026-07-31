import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../paths.js";

const UnitIntervalSchema = z.number().min(0).max(1);

export const EditionQualityConfigSchema = z.object({
  schemaVersion: z.literal(1),
  brand: z.object({ name: z.literal("Caught Up") }),
  quality: z.object({
    minimumSignalStrength: z.number().min(0).max(100),
    minimumSuccessfulSources: z.number().int().nonnegative(),
    minimumCandidateItems: z.number().int().nonnegative(),
    minimumCitedSources: z.number().int().nonnegative(),
    maximumSingleSourceShare: UnitIntervalSchema,
    minimumSourceDiversity: UnitIntervalSchema,
    maximumDuplicateStorySimilarity: UnitIntervalSchema,
    maximumRepeatedTopicFrequency: UnitIntervalSchema,
    requirePrimarySourceWhenRelevant: z.boolean(),
    maximumUnsupportedWatchlistItems: z.number().int().nonnegative(),
    enforcement: z.literal("enforce"),
    failureAction: z.literal("no_edition")
  }),
  article: z.object({
    targetWords: z.number().int().positive(),
    briefsMaximum: z.number().int().min(2).max(4),
    watchlistMaximum: z.number().int().min(4).max(6),
    maximumOutputTokens: z.number().int().positive(),
    maximumLocalizationOutputTokens: z.number().int().positive(),
    maximumCurationCandidates: z.number().int().positive()
  }),
  models: z.object({
    curation: z.literal("claude-sonnet-4-6"),
    writing: z.literal("claude-opus-4-7"),
    localization: z.literal("claude-sonnet-4-6")
  }),
  budgets: z.object({
    warningCostPerRun: z.number().nonnegative(),
    hardCostPerRun: z.number().positive(),
    monthlyWarning: z.number().nonnegative(),
    monthlyHardLimit: z.number().positive(),
    editionProductionUsd: z.literal(0.35),
    maximumRegenerationAttemptsPerDate: z.number().int().min(0).max(2)
  }),
  stet: z.object({
    maximumRewriteAttempts: z.literal(1),
    minimumScore: z.number().int().min(0).max(50)
  }),
  hacek: z.object({
    maximumRewriteAttempts: z.literal(1),
    minimumScore: z.number().int().min(0).max(50)
  })
});

export type EditionQualityConfig = z.infer<typeof EditionQualityConfigSchema>;

export async function loadEditionQualityConfig(
  file = path.join(configRoot, "edition-quality.json")
): Promise<EditionQualityConfig> {
  return EditionQualityConfigSchema.parse(JSON.parse(await readFile(file, "utf8")));
}
