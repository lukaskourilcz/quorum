import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KvorumMonitorReceiptSchema,
  type KvorumMonitorReceipt
} from "../src/contracts/kvorum-monitor.js";
import {
  buildKvorumMonitorReceipt,
  purgeKvorumRawItems,
  writeKvorumMonitorReceipt
} from "../src/ventures/kvorum/monitor.js";
import { atomicWriteJson } from "../src/state.js";
import { repoRoot } from "../src/paths.js";

const now = new Date("2026-08-12T21:00:00.000Z");

async function validFixture(): Promise<KvorumMonitorReceipt> {
  return KvorumMonitorReceiptSchema.parse(JSON.parse(await readFile(
    path.join(repoRoot, "contracts/fixtures/kvorum-monitor.valid.json"),
    "utf8"
  )) as unknown);
}

describe("kvorum-monitor/1 receipt", () => {
  it("accepts the golden receipt and rejects the poison governance and count claims", async () => {
    expect(KvorumMonitorReceiptSchema.safeParse(await validFixture()).success).toBe(true);
    const poison = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/kvorum-monitor.poison.json"),
      "utf8"
    )) as unknown;
    expect(KvorumMonitorReceiptSchema.safeParse(poison).success).toBe(false);
  });

  it("purges a 31-day-old raw item while its cluster, attribution and rank survive byte-for-byte", async () => {
    const receipt = await validFixture();
    receipt.rawItems[0]!.publishedAt = "2026-07-12T20:59:59.000Z";
    receipt.itemsKept = receipt.rawItems.length;
    const clusterBefore = JSON.stringify(receipt.clusters);
    const ranksBefore = JSON.stringify(receipt.ranks);

    const purged = purgeKvorumRawItems(receipt, now);

    expect(purged.rawItems).toHaveLength(1);
    expect(purged.rawItems.some((item) => item.source.id === "stit-demokracie-facebook"))
      .toBe(false);
    expect(JSON.stringify(purged.clusters)).toBe(clusterBefore);
    expect(JSON.stringify(purged.ranks)).toBe(ranksBefore);
    expect(purged.clusters[0]?.attributions[0]).toMatchObject({
      sourceId: "stit-demokracie-facebook",
      url: "https://facebook.com/stitdemokracie/posts/123",
      excerpt: "Premiér Babiš jednal o televizních poplatcích."
    });
    expect(purged.purge).toMatchObject({
      retentionDays: 30,
      cutoffPublishedAt: "2026-07-13T21:00:00.000Z",
      rawItemsBefore: 2,
      rawItemsAfter: 1,
      purged: [{
        sourceId: "stit-demokracie-facebook",
        publishedAt: "2026-07-12T20:59:59.000Z",
        purgedAt: "2026-08-12T21:00:00.000Z"
      }]
    });
    expect(purged.purge.purged[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps an item exactly on the 30-day boundary", async () => {
    const receipt = await validFixture();
    receipt.rawItems[0]!.publishedAt = "2026-07-13T21:00:00.000Z";
    const purged = purgeKvorumRawItems(receipt, now);
    expect(purged.rawItems).toHaveLength(2);
    expect(purged.purge.purged).toEqual([]);
  });

  it("keeps the top hundred clusters on a loud day instead of throwing, and says how many it dropped", async () => {
    const fixture = await validFixture();
    const template = fixture.clusters[0]!;
    const clusterId = (index: number) => index.toString(16).padStart(40, "0");

    // 163 clusters is what the first live seven-feed read actually produced on 2026-08-30.
    const clusters = Array.from({ length: 163 }, (_, index) => ({
      ...template,
      id: clusterId(index),
      title: `Shluk ${index}`
    }));
    // Ascending score, so the hundred the receipt must keep are the *last* hundred built. The
    // score is the factor product the contract cross-checks, so entityWeight carries it alone.
    const ranks = clusters.map((cluster, index) => ({
      clusterId: cluster.id,
      position: index + 1,
      score: index + 1,
      factors: {
        corroboration: 1,
        entityWeight: index + 1,
        engagementSalience: 1,
        novelty: 1,
        standingTopicContinuity: 1,
        trendCrossover: 1
      }
    }));

    const receipt = buildKvorumMonitorReceipt({
      date: "2026-08-12",
      now,
      fetched: {
        items: [],
        sourceResults: [{
          sourceId: "irozhlas",
          kind: "feed",
          attempted: true,
          status: "success",
          count: 163,
          reason: null
        }],
        artifactPaths: [],
        fixtureOnly: false
      },
      clusters,
      ranks
    });

    expect(receipt.clusters).toHaveLength(100);
    expect(receipt.ranks).toHaveLength(100);
    expect(receipt.truncated).toEqual({ clusters: 63, ranks: 63 });
    // Highest score first, renumbered from one, and the lowest-scoring clusters fell off.
    expect(receipt.ranks[0]).toMatchObject({ clusterId: clusterId(162), position: 1, score: 163 });
    expect(receipt.ranks.at(-1)).toMatchObject({ clusterId: clusterId(63), position: 100 });
    expect(new Set(receipt.clusters.map((cluster) => cluster.id)))
      .toEqual(new Set(receipt.ranks.map((rank) => rank.clusterId)));
    expect(receipt.clusters.some((cluster) => cluster.id === clusterId(0))).toBe(false);
  });

  it("records no truncation on an ordinary day", async () => {
    const fixture = await validFixture();
    const receipt = buildKvorumMonitorReceipt({
      date: "2026-08-12",
      now,
      fetched: {
        items: [],
        sourceResults: fixture.sourceResults,
        artifactPaths: [],
        fixtureOnly: fixture.fixtureOnly
      },
      clusters: fixture.clusters,
      ranks: fixture.ranks
    });
    expect(receipt.truncated).toEqual({ clusters: 0, ranks: 0 });
    expect(receipt.clusters).toEqual(fixture.clusters);
  });

  it("uses one atomic writer for today's receipt and retention rewrites", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "kvorum-monitor-writer-"));
    try {
      const historical = await validFixture();
      historical.date = "2026-07-12";
      historical.generatedAt = "2026-07-12T21:00:00.000Z";
      historical.rawItems[0]!.publishedAt = "2026-07-12T20:59:59.000Z";
      historical.itemsKept = historical.rawItems.length;
      await atomicWriteJson(root, "ventures/kvorum/monitor/2026-07-12.json", historical);

      const current = buildKvorumMonitorReceipt({
        date: "2026-08-12",
        now,
        fetched: {
          items: [],
          sourceResults: [{
            sourceId: "stit-demokracie-facebook",
            kind: "apify",
            attempted: false,
            status: "skipped",
            count: 0,
            reason: "Fixture-only approval hold."
          }],
          artifactPaths: [],
          fixtureOnly: true
        }
      });
      const paths = await writeKvorumMonitorReceipt({ root, receipt: current, now });
      expect(paths).toEqual([
        "ventures/kvorum/monitor/2026-08-12.json",
        "ventures/kvorum/monitor/2026-07-12.json"
      ]);

      const storedHistorical = KvorumMonitorReceiptSchema.parse(JSON.parse(await readFile(
        path.join(root, "ventures/kvorum/monitor/2026-07-12.json"),
        "utf8"
      )) as unknown);
      expect(storedHistorical.rawItems).toHaveLength(1);
      expect(storedHistorical.rawItems[0]?.source.id).toBe("irozhlas");
      expect(storedHistorical.clusters).toEqual(historical.clusters);
      expect(storedHistorical.ranks).toEqual(historical.ranks);

      const storedCurrent = KvorumMonitorReceiptSchema.parse(JSON.parse(await readFile(
        path.join(root, "ventures/kvorum/monitor/2026-08-12.json"),
        "utf8"
      )) as unknown);
      expect(storedCurrent).toMatchObject({
        date: "2026-08-12",
        fixtureOnly: true,
        itemsKept: 0,
        rawItems: [],
        clusters: [],
        ranks: []
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
