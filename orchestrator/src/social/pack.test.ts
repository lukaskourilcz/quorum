import { mkdir, readdir, readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import editionFixture from "../../../contracts/fixtures/edition-package.valid.json" with { type: "json" };
import { caughtUpEditionMeeting as caughtUpMeetingFixture, czechOnlyEdition } from "../../tests/fixtures/caught-up-edition.js";
import { EditionPackageSchema } from "../contracts/edition-package.js";
import { SocialPackSchema } from "../contracts/social-pack.js";
import { canonicalJson, sha256 } from "../hashing.js";
import { configRoot, repoRoot } from "../paths.js";
import { readRecordedAssetHashes } from "./media/recorded-hashes.js";
import { composeEditionSocialPack } from "./pack.js";
import { loadSocialPublisherRegistry, SocialPublisherRegistrySchema } from "./publisher-targets.js";
import {
  AWAITING_OWNER_APPROVAL,
  CapabilityAwareQueueItemSchema,
  assertQueueItemPublishable,
  capabilityAwareQueuePayloadHash,
  type CapabilityAwareQueueItem
} from "./queue.js";
import { isDue } from "./runner-context.js";

/**
 * How long a sharp-backed render may take before the suite calls it hung.
 *
 * These three tests rasterise full carousel sets. Alone they take 7.4, 1.7 and 3.3 seconds; on a
 * loaded CI runner the first one crossed the limit and failed the pre-cycle release gate, so the
 * 16:28 meeting on 3 August never opened — a healthy cycle lost to a slow image encoder. The
 * config-level testTimeout did not apply to it; a per-test value does.
 */
const RENDER_TIMEOUT_MS = 90_000;

const roots: string[] = [];

/**
 * What the Queue's approval does to a draft (`approveQueueItem` in `site/src/lib/admin-queue/item.ts`,
 * keeping the window): every check passes, the approval event becomes the provenance and the hash is
 * recomputed over both.
 */
function approvedByOwner(item: CapabilityAwareQueueItem): CapabilityAwareQueueItem {
  const approved = {
    ...item,
    status: "queued" as const,
    checks: Object.fromEntries(Object.keys(item.checks).map((id) => [id, "pass"])) as CapabilityAwareQueueItem["checks"],
    approvalProvenance: { ...item.approvalProvenance, approvalRef: "social-queue-event-0123456789abcdef01234567" }
  };
  return CapabilityAwareQueueItemSchema.parse({ ...approved, content: { ...approved.content, contentHash: capabilityAwareQueuePayloadHash(approved) } });
}

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
      meeting: caughtUpMeetingFixture,
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
    // Threads carries none. The composer used to render, hash, write and commit a full second
    // deck for a channel whose queue item forces `assetPaths: []`, then throw it away.
    expect(pack.threads.frames).toEqual([]);
    expect(pack.byLocale.cs.threads.frames).toEqual([]);
    expect(pack.instagram.frames).not.toEqual(pack.threads.frames);
    expect(pack.instagram).toEqual(pack.byLocale.en!.instagram);
    expect(pack.threads).toEqual(pack.byLocale.en!.threads);
    // The frame count follows the edition now — five to ten — rather than a fixed template,
    // so it is bounded rather than restated.
    for (const frames of [
      pack.byLocale.en!.instagram.frames,
      pack.byLocale.cs.instagram.frames
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
      pack.quoteCard.frame
    ]).size;
    expect(Object.keys(pack.altTexts)).toHaveLength(frameTotal);
    expect(pack.instagram.caption).not.toBe(pack.threads.text);
    expect(pack.byLocale.cs.instagram.caption).not.toBe(pack.byLocale.cs.threads.text);
    for (const frame of [
      ...pack.byLocale.en!.instagram.frames,
      ...pack.byLocale.cs.instagram.frames,
      pack.quoteCard.frame
    ]) {
      const metadata = await sharp(await readFile(path.join(root, "site", "public", frame.slice(1)))).metadata();
      expect(metadata.format).toBe("png");
      expect(metadata).toMatchObject({ width: 1080, height: 1350 });
      expect(pack.altTexts[frame]).toBeTruthy();
    }
    // Nothing was written for a channel that takes nothing.
    expect(Object.keys(pack.altTexts).some((frame) => frame.includes("/threads/"))).toBe(false);
    expect(result!.queueItems).toHaveLength(4);
    expect(new Set(result!.queueItems.map((item) => item.id)).size).toBe(4);
    expect(new Set(result!.queueItems.map((item) => item.destination))).toEqual(new Set([
      pack.byLocale.en!.destination,
      pack.byLocale.cs.destination
    ]));
    // Queue v2 drafts (quorum#583), each on the profile and connection the registry's legacy mapping
    // gives DNESKAi's v1 posts, so the two writers' posts land on the same feed. Nothing in one can
    // send before the owner approves it in the Queue.
    const registry = await loadSocialPublisherRegistry(configRoot);
    const mapping = registry.legacyQueueMappings.find(({ venture }) => venture === "caught-up")!;
    const writtenPack = JSON.parse(await readFile(path.join(stateRoot, "social/packs/2026-08-04.json"), "utf8")) as unknown;
    for (const item of result!.queueItems) {
      const parsed = CapabilityAwareQueueItemSchema.parse(item);
      expect(parsed).toMatchObject({
        status: "draft",
        sourceVentureId: "caught-up",
        target: {
          profileId: registry.connections.find(({ id }) => id === mapping.connections[parsed.channel as "instagram" | "threads"])!.profileId,
          profileRole: "venture-primary",
          role: "primary",
          connectionBindingRef: mapping.connections[parsed.channel as "instagram" | "threads"],
          capabilityRef: null
        },
        // The pack as written, by hash: the asset gate reads the file back and compares.
        sourcePackage: { schemaVersion: "approved-publish-package/1", artifactRef: "state/social/packs/2026-08-04.json", packageHash: sha256(canonicalJson(writtenPack)) },
        approvalProvenance: { approvalRef: AWAITING_OWNER_APPROVAL, selectionRef: "state/meetings/2026-08-04-cu-edition.json" },
        attempt: null,
        migration: null
      });
      expect(Object.values(parsed.checks)).toEqual(Array(11).fill("pending"));
      expect(capabilityAwareQueuePayloadHash(parsed)).toBe(parsed.content.contentHash);
      expect(JSON.parse(await readFile(path.join(stateRoot, `social/queue/2026-08-04-${parsed.locale}-${parsed.channel}.json`), "utf8"))).toEqual(parsed);
      expect(isDue(parsed, new Date("2026-08-04T05:00:00.000Z"))).toBe(false);
      expect(() => assertQueueItemPublishable({ ...parsed, status: "queued" })).toThrow(/incomplete approval checks/u);
      // The asset gate trusts the pack, and finds a recorded hash for every frame an item names.
      const recorded = await readRecordedAssetHashes({ item: parsed, repoRoot: root, stateRoot });
      expect(recorded.sourcePackage).toBe("verified");
      expect(parsed.content.assetPaths.every((asset) => recorded.hashes.has(asset))).toBe(true);
    }

    const replayRoot = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-replay-"));
    roots.push(replayRoot);
    const replay = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: caughtUpMeetingFixture,
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
  // Two locales, two genuinely different canvases, up to ten slides each: forty rasterisations
  // where the fixed five-slide template did ten. Real work, not waste.
  }, 90_000);

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
      meeting: caughtUpMeetingFixture,
      destinations: {
        en: "https://caught-up.example/articles/unavailable",
        cs: "https://caught-up.example/cs/articles/unavailable"
      },
      repoRoot: root,
      stateRoot: path.join(root, "state")
    })).toBeNull();
  }, RENDER_TIMEOUT_MS);

  it("rejects a non-HTTPS destination before writing public assets", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-"));
    roots.push(root);
    await expect(composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: caughtUpMeetingFixture,
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
      meeting: caughtUpMeetingFixture,
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
  }, RENDER_TIMEOUT_MS);
});

