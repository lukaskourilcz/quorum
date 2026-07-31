import type { SourceFetchContext } from "../types.js";
import { fetchJson, fetchText } from "./util.js";

export async function fetchReadable(
  url: string,
  context: SourceFetchContext
): Promise<string | null> {
  try {
    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    if (firecrawlKey) {
      const data = await fetchJson<{ data?: { markdown?: string } }>(
        "https://api.firecrawl.dev/v1/scrape",
        context,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${firecrawlKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
          timeoutMs: 20_000
        }
      );
      if (data.data?.markdown?.trim()) return data.data.markdown;
    }
  } catch {
    // Fall through to the keyless Jina reader.
  }

  try {
    const headers: Record<string, string> = {
      "user-agent": "boardlessai-source-shadow/0.1",
      "x-return-format": "markdown"
    };
    if (process.env.JINA_API_KEY) {
      headers.authorization = `Bearer ${process.env.JINA_API_KEY}`;
    }
    const text = await fetchText(`https://r.jina.ai/${url}`, context, {
      headers,
      timeoutMs: 20_000
    });
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

export function linksFromMarkdown(
  markdown: string,
  max = 25
): Array<{ title: string; url: string }> {
  const pattern = /\[([^\]]{8,})\]\((https:\/\/[^)\s]+)\)/g;
  const seen = new Set<string>();
  const links: Array<{ title: string; url: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(markdown)) && links.length < max) {
    const title = match[1]?.replace(/\s+/g, " ").trim();
    const url = match[2];
    if (!title || !url || seen.has(url)) continue;
    seen.add(url);
    links.push({ title, url });
  }
  return links;
}
