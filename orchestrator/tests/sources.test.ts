import { describe, expect, it } from "vitest";
import { createDigest } from "../src/sources/digest.js";
import { normalizeHnStory } from "../src/sources/hn.js";
import { parseRss } from "../src/sources/rss.js";

describe("source normalization", () => {
  it("parses RSS and Atom-shaped evidence inputs offline", () => {
    const items = parseRss(
      `<?xml version="1.0"?><rss><channel><item>
        <title>Useful signal</title>
        <link>https://example.com/post</link>
        <guid>post-1</guid>
        <pubDate>Wed, 23 Jul 2026 08:00:00 GMT</pubDate>
        <description><![CDATA[<p>Summary</p>]]></description>
      </item></channel></rss>`,
      "fixture-rss",
      new Date("2026-07-23T09:00:00.000Z")
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.summary).toBe("Summary");
  });

  it("drops deleted HN records and deduplicates tracking URLs", () => {
    const now = new Date("2026-07-23T09:00:00.000Z");
    expect(
      normalizeHnStory(
        { id: 1, title: "Deleted", type: "story", deleted: true },
        "hn",
        now
      )
    ).toBeNull();
    const item = normalizeHnStory(
      {
        id: 2,
        title: "Signal",
        type: "story",
        url: "https://example.com/signal"
      },
      "hn",
      now
    )!;
    expect(
      createDigest([
        item,
        { ...item, externalId: "3", url: `${item.url}?utm_source=x` }
      ])
    ).toHaveLength(1);
  });
});
