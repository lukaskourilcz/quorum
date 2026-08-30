import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runContestAdapter } from "../src/ventures/contest-radar/adapters.js";
import { fetchContestSource, type ContestFetchCache } from "../src/ventures/contest-radar/fetch.js";
import { loadContestSourceRegistry } from "../src/ventures/contest-radar/sources.js";
import { repoRoot } from "../src/paths.js";

const AT = "2026-08-30T12:00:00.000Z";

async function fixture(name: string): Promise<string> {
  return readFile(path.join(repoRoot, "orchestrator/tests/fixtures/contest-radar", name), "utf8");
}

async function sourceById(id: string) {
  const registry = await loadContestSourceRegistry();
  return registry.sources.find((source) => source.id === id)!;
}

/**
 * The fixtures are real captures from 2026-08-30, trimmed to three rows each. An adapter proved
 * against invented bytes proves nothing about the source it will actually meet.
 */
describe("the Contest Radar adapters", () => {
  it("reads Devpost's public JSON into bounded candidates", async () => {
    const result = runContestAdapter({
      source: await sourceById("devpost"),
      body: await fixture("devpost.json"),
      observedAt: AT
    });

    expect(result.malformed).toBe(0);
    expect(result.candidates.length).toBeGreaterThan(0);
    const first = result.candidates[0]!;
    expect(first.hints.kind).toBe("hackathon");
    expect(first.listingUrl.startsWith("https://")).toBe(true);
    expect(first.contentHash).toHaveLength(64);
  });

  it("keeps Czech and Slovak diacritics intact through a feed and a REST body", async () => {
    const [rss, wordpress] = await Promise.all([
      fixture("esutaze.xml").then(async (body) =>
        runContestAdapter({ source: await sourceById("esutaze-sk"), body, observedAt: AT })),
      fixture("chcemesoutezit.json").then(async (body) =>
        runContestAdapter({ source: await sourceById("chcemesoutezit-cz"), body, observedAt: AT }))
    ]);

    expect(rss.malformed).toBe(0);
    expect(wordpress.malformed).toBe(0);
    const titles = [...rss.candidates, ...wordpress.candidates].map(({ title }) => title).join(" ");
    // Mangled encoding is the failure this catches, and it is silent otherwise.
    expect(titles).toMatch(/[áčďéěíňóřšťúůýž]/iu);
    expect(titles).not.toMatch(/Ã|â€|Ã©/u);
  });

  it("carries no page body, no markup and no http:// link", async () => {
    const result = runContestAdapter({
      source: await sourceById("esutaze-sk"),
      body: await fixture("esutaze.xml"),
      observedAt: AT
    });

    for (const item of result.candidates) {
      const serialized = JSON.stringify(item);
      // The founding forbids a raw archive, and a feed's description is where one would creep in.
      expect(serialized).not.toMatch(/<\/?(?:p|div|img|a|script)\b/u);
      expect(item.snippet?.length ?? 0).toBeLessThanOrEqual(1_000);
      expect(item.listingUrl.startsWith("https://")).toBe(true);
    }
  });

  it("treats everything it reads as a hint rather than a fact", async () => {
    const result = runContestAdapter({
      source: await sourceById("devpost"),
      body: await fixture("devpost.json"),
      observedAt: AT
    });

    // A candidate has no confidence and no evidence ref anywhere: extraction adds those after the
    // rules page is read. A listing's marketing copy is not a deadline anybody can rely on.
    const serialized = JSON.stringify(result.candidates);
    expect(serialized).not.toContain("confidence");
    expect(serialized).not.toContain("evidenceRefs");
  });

  it("costs one item for a malformed row rather than the whole source", async () => {
    const body = JSON.stringify({
      hackathons: [
        { id: 1, title: "Real one", url: "https://example.test/one" },
        { id: 2, title: "", url: "https://example.test/two" },
        { title: "No id", url: "https://example.test/three" },
        { id: 4, title: "Insecure", url: "http://example.test/four" }
      ]
    });

    const result = runContestAdapter({ source: await sourceById("devpost"), body, observedAt: AT });

    expect(result.candidates).toHaveLength(1);
    expect(result.malformed).toBe(3);
  });

  it("returns one malformed and no candidates for a body it cannot parse", async () => {
    const result = runContestAdapter({ source: await sourceById("devpost"), body: "{ not json", observedAt: AT });

    expect(result).toEqual({ candidates: [], malformed: 1 });
  });
});

