import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/paths.js";
import {
  BoardlessStreamSchema,
  StreamSyncReceiptSchema,
} from "../src/contracts/boardless-stream.js";
import { BoardlessEventsSchema } from "../src/contracts/boardless-events.js";
import { KvorumSourceRegistrySchema } from "../src/contracts/kvorum-sources.js";
import { canonicalUrl, mergeStream, normalizeItem, publishedDate, streamItemId } from "../src/streams/normalize.js";
import { parseDuration, parseFeed, podcastIndexHeaders, syncStream } from "../src/streams/fetch.js";
import { loadStreamRegistry, registryHosts, sourcesFor } from "../src/streams/registry.js";
import type { StreamSourceEntry } from "../src/streams/registry.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(repoRoot, "contracts/fixtures", name), "utf8"));

const entry: StreamSourceEntry = {
  id: "interconnects",
  stream: "talked-about",
  kind: "substack",
  name: "Interconnects",
  feed: "https://www.interconnects.ai/feed",
  host: "www.interconnects.ai",
  enabled: true,
};

describe("the stream contracts", () => {
  it("accepts the golden files", () => {
    expect(BoardlessStreamSchema.safeParse(fixture("boardless-stream.valid.json")).success).toBe(true);
    expect(BoardlessEventsSchema.safeParse(fixture("boardless-events.valid.json")).success).toBe(true);
  });

  it("rejects the poison files", () => {
    expect(BoardlessStreamSchema.safeParse(fixture("boardless-stream.poison.json")).success).toBe(false);
    expect(BoardlessEventsSchema.safeParse(fixture("boardless-events.poison.json")).success).toBe(false);
  });

  it("rejects an event whose end precedes its start", () => {
    const file = fixture("boardless-events.valid.json");
    file.events[0].ends = "2026-10-13";
    expect(BoardlessEventsSchema.safeParse(file).success).toBe(false);
  });

  it("rejects duplicate event ids", () => {
    const file = fixture("boardless-events.valid.json");
    file.events[1].id = file.events[0].id;
    expect(BoardlessEventsSchema.safeParse(file).success).toBe(false);
  });
});

describe("canonical urls and ids", () => {
  it("strips tracking parameters, the fragment and a trailing slash", () => {
    expect(canonicalUrl("https://www.example.com/post/?utm_source=x&b=2&a=1#top")).toBe(
      "https://example.com/post?a=1&b=2",
    );
  });

  it("gives the same id to the same post arriving two ways", () => {
    expect(streamItemId("https://example.com/post?utm_campaign=rss")).toBe(
      streamItemId("https://www.example.com/post/#section"),
    );
  });

  it("gives different ids to different posts", () => {
    expect(streamItemId("https://example.com/a")).not.toBe(streamItemId("https://example.com/b"));
  });

  it("reads a publication date or refuses one it cannot parse", () => {
    expect(publishedDate("Fri, 08 Aug 2026 09:00:00 GMT")).toBe("2026-08-08");
    expect(publishedDate("2026-08-08T22:10:00Z")).toBe("2026-08-08");
    expect(publishedDate("nonsense")).toBeNull();
    expect(publishedDate(undefined)).toBeNull();
  });
});

describe("normalising one feed entry", () => {
  const raw = {
    title: "The Hidden Cost of Long Context Windows",
    url: "https://www.interconnects.ai/p/long-context-cost?utm_source=rss",
    author: "Nathan Lambert",
    publishedAt: "2026-08-08T09:00:00Z",
    summary: "Why it matters.",
  };

  it("produces a contract-valid item", () => {
    const item = normalizeItem(raw, entry, "talked-about");
    expect(item).not.toBeNull();
    expect(item?.url).toBe("https://interconnects.ai/p/long-context-cost");
    expect(item?.source.name).toBe("Interconnects");
    expect(item?.show).toBeUndefined();
  });

  it("attaches show and platform links only for podcasts", () => {
    const podcast = normalizeItem({ ...raw, durationSec: 4320 }, { ...entry, stream: "podcasts", links: { spotify: "https://open.spotify.com/x" } }, "podcasts");
    expect(podcast?.show).toBe("Interconnects");
    expect(podcast?.durationSec).toBe(4320);
    expect(podcast?.links?.spotify).toBe("https://open.spotify.com/x");
  });

  it("drops an entry it cannot render rather than throwing", () => {
    expect(normalizeItem({ ...raw, url: undefined }, entry, "talked-about")).toBeNull();
    expect(normalizeItem({ ...raw, title: undefined }, entry, "talked-about")).toBeNull();
    expect(normalizeItem({ ...raw, publishedAt: "nonsense" }, entry, "talked-about")).toBeNull();
    expect(normalizeItem({ ...raw, url: "http://insecure.example.com" }, entry, "talked-about")).toBeNull();
    expect(normalizeItem({ ...raw, url: "not a url" }, entry, "talked-about")).toBeNull();
  });

  it("clamps an over-long summary instead of failing the item", () => {
    const item = normalizeItem({ ...raw, summary: "x".repeat(400) }, entry, "talked-about");
    expect(item?.summary?.length).toBeLessThanOrEqual(280);
  });
});

