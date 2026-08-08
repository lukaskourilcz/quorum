import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArticlePackageSchema, type ArticlePackage } from "../src/contracts/mma-files.js";
import { checkImageCorrection } from "../src/mma-files/correction.js";
import { articlePackageHash } from "../src/mma-files/hash.js";
import { ArticleSlotConflictError, storeArticlePackage } from "../src/mma-files/store.js";
import { deterministicArticleImage } from "../src/images/article-image.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
  const made = await mkdtemp(path.join(os.tmpdir(), "article-correction-"));
  roots.push(made);
  return made;
}

function sealed(content: Record<string, unknown>): ArticlePackage {
  return ArticlePackageSchema.parse({ ...content, packageHash: articlePackageHash(content) });
}

function article(overrides: Record<string, unknown> = {}): ArticlePackage {
  return sealed({
    schemaVersion: "article/1",
    slug: "fixture-preview",
    localizations: {
      cs: { title: "Doložená pozvánka", dek: "Co podklady potvrzují.", bodyMDX: "Český text." }
    },
    format: "fight-week-preview",
    sources: [{ kind: "internal", ref: "state/mma/events/fixture.json" }],
    image: deterministicArticleImage({ venture: "mma-files", slug: "fixture-preview", title: "T" }),
    heroSpec: { template: "data-card", bindings: { label: "Fixture" } },
    fighterRefs: ["ufc:alex-example"],
    publishAt: "2026-08-01T08:00:00.000Z",
    slot: "am",
    status: "published",
    ...overrides
  });
}

/** The same article under a visibly different picture, correctly declared. */
function correctionOf(current: ArticlePackage, overrides: Record<string, unknown> = {}): ArticlePackage {
  const { packageHash: _current, ...content } = current;
  return sealed({
    ...content,
    image: deterministicArticleImage({ venture: "mma-files", slug: current.slug, title: "A different plate" }),
    correction: {
      schemaVersion: "article-image-correction/1",
      supersedesPackageHash: current.packageHash,
      reason: "The delivered hero showed the wrong subject.",
      correctedAt: "2026-08-09T06:00:00.000Z"
    },
    ...overrides
  });
}

describe("what a correction may change", () => {
  it("accepts a package that differs only in its picture", () => {
    const current = article();
    expect(checkImageCorrection({ current, replacement: correctionOf(current) }))
      .toEqual({ ok: true, problems: [] });
  });

  it("refuses one that also rewrites the article", () => {
    // The words a reader read cannot change through this door, which is the whole of what the
    // correction promises and the only reason the immutability guard may have an exception.
    const current = article();
    const smuggled = correctionOf(current, {
      localizations: {
        cs: { title: "Přepsaný titulek", dek: "Co podklady potvrzují.", bodyMDX: "Český text." }
      }
    });

    expect(checkImageCorrection({ current, replacement: smuggled }).problems)
      .toContain("more-than-the-image-changed");
  });

  it("refuses one that names a package this repository does not hold", () => {
    const current = article();
    const wrongParent = correctionOf(current, {
      correction: {
        schemaVersion: "article-image-correction/1",
        supersedesPackageHash: "f".repeat(64),
        reason: "Supersedes something else.",
        correctedAt: "2026-08-09T06:00:00.000Z"
      }
    });

    expect(checkImageCorrection({ current, replacement: wrongParent }).problems)
      .toContain("supersedes-a-different-package");
  });

  it("refuses a package with no correction block at all", () => {
    const current = article();
    const replacement = article({ image: deterministicArticleImage({ venture: "mma-files", slug: "fixture-preview", title: "Other" }) });
    expect(checkImageCorrection({ current, replacement }))
      .toEqual({ ok: false, problems: ["no-correction-block"] });
  });
});

describe("the immutable article slot", () => {
  it("still refuses a different package under the same date and slot", async () => {
    const where = await root();
    const current = article();
    await storeArticlePackage(where, current);
    const rewrite = article({
      localizations: {
        cs: { title: "Jiný titulek", dek: "Jiný perex.", bodyMDX: "Jiný text." }
      }
    });

    await expect(storeArticlePackage(where, rewrite)).rejects.toBeInstanceOf(ArticleSlotConflictError);
  });

  it("refuses a correction whose proof does not hold", async () => {
    const where = await root();
    const current = article();
    await storeArticlePackage(where, current);
    const smuggled = correctionOf(current, {
      sources: [{ kind: "internal", ref: "state/mma/events/somewhere-else.json" }]
    });

    await expect(storeArticlePackage(where, smuggled)).rejects.toThrow(/more-than-the-image-changed/u);
  });

  it("lets a proven correction through, and keeps the article's words", async () => {
    const where = await root();
    const current = article();
    await storeArticlePackage(where, current);
    const replacement = correctionOf(current);
    const stored = await storeArticlePackage(where, replacement);

    const onDisk = ArticlePackageSchema.parse(JSON.parse(await readFile(path.join(where, stored.path), "utf8")));
    expect(onDisk.packageHash).toBe(replacement.packageHash);
    expect(onDisk.correction?.supersedesPackageHash).toBe(current.packageHash);
    expect(onDisk.localizations).toEqual(current.localizations);
    expect(onDisk.image.hero_bytes_base64).not.toBe(current.image.hero_bytes_base64);
  });
});
