import { z } from "zod";
import { fetchSource } from "../sources/adapters/index.js";
import { SourceRegistrySchema, SourceItemSchema, type SourceConfig, type SourceFetchContext, type SourceItem } from "../sources/types.js";
import { parseSafeHttpsUrl } from "../security/url.js";
import { DneskaiFeedRequestSchema, DneskaiFeedResponseSchema, type DneskaiFeedRequest, type DneskaiFeedResponse } from "./collection-contract.js";

export const CollectionNetworkSchema = z.object({ runtimeHosts: z.array(z.string().min(1)).min(1).max(200) });
export class InvalidCollectionQuery extends Error {}
export function validateCollectionQuery(query: DneskaiFeedRequest, registry: unknown): SourceConfig[] {
  const sources = SourceRegistrySchema.parse(registry).sources;
  if (new Set(query.sourceIds).size !== query.sourceIds.length) throw new InvalidCollectionQuery("Duplicate source IDs");
  return query.sourceIds.map(id => {
    const source = sources.find(candidate => candidate.id === id);
    if (!source) throw new InvalidCollectionQuery("Unknown source ID");
    return source;
  });
}

/** No state writes, provider readers, generation, title/image selection or publication. */
export async function collectMarketingSources(input: {
  query: DneskaiFeedRequest;
  registry: unknown;
  network: unknown;
  now?: Date;
  signal?: AbortSignal;
}, dependencies: { fetch?: (source: SourceConfig, context: SourceFetchContext) => Promise<SourceItem[]> } = {}): Promise<DneskaiFeedResponse> {
  const query = DneskaiFeedRequestSchema.parse(input.query);
  const configured = validateCollectionQuery(query, input.registry);
  const allowHosts = CollectionNetworkSchema.parse(input.network).runtimeHosts;
  const now = input.now ?? new Date();
  const since = new Date(query.since).getTime();
  if (since > now.getTime()) throw new InvalidCollectionQuery("Future collection window");
  const signal = AbortSignal.any([AbortSignal.timeout(40_000), ...(input.signal ? [input.signal] : [])]);
  const sources = await Promise.all(configured.map(async (configuredSource): Promise<DneskaiFeedResponse["sources"][number]> => {
    const sourceId = configuredSource.id;
    const failed = (errorCode: string) => ({ sourceId, status: "error" as const, errorCode, items: [] });
    if (!configuredSource.enabled) return failed("source-disabled");
    if (configuredSource.credentialEnv && !process.env[configuredSource.credentialEnv]) return failed("credential-unavailable");
    const issues = new Set<string>();
    try {
      signal.throwIfAborted();
      const raw = await (dependencies.fetch ?? fetchSource)({ ...configuredSource, maxItems: Math.min(configuredSource.maxItems, query.maxItems + 1) }, {
        allowHosts, now, signal, allowPaidReaders: false, reportIssue: code => { issues.add(code); }
      });
      signal.throwIfAborted();
      if (raw.length === 0) return failed(issues.has("reader-disabled") ? "reader-disabled" : "empty-source");
      const seenIds = new Set<string>();
      const seenUrls = new Set<string>();
      const items: DneskaiFeedResponse["sources"][number]["items"] = [];
      for (const value of raw) {
        const parsed = SourceItemSchema.safeParse(value);
        if (!parsed.success || parsed.data.sourceId !== sourceId || parsed.data.externalId.length > 2048) { issues.add("invalid-item"); continue; }
        const item = parsed.data;
        try { parseSafeHttpsUrl(item.url); } catch { issues.add("invalid-item"); continue; }
        if (item.publishedAt !== null && new Date(item.publishedAt).getTime() > now.getTime()) { issues.add("invalid-date"); continue; }
        if (item.publishedAt !== null && new Date(item.publishedAt).getTime() < since) continue;
        if (seenIds.has(item.externalId) || seenUrls.has(item.url)) { issues.add("duplicate-item"); continue; }
        seenIds.add(item.externalId); seenUrls.add(item.url);
        if (item.publishedAt === null) issues.add("unknown-date");
        items.push({ externalId: item.externalId, title: item.title, url: item.url,
          publishedAt: item.publishedAt, summary: item.summary, fetchedAt: now.toISOString() });
      }
      items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
      // At the cap, completeness cannot safely advance the receiver's source cursor.
      if (items.length >= query.maxItems) issues.add("item-cap");
      if (items.length === 0 && issues.size > 0) return failed(issues.has("fetch-failed") ? "fetch-failed" : "unusable-source");
      return { sourceId, status: issues.size ? "partial" : "ok", errorCode: issues.size ? [...issues].sort().join(",") : null, items: items.slice(0, query.maxItems) };
    } catch {
      return failed(signal.aborted ? "collection-timeout" : "fetch-failed");
    }
  }));
  return DneskaiFeedResponseSchema.parse({ schemaVersion: "dneskai-feed/1", sources });
}
