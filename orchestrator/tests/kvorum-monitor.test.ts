import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  fetchKvorumMonitor,
  mapKvorumFeedItem,
  mapKvorumStitRow,
  matchKvorumEntities
} from "../src/ventures/kvorum/monitor.js";
import { loadKvorumEntityLexicon } from "../src/ventures/kvorum/entities.js";
import { loadKvorumSourceRegistry } from "../src/ventures/kvorum/sources.js";

const now = new Date("2026-08-12T21:00:00.000Z");
const signedInbox = [
  "- [x] HUMAN_APPROVAL APIFY-ACCOUNT-001 — owner resolved.",
  "- [x] HUMAN_APPROVAL KV-APIFY-001 — owner resolved.",
  "- [x] HUMAN_APPROVAL KV-SOURCES-002 — owner resolved."
].join("\n");
const signedFounding = [
  "Status: countersigned",
  "Signature / explicit approval reference: owner-test"
].join("\n");
const signedCapacity = [
  "Status: countersigned",
  "Signature / explicit approval reference: owner-test",
  "Freed worst-day capacity USD: $0.08"
].join("\n");
const actorRow = {
  message: "Premiér Babiš a hnutí ANO řeší televizní poplatky České televize.",
  postUrl: "https://www.facebook.com/stitdemokracie/posts/123?utm_source=fixture",
  timestamp: "2026-08-12T20:30:00.000Z",
  likesCount: 120,
  commentsCount: 18,
  sharesCount: 7,
  comments: [{ author: "Private Commenter", text: "must not survive" }],
  user: { name: "Private Profile", email: "private@example.test" },
  cookie: "must-not-survive",
  imageUrl: "https://private.example.test/photo.jpg"
};
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Kvórum fixture</title>
  <item><title>Vláda jedná o pomoci Ukrajině</title><link>https://news.example.test/story?utm_source=rss</link>
  <description>Senát projedná muniční iniciativu.</description><author>Private Feed Author</author>
  <pubDate>Wed, 12 Aug 2026 19:00:00 GMT</pubDate></item></channel></rss>`;

async function tempRoot(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("Kvórum monitor fixed-field mapping", () => {
  it("keeps exactly the common fields plus bounded Štít context", async () => {
    const [lexicon, sources] = await Promise.all([
      loadKvorumEntityLexicon(),
      loadKvorumSourceRegistry()
    ]);
    const item = mapKvorumStitRow(actorRow, lexicon, sources);
    expect(item).not.toBeNull();
    expect(Object.keys(item!)).toEqual([
      "source",
      "url",
      "publishedAt",
      "text",
      "entities",
      "stit"
    ]);
    expect(Object.keys(item!.source)).toEqual(["id", "name", "kind", "host"]);
    expect("stit" in item! ? Object.keys(item!.stit) : []).toEqual([
      "pagePostUrl",
      "likes",
      "comments",
      "shares"
    ]);
    expect(item).toMatchObject({
      source: { id: "stit-demokracie-facebook", kind: "facebook" },
      publishedAt: "2026-08-12T20:30:00.000Z",
      entities: expect.arrayContaining([
        "andrej-babis",
        "ano-2011",
        "ceska-televize",
        "public-media-funding"
      ]),
      stit: { likes: 120, comments: 18, shares: 7 }
    });
    const stored = JSON.stringify(item);
    expect(stored).not.toContain("Private Commenter");
    expect(stored).not.toContain("Private Profile");
    expect(stored).not.toContain("private@example.test");
    expect(stored).not.toContain("must-not-survive");
    expect(stored).not.toContain("photo.jpg");
  });

  it("keeps feed authors and arbitrary parser fields outside the five-field boundary", async () => {
    const [lexicon, sources] = await Promise.all([
      loadKvorumEntityLexicon(),
      loadKvorumSourceRegistry()
    ]);
    const item = mapKvorumFeedItem({
      title: "Vláda jedná o pomoci Ukrajině",
      summary: "Senát projedná muniční iniciativu.",
      url: "https://news.example.test/story",
      publishedAt: "2026-08-12T19:00:00.000Z",
      author: "Private Feed Author",
      durationSec: 120
    }, sources.feeds[0]!, lexicon);
    expect(Object.keys(item!)).toEqual(["source", "url", "publishedAt", "text", "entities"]);
    expect(JSON.stringify(item)).not.toContain("Private Feed Author");
    expect(item?.entities).toEqual(expect.arrayContaining(["vlada-cr", "ukraine-aid", "senat"]));
  });

  it("matches whole normalized aliases and never invents an unlisted person", async () => {
    const lexicon = await loadKvorumEntityLexicon();
    expect(matchKvorumEntities(
      "Babis jedná za ANO. Soukromá osoba Jana Nová není v lexikonu.",
      lexicon
    )).toEqual(expect.arrayContaining(["andrej-babis", "ano-2011"]));
    expect(matchKvorumEntities("Motoristé jednají.", lexicon)).toContain("motoriste-sobe");
    expect(matchKvorumEntities("Stanice hlásí provoz.", lexicon)).not.toContain("stan");
    expect(matchKvorumEntities("Jana Nová", lexicon)).toEqual([]);
  });
});

describe("Kvórum fixture-driven monitor fetch", () => {
  it("produces byte-stable normalized items without test network access", async () => {
    const root = await tempRoot("kvorum-monitor-stable-");
    const fetchImpl = vi.fn(async () => new Response(rss, {
      status: 200,
      headers: { "content-type": "application/rss+xml" }
    }));
    const resolveImpl = vi.fn(async () => ["93.184.216.34"]);
    const actorRunner = vi.fn(async () => [actorRow]);
    try {
      const [sources, lexicon] = await Promise.all([
        loadKvorumSourceRegistry(),
        loadKvorumEntityLexicon()
      ]);
      const run = () => fetchKvorumMonitor({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "fixture-token",
        sourceRegistry: sources,
        entityLexicon: lexicon,
        foundingDecisionRaw: signedFounding,
        budgetCapacityDecisionRaw: signedCapacity,
        apifyUsageFetcher: async () => 0.4,
        actorRunner,
        fetchImpl,
        resolveImpl
      });
      const first = await run();
      const second = await run();
      expect(JSON.stringify(second.items)).toBe(JSON.stringify(first.items));
      expect(first.items).toHaveLength(8);
      expect(first.sourceResults).toHaveLength(8);
      expect(first.sourceResults.every((result) => result.status === "success")).toBe(true);
      expect(first.artifactPaths).toEqual(["kvorum/source-quota/apify.json"]);
      expect(first.fixtureOnly).toBe(false);
      expect(fetchImpl).toHaveBeenCalledTimes(14);
      expect(resolveImpl).toHaveBeenCalledTimes(14);
      expect(actorRunner).toHaveBeenCalledTimes(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("turns each failing source into one line and continues the remaining sections", async () => {
    const root = await tempRoot("kvorum-monitor-failures-");
    const fetchImpl = vi.fn(async (request: string | URL | Request) => {
      const url = String(request);
      return url.includes("ct24.ceskatelevize.cz")
        ? new Response("down", { status: 503, headers: { "content-type": "text/plain" } })
        : new Response(rss, { status: 200, headers: { "content-type": "application/rss+xml" } });
    });
    try {
      const result = await fetchKvorumMonitor({
        root,
        date: "2026-08-12",
        now,
        inbox: signedInbox,
        token: "fixture-token",
        foundingDecisionRaw: signedFounding,
        budgetCapacityDecisionRaw: signedCapacity,
        apifyUsageFetcher: async () => 0,
        actorRunner: vi.fn(async () => { throw new Error("actor fixture failure"); }),
        fetchImpl,
        resolveImpl: async () => ["93.184.216.34"]
      });
      expect(result.items).toHaveLength(6);
      expect(result.sourceResults.filter((entry) => entry.status === "failed")).toEqual([
        expect.objectContaining({ sourceId: "stit-demokracie-facebook", count: 0 }),
        expect.objectContaining({ sourceId: "ct24", count: 0 })
      ]);
      expect(result.sourceResults.filter((entry) => entry.status === "success")).toHaveLength(6);
      expect(result.artifactPaths).toEqual(["kvorum/source-quota/apify.json"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("is a fixture-only no-op while authority and source approvals are pending", async () => {
    const root = await tempRoot("kvorum-monitor-pending-");
    const fetchImpl = vi.fn();
    const actorRunner = vi.fn();
    const usageFetcher = vi.fn();
    try {
      const result = await fetchKvorumMonitor({
        root,
        date: "2026-08-12",
        now,
        inbox: "- [ ] HUMAN_APPROVAL KV-SOURCES-002",
        token: "token-that-must-not-be-used",
        foundingDecisionRaw: "Status: pending countersignature",
        budgetCapacityDecisionRaw: "",
        apifyUsageFetcher: usageFetcher,
        actorRunner,
        fetchImpl,
        resolveImpl: vi.fn()
      });
      expect(result.items).toEqual([]);
      expect(result.sourceResults).toHaveLength(8);
      expect(result.sourceResults.every((entry) => entry.status === "skipped")).toBe(true);
      expect(result.sourceResults.every((entry) => entry.reason?.includes("waiting for"))).toBe(true);
      expect(result.fixtureOnly).toBe(true);
      expect(result.artifactPaths).toEqual([]);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(actorRunner).not.toHaveBeenCalled();
      expect(usageFetcher).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
