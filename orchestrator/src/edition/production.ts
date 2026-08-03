import { EditionPackageSchema, type EditionPackage } from "../contracts/edition-package.js";
import type { SourceScrapeResult } from "../sources/run.js";
import type { SourceConfig, SourceItem } from "../sources/types.js";
import { curate, CurationGateError } from "./curate.js";
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
  reviewCzechArticle,
  stetFeedback,
  type StetReview
} from "./stet.js";
import type {
  CuratedBrief,
  CzechArticle,
  EditionModelGateway,
  WrittenArticle
} from "./types.js";
import type { LicensedPhotoCandidate } from "../images/licensed.js";
import { materializeLicensedPhoto } from "../images/licensed.js";
import { InvalidArticleError, write } from "./write.js";
import { InvalidModelOutputError } from "./models.js";
import { BudgetError } from "../budget.js";

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
  imageCandidates?: readonly LicensedPhotoCandidate[];
  /** How a picked article's text is fetched. Injected by tests so none reaches the network. */
  readBody?: (url: string, at: Date) => Promise<string | null>;
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
    // Same cut as curate: relevance is only fair over the candidates the editor saw.
    primarySourceRelevant: input.items
      .slice(0, input.config.article.maximumCurationCandidates)
      .some((item) => item.tags.includes("primary-source")),
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

function articleRationale(article: CzechArticle, fallback: string): string {
  if (!fallback) {
    return `${article.cs.title} led today's digest because its cited evidence cleared the source-diversity, uncertainty and copy gates.`.slice(0, 280);
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
      curate(input.items, input.date, input.config, input.gateway, input.sources)
    );
  } catch (error) {
    if (error instanceof CurationGateError) {
      // The curation call happened and cost money even though the pick list failed. Record
      // it, or the ledger under-reports and the day's digest shows a cheaper failure than
      // the one that occurred. Name the violations so the record says what to fix.
      reporter.addUsage(error.usage as Parameters<typeof reporter.addUsage>[0]);
      for (const violation of error.violations) reporter.warn(`quality:${violation}`);
      reporter.warn(`curation_gate_failed_before_write:${error.violations.join(",")}`);
      return noEdition(input, reporter, "curation_gate_failed");
    }
    // Same reason: only CurationGateError carried its usage, so a curation call that was
    // billed and then failed to parse vanished from the ledger entirely.
    if (error instanceof InvalidModelOutputError) reporter.addUsage(error.usage);
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
    let english: CzechArticle;
    try {
      english = await reporter.stage(attempt === 0 ? "write" : `rewrite_${attempt}`, () =>
        write(brief, input.items, input.config, input.gateway, feedback, input.imageCandidates, input.now, input.readBody)
      );
      english.usage.forEach((usage) => reporter.addUsage(usage));
    } catch (error) {
      // A refused reservation is not a bad article. It was reported as
      // content_invalid_after_regeneration, and the remaining attempts were then spent on
      // calls the budget refuses instantly — each recorded with durationMs 0 — while the
      // budget error text was fed back to the writer as though it were editorial feedback.
      if (error instanceof BudgetError) {
        reporter.warn(`budget_stop:${error.code}`);
        return noEdition(input, reporter, "budget_exhausted");
      }
      if (error instanceof InvalidArticleError || error instanceof InvalidModelOutputError) {
        reporter.addUsage(error.usage);
      }
      const reason = error instanceof Error ? error.message : "unknown";
      reporter.warn(`content_invalid:${reason}`);
      if (attempt >= input.config.budgets.maximumRegenerationAttemptsPerDate) {
        return noEdition(input, reporter, "content_invalid_after_regeneration");
      }
      reporter.regenerationAttempts += 1;
      // Without the specific rejection, a rewrite is a verbatim replay of the attempt that
      // just failed and reproduces the same violation until the budget is spent. This text
      // is our own validator describing our own schema, not external content, so it does
      // not cross the untrusted-data boundary. Bound it so one pathological error cannot
      // dominate the rewrite prompt.
      const diagnosis = reason.replace(/\s+/gu, " ").trim().slice(0, 400);
      feedback = [
        `Your previous attempt was rejected: ${diagnosis}`,
        "Correct exactly that rejection. Keep everything else that already passed unchanged.",
        "Return a complete schema-valid article using only supplied source URLs."
      ];
      continue;
    }

    // Judge what the English draft already settles before paying to localize it. Every metric
    // the quality gate reads comes from the article's sources and tags, both fixed by the
    // time write() returns, and one full pass costs about $0.22 of a $0.35 per-edition cap
    // while a rewrite reserves $0.14 — so a violation discovered after the Czech desk had
    // been paid was terminal, and the two configured regenerations could never run. The
    // thresholds are untouched; this only fails earlier, and it can never pass anything the
    // final gate would reject.
    const draftMetrics = qualityMetrics(
      { ...english, byLocale: { cs: english.cs } },
      input,
      reporter.totalCostUsd()
    );
    const draftQuality = evaluateEditionQuality(draftMetrics, input.config, attempt);
    if (!draftQuality.passed) {
      // The report carries the gate that stopped the run, whichever pass caught it.
      reporter.quality = { metrics: draftMetrics, result: draftQuality };
      draftQuality.violations.forEach((violation) => reporter.warn(`quality:${violation}`));
      lastQualityViolations = draftQuality.violations;
      if (attempt >= input.config.budgets.maximumRegenerationAttemptsPerDate) {
        return noEdition(input, reporter, `quality_block:${draftQuality.violations.join(",")}`);
      }
      reporter.regenerationAttempts += 1;
      feedback = draftQuality.violations.map(
        (violation) => `Quality gate ${violation} must pass without inventing facts or sources.`
      );
      continue;
    }

    const rationale = articleRationale(
      english,
      input.deriveWhyThisStory ? "" : input.whyThisStory
    );
    const stet = await reporter.stage(`stet_${attempt}`, () =>
      reviewCzechArticle(english, rationale, input.config)
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

    // The article is what the desk wrote. Nothing adapts it afterwards, so there is no second
    // telling to review, no parity to check between two tellings, and no second model call.
    const article: WrittenArticle = { ...english, byLocale: { cs: english.cs } };

    const metrics = qualityMetrics(article, input, reporter.totalCostUsd());
    const quality = await reporter.stage(`quality_${attempt}`, () =>
      evaluateEditionQuality(metrics, input.config, attempt)
    );
    reporter.quality = { metrics, result: quality };
    quality.violations.forEach((violation) => reporter.warn(`quality:${violation}`));
    if (quality.passed) {
      const editionPackage = await reporter.stage("assemble_package", async () => {
        const candidate = article.selectedImageCandidateIndex === undefined
          ? undefined
          : input.imageCandidates?.[article.selectedImageCandidateIndex];
        let image;
        if (candidate) {
          try {
            image = await materializeLicensedPhoto({
              candidate,
              venture: "caught-up",
              slug: article.slug,
              ...(article.byLocale.en ? { altEn: article.byLocale.en.illustrationAlt } : {}),
              altCs: article.byLocale.cs.illustrationAlt
            });
          } catch (error) {
            reporter.warn(`licensed_image_fallback:${error instanceof Error ? error.message : "unknown"}`);
          }
        }
        return buildEditionPackage(article, input.config, {
          meetingRef: input.meetingRef,
          roomUrl: input.roomUrl,
          whyThisStory: rationale,
          generatedAt: input.now,
          sourceCandidates: input.items.length,
          signalStrength: metrics.signalStrength,
          costUsd: reporter.totalCostUsd(),
          socialPackEnabled: input.socialPackEnabled,
          ...(image ? { image } : {})
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
