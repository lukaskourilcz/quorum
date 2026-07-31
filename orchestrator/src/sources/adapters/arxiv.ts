import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "../types.js";
import { parseRssFeed } from "./rss.js";
import { fetchText } from "./util.js";

export async function fetchArxiv(
  source: SourceConfig,
  context: SourceFetchContext
): Promise<SourceItem[]> {
  const url = new URL(source.url);
  url.searchParams.set("search_query", source.query ?? "cat:cs.AI");
  url.searchParams.set("sortBy", "submittedDate");
  url.searchParams.set("sortOrder", "descending");
  url.searchParams.set("max_results", String(source.maxItems));
  return parseRssFeed(await fetchText(url.toString(), context), source, context.now);
}