describe("every composed queue item survives the publisher's own gate", () => {
  it("does not attach carousel frames to a Threads item", async () => {
    // DNESKAi's Threads post is text and a link; its frames belong to the Instagram carousel. The
    // connector takes Threads images since #572, but DNESKAi renders no Threads deck to attach.
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-threads-"));
    roots.push(root);
    const result = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(editionFixture),
      meeting: caughtUpMeetingFixture,
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
      // Not before the owner approves it (quorum#583)...
      expect(() => assertQueueItemPublishable({ ...item, status: "queued" })).toThrow(/incomplete approval checks/u);
      // ...and then the real gate, not a restatement of it: whatever the composer emits must pass
      // here once the Queue has approved it.
      expect(() => assertQueueItemPublishable(approvedByOwner(item))).not.toThrow();
    }
  }, RENDER_TIMEOUT_MS);
});

describe("composition without an enabled channel (quorum#563)", () => {
  it("writes the pack and two drafts, hosts no frame, and leaves nothing publishable on Instagram", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-unhosted-"));
    roots.push(root);
    const czechOnly = structuredClone(editionFixture) as Record<string, unknown>;
    delete (czechOnly.article as Record<string, unknown>).en;
    const stateRoot = path.join(root, "state");
    const result = await composeEditionSocialPack({
      editionPackage: EditionPackageSchema.parse(czechOnly),
      meeting: caughtUpMeetingFixture,
      destinations: { cs: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut" },
      repoRoot: root,
      stateRoot,
      now: new Date("2026-08-04T04:00:00.000Z"),
      hostFrames: false
    });
    expect(result).not.toBeNull();
    // The pack is complete: its frame manifest, its alt text and the visual the admin renders from.
    const pack = SocialPackSchema.parse(JSON.parse(await readFile(path.join(stateRoot, "social/packs/2026-08-04.json"), "utf8")));
    expect(pack.byLocale.cs.instagram.frames.length).toBeGreaterThan(0);
    expect(pack.byLocale.cs.instagram.visual.template_id).toBeTruthy();
    expect(result!.queueItems).toHaveLength(2);
    // Nothing under site/public/social: not a frame, not the quote card.
    await expect(readdir(path.join(root, "site"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(result!.artifactPaths.some((artifact) => artifact.includes("public/social"))).toBe(false);
    const assets = JSON.parse(await readFile(path.join(stateRoot, "social/assets/2026-08-04.json"), "utf8")) as { hosted: boolean };
    expect(assets.hosted).toBe(false);
    for (const item of result!.queueItems) {
      expect(item.status).toBe("draft");
      expect(item.content.assetPaths).toEqual([]);
      CapabilityAwareQueueItemSchema.parse(item);
      if (item.channel === "threads") {
        expect(() => assertQueueItemPublishable(approvedByOwner(item))).not.toThrow();
      } else {
        // Reviewable and copyable, never sendable: even approved, the publisher's own gate refuses it.
        expect(() => assertQueueItemPublishable(approvedByOwner(item))).toThrow(/hosted images/u);
      }
    }
  }, RENDER_TIMEOUT_MS);
});

describe("drafts bound to DNESKAi's own profile (quorum#583)", () => {
  it("writes nothing at all when the registry cannot bind a draft", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-registry-"));
    roots.push(root);
    const config = path.join(root, "config");
    await mkdir(config, { recursive: true });
    const registry = SocialPublisherRegistrySchema.parse(JSON.parse(await readFile(path.join(configRoot, "social-publisher-registry.json"), "utf8")));
    const threads = registry.legacyQueueMappings.find(({ venture }) => venture === "caught-up")!.connections.threads;
    // Without DNESKAi's Threads connection, and the legacy mapping that names it, the registry still
    // parses; the composer must not bind the Threads draft to anything else.
    await writeFile(path.join(config, "social-publisher-registry.json"), JSON.stringify(SocialPublisherRegistrySchema.parse({
      ...registry,
      connections: registry.connections.filter(({ id }) => id !== threads),
      legacyQueueMappings: registry.legacyQueueMappings.filter(({ venture }) => venture !== "caught-up")
    })));
    const stateRoot = path.join(root, "state");
    await expect(composeEditionSocialPack({
      editionPackage: czechOnlyEdition(),
      meeting: caughtUpMeetingFixture,
      destinations: { cs: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut" },
      repoRoot: root,
      stateRoot,
      configRoot: config,
      now: new Date("2026-08-04T04:00:00.000Z")
    })).rejects.toThrow(/exactly one primary threads connection/u);
    // Resolved before the first render: no pack, no draft, no frame.
    await expect(readdir(stateRoot)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readdir(path.join(root, "site"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("the Queue's DNESKAi handshake fixture (quorum#583)", () => {
  // `contracts/fixtures/caught-up-queue-threads.valid.json` is the Threads draft this composes, and
  // the site's Queue tests approve that file. So the Queue is proved against the draft the pack
  // really writes. After a deliberate change to the pack, rewrite it with UPDATE_CAUGHT_UP_FIXTURES=1.
  it("composes exactly the Threads draft the fixture holds", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "boardless-social-pack-fixture-"));
    roots.push(root);
    const result = await composeEditionSocialPack({
      editionPackage: czechOnlyEdition(),
      meeting: caughtUpMeetingFixture,
      destinations: { cs: "https://caught-up.example/articles/2026-08-04-measured-model-price-cut" },
      repoRoot: root,
      stateRoot: path.join(root, "state"),
      now: new Date("2026-08-04T04:00:00.000Z"),
      hostFrames: false
    });
    const threads = JSON.parse(JSON.stringify(result!.queueItems.find(({ channel }) => channel === "threads"))) as unknown;
    const fixture = path.join(repoRoot, "contracts/fixtures/caught-up-queue-threads.valid.json");
    if (process.env.UPDATE_CAUGHT_UP_FIXTURES === "1") await writeFile(fixture, `${JSON.stringify(threads, null, 2)}\n`);
    expect(threads).toEqual(JSON.parse(await readFile(fixture, "utf8")));
  }, RENDER_TIMEOUT_MS);
});
