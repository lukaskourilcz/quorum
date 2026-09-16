import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { configRoot } from "../paths.js";
import { QUALITY_METRIC_KEYS } from "./quality.js";

const UnitIntervalSchema = z.number().min(0).max(1);

/**
 * The rubric: the gate's violation codes written down as independently gradeable criteria.
 *
 * It carries no threshold of its own. `thresholdKey` is a dotted path into the same config object
 * the evaluator reads, so a criterion and the gate can never disagree about the number — the
 * mistake `orchestrator/src/portfolio/limits.ts` records, where a copied budget figure went on
 * being spent against after the decision behind it had been superseded.
 *
 * It also carries no grading logic. `evaluateEditionQuality` is the only implementation of these
 * rules and the regrade calls it; a rubric that re-derived the comparisons from `metrics` and
 * `thresholdKey` would be a second gate, and two gates over one decision disagree the first time
 * either moves.
 *
 * `version` is the shape and `revision` is the content. A criterion added, removed or reworded
 * bumps `revision`, which appears in every receipt, so a receipt says which rubric graded it.
 */
export const EditionRubricCriterionSchema = z.object({
  /** The violation code `evaluateEditionQuality` pushes. A test keeps the two lists equal. */
  code: z.string().regex(/^[a-z][a-z0-9_]*$/u).max(60),
  category: z.enum(["evidence", "independence", "originality", "cost"]),
  /** Which recorded metrics decide this criterion. */
  metrics: z.array(z.enum(QUALITY_METRIC_KEYS)).min(1).max(3),
  /** A dotted path in this config, or null for a criterion that reads no threshold. */
  thresholdKey: z.string().regex(/^[a-z][A-Za-z]*\.[a-z][A-Za-z]*$/u).max(80).nullable(),
  /** What passing this criterion asserts about the edition, in one sentence. */
  asserts: z.string().min(20).max(300)
});

export type EditionRubricCriterion = z.infer<typeof EditionRubricCriterionSchema>;

export const EditionRubricSchema = z.object({
  version: z.literal("edition-rubric/1"),
  revision: z.number().int().positive(),
  criteria: z.array(EditionRubricCriterionSchema).min(1).max(40)
});

export type EditionRubric = z.infer<typeof EditionRubricSchema>;

/**
 * The config groups a rubric criterion may point into.
 *
 * Structural rather than `EditionQualityConfig`, so the schema's own `superRefine` and every
 * later caller resolve a `thresholdKey` through this one function. Two resolvers would be two
 * answers about whether a criterion's threshold exists.
 */
export interface RubricThresholdSource {
  quality: Record<string, unknown>;
  budgets: Record<string, unknown>;
  article: Record<string, unknown>;
  stet: Record<string, unknown>;
  hacek: Record<string, unknown>;
}

/** The value a rubric `thresholdKey` names, or undefined when it names nothing. */
export function rubricThreshold(
  source: RubricThresholdSource,
  key: string
): number | boolean | undefined {
  const [group, field] = key.split(".");
  const value = group && group in source
    ? source[group as keyof RubricThresholdSource][field ?? ""]
    : undefined;
  return typeof value === "number" || typeof value === "boolean" ? value : undefined;
}

export const EditionQualityConfigSchema = z.object({
  schemaVersion: z.literal(1),
  // The venture id stays `caught-up`; the publication the reader sees is DNESKAi, and this is
  // the name the deterministic cover plate prints.
  brand: z.object({ name: z.literal("DNESKAi") }),
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
    maximumCurationCandidates: z.number().int().positive(),
    /**
     * Whether the write call is asked for the practical item at all.
     *
     * The whole path around it ships either way: the package schema accepts the block, the
     * delivery boundary checks it against the edition's own date and sources, and a package
     * that carries one is published. This switch decides only whether the desk is asked, which
     * is the one part of it that costs output tokens on a paid call. It is off until DNESKAi
     * renders the field, because paying for words no reader is shown is not a saving anywhere.
     */
    practicalItem: z.boolean()
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
  }),
  rubric: EditionRubricSchema
}).superRefine((config, ctx) => {
  const seen = new Set<string>();
  for (const [index, criterion] of config.rubric.criteria.entries()) {
    if (seen.has(criterion.code)) {
      ctx.addIssue({
        code: "custom",
        path: ["rubric", "criteria", index, "code"],
        message: `${criterion.code} appears twice; a criterion graded twice is two grades for one code.`
      });
    }
    seen.add(criterion.code);
    if (criterion.thresholdKey === null) continue;
    // Checked at load, not at grade time. A criterion pointing at a threshold that does not
    // exist would silently grade against `undefined` and read as met on every edition.
    if (rubricThreshold(config, criterion.thresholdKey) === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["rubric", "criteria", index, "thresholdKey"],
        message: `${criterion.thresholdKey} resolves to no threshold in this config.`
      });
    }
  }
});

export type EditionQualityConfig = z.infer<typeof EditionQualityConfigSchema>;

export async function loadEditionQualityConfig(
  file = path.join(configRoot, "edition-quality.json")
): Promise<EditionQualityConfig> {
  return EditionQualityConfigSchema.parse(JSON.parse(await readFile(file, "utf8")));
}