describe("merging a sync into the current file", () => {
  const item = (id: string, published: string, name = "Interconnects") => ({
    id: id.padEnd(40, "0"),
    title: `Post ${id}`,
    url: `https://example.com/${id}`,
    source: { kind: "substack" as const, name },
    published,
  });

  it("adds what is new and leaves what is already published alone", () => {
    const current = [item("a", "2026-08-01")];
    const result = mergeStream(current, [item("a", "2026-08-01"), item("b", "2026-08-08")], {
      anchor: "2026-08-09",
      windowDays: 60,
      perSourcePerDay: 4,
    });
    expect(result.added).toEqual([item("b", "2026-08-08").id]);
    expect(result.items).toHaveLength(2);
  });

  it("prunes past the window", () => {
    const result = mergeStream([item("old", "2026-01-01")], [], {
      anchor: "2026-08-09",
      windowDays: 60,
      perSourcePerDay: 4,
    });
    expect(result.pruned).toHaveLength(1);
    expect(result.items).toHaveLength(0);
  });

  it("refuses an item that arrives already outside the window", () => {
    const result = mergeStream([], [item("stale", "2026-01-01")], {
      anchor: "2026-08-09",
      windowDays: 60,
      perSourcePerDay: 4,
    });
    expect(result.added).toEqual([]);
  });

  it("caps one source per day so a busy blog cannot take the page", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((id) => item(id, "2026-08-08"));
    const result = mergeStream([], many, { anchor: "2026-08-09", windowDays: 60, perSourcePerDay: 4 });
    expect(result.added).toHaveLength(4);
  });

  it("counts the cap per source, not across all of them", () => {
    const mixed = [
      ...["a", "b", "c", "d"].map((id) => item(id, "2026-08-08", "One")),
      ...["e", "f"].map((id) => item(id, "2026-08-08", "Two")),
    ];
    const result = mergeStream([], mixed, { anchor: "2026-08-09", windowDays: 60, perSourcePerDay: 4 });
    expect(result.added).toHaveLength(6);
  });

  it("sorts newest first", () => {
    const result = mergeStream([], [item("a", "2026-08-01"), item("b", "2026-08-09")], {
      anchor: "2026-08-09",
      windowDays: 60,
      perSourcePerDay: 4,
    });
    expect(result.items[0]?.published).toBe("2026-08-09");
  });
});

describe("feed parsing", () => {
  it("reads RSS 2.0", async () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
      <item><title>A</title><link>https://example.com/a</link><pubDate>Fri, 08 Aug 2026 09:00:00 GMT</pubDate></item>
    </channel></rss>`;
    const items = await parseFeed(xml);
    expect(items[0]?.title).toBe("A");
    expect(items[0]?.url).toBe("https://example.com/a");
  });

  it("reads Atom", async () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>F</title>
      <entry><title>B</title><link href="https://example.com/b"/><published>2026-08-08T09:00:00Z</published></entry>
    </feed>`;
    const items = await parseFeed(xml);
    expect(items[0]?.title).toBe("B");
    expect(items[0]?.url).toBe("https://example.com/b");
  });

  it("reads a duration in either notation and refuses nonsense", () => {
    expect(parseDuration("4320")).toBe(4320);
    expect(parseDuration("1:12:00")).toBe(4320);
    expect(parseDuration("30:00")).toBe(1800);
    expect(parseDuration("soon")).toBeUndefined();
    expect(parseDuration(undefined)).toBeUndefined();
  });
});

