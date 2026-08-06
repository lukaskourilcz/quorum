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
import {
  copyReviewFindings,
  qualityFindings,
  UNRESOLVED_REVIEW_NOTICE
} from "./publication-gate.js";
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
import { heroAltCs } from "../images/alt.js";
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
  /** This week's rising AI topics, if a scout snapshot exists. A tiebreaker for curation only. */
  trending?: readonly { topic: string; engagementPerHour: number; weekOverWeekDelta: number | null }[];
}

export interface EditionProductionResult {
  package: EditionPackage;
  report: EditionRunReport;
}

/**
 * The recent editions that actually carried topics.
 *
 * A day with no edition still gets a delivery receipt, and that receipt records `tags: []`
 * (`delivery/outbox.ts`). An empty list is the absence of a day, not evidence that the day's
 * topics differed from today's, so it is dropped here before anything counts the window. Left
 * in, empty days satisfied the warm-up — three no-edition days made the sample look full — and
 * stood in the window as though they had been editions.
 */
function publishedEditionTags(
  recent: readonly (readonly string[])[]
): readonly (readonly string[])[] {
  return recent.filter((tags) => tags.length > 0);
}

/**
 * How much of today's topic set recent editions have already carried — or 0 while the window is
 * too short for that question to have an answer.
 *
 * The score is (article tags some recent edition already carried) / (article tags). Over t tags
 * it can only land on k/t for whole k, and the gate fires on `> maximumRepeatedTopicFrequency`,
 * so the shipped 0.5 means exactly "more than half the topic set is a rerun": t = 2 needs both
 * tags, t = 3 needs 2 of 3 (0.67), t = 4 needs 3 (0.75), t = 5 needs 3 (0.6), t = 6 needs 4
 * (0.67). One shared tag scores 1/t, which is at most 1/2 across every set the writer contract
 * lets hold more than one tag, so a single recurring tag can never be a violation — `ai` on the
 * list every day is what an AI magazine looks like, while the same six tags in the same order
 * is a repeat. A one-tag article is the edge the arithmetic cannot soften: there the one tag is
 * the whole topic set and 1/1 = 1.00 is a total rerun, which is the measure working rather than
 * the old fault returning.
 *
 * The old score divided by the window instead of by the tag set: today's most-repeated tag over
 * n priors scored 2/(n+1) on a single recurrence, so one shared tag out of six read as a total
 * repeat, and the gate banned recurrence rather than measuring it.
 *
 * The metric keeps the name `repeatedTopicFrequency` and the violation code
 * `maximum_repeated_topic_frequency` so committed run records under `state/edition/runs/` and
 * the inbox items that cite the code still read against the same gate.
 *
 * A 0 returned during warm-up means unmeasured, not measured-zero; produceEdition warns so the
 * run report says which of the two it was.
 */
