import { fetchSource } from "./adapters/index.js";
import { newestFirst } from "./adapters/util.js";
import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "./types.js";

export interface SourceScrapeResult {
  sourceId: string;
  status: "success" | "skipped" | "failed";
  candidateItems: number;
  durationMs: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface ScrapeRunResult {
  items: SourceItem[];
  sources: SourceScrapeResult[];
}

function skipReason(source: SourceConfig): string | null {
  if (!source.enabled) return "source disabled";
  if (source.credentialEnv && !process.env[source.credentialEnv]) {
    return `${source.credentialEnv} unavailable`;
  }
  return null;
}

export async function runScrapersDetailed(
  sources: readonly SourceConfig[],
  context: SourceFetchContext,
  concurrency = 6,
  fetcher: (
    source: SourceConfig,
    context: SourceFetchContext
  ) => Promise<SourceItem[]> = fetchSource
): Promise<ScrapeRunResult> {
  const queue = [...sources];
  const items: SourceItem[] = [];
  const results: SourceScrapeResult[] = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;
      const started = Date.now();
      const reason = skipReason(source);
      if (reason) {
        results.push({
          sourceId: source.id,
          status: "skipped",
          candidateItems: 0,
          durationMs: Date.now() - started,
          errorCode: null,
          errorMessage: reason
        });
        continue;
      }
      try {
        const kept = newestFirst(await fetcher(source, context)).slice(
          0,
          source.maxItems
        );
        items.push(...kept);
        results.push({
          sourceId: source.id,
          status: "success",
          candidateItems: kept.length,
          durationMs: Date.now() - started,
          errorCode: null,
          errorMessage: null
        });
      } catch (error) {
        results.push({
          sourceId: source.id,
          status: "failed",
          candidateItems: 0,
          durationMs: Date.now() - started,
          errorCode: error instanceof Error ? error.name : "unknown",
          errorMessage:
            error instanceof Error ? error.message.slice(0, 300) : "unknown error"
        });
      }
    }
  });
  await Promise.all(workers);

  const byUrl = new Map<string, SourceItem>();
  for (const item of items) {
    if (!byUrl.has(item.url)) byUrl.set(item.url, item);
  }
  return {
    items: [...byUrl.values()],
    sources: results.sort((left, right) => left.sourceId.localeCompare(right.sourceId))
  };
}
