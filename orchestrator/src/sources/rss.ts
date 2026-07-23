import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "../security/url.js";
import { SourceItemSchema, type SourceItem } from "./types.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true
});

function list<T>(value: T | T[] | undefined): T[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function text(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object" && "#text" in value) {
    return text((value as { "#text": unknown })["#text"]);
  }
  return "";
}

function link(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    return text(candidate["@_href"] ?? candidate["#text"]);
  }
  return "";
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stripMarkup(value: string): string {
  return value
    .replaceAll(/<script[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export function parseRss(
  xml: string,
  sourceId: string,
  fetchedAt = new Date(),
  maxItems = 20
): SourceItem[] {
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as { channel?: Record<string, unknown> } | undefined;
  const feed = document.feed as Record<string, unknown> | undefined;
  const rawItems = rss?.channel
    ? list(rss.channel.item)
    : feed
      ? list(feed.entry)
      : [];
  return rawItems.slice(0, maxItems).flatMap((raw) => {
    if (!raw || typeof raw !== "object") {
      return [];
    }
    const item = raw as Record<string, unknown>;
    const url = link(item.link) || text(item.guid) || text(item.id);
    const title = stripMarkup(text(item.title));
    if (!url || !title) {
      return [];
    }
    const externalId =
      text(item.guid ?? item.id) ||
      createHash("sha256").update(url).digest("hex").slice(0, 20);
    return [
      SourceItemSchema.parse({
        sourceId,
        externalId,
        title,
        url,
        publishedAt: isoDate(
          item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]
        ),
        author: text(item.author ?? item.creator ?? item["dc:creator"]) || null,
        summary: stripMarkup(
          text(item.description ?? item.summary ?? item.content)
        ).slice(0, 2_000),
        fetchedAt: fetchedAt.toISOString()
      })
    ];
  });
}

export async function fetchRss(
  sourceId: string,
  url: string,
  maxItems: number,
  allowHosts: readonly string[],
  now = new Date()
): Promise<SourceItem[]> {
  const response = await safeFetch(url, { allowHosts });
  return parseRss(
    new TextDecoder().decode(response.body),
    sourceId,
    now,
    maxItems
  );
}
