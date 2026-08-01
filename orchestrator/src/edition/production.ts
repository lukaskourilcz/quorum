import { EditionPackageSchema, type EditionPackage } from "../contracts/edition-package.js";
import type { SourceScrapeResult } from "../sources/run.js";
import type { SourceConfig, SourceItem } from "../sources/types.js";
import { curate } from "./curate.js";
import type { EditionQualityConfig } from "./config.js";
import { buildEditionPackage, buildNoEditionPackage } from "./package.js";
import {
  computeSignalStrength,
  evaluateEditionQuality,
  maximumTitleSimilarity,
  sourceDiversity,
  type QualityMetrics
} from "./quality.js";
import { EditionRunReporter, type EditionRunReport } from "./report.js";
import {
  hacekFeedback,
  reviewCzechArticle,
  reviewEnglishArticle,
  stetFeedback,
  type StetReview
} from "./stet.js";
import type {
  CuratedBrief,
  EditionModelGateway,
  EnglishArticle,
  WrittenArticle
} from "./types.js";
import { InvalidArticleError, write } from "./write.js";
import { InvalidModelOutputError } from "./models.js";
import {
  localizeToCzech,
  parityFeedback,
  reviewTranslationParity
} from "./localize.js";
import { createHash } from "node:crypto";
import {
  ARTICLE_HERO_COMPOSER_VERSION,
  composeArticleHero
} from "../social/media/compose.js";

export interface EditionProductionInput {
  date: string;
  now: Date;
  items: readonly SourceItem[];
  sources: readonly SourceConfig[];
  sourceResults: readonly SourceScrapeResult[];
  recentEditionTags: readonly (readonly string[])[];
  meetingRef: string;
  roomUrl: string;
  whyThisStory: string;
  deriveWhyThisStory?: boolean;
  mode: "dry_run" | "production";
  config: EditionQualityConfig;
  gateway: EditionModelGateway;
  reporter?: EditionRunReporter;
  socialPackEnabled?: boolean;
  heroEnabled?: boolean;
}

export interface EditionProductionResult {
  package: EditionPackage;
  report: EditionRunReport;
}

function repeatedTopicFrequency(
  tags: readonly string[],
  recent: readonly (readonly string[])[]
): number {
  if (tags.length === 0 || recent.length === 0) return 0;
  return Math.max(
    ...tags.map(
      (tag) =>
        (recent.filter((issueTags) => issueTags.includes(tag)).length + 1) /
        (recent.length + 1)
    )
  );
}

function qualityMetrics(
  article: WrittenArticle,
  input: EditionProductionInput,
  costPerRun: number | undefined
): QualityMetrics {
  const sourceIds = article.sources.map((source) => source.source_id ?? source.id);
  const contribution = new Map<string, number>();
  for (const id of sourceIds) contribution.set(id, (contribution.get(id) ?? 0) + 1);
  const picked = new Set(article.sources.map((source) => source.url));
  const runnerUrls = new Set(
    input.items.filter((item) => !picked.has(item.url)).map((item) => item.url)
  );
  return {
    successfulSources: input.sourceResults.filter((source) => source.status === "success").length,
    candidateItems: input.items.length,
    citedSources: article.sources.length,
    signalStrength: computeSignalStrength({
      cited: sourceIds.map((sourceId) => ({ sourceId })),
      registry: input.sources
    }),
    maximumSingleSourceShare:
      sourceIds.length === 0
        ? 1
        : Math.max(...contribution.values()) / sourceIds.length,
    sourceDiversity: sourceDiversity(sourceIds),
    duplicateStorySimilarity: maximumTitleSimilarity(
      article.sources.map((source) => source.title)
    ),
    repeatedTopicFrequency: repeatedTopicFrequency(article.tags, input.recentEditionTags),
    primarySourceRelevant: input.items.some((item) => item.tags.includes("primary-source")),
    primarySourcePresent: article.sources.some(
      (source) => source.classification === "primary"
    ),
    unsupportedWatchlistItems: article.wire.filter((item) => !runnerUrls.has(item.url)).length,
    costPerRun
  };
}

