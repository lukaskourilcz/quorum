import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "../types.js";
import { fetchJson, makeItem } from "./util.js";

interface GnewsResponse {
  articles?: Array<{
    title?: string;
    url?: string;
    description?: string;
    publishedAt?: string;
    source?: { name?: string };
  }>;
}

export function projectGnews(
  data: GnewsResponse,
  source: SourceConfig,
  now: Date
): SourceItem[] {
  return (data.articles ?? []).flatMap((article) => {
    if (!article.url) return [];
    const item = makeItem(
      article.url,
      {
        title: article.title,
        summary: article.description,
        publishedAt: article.publishedAt,
        author: article.source?.name
      },
      source,
      now
    );
    return item ? [item] : [];
  });
}

export async function fetchGnews(
  source: SourceConfig,
  context: SourceFetchContext
): Promise<SourceItem[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const url = new URL(source.url);
  url.searchParams.set("q", source.query ?? "artificial intelligence");
  url.searchParams.set("lang", "en");
  url.searchParams.set("max", String(Math.min(source.maxItems, 10)));
  url.searchParams.set("apikey", key);
  return projectGnews(
    await fetchJson<GnewsResponse>(url.toString(), context),
    source,
    context.now
  );
}