describe("the curated registry", () => {
  const registry = loadStreamRegistry();

  it("declares apify off", () => {
    expect(registry.apify).toBe(false);
  });

  it("only offers sources that have a feed and are enabled", () => {
    for (const stream of ["talked-about", "podcasts"] as const) {
      for (const source of sourcesFor(registry, stream)) {
        expect(source.feed).toBeTruthy();
        expect(source.enabled).toBe(true);
      }
    }
  });

  it("ships an unresolved feed disabled with a note rather than a guess", () => {
    const disabled = registry.sources.filter((source) => !source.enabled);
    expect(disabled.length).toBeGreaterThan(0);
    for (const source of disabled) expect(source.note).toBeTruthy();
  });

  it("puts every enabled stream and Kvórum feed host in the network allowlist", () => {
    const allow = JSON.parse(
      readFileSync(path.join(repoRoot, "config/network-allowlist.json"), "utf8"),
    ) as { runtimeHosts: string[] };
    const kvorum = KvorumSourceRegistrySchema.parse(
      JSON.parse(readFileSync(path.join(repoRoot, "config/kvorum-sources.json"), "utf8")),
    );
    const enabled = [
      ...registry.sources.filter((source) => source.enabled).map((source) => source.host),
      ...kvorum.feeds.filter((feed) => feed.enabled).map((feed) => feed.host),
    ];
    for (const host of new Set(enabled)) {
      expect(allow.runtimeHosts, `${host} must be allowlisted`).toContain(host);
    }
    expect(registryHosts(registry).length).toBeGreaterThan(0);
  });
});

describe("a sync pass", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>F</title>
    <item><title>A</title><link>https://www.interconnects.ai/p/a</link><pubDate>Fri, 08 Aug 2026 09:00:00 GMT</pubDate></item>
  </channel></rss>`;

  const registry = {
    schemaVersion: "caught-up-streams/1" as const,
    apify: false as const,
    sources: [entry],
  };

  it("writes a receipt that satisfies its own contract", async () => {
    const { items, receipt } = await syncStream({
      stream: "talked-about",
      current: [],
      registry,
      deps: {
        now: "2026-08-09",
        fetchImpl: (async () =>
          new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } })) as typeof fetch,
      },
    });
    expect(items).toHaveLength(1);
    expect(StreamSyncReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(receipt.before).toBe(0);
    expect(receipt.after).toBe(1);
    expect(receipt.sourceErrors).toEqual([]);
  });

  it("turns a failing source into a note, never a thrown run", async () => {
    const { items, receipt } = await syncStream({
      stream: "talked-about",
      current: [],
      registry,
      deps: {
        now: "2026-08-09",
        fetchImpl: (async () => {
          throw new Error("upstream is down");
        }) as typeof fetch,
      },
    });
    expect(items).toEqual([]);
    expect(receipt.sourceErrors).toHaveLength(1);
    expect(receipt.sourceErrors[0]?.source).toBe("interconnects");
  });

  it("is idempotent: a second identical sync adds nothing", async () => {
    const deps = {
      now: "2026-08-09",
      fetchImpl: (async () =>
        new Response(xml, { status: 200, headers: { "content-type": "application/rss+xml" } })) as typeof fetch,
    };
    const first = await syncStream({ stream: "talked-about", current: [], registry, deps });
    const second = await syncStream({ stream: "talked-about", current: first.items, registry, deps });
    expect(second.receipt.added).toEqual([]);
    expect(second.items).toEqual(first.items);
  });
});

describe("podcast index auth", () => {
  it("signs with the documented header set and never leaks the secret", () => {
    const headers = podcastIndexHeaders("key", "secret", 1_754_000_000);
    expect(headers["X-Auth-Key"]).toBe("key");
    expect(headers["X-Auth-Date"]).toBe("1754000000");
    expect(headers.Authorization).toMatch(/^[0-9a-f]{40}$/u);
    expect(Object.values(headers).join(" ")).not.toContain("secret");
  });
});
