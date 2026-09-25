import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, sha256 } from "../src/hashing.js";
import { configRoot, repoRoot } from "../src/paths.js";
import {
  JSDELIVR_HOST,
  gitSocialAssetCommits,
  jsDelivrAssetUrl,
  loadSocialAssetAllowHosts,
  resolveSocialAssetBase,
  verifySocialAssets,
  type SocialAssetCheckOptions,
  type SocialAssetCommits
} from "../src/social/media/assets.js";
import { readRecordedAssetHashes, type RecordedAssetHashes } from "../src/social/media/recorded-hashes.js";
import { gateSocialAssets } from "../src/social/media/gate.js";
import { checkPlatformImage } from "../src/social/media/validate.js";
import { createMetaPublishAdapter } from "../src/social/meta.js";
import type { Channel } from "../src/social/channel-registry.js";
import type { ResolvedPublisherTarget } from "../src/social/publisher-targets.js";
import { CapabilityAwareQueueItemSchema, capabilityAwareQueuePayloadHash, type CapabilityAwareQueueItem } from "../src/social/queue.js";
import { safeFetch } from "../src/security/url.js";
import recorded from "./fixtures/social-assets/jsdelivr-head.json" with { type: "json" };

const execFileAsync = promisify(execFile);
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function tempRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

const COMMIT = "81dced6d1d06ab4c82b4b87f5ee66867cc52215a";
const FRAME = "/social/devshark/2026-09-26/en/slide-01.png";
/** A real 1080 x 1350 PNG: since #572 the proved bytes must also be an image the platform takes. */
const FRAME_BYTES = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#0b2233" } }).png().toBuffer();
const JPEG_FRAME = "/social/devshark/2026-09-26/en/slide-01.jpg";
const publicDns = async () => ["104.16.85.20"];

type RecordedAnswer = { status: number; headers: Record<string, string> };

/** A fetch that answers every request with one recorded jsDelivr answer, and remembers what it was asked. */
function recordedFetch(answer: RecordedAnswer) {
  return vi.fn<typeof fetch>(async () => new Response(null, { status: answer.status, headers: answer.headers }));
}

function fakeCommits(files: Record<string, { commit: string; bytes: Buffer | null }>): SocialAssetCommits {
  return {
    latestCommit: async (repositoryPath) => files[repositoryPath]?.commit ?? null,
    committedBytes: async (commit, repositoryPath) => {
      const file = files[repositoryPath];
      return file && file.commit === commit ? file.bytes : null;
    }
  };
}

function hashesFor(entries: Record<string, string>, sourcePackage: RecordedAssetHashes["sourcePackage"] = "verified"): RecordedAssetHashes {
  return { hashes: new Map(Object.entries(entries)), altTexts: new Map(), sourcePackage, dropped: 0 };
}

/** A Threads item: Threads takes the PNG frames these tests commit, and Instagram would refuse them. */
function item(assetPaths: string[] = [FRAME]): Pick<CapabilityAwareQueueItem, "id" | "sourceVentureId" | "channel" | "content"> {
  return {
    id: "ms-2026-09-26-devshark-en-threads",
    sourceVentureId: "marketingshark",
    channel: "threads",
    content: {
      text: "One question a day.",
      altText: "Slide one of five.",
      assetPaths,
      factualClaimRefs: ["marketingshark:question:q1"],
      rendererVersion: "carousel-studio-1",
      contentHash: "0".repeat(64)
    }
  };
}

function options(overrides: Partial<SocialAssetCheckOptions> = {}): SocialAssetCheckOptions {
  return {
    environment: {},
    recorded: hashesFor({ [FRAME]: sha256(FRAME_BYTES) }),
    commits: fakeCommits({ [`site/public${FRAME}`]: { commit: COMMIT, bytes: FRAME_BYTES } }),
    allowHosts: [JSDELIVR_HOST],
    now: new Date("2026-09-26T07:00:00.000Z"),
    fetchImpl: recordedFetch(recorded.answers.committed),
    resolveImpl: publicDns,
    ...overrides
  };
}

