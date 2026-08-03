import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import editionFixture from "../../../contracts/fixtures/edition-package.valid.json" with { type: "json" };
import meetingFixture from "../../../contracts/fixtures/meeting-record.valid.json" with { type: "json" };
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { MeetingRecordSchema } from "../contracts/meeting-record.js";
import { SocialPackSchema } from "../contracts/social-pack.js";
import { QueueItemSchema, assertQueueItemPublishable, queuePayloadHash } from "./queue.js";
import { composeEditionSocialPack } from "./pack.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Caught Up social pack composer", () => {
  it("renders accessible localized carousel sets and four draft-locked queue items", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-"));
    roots.push(root);
    const stateRoot = path.join(root, "state");
    const result = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: MeetingRecordSchema.parse(meetingFixture),
      destinations: {
        en: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut",
        cs: "https://caught-up.example/cs/articles/2026-08-04-measured-model-price-cut"
      },
      repoRoot: root,
      stateRoot,
      now: new Date("2026-08-04T04:00:00.000Z")
    });
    expect(result).not.toBeNull();
    const pack = SocialPackSchema.parse(result!.pack);
    expect(pack.instagram.frames).not.toEqual(pack.threads.frames);
    expect(pack.instagram).toEqual(pack.byLocale.en!.instagram);
    expect(pack.threads).toEqual(pack.byLocale.en!.threads);
    // The frame count follows the edition now — five to ten — rather than a fixed template,
    // so it is bounded rather than restated.
    for (const frames of [
      pack.byLocale.en!.instagram.frames,
      pack.byLocale.cs.instagram.frames,
      pack.byLocale.en!.threads.frames,
      pack.byLocale.cs.threads.frames
    ]) {
      expect(frames.length).toBeGreaterThanOrEqual(5);
      expect(frames.length).toBeLessThanOrEqual(10);
    }
    expect(pack.byLocale.cs.instagram.frames).toHaveLength(pack.byLocale.en!.instagram.frames.length);
    expect(pack.byLocale.en!.instagram.frames).not.toEqual(pack.byLocale.cs.instagram.frames);
    expect(pack.byLocale.en!.destination).toContain("/articles/");
    expect(pack.byLocale.en!.destination).not.toContain("/en/articles/");
    expect(pack.byLocale.cs.destination).toContain("/cs/articles/");
    // One alt text per rendered frame plus the quote card. Derived, because the frame count
    // now depends on the edition.
    const frameTotal = new Set([
      ...pack.byLocale.en!.instagram.frames,
      ...pack.byLocale.cs.instagram.frames,
      ...pack.byLocale.en!.threads.frames,
      ...pack.byLocale.cs.threads.frames,
      pack.quoteCard.frame
    ]).size;
    expect(Object.keys(pack.altTexts)).toHaveLength(frameTotal);
    expect(pack.instagram.caption).not.toBe(pack.threads.text);
    expect(pack.byLocale.cs.instagram.caption).not.toBe(pack.byLocale.cs.threads.text);
    for (const frame of [
      ...pack.byLocale.en!.instagram.frames,
      ...pack.byLocale.cs.instagram.frames,
      ...pack.byLocale.en!.threads.frames,
      ...pack.byLocale.cs.threads.frames,
      pack.quoteCard.frame
    ]) {
      const metadata = await sharp(await readFile(path.join(root, "site", "public", frame.slice(1)))).metadata();
      expect(metadata.format).toBe("png");
      if (frame.includes("/threads/")) expect(metadata).toMatchObject({ width: 1200, height: 1200 });
      else expect(metadata).toMatchObject({ width: 1080, height: 1350 });
      expect(pack.altTexts[frame]).toBeTruthy();
    }
    expect(result!.queueItems).toHaveLength(4);
    expect(new Set(result!.queueItems.map((item) => item.id)).size).toBe(4);
    expect(new Set(result!.queueItems.map((item) => item.destination))).toEqual(new Set([
      pack.byLocale.en!.destination,
      pack.byLocale.cs.destination
    ]));
    for (const item of result!.queueItems) {
      const parsed = QueueItemSchema.parse(item);
      expect(parsed.status).toBe("draft");
      expect(Object.values(parsed.checks)).toEqual(Array(8).fill("pass"));
      expect(queuePayloadHash(parsed)).toBe(parsed.content.contentHash);
      expect(parsed.attempt).toBeNull();
    }

    const replayRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-replay-"));
    roots.push(replayRoot);
    const replay = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: MeetingRecordSchema.parse(meetingFixture),
      destinations: {
        en: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut",
        cs: "https://caught-up.example/cs/articles/2026-08-04-measured-model-price-cut"
      },
      repoRoot: replayRoot,
      stateRoot: path.join(replayRoot, "state"),
      now: new Date("2026-08-04T04:00:00.000Z")
    });
    expect(replay!.pack).toEqual(pack);
    expect(replay!.queueItems).toEqual(result!.queueItems);
    expect(await readFile(path.join(replayRoot, "site", "public", pack.instagram.frames[0]!.slice(1))))
      .toEqual(await readFile(path.join(root, "site", "public", pack.instagram.frames[0]!.slice(1))));
  }, 15_000);

  it("does not manufacture a pack for NO_EDITION", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-"));
    roots.push(root);
    const noEdition = {
      ...editionFixture,
      status: "no_edition",
      article: undefined,
      hero: undefined,
      socialPackRef: undefined,
      board: {
        meetingRef: "meetings/2026-08-04-cu-edition",
        roomUrl: "https://boardless.example/meetings/2026-08-04-cu-edition",
        noEditionReason: "No source cleared the gate."
      }
    };
    expect(await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(noEdition),
      meeting: MeetingRecordSchema.parse(meetingFixture),
      destinations: {
        en: "https://caught-up.example/articles/unavailable",
        cs: "https://caught-up.example/cs/articles/unavailable"
      },
      repoRoot: root,
      stateRoot: path.join(root, "state")
    })).toBeNull();
  });

  it("rejects a non-HTTPS destination before writing public assets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-"));
    roots.push(root);
    await expect(composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: MeetingRecordSchema.parse(meetingFixture),
      destinations: {
        en: "http://caught-up.example/articles/unsafe",
        cs: "https://caught-up.example/cs/articles/unsafe"
      },
      repoRoot: root,
      stateRoot: path.join(root, "state")
    })).rejects.toThrow("Only HTTPS URLs are allowed");
  });
});

