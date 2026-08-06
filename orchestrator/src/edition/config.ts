import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../paths.js";

const UnitIntervalSchema = z.number().min(0).max(1);

export const EditionQualityConfigSchema = z.object({
  schemaVersion: z.literal(1),
  brand: z.object({ name: z.literal("Caught Up") }),
  quality: z
    .object({
      minimumSignalStrength: z.number().min(0).max(100),
      minimumSuccessfulSources: z.number().int().nonnegative(),
      minimumCandidateItems: z.number().int().nonnegative(),
      minimumCitedSources: z.number().int().nonnegative(),
      maximumSingleSourceShare: UnitIntervalSchema,
      minimumSourceDiversity: UnitIntervalSchema,
      maximumDuplicateStorySimilarity: UnitIntervalSchema,
      // The share of an article's tags that recent editions already carried. Named "frequency"
      // from the window-based score it replaced; the run records under state/edition/runs/ and
      // the inbox items citing `maximum_repeated_topic_frequency` keep reading against it.
      maximumRepeatedTopicFrequency: UnitIntervalSchema,
      // Editions that actually published topics before `maximumRepeatedTopicFrequency` is read
      // at all. Same idea as `warmupCycles` in config/kpis.json, counted in editions instead of
      // cycles: hold the verdict until there is enough history to support one. The window no
      // longer sets the score's denominator — the article's own tag count does — so this length
      // and the threshold are now independent, and only the sample size argues for the value.
      repeatedTopicWarmupEditions: z.number().int().positive(),
      requirePrimarySourceWhenRelevant: z.boolean(),
      maximumUnsupportedWatchlistItems: z.number().int().nonnegative(),
      enforcement: z.literal("enforce"),
      failureAction: z.literal("no_edition")
    })
    .superRefine((quality, ctx) => {
      // The score is (article tags recent editions already carried) / (article tags), so over
      // t tags it lands on k/t and one shared tag is 1/t. The writer contract accepts 1 to 6
      // tags, so across every set that can hold more than one tag the largest a single shared
      // tag scores is 1/2, at t = 2. A threshold under that reads one shared tag as a repeat
      // again — `ai` every day would end the day in no_edition — which is the fault the share
      // replaced the old window-based score to fix.
      const loneSharedTag = 1 / 2;
      if (quality.maximumRepeatedTopicFrequency < loneSharedTag) {
        ctx.addIssue({
          code: "custom",
          path: ["maximumRepeatedTopicFrequency"],
          message: `maximumRepeatedTopicFrequency ${quality.maximumRepeatedTopicFrequency} is below ${loneSharedTag}, the share one shared tag scores in a two-tag article: that threshold bans a single recurring tag instead of measuring how much of the topic set repeats.`
        });
      }
    }),
  article: z.object({
    targetWords: z.number().int().positive(),
    briefsMaximum: z.number().int().min(2).max(4),
    watchlistMaximum: z.number().int().min(4).max(6),
    maximumOutputTokens: z.number().int().positive(),
    maximumCurationCandidates: z.number().int().positive()
  }),
  models: z.object({
    curation: z.literal("claude-sonnet-4-6"),
    writing: z.literal("claude-sonnet-4-6")
  }),
  budgets: z.object({
    warningCostPerRun: z.number().nonnegative(),
    hardCostPerRun: z.number().positive(),
    monthlyWarning: z.number().nonnegative(),
    monthlyHardLimit: z.number().positive(),
    editionProductionUsd: z.literal(0.5),
    maximumRegenerationAttemptsPerDate: z.number().int().min(0).max(2)
  }),
  stet: z.object({
    maximumRewriteAttempts: z.literal(1),
    minimumScore: z.number().int().min(0).max(50)
  }),
  // Kept after the localization stage retired: the one remaining review holds the stricter of
  // stet.minimumScore and this, so collapsing two gates into one cannot lower the bar.
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
