import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { refreshGoViralTrends } from "../src/portfolio/evidence.js";

/**
 * The keyless trending sources, on the days they exist for.
 *
 * `collectFreeTrendingSignals` is $0 — HN Algolia, Google Trends, Google News and a Reddit rank
 * read — and its docstring has always promised it runs whether or not `APIFY_TOKEN` exists. It
 * did not. The call sat after the Apify verdict's early return, after the priced-out return and
 * after the empty-scout return, so on a tokenless day it never ran and the magazines got nothing.
 *
 * These cases pin the corrected order. They run offline: every request is answered by the stub
 * below, and a test that reached the network would be a test that fails in CI for the wrong
 * reason.
 */

const token = process.env.APIFY_TOKEN;
afterEach(() => {
  if (token === undefined) delete process.env.APIFY_TOKEN;
  else process.env.APIFY_TOKEN = token;
});

/** Answers each keyless provider with the shape it parses, and refuses everything else. */
function stubFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.includes("algolia")
      ? JSON.stringify({ hits: [{ title: "An AI model shipped", points: 240, num_comments: 90, created_at: new Date().toISOString(), objectID: "1" }] })
      : url.includes("trends.google")
        ? ")]}'\n" + JSON.stringify({ default: { trendingSearchesDays: [] } })
        : url.includes("news.google")
          ? '<?xml version="1.0"?><rss><channel><item><title>An AI model shipped</title><link>https://example.test/a</link></item></channel></rss>'
          : url.includes("reddit")
            ? JSON.stringify({
              data: {
                children: [{
                  data: {
                    title: "An AI model shipped",
                    score: 900,
                    num_comments: 120,
                    permalink: "/r/x/1",
                    created_utc: 1_786_000_000
                  }
                }]
              }
            })
            : "{}";
    return new Response(body, { status: 200, headers: { "content-type": url.includes("news.google") ? "application/xml" : "application/json" } });
  }) as typeof fetch;
}

describe("the free trending signals reach the day's output on every path", () => {
  it("collects them on a tokenless day, when the paid scout cannot run at all", async () => {
    delete process.env.APIFY_TOKEN;
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-trends-"));
    const result = await refreshGoViralTrends({
      root,
      date: "2026-08-10",
      now: new Date("2026-08-10T11:00:00.000Z"),
      fetchImpl: stubFetch()
    });

    // No token and no snapshot, so the room still does not meet — that gate is unchanged.
    expect(result.trends).toBeNull();
    expect(result.stale).toBe(true);
    // But the keyless collection ran, and its refs are on the day's output. Before this change
    // the same call returned an empty `evidenceRefs`, every time, for free.
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.evidenceRefs.every((ref) => ref.startsWith("source:trending:"))).toBe(true);
    expect(result.evidenceRefs.every((ref) => ref.endsWith(":2026-08-10"))).toBe(true);
    // Nothing paid was touched: no Apify ref, and no artifact written.
    expect(result.evidenceRefs.some((ref) => ref.startsWith("source:apify:"))).toBe(false);
    expect(result.artifactPaths).toEqual([]);
  });

  it("returns one ref per provider that answered, and never a duplicate", async () => {
    delete process.env.APIFY_TOKEN;
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-trends-"));
    const result = await refreshGoViralTrends({
      root,
      date: "2026-08-10",
      now: new Date("2026-08-10T11:00:00.000Z"),
      fetchImpl: stubFetch()
    });
    expect(new Set(result.evidenceRefs).size).toBe(result.evidenceRefs.length);
  });

  it("says in plain words that no scout ran, rather than implying one did", async () => {
    delete process.env.APIFY_TOKEN;
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-trends-"));
    const result = await refreshGoViralTrends({
      root,
      date: "2026-08-10",
      now: new Date("2026-08-10T11:00:00.000Z"),
      fetchImpl: stubFetch()
    });
    expect(result.reason.length).toBeGreaterThan(0);
    expect(result.snapshotDate).toBeNull();
  });
});
