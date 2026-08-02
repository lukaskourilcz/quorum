import type { EditionQualityConfig } from "./config.js";
import type { SourceConfig } from "../sources/types.js";

export interface QualityMetrics {
  successfulSources: number;
  candidateItems: number;
  citedSources: number;
  signalStrength: number;
  maximumSingleSourceShare: number;
  sourceDiversity: number;
  duplicateStorySimilarity: number;
  repeatedTopicFrequency: number;
  primarySourceRelevant: boolean;
  primarySourcePresent: boolean;
  unsupportedWatchlistItems: number;
  costPerRun: number | undefined;
}

export interface QualityResult {
  passed: boolean;
  enforced: true;
  violations: string[];
  action: "publish" | "regenerate" | "no_edition";
}

export function evaluateEditionQuality(
  metrics: QualityMetrics,
  config: EditionQualityConfig,
  regenerationAttempt: number
): QualityResult {
  const violations: string[] = [];
  if (metrics.successfulSources < config.quality.minimumSuccessfulSources) {
    violations.push("minimum_successful_sources");
  }
  if (metrics.candidateItems < config.quality.minimumCandidateItems) {
    violations.push("minimum_candidate_items");
  }
  if (metrics.citedSources < config.quality.minimumCitedSources) {
    violations.push("minimum_cited_sources");
  }
  if (metrics.signalStrength < config.quality.minimumSignalStrength) {
    violations.push("minimum_signal_strength");
  }
  if (metrics.maximumSingleSourceShare > config.quality.maximumSingleSourceShare) {
    violations.push("maximum_single_source_share");
  }
  if (metrics.sourceDiversity < config.quality.minimumSourceDiversity) {
    violations.push("minimum_source_diversity");
  }
  if (metrics.duplicateStorySimilarity > config.quality.maximumDuplicateStorySimilarity) {
    violations.push("maximum_duplicate_story_similarity");
  }
  if (metrics.repeatedTopicFrequency > config.quality.maximumRepeatedTopicFrequency) {
    violations.push("maximum_repeated_topic_frequency");
  }
  if (
    config.quality.requirePrimarySourceWhenRelevant &&
    metrics.primarySourceRelevant &&
    !metrics.primarySourcePresent
  ) {
    violations.push("primary_source_required");
  }
  if (
    metrics.unsupportedWatchlistItems >
    config.quality.maximumUnsupportedWatchlistItems
  ) {
    violations.push("maximum_unsupported_watchlist_items");
  }
  if (metrics.costPerRun === undefined) {
    violations.push("hard_cost_unavailable");
  } else {
    if (metrics.costPerRun > config.budgets.editionProductionUsd) {
      violations.push("edition_production_budget");
    }
    if (metrics.costPerRun > config.budgets.warningCostPerRun) {
      violations.push("warning_cost_per_run");
    }
    if (metrics.costPerRun > config.budgets.hardCostPerRun) {
      violations.push("hard_cost_per_run");
    }
  }
  return {
    passed: violations.length === 0,
    enforced: true,
    violations,
    action:
      violations.length === 0
        ? "publish"
        : regenerationAttempt < config.budgets.maximumRegenerationAttemptsPerDate
          ? "regenerate"
          : "no_edition"
  };
}

function words(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase("en")
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

export function titleSimilarity(left: string, right: string): number {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / new Set([...a, ...b]).size;
}

/**
 * The quality violations a pick list alone decides, checkable before anything is written.
 *
 * Six of the edition gates are fixed entirely by which items the editor picked, but they
 * were only evaluated after the English write and the Czech translation had both been
 * billed. The first live run failed `primary_source_required` that way: $0.2226 spent,
 * no edition, and no rewrite of an article can repair a pick list. Running the same rules
 * against the picks costs nothing and fails at the price of one curation call.
 *
 * Deliberately partial. `repeatedTopicFrequency` needs the finished article's tags and
 * `unsupportedWatchlistItems` needs its wire list, so those stay where they are. This
 * never returns a violation the full gate would not also return.
 */
export function curationOwnedViolations(input: {
  picked: readonly { sourceId: string; title: string; isPrimarySource: boolean }[];
  anyCandidateIsPrimarySource: boolean;
  registry: Parameters<typeof computeSignalStrength>[0]["registry"];
  config: {
    quality: {
      minimumSignalStrength: number;
      maximumSingleSourceShare: number;
      minimumSourceDiversity: number;
      maximumDuplicateStorySimilarity: number;
      requirePrimarySourceWhenRelevant: boolean;
    };
  };
}): string[] {
  const violations: string[] = [];
  const sourceIds = input.picked.map((item) => item.sourceId);
  if (sourceIds.length === 0) return ["minimum_source_diversity"];

  const contribution = new Map<string, number>();
  for (const id of sourceIds) contribution.set(id, (contribution.get(id) ?? 0) + 1);

  if (computeSignalStrength({ cited: sourceIds.map((sourceId) => ({ sourceId })), registry: input.registry })
      < input.config.quality.minimumSignalStrength) {
    violations.push("minimum_signal_strength");
  }
  if (Math.max(...contribution.values()) / sourceIds.length > input.config.quality.maximumSingleSourceShare) {
    violations.push("maximum_single_source_share");
  }
  if (sourceDiversity(sourceIds) < input.config.quality.minimumSourceDiversity) {
    violations.push("minimum_source_diversity");
  }
  if (maximumTitleSimilarity(input.picked.map((item) => item.title))
      > input.config.quality.maximumDuplicateStorySimilarity) {
    violations.push("maximum_duplicate_story_similarity");
  }
  if (input.config.quality.requirePrimarySourceWhenRelevant
      && input.anyCandidateIsPrimarySource
      && !input.picked.some((item) => item.isPrimarySource)) {
    violations.push("primary_source_required");
  }
  return violations;
}

export function maximumTitleSimilarity(titles: readonly string[]): number {
  let maximum = 0;
  for (let left = 0; left < titles.length; left += 1) {
    for (let right = left + 1; right < titles.length; right += 1) {
      maximum = Math.max(maximum, titleSimilarity(titles[left]!, titles[right]!));
    }
  }
  return maximum;
}

export function sourceDiversity(sourceIds: readonly string[]): number {
  if (sourceIds.length < 2) return sourceIds.length;
  const counts = new Map<string, number>();
  for (const id of sourceIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const concentration = [...counts.values()].reduce(
    (sum, count) => sum + (count / sourceIds.length) ** 2,
    0
  );
  return 1 - concentration;
}

export function computeSignalStrength(input: {
  cited: readonly { sourceId: string }[];
  registry: readonly Pick<SourceConfig, "id" | "weight">[];
}): number {
  if (input.cited.length === 0) return 0;
  const byId = new Map(input.registry.map((source) => [source.id, source]));
  const seen = new Set<string>();
  const weights: number[] = [];
  for (const citation of input.cited) {
    if (seen.has(citation.sourceId)) continue;
    seen.add(citation.sourceId);
    weights.push(byId.get(citation.sourceId)?.weight ?? 0.5);
  }
  const diversity = Math.min(100, seen.size * 22);
  const meanWeight =
    weights.length > 0
      ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length
      : 0;
  const quality = Math.min(100, meanWeight * 110);
  return Math.round((diversity + quality) / 2);
}
