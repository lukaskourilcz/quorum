import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KVORUM_APIFY_MONTHLY_SHARE_USD,
  KVORUM_APIFY_RUN_RESERVATION_USD,
  KvorumApifyQuotaSchema
} from "../src/contracts/kvorum-apify-quota.js";
import { KvorumSourceRegistrySchema } from "../src/contracts/kvorum-sources.js";
import { repoRoot } from "../src/paths.js";

async function json(relativePath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8")) as unknown;
}

describe("Kvórum Apify quota", () => {
  it("loads the zero-use state with the signed venture share", async () => {
    const quota = KvorumApifyQuotaSchema.parse(
      await json("state/kvorum/source-quota/apify.json")
    );
    expect(quota).toEqual({
      schemaVersion: "kvorum-apify-quota/1",
      month: "2026-08",
      shareCapUsd: KVORUM_APIFY_MONTHLY_SHARE_USD,
      estimatedUsedUsd: 0,
      sharedAccountUsedUsd: null,
      reservedPerRun: KVORUM_APIFY_RUN_RESERVATION_USD,
      updatedAt: "2026-08-12T00:00:00.000Z",
      perActorCounts: {}
    });
  });

  it("reserves the verified full-run ceiling rather than the stale design estimate", async () => {
    const sources = KvorumSourceRegistrySchema.parse(await json("config/kvorum-sources.json"));
    expect(KVORUM_APIFY_RUN_RESERVATION_USD).toBe(sources.actors[0]!.pricing.maxRunUsd);
    expect(KVORUM_APIFY_RUN_RESERVATION_USD).toBe(sources.recipe[0]!.maxTotalChargeUsd);
    expect(KVORUM_APIFY_RUN_RESERVATION_USD).toBe(0.151);
    expect(KVORUM_APIFY_RUN_RESERVATION_USD * 13)
      .toBeLessThan(KVORUM_APIFY_MONTHLY_SHARE_USD);
    expect(KVORUM_APIFY_RUN_RESERVATION_USD * 14)
      .toBeGreaterThan(KVORUM_APIFY_MONTHLY_SHARE_USD);
  });

  it("accepts reconciled fixtures and rejects stale or unreconciled quota state", async () => {
    expect(KvorumApifyQuotaSchema.safeParse(
      await json("contracts/fixtures/kvorum-apify-quota.valid.json")
    ).success).toBe(true);
    expect(KvorumApifyQuotaSchema.safeParse(
      await json("contracts/fixtures/kvorum-apify-quota.poison.json")
    ).success).toBe(false);

    const valid = await json("contracts/fixtures/kvorum-apify-quota.valid.json") as {
      estimatedUsedUsd: number;
    };
    valid.estimatedUsedUsd = 0.1;
    expect(KvorumApifyQuotaSchema.safeParse(valid).success).toBe(false);
  });
});
