import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArticlePackageSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import { articleQueue } from "../src/mma-files/publish.js";
import { retireArticle, surveyRetirableArticles } from "../src/mma-files/retire.js";
import { repoRoot } from "../src/paths.js";
import { atomicWriteJson } from "../src/state.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

let fixture: Record<string, unknown> | null = null;

async function article(root: string, slug: string, publishAt: string): Promise<ArticlePackage> {
  fixture ??= JSON.parse(
    await readFile(path.join(repoRoot, "contracts", "fixtures", "article.valid.json"), "utf8")
  ) as Record<string, unknown>;
  // The fixture is a draft; only published packages enter the delivery queue at all.
  const content: Record<string, unknown> = { ...fixture, slug, publishAt, slot: "am", status: "published" };
  delete content.packageHash;
  const parsed = ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content as never) });
  await atomicWriteJson(root, `ventures/mma-files/articles/${publishAt.slice(0, 10)}-am-${slug}.json`, parsed);
  return parsed;
}

async function receipt(root: string, hash: string, status: string, code?: string): Promise<void> {
  await atomicWriteJson(root, `ventures/mma-files/deliveries/articles/${hash}.json`, {
    schemaVersion: "mma-files-delivery-receipt/1",
    kind: "article", packageHash: hash, status, ...(code ? { code } : {})
  });
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "mma-retire-"));
  roots.push(root);
  return root;
}

describe("retiring a parked MMA article", () => {
  it("retires a parked package whose slug an earlier delivered article already serves", async () => {
    const root = await tempRoot();
    const first = await article(root, "ufc-event-gamrot-vs-salkilld", "2026-08-05T08:00:00.000Z");
    const repeat = await article(root, "ufc-event-gamrot-vs-salkilld", "2026-08-08T08:00:00.000Z");
    await receipt(root, first.packageHash, "delivered");
    await receipt(root, repeat.packageHash, "needs_reconciliation", "hash_conflict");

    const survey = await surveyRetirableArticles(root);
    expect(survey.keep).toEqual([]);
    expect(survey.retirable).toHaveLength(1);
    expect(survey.retirable[0]).toMatchObject({
      packageHash: repeat.packageHash,
      supersededBy: { packageHash: first.packageHash, publishAt: "2026-08-05T08:00:00.000Z" }
    });

    await retireArticle(root, survey.retirable[0]!);
    const queue = await articleQueue(root);
    expect(queue.find((entry) => entry.packageHash === repeat.packageHash)?.state).toBe("retired");
    // The story stays published under the date that reached readers.
    expect(queue.find((entry) => entry.packageHash === first.packageHash)?.state).toBe("delivered");
  });

  it("keeps a parked package whose slug was never delivered", async () => {
    // The narrow rule is the whole safety property: a package nobody has published anywhere is a
    // person's decision, not a cleanup.
    const root = await tempRoot();
    const first = await article(root, "ufc-event-lonely", "2026-08-05T08:00:00.000Z");
    const repeat = await article(root, "ufc-event-lonely", "2026-08-08T08:00:00.000Z");
    await receipt(root, first.packageHash, "needs_reconciliation", "push_rejected");
    await receipt(root, repeat.packageHash, "needs_reconciliation", "hash_conflict");

    const survey = await surveyRetirableArticles(root);
    expect(survey.retirable).toEqual([]);
    // Only the repeat is parked: `push_rejected` is retryable, so the first is still pending and
    // is not this survey's business at all.
    expect(survey.keep).toEqual([{
      packageHash: repeat.packageHash,
      label: expect.stringContaining("ufc-event-lonely") as unknown as string,
      reason: "no earlier delivered article shares its slug"
    }]);
    expect((await articleQueue(root)).find((entry) => entry.packageHash === first.packageHash)?.state)
      .toBe("pending");
  });

  it("never retires the earlier article on the strength of a later one", async () => {
    const root = await tempRoot();
    const parked = await article(root, "ufc-event-order", "2026-08-05T08:00:00.000Z");
    const later = await article(root, "ufc-event-order", "2026-08-08T08:00:00.000Z");
    await receipt(root, parked.packageHash, "needs_reconciliation", "hash_conflict");
    await receipt(root, later.packageHash, "delivered");

    const survey = await surveyRetirableArticles(root);
    expect(survey.retirable).toEqual([]);
    expect(survey.keep[0]?.packageHash).toBe(parked.packageHash);
  });

  it("leaves a different slug alone however many are parked", async () => {
    const root = await tempRoot();
    const delivered = await article(root, "ufc-event-one", "2026-08-05T08:00:00.000Z");
    const other = await article(root, "ufc-event-two", "2026-08-08T08:00:00.000Z");
    await receipt(root, delivered.packageHash, "delivered");
    await receipt(root, other.packageHash, "needs_reconciliation", "hash_conflict");

    expect((await surveyRetirableArticles(root)).retirable).toEqual([]);
  });

  it("writes a retirement that says what superseded it, and never says delivered", async () => {
    const root = await tempRoot();
    const first = await article(root, "ufc-event-receipt", "2026-08-05T08:00:00.000Z");
    const repeat = await article(root, "ufc-event-receipt", "2026-08-08T08:00:00.000Z");
    await receipt(root, first.packageHash, "delivered");
    await receipt(root, repeat.packageHash, "needs_reconciliation", "hash_conflict");

    const survey = await surveyRetirableArticles(root);
    await retireArticle(root, survey.retirable[0]!);

    const written = JSON.parse(await readFile(
      path.join(root, "ventures", "mma-files", "deliveries", "articles", `${repeat.packageHash}.json`), "utf8"
    )) as Record<string, unknown>;
    expect(written).toMatchObject({
      status: "retired",
      code: "superseded_slug",
      supersededBy: first.packageHash
    });
    expect(written.status).not.toBe("delivered");
    expect(written.detail).toContain("2026-08-05");
  });

  it("leaves the article package itself untouched", async () => {
    const root = await tempRoot();
    const first = await article(root, "ufc-event-immutable", "2026-08-05T08:00:00.000Z");
    const repeat = await article(root, "ufc-event-immutable", "2026-08-08T08:00:00.000Z");
    await receipt(root, first.packageHash, "delivered");
    await receipt(root, repeat.packageHash, "needs_reconciliation", "hash_conflict");
    const before = await readFile(
      path.join(root, "ventures", "mma-files", "articles", "2026-08-08-am-ufc-event-immutable.json"), "utf8"
    );

    const survey = await surveyRetirableArticles(root);
    await retireArticle(root, survey.retirable[0]!);

    await expect(readFile(
      path.join(root, "ventures", "mma-files", "articles", "2026-08-08-am-ufc-event-immutable.json"), "utf8"
    )).resolves.toBe(before);
  });
});
