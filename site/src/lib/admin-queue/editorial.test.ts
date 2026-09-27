import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEditorialDecision, editorialCard, readEditorialQueue } from "./editorial";

const roots: string[] = [];
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() {
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", ""); vi.stubEnv("VERCEL", ""); vi.stubEnv("NODE_ENV", "test");
  const root = await mkdtemp(path.join(os.tmpdir(), "editorial-admin-")); roots.push(root);
  const article = JSON.parse(await readFile(path.resolve("../contracts/fixtures/edition-package.valid.json"), "utf8"));
  const review = { schemaVersion: "editorial-review/1", id: article.idempotencyKey, createdAt: "2026-09-27T10:00:00.000Z", package: article,
    titles: [article.article.cs.frontmatter.title], images: [
      { id: "photo-1", image: null, unavailableReason: "No photograph" },
      { id: "photo-2", image: null, unavailableReason: "No photograph" },
      { id: "fal", image: { ...article.image, origin: "illustration", license: { ...article.image.license, name: "BoardlessAI illustration" } }, unavailableReason: null }
    ] };
  await mkdir(path.join(root, "state/editorial/reviews"), { recursive: true });
  await writeFile(path.join(root, `state/editorial/reviews/${review.id}.json`), JSON.stringify(review));
  const card = editorialCard(review)!;
  return { root, card, request: { id: card.id, hash: card.hash, action: "approve", title: "Vybraný titulek", imageId: "fal" } };
}
describe("article Queue actions", () => {
  it("records an immutable owner decision and shows it on the next read", async () => {
    const { root, request } = await fixture();
    expect((await readEditorialQueue(root)).items[0]?.decision).toBe("pending");
    expect(await applyEditorialDecision(request, root)).toMatchObject({ decision: "approve", persistence: "filesystem" });
    expect((await readEditorialQueue(root)).items[0]?.decision).toBe("approve");
    await expect(applyEditorialDecision(request, root)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("refuses stale content, unavailable candidates and path injection", async () => {
    const { root, request } = await fixture();
    await expect(applyEditorialDecision({ ...request, hash: "0".repeat(64) }, root)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(applyEditorialDecision({ ...request, imageId: "photo-1" }, root)).rejects.toMatchObject({ code: "REFUSED" });
    await expect(applyEditorialDecision({ ...request, id: "../../other" }, root)).rejects.toMatchObject({ code: "INVALID" });
    expect((await readEditorialQueue(root)).items[0]?.decision).toBe("pending");
  });
});
