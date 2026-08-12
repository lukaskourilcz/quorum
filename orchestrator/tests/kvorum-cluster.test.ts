import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { KvorumMonitorItemSchema, type KvorumMonitorItem } from "../src/contracts/kvorum-monitor.js";
import {
  KVORUM_CLUSTER_JACCARD_THRESHOLD,
  clusterKvorumItems,
  kvorumJaccard,
  kvorumMonitorItemRef,
  normalizeKvorumTopicTokens
} from "../src/ventures/kvorum/cluster.js";

const LABELS = {
  "ceska-televize": "Česká televize",
  "public-media-funding": "Financování médií veřejné služby",
  "ukraine-aid": "Pomoc Ukrajině",
  "vlada-cr": "Vláda České republiky"
};

async function fixtureDay(): Promise<KvorumMonitorItem[]> {
  const raw = JSON.parse(await readFile(
    path.join(import.meta.dirname, "fixtures/kvorum-cluster-day.json"),
    "utf8"
  )) as unknown[];
  return raw.map((item) => KvorumMonitorItemSchema.parse(item));
}

describe("Kvórum deterministic clustering", () => {
  test("normalizes Czech headline tokens and excludes prose after the first clause", () => {
    expect(normalizeKvorumTopicTokens(
      "Televizní POPLATKY se znovu mění — Toto tělo textu nesmí ovlivnit shluk."
    )).toEqual(["meni", "poplatky", "televizni", "znovu"]);
  });

  test("uses weighted Jaccard with curated entities carrying more signal", () => {
    expect(kvorumJaccard(
      { entityIds: ["public-media-funding"], topicTokens: ["poplatky", "televizni"] },
      { entityIds: ["public-media-funding"], topicTokens: ["poplatky", "snemovna"] }
    )).toBeCloseTo(5 / 7);
    expect(kvorumJaccard(
      { entityIds: [], topicTokens: [] },
      { entityIds: [], topicTokens: [] }
    )).toBe(0);
  });

  test("canonicalizes feed URLs and keys Facebook posts by their public post id", async () => {
    const [facebook, , , , , , , feed] = await fixtureDay();
    expect(kvorumMonitorItemRef({
      ...feed!,
      url: "https://www.psp.cz/sqw/text/tiskt.sqw?utm_medium=email&CT=42&O=10#top"
    })).toBe(kvorumMonitorItemRef(feed!));
    expect(kvorumMonitorItemRef({
      ...facebook!,
      url: "https://facebook.com/redirected/1001",
      stit: {
        ...("stit" in facebook! ? facebook!.stit : { pagePostUrl: "", likes: null, comments: null, shares: null }),
        pagePostUrl: "https://facebook.com/stitdemokracie/posts/1001?ref=share"
      }
    })).toBe(kvorumMonitorItemRef(facebook!));
  });

  test("clusters a realistic day with item-level attribution and shared explanations", async () => {
    const clusters = clusterKvorumItems(await fixtureDay(), { entityLabels: LABELS });
    expect(clusters).toHaveLength(4);
    expect(clusters.map((cluster) => cluster.itemRefs.length).sort()).toEqual([1, 2, 2, 3]);

    const media = clusters.find((cluster) => cluster.itemRefs.length === 3)!;
    expect(media.entityIds).toEqual(["ceska-televize", "public-media-funding"]);
    expect(media.topicTokens).toEqual(["poplatky", "televizni"]);
    expect(media.title).toBe("Česká televize · Financování médií veřejné služby");
    expect(media.attributions).toHaveLength(media.itemRefs.length);
    expect(media.attributions.filter((item) => item.discoveryOnly)).toHaveLength(1);
    expect(media.attributions.find((item) => item.discoveryOnly)?.sourceName).toBe("Štít demokracie");

    const topicOnly = clusters.find((cluster) => cluster.entityIds.length === 0)!;
    expect(topicOnly.topicTokens).toEqual(["ceka", "obci", "rozpocet", "zmena"]);
    expect(topicOnly.itemRefs).toHaveLength(2);
    expect(topicOnly.title).toBe("Ceka · obci · rozpocet · zmena");
  });

  test("honors the threshold and refuses an unexplainable transitive merge", async () => {
    const items = await fixtureDay();
    expect(clusterKvorumItems(items, { jaccardThreshold: 1 })).toHaveLength(7);
    expect(KVORUM_CLUSTER_JACCARD_THRESHOLD).toBe(0.2);

    const base = items[5]!;
    const chain: KvorumMonitorItem[] = [
      { ...base, url: "https://denikn.cz/a", text: "Alpha beta", entities: [] },
      { ...base, url: "https://denikn.cz/b", text: "Alpha beta gamma", entities: [] },
      { ...base, url: "https://denikn.cz/c", text: "Beta gamma", entities: [] }
    ];
    const clusters = clusterKvorumItems(chain, { jaccardThreshold: 0.5 });
    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) =>
      cluster.entityIds.length > 0 || cluster.topicTokens.length > 0
    )).toBe(true);
  });

  test("deduplicates one canonical item in favor of a direct source", async () => {
    const items = await fixtureDay();
    const direct = items[1]!;
    const duplicate: KvorumMonitorItem = {
      ...direct,
      source: { id: "google-news-cz", name: "Google News Czech edition", kind: "rss", host: "news.google.com" },
      url: `${direct.url}?utm_source=google`
    };
    const clusters = clusterKvorumItems([duplicate, direct]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.attributions).toHaveLength(1);
    expect(clusters[0]?.attributions[0]?.sourceId).toBe("irozhlas");
  });

  test("is byte-stable across runs and input order on the fixture day", async () => {
    const items = await fixtureDay();
    const first = JSON.stringify(clusterKvorumItems(items, { entityLabels: LABELS }));
    const second = JSON.stringify(clusterKvorumItems(items, { entityLabels: LABELS }));
    const reversed = JSON.stringify(clusterKvorumItems([...items].reverse(), { entityLabels: LABELS }));
    expect(second).toBe(first);
    expect(reversed).toBe(first);
  });

  test("rejects invalid thresholds and omits items with no usable signal", async () => {
    const [item] = await fixtureDay();
    expect(() => clusterKvorumItems([item!], { jaccardThreshold: 0 })).toThrow("(0, 1]");
    expect(clusterKvorumItems([{ ...item!, text: "a i u", entities: [] }])).toEqual([]);
  });
});
