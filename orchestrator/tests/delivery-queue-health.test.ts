import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runQueueHealthCheck } from "../src/delivery/queue-health.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import { recordMmaDelivery } from "../src/mma-files/publish.js";
import { repoRoot } from "../src/paths.js";
import { atomicWriteJson } from "../src/state.js";

/**
 * Both magazines stopped publishing in the same week and neither queue said so. Every jam had a
 * receipt explaining itself; nothing looked at the queue as a whole and noticed it had stopped
 * moving. This is that reader.
 */
async function queueArticles(dates: readonly string[]): Promise<{ root: string; hashes: string[] }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "queue-health-"));
  const raw = JSON.parse(await readFile(path.join(repoRoot, "contracts", "fixtures", "article.valid.json"), "utf8"));
  const { packageHash: _fixture, ...rawContent } = raw;
  const hashes: string[] = [];
  for (const date of dates) {
    const slug = `preview-${date}`;
    const content = {
      ...rawContent,
      status: "published",
      publishAt: `${date}T10:00:00.000Z`,
      slug,
      image: {
        ...rawContent.image,
        hero_path: `public/images/articles/${slug}/hero.svg`,
        thumb_path: `public/images/articles/${slug}/thumb.svg`
      }
    };
    const pkg = { ...content, packageHash: articlePackageHash(content) };
    hashes.push(pkg.packageHash);
    await atomicWriteJson(root, `ventures/mma-files/articles/${date}-am-${slug}.json`, pkg);
  }
  return { root, hashes };
}

describe("the daily queue-drain check", () => {
  it("reads a queue that is moving as healthy and still leaves the day's record", async () => {
    const { root } = await queueArticles(["2026-08-12"]);

    const { report, artifacts } = await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 200 });

    const mma = report.ventures.find((venture) => venture.venture === "mma-files")!;
    expect(mma.waiting).toHaveLength(1);
    expect(mma.parked).toHaveLength(0);
    expect(mma.stalled).toBe(false);
    expect(report.needsOwner).toBe(false);
    expect(artifacts).toContain("delivery/queue-health/2026-08-12.json");
    // A check that only leaves a trace when it fails cannot be told from one that never ran.
    const record = JSON.parse(await readFile(path.join(root, "delivery/queue-health/2026-08-12.json"), "utf8"));
    expect(record).toMatchObject({ schemaVersion: "delivery-queue-health/1", date: "2026-08-12" });
  });

  it("calls a queue stalled when its oldest package has missed more than a day of runs", async () => {
    const { root } = await queueArticles(["2026-08-05", "2026-08-12"]);

    const { report } = await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 200 });

    const mma = report.ventures.find((venture) => venture.venture === "mma-files")!;
    expect(mma.oldestWaitingDate).toBe("2026-08-05");
    expect(mma.stalledDays).toBe(7);
    expect(mma.stalled).toBe(true);
    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("DELIVERY-QUEUE-MMA-FILES");
  });

  it("treats a refused package as needing a person however new it is", async () => {
    const { root, hashes } = await queueArticles(["2026-08-12"]);
    await recordMmaDelivery({
      kind: "article",
      packageHash: hashes[0]!,
      packagePath: path.join(root, "ventures/mma-files/articles/2026-08-12-am-preview-2026-08-12.json"),
      status: "needs_reconciliation",
      code: "hash_conflict",
      detail: "2026-08-12:am already contains different immutable bytes",
      root
    });

    const { report } = await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 200 });

    const mma = report.ventures.find((venture) => venture.venture === "mma-files")!;
    expect(mma.parked).toHaveLength(1);
    expect(mma.parked[0]?.code).toBe("hash_conflict");
    expect(mma.stalled).toBe(true);
    expect(report.needsOwner).toBe(true);
  });

  it("raises one owner item while a queue stays stuck and ticks it when the queue drains", async () => {
    const { root, hashes } = await queueArticles(["2026-08-05"]);
    const packagePath = path.join(root, "ventures/mma-files/articles/2026-08-05-am-preview-2026-08-05.json");

    await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 200 });
    await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 200 });
    const raised = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(raised.match(/DELIVERY-QUEUE-MMA-FILES/gu)).toHaveLength(1);

    await recordMmaDelivery({
      kind: "article",
      packageHash: hashes[0]!,
      packagePath,
      status: "delivered",
      targetCommit: "abc123",
      root
    });
    const { report } = await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 200 });
    expect(report.needsOwner).toBe(false);
    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("- [x] **DELIVERY-QUEUE-MMA-FILES**");
  });
});

/**
 * The check the 12 August incident needed and nobody had.
 *
 * Every record said that delivery succeeded, and every record was right: the package was accepted,
 * the commit was on main, the gate was green and the host reported no errors. The build simply
 * never ran. Receipts answer "did we send it"; only the live site answers "can a reader open it".
 */
describe("a delivery nobody built", () => {
  async function deliveredEdition(date: string): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "deploy-fresh-"));
    await atomicWriteJson(root, `edition/deliveries/${date}.json`, {
      schemaVersion: 1, date, status: "delivered", packageHash: "a".repeat(64), tags: []
    });
    return root;
  }

  it("raises an owner item when the site does not serve the newest delivered edition", async () => {
    const root = await deliveredEdition("2026-08-12");

    const { report } = await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 404 });

    const caughtUp = report.deploys.find((entry) => entry.venture === "caught-up")!;
    expect(caughtUp.live).toBe(false);
    expect(caughtUp.url).toContain("/data/board/2026-08-12.json");
    expect(report.needsOwner).toBe(true);
    const inbox = await readFile(path.join(root, "INBOX.md"), "utf8");
    expect(inbox).toContain("DELIVERY-NOT-BUILT-CAUGHT-UP");
    expect(inbox).toContain("build that never ran");
  });

  it("ticks the item once the site serves it again", async () => {
    const root = await deliveredEdition("2026-08-12");
    await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 404 });

    await runQueueHealthCheck({ root, today: "2026-08-13", probe: async () => 200 });

    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("- [x] **DELIVERY-NOT-BUILT-CAUGHT-UP**");
  });

  it("leaves the item alone when the site cannot be reached at all", async () => {
    // Not knowing is not the same as being fine, and this is the one check whose point is that
    // silence lies. An unreachable host must not read as a clean bill of health.
    const root = await deliveredEdition("2026-08-12");
    await runQueueHealthCheck({ root, today: "2026-08-12", probe: async () => 404 });

    const { report } = await runQueueHealthCheck({
      root,
      today: "2026-08-13",
      probe: async () => { throw new Error("ENOTFOUND"); }
    });

    expect(report.deploys.find((entry) => entry.venture === "caught-up")?.live).toBeNull();
    expect(await readFile(path.join(root, "INBOX.md"), "utf8")).toContain("- [ ] **DELIVERY-NOT-BUILT-CAUGHT-UP**");
  });
});
