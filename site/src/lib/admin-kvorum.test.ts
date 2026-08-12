import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readAdminKvorum } from "./admin-kvorum";

const created: string[] = [];

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(process.cwd(), `../contracts/fixtures/${name}.json`), "utf8")) as unknown;
}

async function makeRoot(files: Record<string, unknown | string> = {}): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "boardless-admin-kvorum-"));
  created.push(root);
  for (const [relative, value] of Object.entries(files)) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
  vi.stubEnv("BOARDLESSAI_REPO_ROOT", root);
  return root;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(created.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("the Kvórum admin sanitising boundary", () => {
  it("loads fixture records as plain panel data without leaking repository addresses", async () => {
    const recommendation = await fixture("venture-recommendation.valid");
    const monitor = await fixture("kvorum-monitor.valid");
    const quota = await fixture("kvorum-apify-quota.valid");
    const root = await makeRoot({
      "state/ventures/kvorum/recommendations/2026-08-12-public-media.json": recommendation,
      "state/ventures/kvorum/monitor/2026-08-12.json": monitor,
      "state/kvorum/source-quota/apify.json": quota
    });

    const snapshot = await readAdminKvorum();
    expect(snapshot).toMatchObject({
      recommendationsState: "present",
      monitorState: "present",
      quotaState: "present",
      unreadable: 0,
      recommendations: [{
        id: "kv-2026-08-12-public-media",
        slug: "public-media",
        headline: "Poplatky se vracejí do Sněmovny",
        evidence: {
          stit: { internalOnly: true, posts: [{ engagement: { likes: 120, comments: 18, shares: 7 } }] }
        },
        gates: { passed: true },
        owner: { postingMode: "manual-only", original: null }
      }],
      monitor: [{
        date: "2026-08-12",
        fixtureOnly: false,
        itemsKept: 2,
        clusters: [{
          title: "Financování médií veřejné služby",
          rank: { position: 1, score: 8.4 }
        }],
        purge: { retentionDays: 30, rawItemsBefore: 2, rawItemsAfter: 2, purgedCount: 0 }
      }],
      quota: {
        month: "2026-08",
        shareCapUsd: 2,
        estimatedUsedUsd: 0.151,
        sharedAccountUsedUsd: 1.25,
        reservedPerRun: 0.151,
        perActorCounts: [{ actorId: "stit-demokracie-facebook", runs: 1, items: 30, estimatedUsd: 0.151 }]
      }
    });
    expect(snapshot.recommendations[0]?.evidence.claims[0]).toMatchObject({
      id: "claim-snemovna",
      type: "fact-multi"
    });
    expect(snapshot.recommendations[0]?.evidence.claims[0]?.sources).toEqual([
      expect.objectContaining({
        sourceName: "iROZHLAS",
        url: "https://www.irozhlas.cz/zpravy-domov/televizni-poplatky"
      }),
      expect.objectContaining({
        sourceName: "ČT24",
        url: "https://ct24.ceskatelevize.cz/domaci/televizni-poplatky"
      })
    ]);
    expect(snapshot.monitor[0]?.clusters[0]?.sources[0]?.engagement)
      .toEqual({ likes: 120, comments: 18, shares: 7 });

    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(root);
    expect(serialized).not.toContain("state/");
    expect(serialized).not.toContain("receiptRef");
    expect(serialized).not.toContain("resultRefs");
    expect(serialized).not.toContain("ratingRef");
  });

  it("drops malformed records independently and reports only their count", async () => {
    const recommendation = await fixture("venture-recommendation.valid");
    const monitor = await fixture("kvorum-monitor.valid");
    await makeRoot({
      "state/ventures/kvorum/recommendations/2026-08-12-public-media.json": recommendation,
      "state/ventures/kvorum/recommendations/2026-08-11-broken.json": "{ not json",
      "state/ventures/kvorum/monitor/2026-08-12.json": monitor,
      "state/ventures/kvorum/monitor/2026-08-11.json": { schemaVersion: "wrong" },
      "state/kvorum/source-quota/apify.json": { schemaVersion: "wrong" }
    });

    const snapshot = await readAdminKvorum();
    expect(snapshot.recommendationsState).toBe("present");
    expect(snapshot.recommendations).toHaveLength(1);
    expect(snapshot.monitorState).toBe("present");
    expect(snapshot.monitor).toHaveLength(1);
    expect(snapshot.quotaState).toBe("unreadable");
    expect(snapshot.quota).toBeNull();
    expect(snapshot.unreadable).toBe(3);
    expect(snapshot).not.toHaveProperty("unreadableFiles");
  });

  it("distinguishes first-run, empty and wholly unreadable stores", async () => {
    const root = await makeRoot();
    await expect(readAdminKvorum()).resolves.toMatchObject({
      recommendationsState: "missing",
      monitorState: "missing",
      quotaState: "missing",
      unreadable: 0
    });

    await Promise.all([
      mkdir(path.join(root, "state/ventures/kvorum/recommendations"), { recursive: true }),
      mkdir(path.join(root, "state/ventures/kvorum/monitor"), { recursive: true })
    ]);
    await expect(readAdminKvorum()).resolves.toMatchObject({
      recommendationsState: "present",
      recommendations: [],
      monitorState: "present",
      monitor: [],
      quotaState: "missing"
    });

    await Promise.all([
      writeFile(path.join(root, "state/ventures/kvorum/recommendations/2026-08-12-broken.json"), "{}", "utf8"),
      writeFile(path.join(root, "state/ventures/kvorum/monitor/2026-08-12.json"), "{}", "utf8")
    ]);
    await expect(readAdminKvorum()).resolves.toMatchObject({
      recommendationsState: "unreadable",
      recommendations: [],
      monitorState: "unreadable",
      monitor: [],
      unreadable: 2
    });
  });
});