describe("the Contest Radar fetcher", () => {
  const cache: ContestFetchCache = {};

  it("refuses a source the registry did not enable, without a request", async () => {
    let called = 0;
    const outcome = await fetchContestSource({
      source: await sourceById("vyhrat-sk"),
      cache,
      now: new Date(AT),
      fetchImpl: (async () => { called += 1; throw new Error("unreachable"); }) as never
    });

    expect(outcome.kind).toBe("skipped");
    expect(outcome.requestCount).toBe(0);
    expect(called).toBe(0);
  });

  it("makes no request for a discovery-only source", async () => {
    let called = 0;
    const outcome = await fetchContestSource({
      source: await sourceById("goviral-scout"),
      cache,
      now: new Date(AT),
      fetchImpl: (async () => { called += 1; throw new Error("unreachable"); }) as never
    });

    expect(outcome.kind).toBe("skipped");
    expect(called).toBe(0);
  });

  it("cuts off a body over its declared ceiling", async () => {
    const source = await sourceById("devpost");
    const outcome = await fetchContestSource({
      source,
      cache,
      now: new Date(AT),
      fetchImpl: (async () => new Response("x".repeat(source.maxBodyBytes + 10), {
        status: 200,
        headers: { "content-type": "application/json" }
      })) as never
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.reason).toContain("over the");
    // A receipt carries the host and the shape of the failure, never a body excerpt.
    expect(outcome.reason).not.toContain("xxxx");
  });

  it("reads an unchanged source from its own body hash when it sends no validator", async () => {
    const source = await sourceById("devpost");
    const body = await fixture("devpost.json");
    const first = await fetchContestSource({
      source, cache, now: new Date(AT),
      fetchImpl: (async () => new Response(body, { status: 200 })) as never
    });
    expect(first.kind).toBe("ok");
    if (first.kind !== "ok") return;

    const second = await fetchContestSource({
      source,
      cache: { [source.id]: first.cache },
      now: new Date(AT),
      fetchImpl: (async () => new Response(body, { status: 200 })) as never
    });

    expect(second.kind).toBe("unchanged");
  });

  it("sends a conditional request once it holds a validator", async () => {
    const source = await sourceById("devpost");
    let sent: Record<string, string> = {};
    const outcome = await fetchContestSource({
      source,
      cache: { [source.id]: { etag: 'W/"abc"', lastModified: null, bodyHash: "x", fetchedAt: AT } },
      now: new Date(AT),
      fetchImpl: ((_url: string, init: { headers: Record<string, string> }) => {
        sent = init.headers;
        return Promise.resolve(new Response(null, { status: 304 }));
      }) as never
    });

    expect(sent["if-none-match"]).toBe('W/"abc"');
    expect(outcome.kind).toBe("unchanged");
  });

  it("identifies itself honestly rather than imitating a browser", async () => {
    const source = await sourceById("devpost");
    let sent: Record<string, string> = {};
    await fetchContestSource({
      source, cache: {}, now: new Date(AT),
      fetchImpl: ((_url: string, init: { headers: Record<string, string> }) => {
        sent = init.headers;
        return Promise.resolve(new Response("{}", { status: 200 }));
      }) as never
    });

    expect(sent["user-agent"]).toContain("BoardlessAI-ContestRadar");
    expect(sent["user-agent"]).not.toMatch(/Mozilla|Chrome|Safari/u);
  });
});
