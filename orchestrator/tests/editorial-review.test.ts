import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorialReviewSchema } from "../src/contracts/editorial-review.js";
import { EditionPackageSchema } from "../src/contracts/edition-package.js";
import { approvedEditorialPackage, editorialReviewHash, hasEditorialApproval, storeEditorialReview } from "../src/edition/review.js";
import { atomicWriteJson } from "../src/state.js";
import { oldestPendingDelivery } from "../src/delivery/outbox.js";
import { releaseReviewedArticles } from "../src/edition/review-release.js";
import { caughtUpEditionMeeting } from "./fixtures/caught-up-edition.js";
import { configRoot } from "../src/paths.js";
import { editionPackageHash } from "../src/edition/package.js";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "editorial-review-")); roots.push(root);
  const edition = EditionPackageSchema.parse(JSON.parse(await readFile(path.resolve("../contracts/fixtures/edition-package.valid.json"), "utf8")));
  if (edition.status !== "edition") throw new Error("Article fixture required");
  edition.idempotencyKey = editionPackageHash(edition);
  const image = { ...edition.image, origin: "illustration" as const, license: { ...edition.image.license, name: "BoardlessAI illustration" as const } };
  const relative = await storeEditorialReview(root, edition, [
    { id: "photo-1", image: null, unavailableReason: "Provider unavailable" },
    { id: "photo-2", image: null, unavailableReason: "No image passed review" },
    { id: "fal", image, unavailableReason: null }
  ], new Date("2026-09-27T10:00:00Z"));
  const review = EditorialReviewSchema.parse(JSON.parse(await readFile(path.join(root, relative!), "utf8")));
  const decision = { schemaVersion: "editorial-decision/1", reviewId: review.id, reviewHash: editorialReviewHash(review), action: "approve", title: "Titulek vybraný majitelem", imageId: "fal", decidedAt: "2026-09-27T10:01:00.000Z", actor: "owner" };
  return { root, review, decision, edition };
}
describe("owner editorial gate", () => {
  it("holds the old automatic outbox without an owner decision", async () => {
    const { root, edition } = await fixture();
    await atomicWriteJson(root, `edition/outbox/${edition.date}-${edition.idempotencyKey}.json`, edition);
    expect(await hasEditorialApproval(root, edition)).toBe(false);
    expect(await oldestPendingDelivery(root)).toBeNull();
  });
  it("binds the chosen title and image to an approved package and allows only those bytes", async () => {
    const { root, review, decision, edition } = await fixture();
    const approved = approvedEditorialPackage(review, decision)!;
    expect(approved.status).toBe("edition");
    if (approved.status !== "edition") return;
    expect(approved.article.cs.frontmatter.title).toBe(decision.title);
    expect(approved.article.cs.frontmatter.generation.human_reviewed).toBe(true);
    expect(approved.image).toEqual(review.images[2]!.image);
    expect(approved.idempotencyKey).not.toBe(edition.idempotencyKey);
    await atomicWriteJson(root, `editorial/decisions/${review.id}.json`, decision);
    expect(await hasEditorialApproval(root, approved)).toBe(true);
    expect(await hasEditorialApproval(root, edition)).toBe(false);
    await atomicWriteJson(root, `edition/outbox/${approved.date}-${approved.idempotencyKey}.json`, approved);
    expect((await oldestPendingDelivery(root))?.package.idempotencyKey).toBe(approved.idempotencyKey);
  });
  it("rejects unavailable images, changed candidates, rejection and malformed approvals", async () => {
    const { review, decision } = await fixture();
    expect(approvedEditorialPackage(review, { ...decision, imageId: "photo-1" })).toBeNull();
    expect(approvedEditorialPackage(review, { ...decision, action: "reject" })).toBeNull();
    expect(approvedEditorialPackage(review, { ...decision, actor: "agent" })).toBeNull();
    expect(approvedEditorialPackage({ ...review, titles: ["Changed"] }, decision)).toBeNull();
    expect(approvedEditorialPackage(review, null)).toBeNull();
  });
  it("releases only the approved article, without producing social drafts", async () => {
    const { root, review, decision } = await fixture();
    vi.stubEnv("CAUGHT_UP_SITE_URL", "https://dneskai.example");
    await atomicWriteJson(root, `meetings/${review.package.date}-cu-edition.json`, caughtUpEditionMeeting);
    const input = { root, repositoryRoot: root, configurationRoot: configRoot, now: new Date("2026-09-27T10:02:00Z") };
    expect(await releaseReviewedArticles(input)).toEqual([]);
    await atomicWriteJson(root, `editorial/decisions/${review.id}.json`, decision);
    const artifacts = await releaseReviewedArticles(input);
    expect(artifacts.some(file => file.startsWith("edition/outbox/"))).toBe(true);
    expect(artifacts.some(file => file.startsWith("social/"))).toBe(false);
    expect(await releaseReviewedArticles(input)).toEqual([]);
  }, 90_000);

  it("requires four distinct headlines and available image bytes before a new review can release", async () => {
    const { review, decision } = await fixture();
    const image = review.images[2]!.image!;
    const current = EditorialReviewSchema.parse({ ...review, schemaVersion: "editorial-review/2",
      titles: ["First headline", "Second headline", "Third headline", "Fourth headline"],
      images: [1, 2, 3, 4].map(index => ({ id: `candidate-${index}`,
        image: { ...image, hero_bytes_base64: Buffer.from(`distinct-image-${index}`).toString("base64") }, unavailableReason: null })) });
    const approve = (value: typeof current) => approvedEditorialPackage(value, {
      ...decision, imageId: "candidate-4", reviewHash: editorialReviewHash(value) });
    const approved = approve(current);
    expect(approved?.status).toBe("edition");
    if (approved?.status !== "edition") throw new Error("Complete review should release");
    expect(approved.image.hero_bytes_base64).toBe(current.images[3]!.image!.hero_bytes_base64);
    const missing = structuredClone(current);
    missing.images[0] = { id: "candidate-1", image: null, unavailableReason: "Provider unavailable" };
    expect(approve(missing)).toBeNull();
    const duplicate = structuredClone(current);
    duplicate.images[0]!.image = duplicate.images[1]!.image;
    expect(approve(duplicate)).toBeNull();
    const repeatedTitle = structuredClone(current);
    repeatedTitle.titles[1] = " FIRST HEADLINE ";
    expect(approve(repeatedTitle)).toBeNull();
  });

});
