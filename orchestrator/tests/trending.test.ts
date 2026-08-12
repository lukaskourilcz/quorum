import { describe, expect, it, vi } from "vitest";
import {
  AI_VOCABULARY,
  TRENDING_HOSTS,
  collectTrendingSignals,
  fetchGoogleNewsVolume,
  fetchGoogleTrends,
  fetchHackerNewsVelocity,
  fetchSubredditRanks,
  matchDictionary,
  rssValues
} from "../src/sources/trending.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configRoot } from "../src/paths.js";

const now = new Date("2026-08-10T12:00:00.000Z");

function respond(body: string, contentType = "application/json"): typeof fetch {
  return vi.fn(async () => new Response(body, {
    status: 200,
    headers: { "content-type": contentType }
  })) as unknown as typeof fetch;
}

const failing = vi.fn(async () => {
  throw new Error("Reddit closed the feed");
}) as unknown as typeof fetch;

describe("free trending signals", () => {
  it("reads Hacker News as a speed, not a total", async () => {
    const result = await fetchHackerNewsVelocity({
      now,
      query: "anthropic",
      fetchImpl: respond(JSON.stringify({
        hits: [
          { title: "Old but huge", points: 1_000, num_comments: 0, created_at: "2026-07-11T12:00:00.000Z" },
          { title: "New and climbing", points: 80, num_comments: 20, created_at: "2026-08-10T10:00:00.000Z" },
          { title: "Nothing happened", points: 0, num_comments: 0, created_at: "2026-08-10T11:00:00.000Z" }
        ]
      }))
    });
    expect(result.status).toBe("success");
    // 100 over 2h beats 1000 over 30 days. That inversion is the whole point.
    expect(result.signals[0]?.topic).toBe("New and climbing");
    expect(result.signals[0]?.value).toBeCloseTo(50, 4);
    expect(result.signals.every((signal) => signal.kind === "velocity")).toBe(true);
    // A story with no points and no comments is not a zero-speed trend, it is not a signal.
    expect(result.signals.map((signal) => signal.topic)).not.toContain("Nothing happened");
  });

  it("lines Google Trends terms up with their own traffic figures", async () => {
    const result = await fetchGoogleTrends({
      now,
      geo: "CZ",
      fetchImpl: respond(`<rss><channel><title>Daily Search Trends</title>
        <item><title>Oktagon 60</title><ht:approx_traffic>20,000+</ht:approx_traffic></item>
        <item><title>nová AI</title><ht:approx_traffic>5,000+</ht:approx_traffic></item>
      </channel></rss>`, "application/rss+xml")
    });
    // The channel's own <title> is the first one in the document. Counting it would attribute
    // every traffic figure to the term before it.
    expect(result.signals.map((signal) => [signal.topic, signal.value])).toEqual([
      ["Oktagon 60", 20_000],
      ["nová AI", 5_000]
    ]);
    expect(result.signals.every((signal) => signal.scope === "geo:CZ")).toBe(true);
  });

  it("counts Google News articles as volume, never as engagement", async () => {
    const result = await fetchGoogleNewsVolume({
      now,
      query: "Jiri Prochazka",
      locale: "cs",
      fetchImpl: respond(`<rss><channel><title>Feed</title>
        <item><title>One</title></item><item><title>Two</title></item><item><title>Three</title></item>
      </channel></rss>`, "application/rss+xml")
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({ kind: "volume", value: 3, scope: "locale:cs" });
  });

  it("reads Reddit as rank only, and treats a closed feed as absence", async () => {
    const ranked = await fetchSubredditRanks({
      now,
      subreddit: "MMA",
      fetchImpl: respond(`<feed><title>r/MMA</title>
        <entry><title>Top post</title></entry><entry><title>Second post</title></entry>
      </feed>`, "application/xml")
    });
    expect(ranked.signals.map((signal) => [signal.kind, signal.value])).toEqual([["rank", 1], ["rank", 2]]);
    expect(ranked.signals[0]?.scope).toBe("r/MMA");

    // Reddit has flagged RSS as the next thing it closes. When it goes, this is the answer:
    // a failed provider with a reason, zero signals, and nothing thrown.
    const closed = await fetchSubredditRanks({ now, subreddit: "MMA", fetchImpl: failing });
    expect(closed.status).toBe("failed");
    expect(closed.signals).toEqual([]);
    expect(closed.reason).toContain("Reddit closed the feed");
  });

  it("tells an empty answer apart from a failed one, because they are not the same news", async () => {
    const empty = await fetchHackerNewsVelocity({ now, query: "nothing", fetchImpl: respond(JSON.stringify({ hits: [] })) });
    expect(empty.status).toBe("empty");
    expect((await fetchHackerNewsVelocity({ now, query: "boom", fetchImpl: failing })).status).toBe("failed");
  });

  it("keeps only signals a dictionary actually names", () => {
    const signals = [
      { provider: "google-trends" as const, kind: "volume" as const, topic: "New Anthropic model", value: 1, ref: "r" },
      { provider: "google-trends" as const, kind: "volume" as const, topic: "Premier League results", value: 9, ref: "r" }
    ];
    expect(matchDictionary(signals, [...AI_VOCABULARY]).map((signal) => signal.topic)).toEqual(["New Anthropic model"]);
    // An empty dictionary matches nothing rather than everything: the failure that would flood a
    // magazine with unrelated trends is the permissive one.
    expect(matchDictionary(signals, [])).toEqual([]);
    // Two-character terms are dropped, or "ai" inside "said" would match half the feed.
    expect(matchDictionary(signals, ["ue"])).toEqual([]);
  });

  it("keeps every provider separate, so silence is visible", async () => {
    const results = await collectTrendingSignals({
      now,
      aiQueries: ["anthropic"],
      mmaQueries: ["UFC"],
      subreddits: ["MMA"],
      fetchImpl: failing
    });
    // Six readings across four providers — Trends is fetched per geo and News per locale — and
    // every one of them comes back as a named failure. A merged score could not tell this apart
    // from a genuinely quiet day.
    expect(results).toHaveLength(6);
    expect(results.every((result) => result.status === "failed")).toBe(true);
    expect(new Set(results.map((result) => result.provider))).toEqual(
      new Set(["hn", "google-trends", "google-news", "reddit"])
    );
  });

  it("keeps the worst-case free sweep inside the existing 24-result contract cap", async () => {
    const results = await collectTrendingSignals({
      now,
      aiQueries: ["ai one", "ai two", "ai three"],
      mmaQueries: ["mma one", "mma two", "mma three", "mma four", "mma five", "mma six"],
      topicQueries: ["book one", "book two", "book three", "book four"],
      subreddits: ["one", "two", "three", "four", "five"],
      fetchImpl: failing
    });
    expect(results).toHaveLength(24);
    expect(results.every((result) => result.status === "failed")).toBe(true);
  });

  it("parses feed values without leaving markup or entities behind", () => {
    expect(rssValues("<title><![CDATA[Fight <b>week</b> &amp; more]]></title>", "title"))
      .toEqual(["Fight week & more"]);
    expect(rssValues("<title>a</title><title>b</title>", "title")).toEqual(["a", "b"]);
    expect(rssValues("<other>a</other>", "title")).toEqual([]);
  });

  it("names only hosts the runtime allowlist carries", async () => {
    const allowlist = JSON.parse(
      await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")
    ) as { runtimeHosts: string[] };
    // safeFetch gates on its own allowHosts and the runtime allowlist gates the process. A host
    // named here but missing there fetches nothing, silently, every day.
    for (const host of TRENDING_HOSTS) {
      expect(allowlist.runtimeHosts, host).toContain(host);
    }
  });
});