function noEdition(
  input: EditionProductionInput,
  reporter: EditionRunReporter,
  reason: string
): EditionProductionResult {
  const editionPackage = buildNoEditionPackage({
    date: input.date,
    meetingRef: input.meetingRef,
    roomUrl: input.roomUrl,
    reason,
    config: input.config,
    ...(reporter.totalCostUsd() === undefined ? {} : { costUsd: reporter.totalCostUsd() })
  });
  return {
    package: editionPackage,
    report: reporter.build("no_edition", editionPackage.status)
  };
}

function articleRationale(article: EnglishArticle, fallback: string): string {
  if (!fallback) {
    return `${article.en.title} led today's digest because its cited evidence cleared the source-diversity, uncertainty and copy gates.`.slice(0, 280);
  }
  return fallback;
}

export async function produceEdition(
  input: EditionProductionInput
): Promise<EditionProductionResult> {
  const reporter =
    input.reporter ?? new EditionRunReporter(input.date, input.mode);
  let brief: CuratedBrief;
  try {
    brief = await reporter.stage("curate", () =>
      curate(input.items, input.date, input.config, input.gateway)
    );
  } catch (error) {
    reporter.warn(`curation_failed:${error instanceof Error ? error.message : "unknown"}`);
    return noEdition(input, reporter, "curation_failed");
  }
  reporter.addUsage(brief.usage);

  let feedback: string[] = [];
  let lastQualityViolations: string[] = [];
  for (
    let attempt = 0;
    attempt <= input.config.budgets.maximumRegenerationAttemptsPerDate;
    attempt += 1
  ) {
    let english: EnglishArticle;
    try {
      english = await reporter.stage(attempt === 0 ? "write" : `rewrite_${attempt}`, () =>
        write(brief, input.items, input.config, input.gateway, feedback)
      );
      english.usage.forEach((usage) => reporter.addUsage(usage));
    } catch (error) {
      if (error instanceof InvalidArticleError || error instanceof InvalidModelOutputError) {
        reporter.addUsage(error.usage);
      }
      reporter.warn(`content_invalid:${error instanceof Error ? error.message : "unknown"}`);
      if (attempt >= input.config.budgets.maximumRegenerationAttemptsPerDate) {
        return noEdition(input, reporter, "content_invalid_after_regeneration");
      }
      reporter.regenerationAttempts += 1;
      feedback = ["Return a complete schema-valid article using only supplied source URLs."];
      continue;
    }

    const rationale = articleRationale(
      english,
      input.deriveWhyThisStory ? "" : input.whyThisStory
    );
    const stet = await reporter.stage(`stet_${attempt}`, () =>
      reviewEnglishArticle(english, rationale, input.config)
    );
    reporter.stet = stet;
    if (!stet.passed) {
      reporter.stetBlocks += 1;
      stet.violations.forEach((violation) => reporter.warn(`stet:${violation.code}`));
      if (
        reporter.stetBlocks > input.config.stet.maximumRewriteAttempts ||
        attempt >= input.config.budgets.maximumRegenerationAttemptsPerDate
      ) {
        return noEdition(input, reporter, "stet_block_after_rewrite");
      }
      reporter.regenerationAttempts += 1;
      feedback = stetFeedback(stet);
      continue;
    }

    let article: WrittenArticle | null = null;
    let localizationFeedback: string[] = [];
    for (
      let localizationAttempt = 0;
      localizationAttempt <= input.config.hacek.maximumRewriteAttempts;
      localizationAttempt += 1
    ) {
      let localized: WrittenArticle;
      try {
        localized = await reporter.stage(
          localizationAttempt === 0 ? `hacek_${attempt}` : `hacek_${attempt}_rewrite`,
          () => localizeToCzech(
            english,
            input.config,
            input.gateway,
            localizationFeedback
          )
        );
        localized.usage.forEach((usage) => reporter.addUsage(usage));
      } catch (error) {
        reporter.warn(`hacek_invalid:${error instanceof Error ? error.message : "unknown"}`);
        reporter.hacekBlocks += 1;
        if (localizationAttempt >= input.config.hacek.maximumRewriteAttempts) {
          return noEdition(input, reporter, "hacek_invalid_after_rewrite");
        }
        localizationFeedback = [
          "Return a complete schema-valid Czech adaptation of every English field."
        ];
        continue;
      }

      const czech = await reporter.stage(
        `hacek_register_${attempt}_${localizationAttempt}`,
        () => reviewCzechArticle(localized, input.config)
      );
      const parity = await reporter.stage(
        `hacek_parity_${attempt}_${localizationAttempt}`,
        () => reviewTranslationParity(localized.byLocale.en, localized.byLocale.cs)
      );
      const parityViolations = parity.violations.map((violation) => ({
        code: violation.code,
        locale: "cs" as const,
        message: violation.message
      }));
      const hacek: StetReview = {
        passed: czech.passed && parity.passed,
        score: Math.max(0, czech.score - parityViolations.length * 5),
        violations: [...czech.violations, ...parityViolations]
      };
      reporter.hacek = hacek;
      if (!hacek.passed) {
        reporter.hacekBlocks += 1;
        hacek.violations.forEach((violation) =>
          reporter.warn(`hacek:${violation.code}`)
        );
        if (localizationAttempt >= input.config.hacek.maximumRewriteAttempts) {
          return noEdition(input, reporter, "hacek_block_after_rewrite");
        }
        localizationFeedback = [
          ...hacekFeedback(czech),
          ...parityFeedback(parity)
        ];
        continue;
      }
      article = localized;
      break;
    }
    if (!article) {
      return noEdition(input, reporter, "hacek_missing_adaptation");
    }

    const metrics = qualityMetrics(article, input, reporter.totalCostUsd());
    const quality = await reporter.stage(`quality_${attempt}`, () =>
      evaluateEditionQuality(metrics, input.config, attempt)
    );
    reporter.quality = { metrics, result: quality };
    quality.violations.forEach((violation) => reporter.warn(`quality:${violation}`));
    if (quality.passed) {
      const editionPackage = await reporter.stage("assemble_package", async () => {
        const heroInputs = JSON.stringify({
          composerVersion: ARTICLE_HERO_COMPOSER_VERSION,
          date: article.date,
          title: article.byLocale.en.title,
          dek: article.byLocale.en.dek
        });
        const heroBytes = input.heroEnabled === false
          ? null
          : await composeArticleHero({
              date: article.date,
              title: article.byLocale.en.title,
              dek: article.byLocale.en.dek
            });
        return buildEditionPackage(article, input.config, {
          meetingRef: input.meetingRef,
          roomUrl: input.roomUrl,
          whyThisStory: rationale,
          generatedAt: input.now,
          sourceCandidates: input.items.length,
          signalStrength: metrics.signalStrength,
          costUsd: reporter.totalCostUsd(),
          socialPackEnabled: input.socialPackEnabled,
          ...(heroBytes
            ? {
                hero: {
                  bytes: heroBytes,
                  alt: article.byLocale.en.illustrationAlt,
                  composerVersion: ARTICLE_HERO_COMPOSER_VERSION,
                  inputsHash: createHash("sha256").update(heroInputs).digest("hex")
                }
              }
            : {})
        });
      });
      EditionPackageSchema.parse(editionPackage);
      return {
        package: editionPackage,
        report: reporter.build("edition", editionPackage.status)
      };
    }
    lastQualityViolations = quality.violations;
    if (quality.action === "no_edition") break;
    reporter.regenerationAttempts += 1;
    feedback = quality.violations.map(
      (violation) => `Quality gate ${violation} must pass without inventing facts or sources.`
    );
  }
  return noEdition(
    input,
    reporter,
    `quality_block:${lastQualityViolations.join(",") || "unknown"}`
  );
}
