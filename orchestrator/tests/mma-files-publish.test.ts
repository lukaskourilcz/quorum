import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWriteJson } from "../src/state.js";
import { fightAiQDeliveryHash, nextArticleDelivery, nextBannerDelivery, nextFightAiQDelivery, recordMmaDelivery } from "../src/mma-files/publish.js";
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

  it("delivers a staged banner once and marks its contract with the receipt", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-banner-publish-"));
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mma-banner-package-"));
    await cp(
      path.join(repoRoot, "state", "ventures", "mma-files", "banners"),
      path.join(root, "ventures", "mma-files", "banners"),
      { recursive: true }
    );
    const pending = await nextBannerDelivery(root, workspace);
    expect(pending).toMatchObject({ kind: "banner" });
    const receiptPath = await recordMmaDelivery({
      kind: "banner",
      packageHash: pending!.packageHash,
      packagePath: pending!.packagePath,
      status: "delivered",
      targetCommit: "abc123",
      root
    });
    expect(receiptPath).toContain("deliveries/banners/");
    expect(await nextBannerDelivery(root, workspace)).toBeNull();
    expect(JSON.parse(await readFile(path.join(root, "ventures", "mma-files", "banners", "contract.json"), "utf8")))
      .toMatchObject({ status: "delivered", receiptRef: receiptPath });
    const delivered = JSON.parse(await readFile(path.join(root, "ventures", "mma-files", "banners", "delivered.json"), "utf8"));
    expect(delivered).toMatchObject({ schemaVersion: "mma-ads/1", slots: { "infeed-rectangle": { enabled: false, image: null } } });
    expect(JSON.stringify(delivered)).not.toContain("bytes_base64");
  });

  it("refuses a banner package edited after selection", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-banner-receipt-"));
    const workspace = await mkdtemp(path.join(os.tmpdir(), "mma-banner-receipt-package-"));
    await cp(
      path.join(repoRoot, "state", "ventures", "mma-files", "banners"),
      path.join(root, "ventures", "mma-files", "banners"),
      { recursive: true }
    );
    const pending = await nextBannerDelivery(root, workspace);
    const changed = JSON.parse(await readFile(pending!.packagePath, "utf8"));
    changed.updatedAt = "2026-08-09T00:01:00.000Z";
    await writeFile(pending!.packagePath, `${JSON.stringify(changed, null, 2)}\n`);
    await expect(recordMmaDelivery({
      kind: "banner",
      packageHash: pending!.packageHash,
      packagePath: pending!.packagePath,
      status: "delivered",
      root
    })).rejects.toThrow(/hash differs/u);
  });
});

/**
 * One rejected article stopped MMA Files publishing for a week. `delivered()` asked a yes/no
 * question, so a receipt reading `needs_reconciliation` was indistinguishable from no receipt,
 * the same bytes went back every run, the magazine refused them the same way, and the three
 * articles written behind it never got a turn.
 */
describe("a delivery the magazine will never accept does not hold the queue", () => {
  async function queueTwoArticles(): Promise<{ root: string; first: string; second: string }> {
    const root = await mkdtemp(path.join(os.tmpdir(), "mma-article-park-"));
    const raw = JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "article.valid.json"), "utf8"));
    const { packageHash: _fixtureHash, ...rawContent } = raw;
    const hashes: string[] = [];
    for (const [publishAt, slug] of [
      ["2026-08-01T10:00:00.000Z", "first-preview"],
      ["2026-08-02T10:00:00.000Z", "second-preview"]
    ] as const) {
      const content = {
        ...rawContent,
        status: "published",
        publishAt,
        slug,
        image: {
          ...rawContent.image,
          hero_path: `public/images/articles/${slug}/hero.svg`,
          thumb_path: `public/images/articles/${slug}/thumb.svg`
        }
      };
      const pkg = { ...content, packageHash: articlePackageHash(content) };
      hashes.push(pkg.packageHash);
      await atomicWriteJson(root, `ventures/mma-files/articles/${publishAt.slice(0, 10)}-am-${slug}.json`, pkg);
    }
    return { root, first: hashes[0]!, second: hashes[1]! };
  }

  it("parks a terminally rejected package and ships the one behind it", async () => {
    const { root, first, second } = await queueTwoArticles();
    const pending = await nextArticleDelivery(root);
    expect(pending?.packageHash).toBe(first);

    await recordMmaDelivery({
      kind: "article",
      packageHash: first,
      packagePath: pending!.packagePath,
      status: "needs_reconciliation",
      code: "hash_conflict",
      detail: "2026-08-01:am already contains different immutable bytes",
      root
    });

    expect((await nextArticleDelivery(root))?.packageHash).toBe(second);
  });

  it("keeps a package the run could not reach at the head of the queue", async () => {
    const { root, first } = await queueTwoArticles();
    const pending = await nextArticleDelivery(root);
    await recordMmaDelivery({
      kind: "article",
      packageHash: first,
      packagePath: pending!.packagePath,
      status: "needs_reconciliation",
      code: "unreachable",
      detail: "GitHub was unreachable after one retry.",
      root
    });

    expect((await nextArticleDelivery(root))?.packageHash).toBe(first);
  });

  it("raises one owner item for a failed slot and ticks it when the slot delivers", async () => {
    const { root, first } = await queueTwoArticles();
    const pending = await nextArticleDelivery(root);
    const failure = {
      kind: "article",
      packageHash: first,
      packagePath: pending!.packagePath,
      status: "needs_reconciliation",
      code: "hash_conflict",
      detail: "2026-08-01:am already contains different immutable bytes",
      root
    } as const;

    await recordMmaDelivery(failure);
    await recordMmaDelivery(failure);
    const raised = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(raised.match(/MMA-FILES-DELIVERY-2026-08-01-am/gu)).toHaveLength(1);
    expect(raised).toContain("[owner:me]");
    expect(raised).not.toContain("/home/runner");

    await recordMmaDelivery({ ...failure, status: "delivered", targetCommit: "abc123" });
    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("- [x] **MMA-FILES-DELIVERY-2026-08-01-am**");
  });
});
