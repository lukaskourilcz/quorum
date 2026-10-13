import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EditionPackageSchema } from "../src/contracts/edition-package.js";
import { EditorialReviewSchema, EditorialPreviewSelectionSchema } from "../src/contracts/editorial-review.js";
import { editionPackageHash } from "../src/edition/package.js";
import { approvedEditorialPackage, editorialReviewHash, storeEditorialReview } from "../src/edition/review.js";
import { atomicWriteJson, readJson } from "../src/state.js";
import { signature, verifySourceRequest, parseSourcePacket, sha256 } from "../src/marketing-source/contract.js";
import { NEWS_FRESHNESS_HOURS, localSourceReader, readSources, retractionPath } from "../src/marketing-source/producer.js";
import { deliverSources, packetKey, reconcileSources, retryReconciledSource } from "../src/marketing-source/outbox.js";
import { configRoot } from "../src/paths.js";
import { resolveVentureCapability } from "../src/ventures/capabilities.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))));
const now = new Date("2026-09-27T10:02:00Z");
const secret = "fixture-dneskai-integration-secret-32-bytes";
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "marketing-source-")); roots.push(root);
  const edition = EditionPackageSchema.parse(JSON.parse(await readFile(path.resolve("../contracts/fixtures/edition-package.valid.json"), "utf8")));
  if (edition.status !== "edition") throw new Error("Article fixture required");
  edition.idempotencyKey = editionPackageHash(edition);
  const image = { ...edition.image, origin: "illustration" as const, license: { ...edition.image.license, name: "BoardlessAI illustration" as const } };
  const relative = await storeEditorialReview(root, edition, [
    { id: "photo-1", image: null, unavailableReason: "fixture-provider-unavailable" },
    { id: "photo-2", image: null, unavailableReason: "fixture-photo-veto" }, { id: "fal", image, unavailableReason: null }
  ], now);
  const review = EditorialReviewSchema.parse(await readJson(root, relative!, null));
  const decision = { schemaVersion: "editorial-decision/1", reviewId: review.id, reviewHash: editorialReviewHash(review),
    action: "approve", title: "Majitelův vybraný titulek", imageId: "fal", decidedAt: now.toISOString(), actor: "owner" };
  const input = { root, siteUrl: "https://dneskai.example", now, freshnessHours: NEWS_FRESHNESS_HOURS, configurationRoot: configRoot };
  return { root, edition, review, decision, input, approve: () => atomicWriteJson(root, `editorial/decisions/${review.id}.json`, decision) };
}

