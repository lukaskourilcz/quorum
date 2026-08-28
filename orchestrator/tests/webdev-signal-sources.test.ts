import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configRoot } from "../src/paths.js";
import { parseWebDevSource } from "../src/ventures/webdev-signal/sources/adapters.js";
import { WebDevSourceCacheSchema } from "../src/ventures/webdev-signal/sources/cache.js";
import { loadWebDevSourceRegistry, webDevSourceHosts } from "../src/ventures/webdev-signal/sources/registry.js";
import { fetchWebDevSource } from "../src/ventures/webdev-signal/sources/transport.js";

const NOW = "2026-08-28T05:00:00.000Z";
const PUBLIC_DNS = async () => ["203.0.113.10"];
const fixtureRoot = path.join(import.meta.dirname, "fixtures", "webdev-signal");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WebDev Signal official adapters", () => {
  it("parses a bounded feed and drops only the malformed item", async () => {
    const source = (await loadWebDevSourceRegistry()).sources.find(({ id }) => id === "chrome-developers")!;
    const result = await parseWebDevSource(source, await readFile(path.join(fixtureRoot, "feed.xml")), { fetchedAt: NOW, fixture: true });
    expect(result).toMatchObject({ itemsSeen: 2, malformedItems: 1, filteredItems: 0, empty: false });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceId: "chrome-developers",
      title: "Chrome 130 adds an invented CSS capability",
      versionText: "130",
      provenance: { fixture: true, authority: "official-primary" }
    });
  });

  it("parses only allowlisted repository releases and filters drafts", async () => {
    const source = (await loadWebDevSourceRegistry()).sources.find(({ id }) => id === "react-releases")!;
    const result = await parseWebDevSource(source, await readFile(path.join(fixtureRoot, "releases.json")), { fetchedAt: NOW, fixture: true });
    expect(result).toMatchObject({ itemsSeen: 3, malformedItems: 1, filteredItems: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      sourceId: "react-releases",
      canonicalProjectUrl: "https://github.com/facebook/react",
      versionText: "v20.0.0"
    });
  });

  it("keeps exact npm advisory scope and isolates malformed advisories", async () => {
    const source = (await loadWebDevSourceRegistry()).sources.find(({ id }) => id === "github-npm-advisories")!;
    const result = await parseWebDevSource(source, await readFile(path.join(fixtureRoot, "advisories.json")), { fetchedAt: NOW, fixture: true });
    expect(result).toMatchObject({ itemsSeen: 2, malformedItems: 1, filteredItems: 0 });
    expect(result.candidates[0]).toMatchObject({
      sourceItemId: "GHSA-xxxx-yyyy-zzzz",
      changeKindHints: ["security-advisory"]
    });
    expect(result.candidates[0]?.versionText).toContain("fixture-package affected >= 1.0.0, < 1.2.3 fixed 1.2.3");
    expect(result.candidates[0]?.securityText).toContain("severity high");
  });

  it("distinguishes legitimate empty arrays from layout failure", async () => {
    const source = (await loadWebDevSourceRegistry()).sources.find(({ id }) => id === "react-releases")!;
    const empty = await parseWebDevSource(source, new TextEncoder().encode("[]"), { fetchedAt: NOW, fixture: true });
    expect(empty).toMatchObject({ empty: true, itemsSeen: 0, malformedItems: 0 });
    await expect(parseWebDevSource(source, new TextEncoder().encode('{"unexpected":true}'), { fetchedAt: NOW, fixture: true })).rejects.toThrow(/layout-invalid/);
  });

  it("orders candidates deterministically independent of input order", async () => {
    const source = (await loadWebDevSourceRegistry()).sources.find(({ id }) => id === "react-releases")!;
    const original = JSON.parse(await readFile(path.join(fixtureRoot, "releases.json"), "utf8")) as unknown[];
    const additional = {
      id: 13000,
      tag_name: "v19.9.9",
      name: "Older invented release",
      body: "Invented older release fixture.",
      html_url: "https://github.com/facebook/react/releases/tag/v19.9.9",
      draft: false,
      published_at: "2026-08-26T10:00:00Z"
    };
    const forward = await parseWebDevSource(source, new TextEncoder().encode(JSON.stringify([...original, additional])), { fetchedAt: NOW, fixture: true });
    const reverse = await parseWebDevSource(source, new TextEncoder().encode(JSON.stringify([additional, ...original])), { fetchedAt: NOW, fixture: true });
    expect(forward.candidates.map(({ sourceItemId }) => sourceItemId)).toEqual(reverse.candidates.map(({ sourceItemId }) => sourceItemId));
  });
});

describe("WebDev Signal source registry", () => {
  it("owns unique audited sources whose enabled hosts are on the shared allowlist", async () => {
    const registry = await loadWebDevSourceRegistry();
    const allowlist = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts: string[] };
    expect(registry.sources).toHaveLength(12);
    expect(new Set(registry.sources.map(({ id }) => id)).size).toBe(registry.sources.length);
    expect(webDevSourceHosts(registry).every((host) => allowlist.runtimeHosts.includes(host))).toBe(true);
    expect(registry.sources.filter(({ state }) => state === "enabled").every(({ authority }) => authority !== "secondary-discovery")).toBe(true);
  });
});

