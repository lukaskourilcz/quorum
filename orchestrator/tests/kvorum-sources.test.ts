import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KvorumSourceRegistrySchema } from "../src/contracts/kvorum-sources.js";
import { configRoot, repoRoot } from "../src/paths.js";
import { loadKvorumSourceRegistry } from "../src/ventures/kvorum/sources.js";

describe("Kvórum source registry", () => {
  it("loads the pinned actor and all seven verified feeds", async () => {
    const registry = await loadKvorumSourceRegistry();
    expect(registry).toMatchObject({
      schemaVersion: "kvorum-sources/1",
      verifiedAt: "2026-08-12",
      approvals: { actor: "KV-APIFY-001", feeds: "KV-SOURCES-002", requiredBeforeLive: true }
    });
    expect(registry.actors[0]).toMatchObject({
      actorSlug: "apify/facebook-posts-scraper",
      actorBuildId: "laKrch6r0XAnxtAFh",
      credentialEnv: "APIFY_TOKEN",
      scheduled: true,
      pricing: {
        actorStartUsd: 0.001,
        pricePerResultUsd: 0.005,
        maxRunUsd: 0.151,
        estimatedThirtyDayUsd: 4.53,
        worstCalendarMonthUsd: 4.681,
        monthlyShareCapUsd: 2
      }
    });
    expect(registry.recipe).toEqual([expect.objectContaining({
      targetPage: "https://www.facebook.com/stitdemokracie",
      maxResults: 30,
      runsPerDay: 1,
      cadence: "daily",
      maxTotalChargeUsd: 0.151
    })]);
    expect(registry.actors[0]!.pricing.worstCalendarMonthUsd)
      .toBeGreaterThan(registry.actors[0]!.pricing.monthlyShareCapUsd);
    expect(registry.feeds.map((feed) => feed.id)).toEqual([
      "irozhlas",
      "ct24",
      "denik-n",
      "seznam-zpravy",
      "psp-tisky",
      "vlada",
      "google-news-cz"
    ]);
    expect(registry.feeds.every((feed) => feed.enabled && feed.costUsd === 0)).toBe(true);
    expect(registry.feeds.map((feed) => feed.host)).toEqual(
      registry.feeds.map((feed) => new URL(feed.url).hostname)
    );
  });

  it("keeps the published fixture and live config under the same contract", async () => {
    const fixture = JSON.parse(await readFile(
      path.join(repoRoot, "contracts/fixtures/kvorum-sources.valid.json"),
      "utf8"
    )) as unknown;
    expect(KvorumSourceRegistrySchema.safeParse(fixture).success).toBe(true);
    expect(KvorumSourceRegistrySchema.safeParse(JSON.parse(await readFile(
      path.join(configRoot, "kvorum-sources.json"),
      "utf8"
    )) as unknown).success).toBe(true);
  });
});
