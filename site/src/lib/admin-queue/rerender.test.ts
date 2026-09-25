import { createHash } from "node:crypto";
import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { packageHash, readQuizPackage, reviewPackageSlides, slidesWithEdits } from "@/lib/devshark-package";
import { setPackageSlideOverride } from "@/lib/package-slide-overrides";
import { applyQueueAction } from "./actions";
import { parseSocialQueueEvent } from "./event";
import { fakeGitHub } from "./fake-github";
import { PACKAGE_DATE, packageFixtureRoot, writeJson } from "./fixture-root";
import { parseQueueItemV2, queueItemV2Hash } from "./item";
import { QueueActionError } from "./store";

vi.mock("server-only", () => ({}));

// quorum#575 (B8): the Queue's `rerender` turns the Design Lab's saved slides into frames, a package
// revision and a superseding draft, on the package the marketingShark room drafts for 2026-09-26.

const now = new Date("2026-09-26T08:00:00.000Z");
const LINKEDIN = "ms-2026-09-26-devshark-en-linkedin";
const INSTAGRAM = "ms-2026-09-26-devshark-en-instagram";
const WHY = { headline: "Why JSON", body: "Browsers parse JSON natively; XML needs a parser.", alt: "Slide 4: why JSON wins" };
const roots: string[] = [];
let root = "";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function json(base: string, relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path.join(base, relative), "utf8")) as Record<string, unknown>;
}

async function queueItem(base: string, id: string) {
  return parseQueueItemV2(await json(base, `state/social/queue/${id.replace(/^ms-/u, "")}.json`).catch(() => json(base, `state/social/queue/${id}.json`)))!;
}

async function events(base: string): Promise<string[]> {
  return (await readdir(path.join(base, "state/social/queue-events")).catch(() => [] as string[])).sort();
}

async function saveSlide(base: string, slide: number, copy: typeof WHY): Promise<void> {
  const record = (await readQuizPackage(PACKAGE_DATE, "devshark", base))!;
  const original = record.slides[slide]!;
  await setPackageSlideOverride({
    slug: record.slug, date: record.date, slide, copy,
    original: { headline: original.headline, body: original.body, alt: original.alt },
    review: (edits) => reviewPackageSlides(record, slidesWithEdits(record, edits)),
    now
  }, base);
}

async function rerender(base: string, id: string, at = now) {
  const item = await queueItem(base, id);
  return applyQueueAction({ action: "rerender", itemId: id, expectedContentHash: item.content.contentHash }, { root: base, now: at });
}

async function refusal(base: string, id: string): Promise<QueueActionError> {
  const error = await rerender(base, id).then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(QueueActionError);
  return error as QueueActionError;
}

beforeEach(async () => {
  vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "");
  root = await packageFixtureRoot();
  roots.push(root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await Promise.all(roots.splice(0).map((entry) => rm(entry, { recursive: true, force: true })));
});

