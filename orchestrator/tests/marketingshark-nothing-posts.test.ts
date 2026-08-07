import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPublishingVenture, SOCIAL_VENTURES } from "../src/social/activation.js";
import { assertQueueItemPublishable, QueueItemSchema } from "../src/social/queue.js";
import { enabledBrands, loadMarketingSharkConfig } from "../src/ventures/marketingshark/config.js";
import { EMPTY_LEDGER } from "../src/ventures/marketingshark/ledger.js";
import { MarketingSharkPackage } from "../src/ventures/marketingshark/package.js";
import { buildQueueItems } from "../src/ventures/marketingshark/queue.js";
import { fixtureChumOutput, planBrandDay, runBrandDay } from "../src/ventures/marketingshark/run.js";

async function draftedPackage(): Promise<{ built: MarketingSharkPackage; root: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "ms-post-"));
  const config = await loadMarketingSharkConfig();
  const brand = enabledBrands(config)[0]!;
  await runBrandDay({
    config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08", cycleId: "c", root, dry: true,
    call: async () => {
      const plan = await planBrandDay({ config, brand, ledger: EMPTY_LEDGER, date: "2026-08-08" });
      return {
        usd: 0,
        output: fixtureChumOutput({
          brand, question: plan.question,
          hookA: plan.hooks.a.variants[brand.tone]!.en, hookACs: plan.hooks.a.variants[brand.tone]!.cs,
          hookB: plan.hooks.b.variants[brand.tone]!.en, hookBCs: plan.hooks.b.variants[brand.tone]!.cs
        })
      };
    }
  });
  const built = MarketingSharkPackage.parse(JSON.parse(await readFile(
    path.join(root, "ventures/marketingshark/packages/2026-08-08/devshark/package.json"), "utf8")));
  return { built, root };
}

describe("marketingShark cannot post", () => {
  it("keeps the global kill switch up and measurement closed in the committed environment", async () => {
    const environment = await readFile(path.join(process.cwd(), "..", ".env.example"), "utf8");
    expect(environment).toMatch(/^SOCIAL_KILL_SWITCH=true$/mu);
    expect(environment).toMatch(/^METRICS_INGESTION_ENABLED=false$/mu);
    // The venture added no channel, no token and no user id of its own.
    expect(environment).not.toMatch(/MARKETINGSHARK|DEVSHARK|GEOSHARK/iu);
  });

  it("writes every queue item as a draft the publisher refuses", async () => {
    const { built } = await draftedPackage();
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;
    const items = buildQueueItems({ built, brand, now: new Date("2026-08-08T07:00:00.000Z") });

    expect(items).toHaveLength(4);
    for (const { item } of items) {
      expect(item.status).toBe("draft");
      expect(item.venture).toBe("marketingshark");
      expect(Object.values(item.checks).every((status) => status === "pending")).toBe(true);
      // Only queued or publishing reaches the publisher, and every check must pass. A draft with
      // eight pending checks fails both tests at once.
      expect(() => assertQueueItemPublishable(item)).toThrow(/not queued for publishing/u);
    }
  });

  it("refuses the item even if someone flips its status to queued", async () => {
    const { built } = await draftedPackage();
    const config = await loadMarketingSharkConfig();
    const brand = enabledBrands(config)[0]!;
    const item = buildQueueItems({ built, brand, now: new Date("2026-08-08T07:00:00.000Z") })[0]!.item;

    const forced = QueueItemSchema.parse({ ...item, status: "queued" });
    // The approval checks are the second lock and they are all still pending.
    expect(() => assertQueueItemPublishable(forced)).toThrow(/incomplete approval checks/u);
  });

  it("is not a publishing venture, so the runner never reaches its items", () => {
    // The third lock. The publisher iterates ventures that own an activation record; a venture
    // with no social account has none, and the guard says so by name rather than by crashing on
    // an undefined lookup.
    expect(isPublishingVenture("marketingshark")).toBe(false);
    expect(SOCIAL_VENTURES).toEqual(["caught-up", "mma-files", "titty-tuesdays"]);
    for (const venture of SOCIAL_VENTURES) expect(isPublishingVenture(venture)).toBe(true);
  });

  it("records the A/B variants without ever ranking them", async () => {
    const { built } = await draftedPackage();
    expect(built.abRecord.measured).toBe(false);
    expect(built.hooks.a.patternId).not.toBe(built.hooks.b.patternId);
    expect(built.abRecord.note).toMatch(/not ranked|neither is ranked/u);
    // A second queue item per variant would imply a test that does not exist.
    expect(built.status).toBe("draft");
  });
});
