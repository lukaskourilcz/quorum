import { fetchArxiv } from "./arxiv.js";
import { fetchBluesky } from "./bluesky.js";
import { fetchGithub } from "./github.js";
import { fetchHn } from "./hn.js";
import { fetchHtml } from "./html.js";
import { fetchRss } from "./rss.js";
import { fetchSpaceflight } from "./spaceflight.js";
import { fetchStackExchange } from "./stackexchange.js";
import type {
  SourceConfig,
  SourceFetchContext,
  SourceItem
} from "../types.js";

export async function fetchSource(
  source: SourceConfig,
  context: SourceFetchContext
): Promise<SourceItem[]> {
  switch (source.kind) {
    case "arxiv":
      return fetchArxiv(source, context);
    case "bluesky":
      return fetchBluesky(source, context);
    case "github":
      return fetchGithub(source, context);
    case "hn":
      return fetchHn(source, context);
    case "html":
      return fetchHtml(source, context);
    case "rss":
      return fetchRss(source, context);
    case "spaceflight":
      return fetchSpaceflight(source, context);
    case "stackexchange":
      return fetchStackExchange(source, context);
  }
}
