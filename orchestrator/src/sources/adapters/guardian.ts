import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "../types.js";
import { fetchJson, makeItem } from "./util.js";

interface GuardianResponse {
  response?: {
    results?: Array<{
      id?: string;
      webTitle?: string;
      webUrl?: string;
      webPublicationDate?: string;
      fields?: { trailText?: string };
    }>;
  };
}

export function projectGuardian(
  data: GuardianResponse,
  source: SourceConfig,
  now: Date
): SourceItem[] {
  return (data.response?.results ?? []).flatMap((result) => {
    if (!result.webUrl) return [];
    const item = makeItem(
      result.webUrl,
      {
        title: result.webTitle,
        summary: result.fields?.trailText,
        publishedAt: result.webPublicationDate,
        externalId: result.id
      },
      source,
      now
    );
    return item ? [item] : [];
  });
}

export async function fetchGuardian(
  source: SourceConfig,
  context: SourceFetchContext
): Promise<SourceItem[]> {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return [];
  const url = new URL(source.url);
  url.searchParams.set("q", source.query ?? "artificial intelligence");
  url.searchParams.set("order-by", "newest");
  url.searchParams.set("show-fields", "trailText");
  url.searchParams.set("page-size", String(source.maxItems));
  url.searchParams.set("api-key", key);
  if (source.section) url.searchParams.set("section", source.section);
  return projectGuardian(
    await fetchJson<GuardianResponse>(url.toString(), context),
    source,
    context.now
  );
}