function repeatedTopicShare(
  tags: readonly string[],
  published: readonly (readonly string[])[],
  warmupEditions: number
): number {
  if (tags.length === 0 || published.length < warmupEditions) return 0;
  const carried = tags.filter((tag) =>
    published.some((issueTags) => issueTags.includes(tag))
  ).length;
  return carried / tags.length;
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
    repeatedTopicFrequency: repeatedTopicShare(
      article.tags,
      publishedEditionTags(input.recentEditionTags),
      input.config.quality.repeatedTopicWarmupEditions
    ),
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

/**
 * The Czech sentence published under "Proč právě tento příběh".
 *
 * It used to be an English template rendered under a Czech heading on every live edition —
 * the only English left on a page a Czech reader reads. The writer now produces it in the
 * same call that produces the article, for about a tenth of a cent, so it is the desk's own
 * sentence about its own story. The two fallbacks below are Czech, and are what a run gets
 * when the model omits the field or when a caller supplies its own line.
 */
function articleRationale(article: CzechArticle, fallback: string): string {
  if (article.whyThisStory) return article.whyThisStory.slice(0, 280);
  if (fallback) return fallback;
  return `${article.cs.title} vede dnešní vydání, protože doložené zdroje prošly kontrolou rozmanitosti zdrojů, nejistoty i jazyka.`.slice(0, 280);
}

export async function produceEdition(
  input: EditionProductionInput
): Promise<EditionProductionResult> {
  const reporter =
    input.reporter ?? new EditionRunReporter(input.date, input.mode);
  // While the sample is under the warm-up, `repeatedTopicShare` reports 0 because the share is
  // not measurable yet, not because no topic repeated. Record which of the two this run is, so
  // nobody reads the zero in the metrics block as a measurement. The count is of editions that
  // published topics, the same list the score is measured against, so a run of no-edition days
  // says the sample is thin instead of hiding behind a full-looking window.
  const publishedRecent = publishedEditionTags(input.recentEditionTags);
  if (publishedRecent.length < input.config.quality.repeatedTopicWarmupEditions) {
    reporter.warn(
      `repeated_topic_warmup:${publishedRecent.length}/${input.config.quality.repeatedTopicWarmupEditions}`
    );
  }
  let brief: CuratedBrief;
  try {
    brief = await reporter.stage("curate", () =>
      curate(input.items, input.date, input.config, input.gateway, input.sources, input.trending)
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
      // The report carries the gate that stopped the run, whichever pass caught it — and, since
      // the switch in publication-gate.ts, the gate that merely spoke up as well.
      reporter.quality = { metrics: draftMetrics, result: draftQuality };
      draftQuality.violations.forEach((violation) => reporter.warn(`quality:${violation}`));
      const draftFindings = qualityFindings(draftQuality.violations);
      if (draftFindings.blocking.length > 0) {
        // Only the blocking codes. `lastQualityViolations` names the run's no-edition reason,
        // and a waived finding did not stop anything.
        lastQualityViolations = draftFindings.blocking;
        if (attempt >= input.config.budgets.maximumRegenerationAttemptsPerDate) {
          return noEdition(input, reporter, `quality_block:${draftFindings.blocking.join(",")}`);
        }
        reporter.regenerationAttempts += 1;
        // Only the blocking codes are worth a paid rewrite. Asking the desk to rewrite an
        // article over a waived finding spends the regeneration budget on a verdict that is
        // not going to stop the article anyway.
        feedback = draftFindings.blocking.map(
          (violation) => `Quality gate ${violation} must pass without inventing facts or sources.`
        );
        continue;
      }
      // Waived findings only. They are on the record; the final gate below records them again
      // against the metrics that actually ship, and the package carries them to the reader.
    }

    const rationale = articleRationale(
      english,
      input.deriveWhyThisStory ? "" : input.whyThisStory
    );
    const stet = await reporter.stage(`stet_${attempt}`, () =>
      reviewCzechArticle(english, rationale, input.config)
    );
    reporter.stet = stet;
    const copyFindings = copyReviewFindings(stet);
    if (!stet.passed) {
      // Counted whether or not it blocks. `stetBlocks` is the numerator of the copy-review KPIs
      // in metrics/quarterly-collector.ts, and those measure how often the review failed; a
      // review that failed and was published anyway is still a review that failed, and zeroing
      // it here would report a clean register the desk never wrote.
      reporter.stetBlocks += 1;
      stet.violations.forEach((violation) => reporter.warn(`stet:${violation.code}`));
      if (copyFindings.blocking.length > 0) {
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
    const finalFindings = qualityFindings(quality.violations);
    if (finalFindings.blocking.length === 0) {
      // Everything the reviews found and nobody resolved, named so the owner reading the run
      // file or the package knows exactly what shipped over which verdict.
      const unresolved = [
        ...finalFindings.waived.map((code) => `quality:${code}`),
        ...copyFindings.waived.map((code) => `stet:${code}`)
      ];
      const unresolvedReview = unresolved.length === 0
        ? undefined
        : { notice: UNRESOLVED_REVIEW_NOTICE, findings: unresolved };
      if (unresolvedReview) {
        reporter.unresolvedReview = unresolvedReview;
        reporter.warn(`shipped_with_unresolved_review:${unresolved.join(",")}`);
      }
      const editionPackage = await reporter.stage("assemble_package", async () => {
        const candidate = article.selectedImageCandidateIndex === undefined
          ? undefined
          : input.imageCandidates?.[article.selectedImageCandidateIndex];
        let image;
        if (candidate) {
          try {
            // The archive's own description of the photograph first, the writer's second.
            //
            // The writer produces its alt before any photograph is chosen: it is describing an
            // illustration it imagined, and attaching it to a real photograph tells a screen
            // reader about a picture that is not on the page. The 2026-08-06 edition described a
            // schematic that does not exist over a real Flickr photograph. heroAltCs is the same
            // rule the MMA desk already applies, and for an illustrative candidate the writer's
            // text is not merely deprioritised but unreachable.
            image = await materializeLicensedPhoto({
              candidate,
              venture: "caught-up",
              slug: article.slug,
              ...(article.byLocale.en ? { altEn: article.byLocale.en.illustrationAlt } : {}),
              altCs: heroAltCs(candidate, article.byLocale.cs.illustrationAlt, article.byLocale.cs.title)
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
          ...(image ? { image } : {}),
          ...(unresolvedReview ? { unresolvedReview } : {})
        });
      });
      EditionPackageSchema.parse(editionPackage);
      return {
        package: editionPackage,
        report: reporter.build("edition", editionPackage.status)
      };
    }
    lastQualityViolations = finalFindings.blocking;
    if (quality.action === "no_edition") break;
    reporter.regenerationAttempts += 1;
    feedback = finalFindings.blocking.map(
      (violation) => `Quality gate ${violation} must pass without inventing facts or sources.`
    );
  }
  return noEdition(
    input,
    reporter,
    `quality_block:${lastQualityViolations.join(",") || "unknown"}`
  );
}
