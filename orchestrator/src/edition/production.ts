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
import { reviewArticle, stetFeedback } from "./stet.js";
import type { CuratedBrief, EditionModelGateway, WrittenArticle } from "./types.js";
import { write } from "./write.js";

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
  mode: "dry_run" | "production";
  config: EditionQualityConfig;
  gateway: EditionModelGateway;
  reporter?: EditionRunReporter;
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
    let article: WrittenArticle;
    try {
      article = await reporter.stage(attempt === 0 ? "write" : `rewrite_${attempt}`, () =>
        write(brief, input.items, input.config, input.gateway, feedback)
      );
      article.usage.forEach((usage) => reporter.addUsage(usage));
    } catch (error) {
      reporter.warn(`content_invalid:${error instanceof Error ? error.message : "unknown"}`);
      if (attempt >= input.config.budgets.maximumRegenerationAttemptsPerDate) {
        return noEdition(input, reporter, "content_invalid_after_regeneration");
      }
      reporter.regenerationAttempts += 1;
      feedback = ["Return a complete schema-valid article using only supplied source URLs."];
      continue;
    }

    const stet = await reporter.stage(`stet_${attempt}`, () =>
      reviewArticle(article, input.whyThisStory, input.config)
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

    const metrics = qualityMetrics(article, input, reporter.totalCostUsd());
    const quality = await reporter.stage(`quality_${attempt}`, () =>
      evaluateEditionQuality(metrics, input.config, attempt)
    );
    reporter.quality = { metrics, result: quality };
    quality.violations.forEach((violation) => reporter.warn(`quality:${violation}`));
    if (quality.passed) {
      const editionPackage = await reporter.stage("assemble_package", () =>
        buildEditionPackage(article, input.config, {
          meetingRef: input.meetingRef,
          roomUrl: input.roomUrl,
          whyThisStory: input.whyThisStory,
          generatedAt: input.now,
          sourceCandidates: input.items.length,
          signalStrength: metrics.signalStrength,
          costUsd: reporter.totalCostUsd()
        })
      );
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
