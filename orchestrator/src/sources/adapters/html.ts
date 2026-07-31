import * as cheerio from "cheerio";
import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "../types.js";
import { fetchReadable, linksFromMarkdown } from "./reader.js";
import { fetchText, makeItem } from "./util.js";

export function projectHtml(
  html: string,
  source: SourceConfig,
  now: Date
): SourceItem[] {
  const $ = cheerio.load(html);
  const items: SourceItem[] = [];
  $("article a[href]").each((_, element) => {
    const href = $(element).attr("href");
    const title = $(element).text().trim();
    if (!href || title.length < 8) return;
    const article = $(element).closest("article");
    let url: string;
    try {
      url = new URL(href, source.url).toString();
    } catch {
      return;
    }
    const item = makeItem(
      url,
      {
        title,
        summary: article.text(),
        publishedAt: article.find("time[datetime]").first().attr("datetime")
      },
      source,
      now
    );
    if (item) items.push(item);
  });
  return items;
}

export async function fetchHtml(
  source: SourceConfig,
  context: SourceFetchContext
): Promise<SourceItem[]> {
  let items: SourceItem[] = [];
  try {
    items = projectHtml(
      await fetchText(source.url, context, {
        headers: { "user-agent": "boardlessai-source-shadow/0.1" }
      }),
      source,
      context.now
    );
  } catch {
    // Reader fallback below isolates a blocked or script-rendered publisher.
  }
  if (items.length > 0) return items;

  const markdown = await fetchReadable(source.url, context);
  if (!markdown) return [];
  return linksFromMarkdown(markdown, source.maxItems).flatMap(({ title, url }) => {
    const item = makeItem(url, { title }, source, context.now);
    return item ? [item] : [];
  });
}
