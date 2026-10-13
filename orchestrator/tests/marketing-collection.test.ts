import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { collectMarketingSources, InvalidCollectionQuery } from "../src/marketing-source/collection.js";
import { DneskaiFeedRequestSchema, DneskaiFeedResponseSchema } from "../src/marketing-source/collection-contract.js";
import { makeItem } from "../src/sources/adapters/util.js";
import { SourceRegistrySchema, type SourceConfig, type SourceFetchContext } from "../src/sources/types.js";
import { fetchReadable } from "../src/sources/adapters/reader.js";
const registry = SourceRegistrySchema.parse(JSON.parse(await readFile(new URL("../../config/sources.json", import.meta.url), "utf8")));
const source = registry.sources.find(s => s.id === "anthropic-news")!;
const now = new Date("2026-10-13T20:00:00Z");
const query = { action: "collect" as const, sourceIds: [source.id], since: "2026-10-12T20:00:00Z", maxItems: 3 };
const base = { query, registry, network: { runtimeHosts: ["www.anthropic.com"] }, now };
function item(index: number, publishedAt: string | undefined = "2026-10-13T12:00:00Z") {
  return makeItem(`https://www.anthropic.com/news/fixture-${index}`, { title: `Fixture source item ${index}`, publishedAt }, source, now)!;
}
describe("bounded free collection contract", () => {
  it("preserves exact shared shapes and rejects foreign actions or oversized limits", () => {
    expect(DneskaiFeedRequestSchema.safeParse(query).success).toBe(true);
    for (const value of [{ ...query, action: "approve" }, { ...query, sourceIds: Array(9).fill(source.id) }, { ...query, maxItems: 21 }, { ...query, brand: "dneskai" }]) expect(DneskaiFeedRequestSchema.safeParse(value).success).toBe(false);
    expect(DneskaiFeedResponseSchema.safeParse({ schemaVersion: "dneskai-feed/1", sources: [], approved: true }).success).toBe(false);
  });
  it("rejects unknown and duplicate registry IDs before any fetch", async () => {
    const fetch = vi.fn();
    for (const sourceIds of [["attacker-source"], [source.id, source.id]]) await expect(collectMarketingSources({ ...base, query: { ...query, sourceIds } }, { fetch })).rejects.toBeInstanceOf(InvalidCollectionQuery);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uses actual known config and forbids readers while returning only authored projections", async () => {
    const fetch = vi.fn(async (_source: SourceConfig, _context: SourceFetchContext) => [item(1)]);
    const result = await collectMarketingSources(base, { fetch });
    expect(fetch.mock.calls[0]?.[0]).toMatchObject({ id: "anthropic-news" });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ allowPaidReaders: false, now });
    expect(result.sources[0]).toMatchObject({ sourceId: source.id, status: "ok", errorCode: null });
    expect(Object.keys(result.sources[0]!.items[0]!)).toEqual(["externalId", "title", "url", "publishedAt", "summary", "fetchedAt"]);
  });
  it("caps output and does not claim completeness at the exact cap", async () => {
    for (const count of [3, 5]) {
      const result = await collectMarketingSources(base, { fetch: async () => Array.from({ length: count }, (_, i) => item(i)) });
      expect(result.sources[0]).toMatchObject({ status: "partial", errorCode: "item-cap" });
      expect(result.sources[0]!.items).toHaveLength(3);
    }
  });
  it("keeps undated records undated and marks partial, rather than substituting observation dates", async () => {
    const undated = item(2); undated.publishedAt = null;
    const actual = await collectMarketingSources(base, { fetch: async () => [undated] });
    expect(actual.sources[0]).toMatchObject({ status: "partial", errorCode: "unknown-date", items: [{ publishedAt: null }] });
  });
  it("reports swallowed adapter failures and paginated caps as incomplete", async () => {
    const result = await collectMarketingSources(base, { fetch: async (_source, context) => {
      context.reportIssue?.("fetch-failed"); context.reportIssue?.("upstream-cap"); return [item(1)];
    } });
    expect(result.sources[0]).toMatchObject({ status: "partial", errorCode: "fetch-failed,upstream-cap" });
  });
  it("has no false success for failures, unreadable sources or disabled config", async () => {
    expect((await collectMarketingSources(base, { fetch: async () => { throw new Error("private-secret"); } })).sources[0]).toEqual({ sourceId: source.id, status: "error", errorCode: "fetch-failed", items: [] });
    expect((await collectMarketingSources(base, { fetch: async () => [] })).sources[0]!.status).toBe("error");
    const fetch = vi.fn();
    const disabled = { ...registry, sources: registry.sources.map(s => s.id === source.id ? { ...s, enabled: false } : s) };
    expect((await collectMarketingSources({ ...base, registry: disabled }, { fetch })).sources[0]!.errorCode).toBe("source-disabled");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("filters old/future/private records and safely represents a complete empty since-window", async () => {
    expect((await collectMarketingSources(base, { fetch: async () => [item(1, "2026-10-10T12:00:00Z")] })).sources[0]).toMatchObject({ status: "ok", items: [] });
    const unsafe = { ...item(2), url: "https://user:private@example.com/" };
    expect((await collectMarketingSources(base, { fetch: async () => [unsafe, item(3, "2026-10-14T12:00:00Z")] })).sources[0]!.status).toBe("error");
  });
  it("does not call either reader even when provider keys exist", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-key"); vi.stubEnv("JINA_API_KEY", "fixture-key");
    const fetch = vi.spyOn(globalThis, "fetch"); const reportIssue = vi.fn();
    try {
      expect(await fetchReadable(source.url, { now, allowHosts: ["www.anthropic.com", "api.firecrawl.dev", "r.jina.ai"], allowPaidReaders: false, reportIssue })).toBeNull();
      expect(fetch).not.toHaveBeenCalled(); expect(reportIssue).toHaveBeenCalledWith("reader-disabled");
    } finally { fetch.mockRestore(); vi.unstubAllEnvs(); }
  });
});