describe("re-rendering a devShark draft from the Design Lab", () => {
  it("writes the frames and a package revision first, then supersedes the draft with one bound to them", async () => {
    await saveSlide(root, 3, WHY);
    const base = (await readQuizPackage(PACKAGE_DATE, "devshark", root))!;
    const result = await rerender(root, LINKEDIN);
    expect(result).toMatchObject({ changed: true, supersedingItemId: `${LINKEDIN}-r1`, event: { action: "rerender", nextStatus: "cancelled" }, dispatch: null });

    const successor = await queueItem(root, `${LINKEDIN}-r1`);
    expect(successor).toMatchObject({ status: "draft", releaseId: base.id, content: { text: (await queueItem(root, LINKEDIN)).content.text } });
    expect(queueItemV2Hash(successor)).toBe(successor.content.contentHash);
    expect(Object.values(successor.checks).every((state) => state === "pending")).toBe(true);
    expect(successor.approvalProvenance.approvalRef).toBe("awaiting-owner-approval");
    expect(successor.content.altText).toContain(WHY.alt);
    expect((await queueItem(root, LINKEDIN)).status).toBe("cancelled");

    // The revision is what the asset gate reads: it hashes to the draft's packageHash and records
    // every frame the draft names, with the bytes on disk.
    const revision = await json(root, successor.sourcePackage!.artifactRef.replace(/^\//u, ""));
    expect(successor.sourcePackage!.artifactRef).toMatch(/^state\/ventures\/marketingshark\/packages\/2026-09-26\/devshark\/revisions\/[a-f0-9]{12}\.json$/u);
    expect(packageHash(revision)).toBe(successor.sourcePackage!.packageHash);
    expect(revision.revisionOf).toEqual({ artifactRef: base.artifactRef, packageHash: base.hash });
    const frames = (revision.render as { frames: Array<{ slide: number; png: { path: string; sha256: string }; jpeg: { path: string; sha256: string } }> }).frames;
    expect(successor.content.assetPaths).toEqual(frames.map((frame) => frame.png.path));
    for (const frame of frames) {
      for (const file of [frame.png, frame.jpeg]) expect(sha(await readFile(path.join(root, "site/public", file.path)))).toBe(file.sha256);
      // Only the edited slide's picture changed; the other four are the room's own bytes.
      expect(frame.png.sha256 === base.frames[frame.slide - 1]!.png.sha256).toBe(frame.slide !== 4);
    }
    expect((revision.carousels as { en: { slides: Array<Record<string, unknown>> } }).en.slides[3]).toMatchObject(WHY);

    const written = await events(root);
    expect(written).toHaveLength(1);
    expect(parseSocialQueueEvent(await json(root, `state/social/queue-events/${written[0]}`))).toMatchObject({
      action: "rerender", itemId: LINKEDIN, supersedingItemId: `${LINKEDIN}-r1`, changedFields: ["frames", "altText"], resultingContentHash: successor.content.contentHash
    });
  });

  it("gives Instagram the JPEG copies of the same revision, written once", async () => {
    await saveSlide(root, 3, WHY);
    await rerender(root, LINKEDIN);
    await rerender(root, INSTAGRAM);
    const linkedin = await queueItem(root, `${LINKEDIN}-r1`);
    const instagram = await queueItem(root, `${INSTAGRAM}-r1`);
    expect(instagram.sourcePackage).toEqual(linkedin.sourcePackage);
    expect(instagram.content.assetPaths).toEqual(linkedin.content.assetPaths.map((asset) => asset.replace(/\.png$/u, ".jpg")));
  });

  it("lets the new draft be approved like any other", async () => {
    await saveSlide(root, 3, WHY);
    await rerender(root, LINKEDIN);
    const successor = await queueItem(root, `${LINKEDIN}-r1`);
    const approval = await applyQueueAction({ action: "approve", itemId: successor.id, expectedContentHash: successor.content.contentHash, mode: "window" }, { root, now });
    expect(approval).toMatchObject({ changed: true, event: { action: "approve", nextStatus: "queued" } });
  });

  it("goes back to the package's own frames when the slides read as the package does again", async () => {
    await saveSlide(root, 3, WHY);
    await rerender(root, LINKEDIN);
    const base = (await readQuizPackage(PACKAGE_DATE, "devshark", root))!;
    await saveSlide(root, 3, { headline: base.slides[3]!.headline, body: base.slides[3]!.body, alt: base.slides[3]!.alt });
    await rerender(root, `${LINKEDIN}-r1`);
    const back = await queueItem(root, `${LINKEDIN}-r2`);
    expect(back.sourcePackage).toEqual({ schemaVersion: "approved-publish-package/1", artifactRef: base.artifactRef, packageHash: base.hash });
    expect(back.content.assetPaths).toEqual(base.frames.map((frame) => frame.png.path));
  });

  it("refuses when nothing changed, when a saved slide would clip, and when the window has closed; each writes nothing", async () => {
    expect((await refusal(root, LINKEDIN)).message).toContain("nothing to re-render");

    // A record that never went through Save: the re-render runs the clip gate itself.
    await writeJson(root, "state/ventures/carousel-studio/slide-overrides.json", { schemaVersion: "carousel-slide-overrides/1", updatedAt: now.toISOString(), overrides: [{
      kind: "package-slide", venture: "devshark", slug: "marketingshark-2026-09-26-devshark", date: PACKAGE_DATE, slide: 2, changedAt: now.toISOString(),
      headline: "A", body: "JSON, the small text format every browser parses natively without an XML parser, which is why so many web APIs return it by default today", alt: "Slide 3"
    }] });
    const clipped = await refusal(root, LINKEDIN);
    expect(clipped.code).toBe("REFUSED");
    expect(clipped.message).toContain("would clip in stat-label");

    await saveSlide(root, 2, { headline: "A", body: "JSON", alt: "Slide 3: the answer is JSON" });
    const late = await rerender(root, LINKEDIN, new Date("2026-09-27T00:00:00.000Z")).then(() => null, (caught: unknown) => caught);
    expect((late as QueueActionError).code).toBe("REFUSED");

    expect(await events(root)).toEqual([]);
    await expect(readdir(path.join(root, "site/public/social"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await queueItem(root, LINKEDIN)).status).toBe("draft");
  });

  it("refuses without the Design Lab edge", async () => {
    const closed = await packageFixtureRoot({ designLabEdge: false });
    roots.push(closed);
    expect((await refusal(closed, LINKEDIN)).message).toContain("no Design Lab edge");
  });

  it("reads the saved slides from GitHub and writes the frames there in a deployment", async () => {
    // The deployment's own copy has no edit; only GitHub has the owner's saved slide.
    const github = await packageFixtureRoot();
    roots.push(github);
    await saveSlide(github, 3, WHY);
    const fake = fakeGitHub(github);
    vi.stubGlobal("fetch", fake.fetch);
    vi.stubEnv("BOARDLESSAI_GITHUB_TOKEN", "test-token");
    vi.stubEnv("BOARDLESSAI_GITHUB_REPOSITORY", "lukaskourilcz/quorum");
    vi.stubEnv("BOARDLESSAI_GITHUB_BRANCH", "main");
    vi.stubEnv("NODE_ENV", "production");
    const result = await rerender(root, LINKEDIN);
    expect(result.persistence).toBe("github");
    const successor = await queueItem(github, `${LINKEDIN}-r1`);
    expect(successor.content.altText).toContain(WHY.alt);
    const puts = fake.calls.filter((call) => call.method === "PUT").map((call) => call.path.replace("/repos/lukaskourilcz/quorum/contents/", ""));
    // Frames and the revision before the event, the event before the draft, the draft before the cancellation.
    expect(puts.slice(0, 10).every((file) => /^site\/public\/social\/devshark\/2026-09-26\/en\/[a-f0-9]{12}\/slide-0[1-5]\.(?:png|jpg)$/u.test(file))).toBe(true);
    expect(puts.slice(10)).toEqual([
      successor.sourcePackage!.artifactRef,
      expect.stringMatching(/^state\/social\/queue-events\/.+-rerender\.json$/u),
      `state/social/queue/${LINKEDIN}-r1.json`,
      `state/social/queue/${PACKAGE_DATE}-devshark-en-linkedin.json`
    ]);
    // Nothing was written to the deployment's copy.
    expect(await events(root)).toEqual([]);
  });
});