describe("WebDev Signal source transport and conditional metadata", () => {
  it("returns fixture bytes without DNS/network and stores metadata rather than raw bodies", async () => {
    const source = (await loadWebDevSourceRegistry()).sources[0]!;
    const fetchImpl = vi.fn();
    const result = await fetchWebDevSource({
      source,
      now: NOW,
      mode: "fixture",
      fixtureBody: new TextEncoder().encode("fixture"),
      fixtureContentType: "application/rss+xml",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolveImpl: vi.fn()
    });
    expect(result).toMatchObject({ kind: "fetched", attempts: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(WebDevSourceCacheSchema.safeParse({ schemaVersion: "webdev-source-cache/1", entries: { [source.id]: result.nextCache } }).success).toBe(true);
    expect(JSON.stringify(result.nextCache)).not.toContain("fixture");
    expect(WebDevSourceCacheSchema.safeParse({
      schemaVersion: "webdev-source-cache/1",
      entries: { [source.id]: { ...result.nextCache, body: "forbidden" } }
    }).success).toBe(false);
  });

  it("sends validators and treats 304 as healthy unchanged", async () => {
    const source = (await loadWebDevSourceRegistry()).sources[0]!;
    const seeded = await fetchWebDevSource({ source, now: NOW, mode: "fixture", fixtureBody: new TextEncoder().encode("old") });
    const cache = { ...seeded.nextCache, etag: "etag-1", lastModified: "Wed, 26 Aug 2026 10:00:00 GMT" };
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("if-none-match")).toBe("etag-1");
      expect(new Headers(init?.headers).get("if-modified-since")).toContain("26 Aug 2026");
      expect(new Headers(init?.headers).get("user-agent")).toContain("WebDevSignal");
      return new Response(null, { status: 304, headers: { etag: "etag-1" } });
    });
    const result = await fetchWebDevSource({ source, now: "2026-08-28T06:00:00.000Z", cache, mode: "live", fetchImpl: fetchImpl as typeof fetch, resolveImpl: PUBLIC_DNS });
    expect(result).toMatchObject({ kind: "unchanged", reason: "not-modified", attempts: 1 });
    expect(result.nextCache.consecutiveFailures).toBe(0);
  });

  it("skips parsing when a 200 response has an unchanged content hash", async () => {
    const source = (await loadWebDevSourceRegistry()).sources[0]!;
    const bytes = new TextEncoder().encode("same bytes");
    const seeded = await fetchWebDevSource({ source, now: NOW, mode: "fixture", fixtureBody: bytes });
    const result = await fetchWebDevSource({
      source,
      now: "2026-08-28T06:00:00.000Z",
      cache: seeded.nextCache,
      mode: "live",
      fetchImpl: (async () => new Response(bytes, { status: 200, headers: { "content-type": "application/rss+xml" } })) as typeof fetch,
      resolveImpl: PUBLIC_DNS
    });
    expect(result).toMatchObject({ kind: "unchanged", reason: "content-hash" });
  });

  it("records bounded retry-after state and does not retry beyond the source cap", async () => {
    const source = (await loadWebDevSourceRegistry()).sources[0]!;
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 429, headers: { "retry-after": "120" } }));
    const result = await fetchWebDevSource({ source, now: NOW, mode: "live", fetchImpl: fetchImpl as typeof fetch, resolveImpl: PUBLIC_DNS });
    expect(result).toMatchObject({ kind: "backoff", reason: "http-429", attempts: 1, retryAfterAt: "2026-08-28T05:02:00.000Z" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("makes dry and uninjected CI runs network-free", async () => {
    const source = (await loadWebDevSourceRegistry()).sources[0]!;
    const fetchImpl = vi.fn();
    expect(await fetchWebDevSource({ source, now: NOW, mode: "dry", fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ kind: "failed", reason: "dry-mode-no-network-or-cache-mutation" });
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.stubEnv("CI", "true");
    expect(await fetchWebDevSource({ source, now: NOW, mode: "live" })).toMatchObject({ kind: "failed", reason: "ci-live-network-disabled" });
  });

  it("inherits content-type, size and private redirect rejection from the shared safe fetch", async () => {
    const source = (await loadWebDevSourceRegistry()).sources[0]!;
    const wrongType = await fetchWebDevSource({
      source,
      now: NOW,
      mode: "live",
      fetchImpl: (async () => new Response("binary", { status: 200, headers: { "content-type": "application/octet-stream" } })) as typeof fetch,
      resolveImpl: PUBLIC_DNS
    });
    expect(wrongType).toMatchObject({ kind: "failed" });
    expect((wrongType.kind === "failed" || wrongType.kind === "held") && wrongType.reason).toMatch(/content type/i);

    const redirected = await fetchWebDevSource({
      source,
      now: NOW,
      mode: "live",
      fetchImpl: (async () => new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest" } })) as typeof fetch,
      resolveImpl: PUBLIC_DNS
    });
    expect(redirected).toMatchObject({ kind: "failed" });
    expect((redirected.kind === "failed" || redirected.kind === "held") && redirected.reason).toMatch(/HTTPS URL|private|allowlisted/i);
  });
});