describe("DNESKAi source bridge", () => {
  it("never promotes an isolated preview selection to production source or delivery approval", async () => {
    const { root, review, decision, input } = await fixture();
    const preview = EditorialPreviewSelectionSchema.parse({ schemaVersion: "editorial-preview-selection/1", scope: "preview-only", delivery: "disabled",
      repository: "lukaskourilcz/quorum", branch: "codex/marketing-source-bridge", decision });
    await atomicWriteJson(root, `editorial/preview-selections/${review.id}.json`, preview);
    expect((await reconcileSources(input)).packets).toEqual([]);
    expect(approvedEditorialPackage(review, preview)).toBeNull();
    // Even a misfiled preview envelope cannot be mistaken for a production-shaped decision.
    await atomicWriteJson(root, `editorial/decisions/${review.id}.json`, preview);
    expect((await reconcileSources(input)).packets).toEqual([]);
  });
  it("exports exact selected content, recorded evidence and full selected rights without creating social state", async () => {
    const { root, approve, input, review } = await fixture();
    expect((await reconcileSources(input)).packets).toEqual([]);
    await approve();
    const snapshot = await reconcileSources({ ...input, write: true });
    const packet = snapshot.packets[0]!;
    expect(parseSourcePacket(packet)).toEqual(packet);
    expect(packet.content.title).toBe("Majitelův vybraný titulek");
    expect(packet.content.body).toBe(review.package.status === "edition" ? review.package.article.cs.body : "");
    expect(packet.content.evidence[0]?.url).toBe(review.package.status === "edition" ? review.package.article.cs.frontmatter.sources[0]!.url : "");
    expect(JSON.parse(packet.content.image!.licence)).toEqual({ origin: "illustration", ...review.images[2]!.image!.license });
    expect(packet.content.image!.url).toBe(`https://dneskai.example${review.images[2]!.image!.hero_path.replace(/^public/u, "")}`);
    expect(packet.contentHash).toBe(sha256(packet.content));
    expect(await readdir(root)).not.toContain("social");
    await reconcileSources({ ...input, write: true });
    expect(await readdir(path.join(root, "marketing-source/outbox"))).toHaveLength(1);
  });
  it("refreshes approval observation without changing the authored content or expiry", async () => {
    const { input, approve } = await fixture(); await approve();
    const first = (await reconcileSources(input)).packets[0]!;
    const refreshed = (await reconcileSources({ ...input, now: new Date(now.getTime() + 60000) })).packets[0]!;
    expect(packetKey(refreshed)).toBe(packetKey(first));
    expect(refreshed.expiresAt).toBe(first.expiresAt);
    expect(refreshed.observedAt).not.toBe(first.observedAt);
  });
  it("records no edition without inventing an article", async () => {
    const { input, root, edition } = await fixture();
    await atomicWriteJson(root, "edition/outbox/fixture-no-edition.json", { schemaVersion: "edition-package/1", status: "no_edition", date: "2026-09-27",
      idempotencyKey: edition.idempotencyKey, generation: edition.generation, reason: "Fixture: no article passed selection",
      board: { meetingRef: edition.board.meetingRef, roomUrl: edition.board.roomUrl, noEditionReason: "Fixture: no article passed selection" } });
    const result = await reconcileSources(input);
    expect(result.noEditionDates).toEqual(["2026-09-27"]);
    expect(result.packets).toEqual([]);
    expect(result.held).toBe(1);
  });
  it("rejection retracts the safe prior content and supersedes the old pending revision", async () => {
    const { input, root, approve, review, decision } = await fixture(); await approve();
    const first = (await reconcileSources({ ...input, write: true })).packets[0]!;
    await atomicWriteJson(root, `editorial/decisions/${review.id}.json`, { ...decision, action: "reject" });
    const second = (await reconcileSources({ ...input, write: true })).packets[0]!;
    expect(second.eligible).toBe(false);
    expect(second.sourceId).toBe(first.sourceId);
    expect(second.sourceRevision).not.toBe(first.sourceRevision);
    expect(second.content).toEqual(first.content);
    expect((await readJson<{ status: string }>(root, `marketing-source/outbox/${packetKey(first)}.json`, { status: "unknown" })).status).toBe("superseded");
    const queried = await readSources({ ...input, reader: localSourceReader(root), sourceIds: [first.sourceId, "unknown"] });
    expect(queried.sources.every(source => !source.packet)).toBe(true);
  });
  it("an owner retraction holds even an otherwise approved article", async () => {
    const { input, approve, root } = await fixture(); await approve();
    const first = (await reconcileSources({ ...input, write: true })).packets[0]!;
    await atomicWriteJson(root, retractionPath(first.sourceId), { schemaVersion: "marketing-source-retraction/1", sourceId: first.sourceId, actor: "owner", reason: "Source correction pending", retractedAt: now.toISOString() });
    const next = (await reconcileSources({ ...input, write: true })).packets[0]!;
    expect(next.eligible).toBe(false);
    expect(next.eligibilityReason).toContain("owner-retraction");
  });
  it("signs exact raw bytes and keeps duplicate delivery idempotent", async () => {
    const { input, approve } = await fixture(); await approve();
    await reconcileSources({ ...input, write: true });
    let calls = 0;
    const fetcher: typeof fetch = async (_url, options) => {
      calls++;
      expect(verifySourceRequest(new Headers(options?.headers), String(options?.body), secret, now)).toBe(true);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const delivery = { ...input, endpoint: "https://own.example/api/marketing/automation", secret, enabled: true, fetcher };
    expect((await deliverSources(delivery)).delivered).toBe(1);
    expect((await deliverSources(delivery)).delivered).toBe(0);
    expect(calls).toBe(1);
  });
  it("bounds retries and keeps failed HTTP response content out of records", async () => {
    const { input, approve, root } = await fixture(); await approve();
    const packet = (await reconcileSources({ ...input, write: true })).packets[0]!;
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return new Response("Bearer must-not-be-recorded", { status: 503 }); };
    const delivery = { ...input, endpoint: "https://own.example/api/marketing/automation", secret, enabled: true, fetcher };
    await deliverSources(delivery); await deliverSources(delivery);
    expect(calls).toBe(1);
    await deliverSources({ ...delivery, now: new Date(now.getTime() + 60000) });
    await deliverSources({ ...delivery, now: new Date(now.getTime() + 360000) });
    const raw = await readFile(path.join(root, `marketing-source/outbox/${packetKey(packet)}.json`), "utf8");
    expect(JSON.parse(raw).status).toBe("reconciliation"); expect(calls).toBe(3);
    expect(raw).not.toContain("must-not-be-recorded"); expect(raw).not.toContain(secret);
    await retryReconciledSource(root, packetKey(packet), now);
    expect(await readdir(path.join(root, "marketing-source/reconciliations"))).toHaveLength(1);
    const retried = await readJson<{ attempts: number; status: string }>(root, `marketing-source/outbox/${packetKey(packet)}.json`, { attempts: -1, status: "unknown" });
    expect(retried).toMatchObject({ attempts: 0, status: "pending" });
    await expect(retryReconciledSource(root, packetKey(packet), now)).rejects.toThrow();
  });
  it("refuses disabled delivery, stale signatures, altered bytes and wrong-brand capability paths", async () => {
    const { input } = await fixture();
    await expect(deliverSources({ ...input, endpoint: "https://own.example/api/marketing/automation", secret, enabled: false })).rejects.toThrow();
    const body = '{"action":"sources","sourceIds":[]}';
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const headers = new Headers({ Authorization: `Bearer ${secret}`, "X-Marketing-Timestamp": timestamp, "X-Marketing-Signature": signature(secret, timestamp, body) });
    expect(verifySourceRequest(headers, body, secret, now)).toBe(true);
    expect(verifySourceRequest(headers, `${body} `, secret, now)).toBe(false);
    expect(verifySourceRequest(headers, body, secret, new Date(now.getTime() + 301000))).toBe(false);
    expect((await resolveVentureCapability({ source: "marketingshark", target: "own-dashboard", capability: "approved-publish-package", schemaVersion: "marketing-source/1" })).decision).toBe("denied");
  });
});