describe("SOCIAL_ASSET_BASE", () => {
  it("defaults to jsDelivr, accepts the three bases and names anything else as an error", () => {
    expect(resolveSocialAssetBase({})).toEqual({ base: "jsdelivr" });
    expect(resolveSocialAssetBase({ SOCIAL_ASSET_BASE: " " })).toEqual({ base: "jsdelivr" });
    expect(resolveSocialAssetBase({ SOCIAL_ASSET_BASE: "site" })).toEqual({ base: "site" });
    expect(resolveSocialAssetBase({ SOCIAL_ASSET_BASE: "blob" })).toEqual({ base: "blob" });
    expect(resolveSocialAssetBase({ SOCIAL_ASSET_BASE: "s3" })).toMatchObject({ base: null });
  });

  it("allowlists jsDelivr for the pre-send check and needs no secret for it", async () => {
    expect(await loadSocialAssetAllowHosts(configRoot)).toContain(JSDELIVR_HOST);
    const environment = await readFile(path.join(repoRoot, ".env.example"), "utf8");
    expect(environment).toMatch(/^SOCIAL_ASSET_BASE=$/mu);
    expect(environment).not.toMatch(/^BLOB_READ_WRITE_TOKEN=/mu);
  });
});

describe("commit-pinned jsDelivr URLs", () => {
  it("resolves a committed frame to the URL of the commit that carries it, and HEADs exactly that", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const result = await verifySocialAssets(item(), options({ fetchImpl }));

    const url = `https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@${COMMIT}/site/public/social/devshark/2026-09-26/en/slide-01.png`;
    expect(jsDelivrAssetUrl(COMMIT, FRAME)).toBe(url);
    expect(result).toEqual({
      status: "ready",
      base: "jsdelivr",
      assets: [{ path: FRAME, url, sha256: sha256(FRAME_BYTES), contentType: "image/png", commit: COMMIT, altText: null }]
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(url);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "HEAD", redirect: "manual" });
  });

  it("holds an uncommitted frame without asking the network", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const result = await verifySocialAssets(item(), options({ fetchImpl, commits: fakeCommits({}) }));

    expect(result).toMatchObject({ status: "held", hold: { reason: "asset-unreachable", base: "jsdelivr", publishingAuthorized: false } });
    expect(result.status === "held" && result.hold.assets[0]).toMatchObject({ outcome: "uncommitted", url: null, commit: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holds a frame jsDelivr does not serve and never tries another URL", async () => {
    const fetchImpl = recordedFetch(recorded.answers["missing-path"]);
    const result = await verifySocialAssets(item([FRAME, "/social/devshark/2026-09-26/en/slide-02.png"]), options({
      fetchImpl,
      recorded: hashesFor({ [FRAME]: sha256(FRAME_BYTES), "/social/devshark/2026-09-26/en/slide-02.png": sha256(FRAME_BYTES) })
    }));

    expect(result).toMatchObject({ status: "held", hold: { reason: "asset-unreachable" } });
    expect(result.status === "held" && result.hold.assets).toEqual([expect.objectContaining({ outcome: "unreachable", commit: COMMIT })]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("holds a frame answered with the wrong content type", async () => {
    const html = await verifySocialAssets(item(), options({ fetchImpl: recordedFetch({ status: 200, headers: { "content-type": "text/html" } }) }));
    const jpegForPng = await verifySocialAssets(item(), options({ fetchImpl: recordedFetch({ status: 200, headers: { "content-type": "image/jpeg" } }) }));

    for (const result of [html, jpegForPng]) {
      expect(result.status === "held" && result.hold.assets[0]?.outcome).toBe("wrong-type");
    }
  });

  it("refuses a redirect instead of following it", async () => {
    const fetchImpl = recordedFetch({ status: 302, headers: { location: "https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@main/x.png" } });
    const result = await verifySocialAssets(item(), options({ fetchImpl }));

    expect(result).toMatchObject({ status: "held", hold: { reason: "asset-unreachable" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never asks a host that is not on the runtime allowlist", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const result = await verifySocialAssets(item(), options({ fetchImpl, allowHosts: [] }));

    expect(result.status === "held" && result.hold.assets[0]?.outcome).toBe("host-not-allowlisted");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holds bytes that differ from the recorded hash before any request", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const changed = await verifySocialAssets(item(), options({
      fetchImpl,
      commits: fakeCommits({ [`site/public${FRAME}`]: { commit: COMMIT, bytes: Buffer.from("a different slide") } })
    }));
    const stalePackage = await verifySocialAssets(item(), options({ fetchImpl, recorded: hashesFor({}, "mismatch") }));
    const unrecorded = await verifySocialAssets(item(), options({ fetchImpl, recorded: hashesFor({}, "none") }));

    expect(changed).toMatchObject({ status: "held", hold: { reason: "asset-hash-mismatch" } });
    expect(stalePackage).toMatchObject({ status: "held", hold: { reason: "asset-hash-mismatch" } });
    expect(unrecorded).toMatchObject({ status: "held", hold: { reason: "asset-hash-unrecorded" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("holds a frame the newest commit deleted, and one that is not an image", async () => {
    const deleted = await verifySocialAssets(item(), options({ commits: fakeCommits({ [`site/public${FRAME}`]: { commit: COMMIT, bytes: null } }) }));
    const webp = await verifySocialAssets(item(["/social/devshark/2026-09-26/en/slide-01.webp"]), options());

    expect(deleted.status === "held" && deleted.hold.assets[0]?.outcome).toBe("not-at-commit");
    expect(webp.status === "held" && webp.hold.assets[0]?.outcome).toBe("wrong-type");
  });

  it("holds every item with an image under the blob base, which is documented and not built", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const blob = await verifySocialAssets(item(), options({ fetchImpl, environment: { SOCIAL_ASSET_BASE: "blob" } }));
    const typo = await verifySocialAssets(item(), options({ fetchImpl, environment: { SOCIAL_ASSET_BASE: "jsdeliver" } }));

    expect(blob).toMatchObject({ status: "held", hold: { base: "blob", reason: "asset-unreachable", assets: [{ outcome: "base-unbuilt" }] } });
    expect(typo).toMatchObject({ status: "held", hold: { base: null, reason: "asset-unreachable", assets: [{ outcome: "base-invalid" }] } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("each platform's own image rules (quorum#572)", () => {
  const jpeg = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#f4efe6" } }).jpeg({ quality: 90 }).toBuffer();
  const png = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: "#f4efe6" } }).png().toBuffer();

  it("holds a PNG for Instagram before reading git or the network", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const latestCommit = vi.fn(async () => COMMIT);
    const result = await verifySocialAssets({ ...item(), channel: "instagram" }, options({ fetchImpl, commits: { latestCommit, committedBytes: async () => FRAME_BYTES } }));

    expect(result).toMatchObject({ status: "held", hold: { reason: "asset-unsupported", assets: [{ outcome: "platform-unsupported", detail: expect.stringContaining("JPEG only") }] } });
    expect(latestCommit).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("proves an Instagram JPEG and holds committed bytes the platform would refuse, before any request", async () => {
    const good = await jpeg(1080, 1350);
    const wide = await png(1600, 1000);
    const instagram = { ...item([JPEG_FRAME]), channel: "instagram" as const };
    const jpegAnswer = recordedFetch({ status: 200, headers: { ...recorded.answers.committed.headers, "content-type": "image/jpeg" } });
    const ready = await verifySocialAssets(instagram, options({
      fetchImpl: jpegAnswer,
      recorded: hashesFor({ [JPEG_FRAME]: sha256(good) }),
      commits: fakeCommits({ [`site/public${JPEG_FRAME}`]: { commit: COMMIT, bytes: good } })
    }));
    const quiet = recordedFetch(recorded.answers.committed);
    const tooWide = await verifySocialAssets(item(), options({
      fetchImpl: quiet,
      recorded: hashesFor({ [FRAME]: sha256(wide) }),
      commits: fakeCommits({ [`site/public${FRAME}`]: { commit: COMMIT, bytes: wide } })
    }));

    expect(ready).toMatchObject({ status: "ready", assets: [{ path: JPEG_FRAME, contentType: "image/jpeg" }] });
    expect(tooWide).toMatchObject({ status: "held", hold: { reason: "asset-unsupported", assets: [{ outcome: "platform-unsupported", detail: expect.stringContaining("width 1600") }] } });
    expect(quiet).not.toHaveBeenCalled();
  });

  it("applies Meta's published limits to the bytes themselves", async () => {
    const cmyk = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#336699" } }).toColourspace("cmyk").jpeg().toBuffer();
    const cases: Array<[string, Buffer, "instagram" | "threads", boolean]> = [
      ["Instagram 4:5 JPEG", await jpeg(1080, 1350), "instagram", true],
      ["Instagram 1.91:1 JPEG (1080 x 566)", await jpeg(1080, 566), "instagram", true],
      ["Instagram 1:1 JPEG", await jpeg(1080, 1080), "instagram", true],
      ["Instagram 9:16 JPEG, taller than 4:5", await jpeg(1080, 1920), "instagram", false],
      ["Instagram 3:1 JPEG, wider than 1.91:1", await jpeg(1350, 450), "instagram", false],
      ["Instagram PNG", await png(1080, 1350), "instagram", false],
      ["Instagram CMYK JPEG", cmyk, "instagram", false],
      ["Instagram narrower than 320", await jpeg(300, 375), "instagram", false],
      ["Threads 4:5 PNG", await png(1080, 1350), "threads", true],
      ["Threads 9:16 JPEG", await jpeg(1080, 1920), "threads", true],
      ["Threads wider than 1440", await png(1600, 1000), "threads", false],
      ["Threads over 8 MB", Buffer.alloc(8_000_001), "threads", false],
      ["not an image", Buffer.from("devShark slide one, as committed"), "threads", false]
    ];
    for (const [label, bytes, channel, accepted] of cases) {
      expect((await checkPlatformImage(bytes, channel)).ok, label).toBe(accepted);
    }
  });

  it("carries each frame's own reviewed alt text from the verified package", async () => {
    const root = await tempRoot("social-assets-alt-");
    const packagePath = "state/ventures/marketingshark/packages/2026-09-26/devshark/package.json";
    const built = {
      carousels: { en: { slides: [{ alt: "Slide 1 of 5: the question." }, { alt: "Slide 2 of 5: the options." }] } },
      render: { frames: [1, 2].map((slide) => ({
        locale: "en",
        slide,
        png: { path: `/social/devshark/2026-09-26/en/slide-0${slide}.png`, sha256: sha256(FRAME_BYTES) },
        jpeg: { path: `/social/devshark/2026-09-26/en/slide-0${slide}.jpg`, sha256: "c".repeat(64) }
      })) }
    };
    await mkdir(path.join(root, path.dirname(packagePath)), { recursive: true });
    await writeFile(path.join(root, packagePath), JSON.stringify(built));
    const reference = { schemaVersion: "approved-publish-package/1" as const, artifactRef: packagePath, packageHash: sha256(canonicalJson(built)) };

    const recordedHashes = await readRecordedAssetHashes({ item: { sourcePackage: reference, content: item().content }, repoRoot: root, stateRoot: path.join(root, "state") });
    expect(Object.fromEntries(recordedHashes.altTexts)).toEqual({
      "/social/devshark/2026-09-26/en/slide-01.png": "Slide 1 of 5: the question.",
      "/social/devshark/2026-09-26/en/slide-01.jpg": "Slide 1 of 5: the question.",
      "/social/devshark/2026-09-26/en/slide-02.png": "Slide 2 of 5: the options.",
      "/social/devshark/2026-09-26/en/slide-02.jpg": "Slide 2 of 5: the options."
    });
    const result = await verifySocialAssets(item(), options({ recorded: recordedHashes }));
    expect(result).toMatchObject({ status: "ready", assets: [{ path: FRAME, altText: "Slide 1 of 5: the question." }] });
  });
});

describe("the asset gate", () => {
  it("costs one item and never the run when a check throws", async () => {
    const stateRoot = await tempRoot("social-assets-gate-");
    const unholdable = CapabilityAwareQueueItemSchema.shape.content.safeParse({
      ...item().content,
      assetPaths: [`/social/${"a".repeat(440)}.png`]
    });
    expect(unholdable.success).toBe(true);
    const entry = { name: "item.json", item: { ...item(), content: unholdable.data! } as unknown as CapabilityAwareQueueItem };
    const plain = { name: "text.json", item: { ...item(), content: { ...item().content, assetPaths: [] } } as unknown as CapabilityAwareQueueItem };

    const result = await gateSocialAssets({ entries: [entry, plain], environment: {}, repoRoot: stateRoot, stateRoot, configRoot, now: new Date("2026-09-26T07:00:00.000Z") });

    expect(result).toMatchObject({ ready: [plain], held: 1 });
    await expect(readFile(path.join(stateRoot, "social/asset-holds/item.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("the site base keeps PUBLIC_SITE_URL and proves the served bytes", () => {
  it("downloads the frame from the configured site and compares its hash", async () => {
    const served = vi.fn<typeof fetch>(async () => new Response(FRAME_BYTES, { status: 200, headers: { "content-type": "image/png" } }));
    const environment = { SOCIAL_ASSET_BASE: "site", PUBLIC_SITE_URL: "https://boardless.example" };
    const ready = await verifySocialAssets(item(), options({ environment, fetchImpl: served }));
    const wrong = await verifySocialAssets(item(), options({ environment, fetchImpl: served, recorded: hashesFor({ [FRAME]: "f".repeat(64) }) }));
    const unset = await verifySocialAssets(item(), options({ environment: { SOCIAL_ASSET_BASE: "site" }, fetchImpl: served }));

    expect(ready).toMatchObject({ status: "ready", base: "site", assets: [{ url: `https://boardless.example${FRAME}`, commit: null }] });
    expect(wrong).toMatchObject({ status: "held", hold: { reason: "asset-hash-mismatch" } });
    expect(unset).toMatchObject({ status: "held", hold: { reason: "asset-unreachable" } });
    expect(served).toHaveBeenCalledTimes(2);
  });
});

describe("the git reader behind the resolver", () => {
  async function git(root: string, ...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("git", ["-c", "user.name=fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd: root });
    return stdout.trim();
  }

  it("names the commit that carries a frame and reads the bytes that commit holds", async () => {
    const root = await tempRoot("social-assets-git-");
    await git(root, "init", "--quiet");
    const relative = `site/public${FRAME}`;
    await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
    await writeFile(path.join(root, relative), FRAME_BYTES);
    await git(root, "add", "--", relative);
    await git(root, "commit", "--quiet", "-m", "frame");
    const committed = await git(root, "rev-parse", "HEAD");
    // A later working-tree edit is not what jsDelivr serves; the reader must ignore it.
    await writeFile(path.join(root, relative), Buffer.from("edited after the commit"));
    await writeFile(path.join(root, "site/public/social/devshark/2026-09-26/en/slide-02.png"), FRAME_BYTES);

    const commits = gitSocialAssetCommits(root);
    expect(await commits.latestCommit(relative)).toBe(committed);
    expect(await commits.committedBytes(committed, relative)).toEqual(FRAME_BYTES);
    expect(await commits.latestCommit("site/public/social/devshark/2026-09-26/en/slide-02.png")).toBeNull();

    await git(root, "rm", "--quiet", "--force", "--", relative);
    await git(root, "commit", "--quiet", "-m", "prune");
    const pruned = await git(root, "rev-parse", "HEAD");
    expect(await commits.latestCommit(relative)).toBe(pruned);
    expect(await commits.committedBytes(pruned, relative)).toBeNull();
  });
});

describe("recorded frame hashes", () => {
  const packagePath = "state/marketingshark/packages/2026-09-26-devshark.json";
  const builtPackage = {
    id: "marketingshark-2026-09-26-devshark",
    render: { frames: [{ slide: 1, png: { path: FRAME, sha256: sha256(FRAME_BYTES), bytes: FRAME_BYTES.byteLength } }] }
  };

  async function writePackage(root: string, value: unknown): Promise<void> {
    await mkdir(path.join(root, path.dirname(packagePath)), { recursive: true });
    await writeFile(path.join(root, packagePath), `${JSON.stringify(value, null, 2)}\n`);
  }

  it("reads a package's frames only while it still hashes to the item's packageHash", async () => {
    const root = await tempRoot("social-assets-recorded-");
    await writePackage(root, builtPackage);
    const reference = { schemaVersion: "approved-publish-package/1" as const, artifactRef: packagePath, packageHash: sha256(canonicalJson(builtPackage)) };
    const content = { ...item().content };

    const verified = await readRecordedAssetHashes({ item: { sourcePackage: reference, content }, repoRoot: root, stateRoot: path.join(root, "state") });
    expect(verified).toMatchObject({ sourcePackage: "verified", dropped: 0 });
    expect(verified.hashes.get(FRAME)).toBe(sha256(FRAME_BYTES));

    await writePackage(root, { ...builtPackage, id: "edited" });
    const edited = await readRecordedAssetHashes({ item: { sourcePackage: reference, content }, repoRoot: root, stateRoot: path.join(root, "state") });
    expect(edited).toMatchObject({ sourcePackage: "mismatch" });
    expect(edited.hashes.size).toBe(0);

    const escaped = await readRecordedAssetHashes({ item: { sourcePackage: { ...reference, artifactRef: "state/../../etc/passwd.json" }, content }, repoRoot: root, stateRoot: path.join(root, "state") });
    expect(escaped).toMatchObject({ sourcePackage: "unreadable", dropped: 1 });
  });

  it("reads DNESKAi's composer record for a dated frame", async () => {
    const root = await tempRoot("social-assets-record-");
    const frame = "/social/2026-08-27/cs/instagram/frame-01.png";
    await mkdir(path.join(root, "state/social/assets"), { recursive: true });
    await writeFile(path.join(root, "state/social/assets/2026-08-27.json"), JSON.stringify({ schemaVersion: 1, frameHashes: { [frame]: sha256(FRAME_BYTES) } }));

    const result = await readRecordedAssetHashes({ item: { sourcePackage: null, content: { ...item().content, assetPaths: [frame] } }, repoRoot: root, stateRoot: path.join(root, "state") });
    expect(result).toMatchObject({ sourcePackage: "none", dropped: 0 });
    expect(result.hashes.get(frame)).toBe(sha256(FRAME_BYTES));
  });
});

describe("the Meta adapter fetches only verified URLs", () => {
  const instagram: Channel = {
    id: "instagram",
    specialist: "INSTAGRAM",
    mode: "autopublish",
    connector: "meta_instagram",
    credentialRef: "unused",
    approvedScopes: ["instagram_basic", "instagram_content_publish"],
    nativeFormats: ["image"],
    maxOrganicPostsPerDay: 1,
    minHoursBetweenPosts: 12,
    timezone: "Europe/Prague",
    enabledByHumanAt: "2026-09-26T06:00:00.000Z"
  };
  const target = {
    connection: { platform: "instagram", approvedScopes: ["instagram_basic", "instagram_content_publish"] },
    credentialRef: "FIXTURE_TOKEN",
    nativeAccountIdRef: "FIXTURE_USER",
    providerId: "direct-meta",
    apiVersion: "v26.0"
  } as unknown as ResolvedPublisherTarget;

  function queued(): CapabilityAwareQueueItem {
    const base = {
      schemaVersion: 2 as const,
      id: "ms-2026-09-26-devshark-en-instagram",
      sourceVentureId: "marketingshark",
      releaseId: "marketingshark-2026-09-26-devshark",
      campaignId: "marketingshark-2026-09-26-devshark",
      experimentId: null,
      target: {
        profileId: "social-profile-devshark-instagram",
        profileRole: "venture-primary" as const,
        role: "primary" as const,
        connectionBindingRef: "social-connection-devshark-instagram",
        capabilityRef: null,
        amplifierEligibilityRef: null,
        campaignApprovalRef: null
      },
      action: "publish-original" as const,
      sourcePackage: { schemaVersion: "approved-publish-package/1" as const, artifactRef: "state/marketingshark/packages/2026-09-26-devshark.json", packageHash: "a".repeat(64) },
      locale: "en" as const,
      variant: "A" as const,
      channel: "instagram" as const,
      objective: "value_action" as const,
      audience: "Working developers",
      destination: "https://devshark.example",
      utm: { source: "instagram" as const, medium: "organic_social" as const, campaign: "marketingshark-devshark", content: "2026-09-26-en-q1" },
      content: { ...item().content },
      publishWindow: { notBefore: "2026-09-26T06:00:00.000Z", notAfter: "2026-09-26T21:00:00.000Z" },
      status: "queued" as const,
      checks: Object.fromEntries(["schema", "brand", "claims", "quill", "keeper", "duplicate", "accessibility", "budget", "capability", "authority", "policy"].map((name) => [name, "pass"])) as CapabilityAwareQueueItem["checks"],
      approvalProvenance: { approvalRef: "fixture:owner-approval", selectionRef: "state/meetings/2026-09-26-ms-daily.json", policyRef: null },
      selectedBy: "MAKO" as const,
      createdAt: "2026-09-26T05:00:00.000Z",
      attempt: null,
      receiptId: null,
      migration: null
    };
    return CapabilityAwareQueueItemSchema.parse({ ...base, content: { ...base.content, contentHash: capabilityAwareQueuePayloadHash(base) } });
  }

  it("hands Meta the commit-pinned URL and nothing else", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: "meta-1" }), { status: 200, headers: { "content-type": "application/json" } }));
    const adapter = createMetaPublishAdapter({ META_GRAPH_API_VERSION: "v26.0", FIXTURE_TOKEN: "token", FIXTURE_USER: "user" }, fetchImpl);
    const url = jsDelivrAssetUrl(COMMIT, FRAME);

    await adapter.publish(instagram, queued(), "1".repeat(64), target, [{ path: FRAME, url, sha256: sha256(FRAME_BYTES), contentType: "image/png", commit: COMMIT, altText: null }]);
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get("image_url")).toBe(url);
  });

  it("stops before any request when a frame has no verified URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = createMetaPublishAdapter({ META_GRAPH_API_VERSION: "v26.0", FIXTURE_TOKEN: "token", FIXTURE_USER: "user", PUBLIC_SITE_URL: "https://boardless.example" }, fetchImpl);

    await expect(adapter.publish(instagram, queued(), "1".repeat(64), target)).rejects.toThrow(/verified before the send/u);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("safeFetch HEAD", () => {
  it("reads headers only, refuses a body and refuses a redirect", async () => {
    const fetchImpl = recordedFetch(recorded.answers.committed);
    const answer = await safeFetch(recorded.answers.committed.url, {
      allowHosts: [JSDELIVR_HOST],
      method: "HEAD",
      fetchImpl,
      resolveImpl: publicDns,
      responseHeaderNames: ["content-length"]
    });
    expect(answer).toMatchObject({ status: 200, contentType: "image/png", headers: { "content-length": "234216" } });
    expect(answer.body.byteLength).toBe(0);
    await expect(safeFetch(recorded.answers.committed.url, { allowHosts: [JSDELIVR_HOST], method: "HEAD", body: "x", fetchImpl, resolveImpl: publicDns }))
      .rejects.toThrow(/cannot include a body/u);
    await expect(safeFetch(recorded.answers.committed.url, {
      allowHosts: [JSDELIVR_HOST],
      method: "HEAD",
      fetchImpl: recordedFetch({ status: 301, headers: { location: "https://cdn.jsdelivr.net/elsewhere.png" } }),
      resolveImpl: publicDns
    })).rejects.toThrow(/Redirects are forbidden/u);
  });
});
