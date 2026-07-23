import { safeFetch } from "../security/url.js";
import { SourceItemSchema, type SourceItem } from "./types.js";

interface HnStory {
  id?: number;
  title?: string;
  url?: string;
  by?: string;
  time?: number;
  text?: string;
  type?: string;
  deleted?: boolean;
  dead?: boolean;
}

export function normalizeHnStory(
  story: HnStory,
  sourceId: string,
  fetchedAt: Date
): SourceItem | null {
  if (
    !story.id ||
    !story.title ||
    story.deleted ||
    story.dead ||
    story.type !== "story"
  ) {
    return null;
  }
  return SourceItemSchema.parse({
    sourceId,
    externalId: String(story.id),
    title: story.title,
    url: story.url ?? `https://news.ycombinator.com/item?id=${story.id}`,
    publishedAt: story.time
      ? new Date(story.time * 1_000).toISOString()
      : null,
    author: story.by ?? null,
    summary: (story.text ?? "").replaceAll(/<[^>]+>/g, " ").slice(0, 2_000),
    fetchedAt: fetchedAt.toISOString()
  });
}

export async function fetchHackerNews(
  sourceId: string,
  indexUrl: string,
  maxItems: number,
  allowHosts: readonly string[],
  now = new Date()
): Promise<SourceItem[]> {
  const index = await safeFetch(indexUrl, { allowHosts, maxBytes: 200_000 });
  const ids = (JSON.parse(new TextDecoder().decode(index.body)) as unknown[])
    .filter((value): value is number => Number.isInteger(value))
    .slice(0, maxItems);
  const stories = await Promise.all(
    ids.map(async (id) => {
      const response = await safeFetch(
        `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
        { allowHosts, maxBytes: 100_000 }
      );
      return normalizeHnStory(
        JSON.parse(new TextDecoder().decode(response.body)) as HnStory,
        sourceId,
        now
      );
    })
  );
  return stories.filter((item): item is SourceItem => item !== null);
}
