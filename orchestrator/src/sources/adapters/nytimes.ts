import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "../types.js";
import { fetchJson, makeItem } from "./util.js";

interface NytimesResponse {
  response?: {
    docs?: Array<{
      _id?: string;
      web_url?: string;
      headline?: { main?: string };
      abstract?: string;
      snippet?: string;
      pub_date?: string;
      byline?: { original?: string };
    }>;
  };
}

export function projectNytimes(
  data: NytimesResponse,
  source: SourceConfig,
  now: Date
): SourceItem[] {
  return (data.response?.docs ?? []).flatMap((doc) => {
    if (!doc.web_url) return [];
    const item = makeItem(
      doc.web_url,
      {
        title: doc.headline?.main,
        summary: doc.abstract || doc.snippet,
        publishedAt: doc.pub_date,
        author: doc.byline?.original,
        externalId: doc._id
      },
      source,
      now
    );
    return item ? [item] : [];
  });
}

export async function fetchNytimes(
  source: SourceConfig,
  context: SourceFetchContext
): Promise<SourceItem[]> {
  const key = process.env.NYTIMES_API_KEY;
  if (!key) return [];
  const url = new URL(source.url);
  url.searchParams.set("q", source.query ?? "artificial intelligence");
  url.searchParams.set("sort", "newest");
  url.searchParams.set("api-key", key);
  return projectNytimes(
    await fetchJson<NytimesResponse>(url.toString(), context),
    source,
    context.now
  );
}
