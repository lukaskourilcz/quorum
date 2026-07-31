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
import { QueueItemSchema, queuePayloadHash } from "./queue.js";
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
    expect(pack.instagram.frames).toEqual(pack.threads.frames);
    expect(pack.instagram).toEqual(pack.byLocale.en.instagram);
    expect(pack.threads).toEqual(pack.byLocale.en.threads);
    expect(pack.byLocale.en.instagram.frames).toHaveLength(4);
    expect(pack.byLocale.cs.instagram.frames).toHaveLength(4);
    expect(pack.byLocale.en.instagram.frames).not.toEqual(pack.byLocale.cs.instagram.frames);
    expect(pack.byLocale.en.destination).toContain("/articles/");
    expect(pack.byLocale.en.destination).not.toContain("/en/articles/");
    expect(pack.byLocale.cs.destination).toContain("/cs/articles/");
    expect(Object.keys(pack.altTexts)).toHaveLength(9);
    expect(pack.instagram.caption).not.toBe(pack.threads.text);
    expect(pack.byLocale.cs.instagram.caption).not.toBe(pack.byLocale.cs.threads.text);
    for (const frame of [
      ...pack.byLocale.en.instagram.frames,
      ...pack.byLocale.cs.instagram.frames,
      pack.quoteCard.frame
    ]) {
      const metadata = await sharp(await readFile(path.join(root, "site", "public", frame.slice(1)))).metadata();
      expect(metadata).toMatchObject({ width: 1080, height: 1350, format: "webp" });
      expect(pack.altTexts[frame]).toBeTruthy();
    }
    expect(result!.queueItems).toHaveLength(4);
    expect(new Set(result!.queueItems.map((item) => item.id)).size).toBe(4);
    expect(new Set(result!.queueItems.map((item) => item.destination))).toEqual(new Set([
      pack.byLocale.en.destination,
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
