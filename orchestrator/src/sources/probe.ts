import type { SourceScrapeResult } from "./run.js";

export interface SourceProbeSummary {
  healthy: number;
  skipped: number;
  failed: number;
  itemCount: number;
  failures: Array<{ sourceId: string; errorCode: string | null }>;
}

export function summarizeSourceProbes(
  results: readonly SourceScrapeResult[]
): SourceProbeSummary {
  return {
    healthy: results.filter(({ status }) => status === "success").length,
    skipped: results.filter(({ status }) => status === "skipped").length,
    failed: results.filter(({ status }) => status === "failed").length,
    itemCount: results.reduce((sum, result) => sum + result.candidateItems, 0),
    failures: results
      .filter(({ status }) => status === "failed")
      .map(({ sourceId, errorCode }) => ({ sourceId, errorCode }))
  };
}
