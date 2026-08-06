import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWriteJson } from "../src/state.js";
import { fightAiQDeliveryHash, nextArticleDelivery, nextFightAiQDelivery, recordMmaDelivery } from "../src/mma-files/publish.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import { repoRoot } from "../src/paths.js";

describe("MMA Files repository delivery", () => {
  it("selects one published article until a delivered receipt exists", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-article-publish-"));
    const raw = JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "article.valid.json"), "utf8"));
    const { packageHash: _fixtureHash, ...rawContent } = raw;
    const content = { ...rawContent, status: "published" };
    const fixture = { ...content, packageHash: articlePackageHash(content) };
    await atomicWriteJson(root, `ventures/mma-files/articles/${fixture.publishAt.slice(0, 10)}-${fixture.slot}-${fixture.slug}.json`, fixture);
    const pending = await nextArticleDelivery(root);
    expect(pending).toMatchObject({ kind: "article", packageHash: fixture.packageHash });
    const receiptPath = await recordMmaDelivery({ kind: "article", packageHash: fixture.packageHash, packagePath: pending!.packagePath, status: "delivered", targetCommit: "abc123", root });
    expect(await nextArticleDelivery(root)).toBeNull();
    // The receipt named a commit and a hash and nothing a reader could open.
    expect(JSON.parse(await readFile(path.join(root, receiptPath), "utf8"))).toMatchObject({
      articleUrl: `https://mma-files.vercel.app/cs/articles/${fixture.slug}`
    });
  });

  it("builds a stable UFC/Oktagon FightAIQ snapshot and skips its replay", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fightaiq-publish-"));
    const workspace = await mkdtemp(path.join(os.tmpdir(), "fightaiq-package-"));
    await atomicWriteJson(root, "mma/fighters/ufc:alex-example.json", JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "fighter-record.valid.json"), "utf8")));
    await atomicWriteJson(root, "mma/odds/one.json", {
      schemaVersion: "odds-snapshot/1",
      boutRef: "ufc:event:test:bout-1",
      phase: "t3",
      source: "owner-entry",
      market: "moneyline",
      prices: [{ pick: "red", decimal: 1.8 }, { pick: "blue", decimal: 2.1 }],
      capturedAt: "2026-08-01T08:00:00.000Z"
    });
    const pending = await nextFightAiQDelivery(root, workspace);
    expect(pending?.kind).toBe("fightaiq");
    const feed = JSON.parse(await readFile(pending!.packagePath, "utf8"));
    const { packageHash, ...content } = feed;
    expect(packageHash).toBe(fightAiQDeliveryHash(content));
    expect(feed).not.toHaveProperty("odds");
    expect(feed).not.toHaveProperty("modelRuns");
    expect(JSON.stringify(feed)).not.toContain('"decimal"');
    await recordMmaDelivery({ kind: "fightaiq", packageHash, packagePath: pending!.packagePath, status: "delivered", root });
    expect(await nextFightAiQDelivery(root, workspace)).toBeNull();
  });
});