describe("a Czech-only edition composes", () => {
  it("renders one locale and never reaches for an English half the package lacks", async () => {
    // composeEditionSocialPack built both locale visuals unconditionally, so the first
    // Czech-only edition threw "Cannot read properties of undefined (reading 'frontmatter')".
    // cycle.ts catches that and recordSocialPackFailure dedupes on a marker, so the composer
    // went dark silently and only the first day ever reached the inbox. This fixture is
    // bilingual, which is exactly why the crash survived until production met it.
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-cs-"));
    roots.push(root);
    const czechOnly = structuredClone(editionFixture) as Record<string, unknown>;
    delete (czechOnly.article as Record<string, unknown>).en;
    const result = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(czechOnly),
      meeting: MeetingRecordSchema.parse(meetingFixture),
      destinations: { cs: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut" },
      repoRoot: root,
      stateRoot: path.join(root, "state"),
      now: new Date("2026-08-04T04:00:00.000Z")
    });
    expect(result).not.toBeNull();
    const pack = SocialPackSchema.parse(result!.pack);
    expect(Object.keys(pack.byLocale)).toEqual(["cs"]);
    // Two queue items, not four: one locale times two channels.
    expect(result!.queueItems).toHaveLength(2);
    expect(result!.queueItems.every((item) => item.locale === "cs")).toBe(true);
  });
});

describe("every composed queue item survives the publisher's own gate", () => {
  it("does not attach carousel frames to a Threads item", async () => {
    // assertQueueItemPublishable rejects a Threads item carrying any asset — the guarded
    // connector is text-only — and it throws rather than skipping, so one bad item would take
    // the whole publisher run down on the first send. Frames belong to the Instagram carousel.
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-threads-"));
    roots.push(root);
    const result = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: MeetingRecordSchema.parse(meetingFixture),
      destinations: {
        en: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut",
        cs: "https://caught-up.example/cs/articles/2026-08-04-measured-model-price-cut"
      },
      repoRoot: root,
      stateRoot: path.join(root, "state"),
      now: new Date("2026-08-04T04:00:00.000Z")
    });
    const items = result!.queueItems;
    expect(items.some((item) => item.channel === "threads")).toBe(true);
    expect(items.some((item) => item.channel === "instagram")).toBe(true);
    for (const item of items) {
      if (item.channel === "threads") expect(item.content.assetPaths).toEqual([]);
      else expect(item.content.assetPaths.length).toBeGreaterThan(0);
      // The real gate, not a restatement of it: whatever the composer emits must pass here.
      expect(() => assertQueueItemPublishable({ ...item, status: "queued" })).not.toThrow();
    }
  });
});
