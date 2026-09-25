import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  SOCIAL_ASSET_BASES,
  SocialAssetHoldSchema,
  type SocialAssetBase,
  type SocialAssetCheck,
  type SocialAssetHold,
  type SocialAssetHoldReason
} from "../../contracts/social-assets.js";
import { sha256 } from "../../hashing.js";
import { safeFetch } from "../../security/url.js";
import type { CapabilityAwareQueueItem } from "../queue.js";
import { checkHostedSocialImage, checkPlatformImage, hostedImageType, isImagePlatform, platformAcceptsExtension } from "./validate.js";
import type { RecordedAssetHashes } from "./recorded-hashes.js";

const execFileAsync = promisify(execFile);

/**
 * The public repository jsDelivr serves committed frames from.
 *
 * Pinned rather than read from the environment: a runner in a fork would otherwise point Meta at
 * the fork. A commit that is not in this repository answers 404 and the item is held.
 */
export const SOCIAL_ASSET_REPOSITORY = "lukaskourilcz/quorum";
export const JSDELIVR_HOST = "cdn.jsdelivr.net";
/** Where a `/social/...` asset path lives in the repository. */
export const SOCIAL_ASSET_ROOT = "site/public";

/**
 * `SOCIAL_ASSET_BASE`, with jsDelivr as the default when it is unset or empty.
 *
 * An unknown value is returned as an error rather than mapped to a default: a typo in a variable
 * that decides where Meta fetches from must hold the item, not quietly pick a host.
 */
export function resolveSocialAssetBase(environment: NodeJS.ProcessEnv): { base: SocialAssetBase } | { base: null; error: string } {
  const value = environment.SOCIAL_ASSET_BASE?.trim() ?? "";
  if (value === "") return { base: "jsdelivr" };
  return (SOCIAL_ASSET_BASES as readonly string[]).includes(value)
    ? { base: value as SocialAssetBase }
    : { base: null, error: `SOCIAL_ASSET_BASE=${value.slice(0, 40)} is not one of ${SOCIAL_ASSET_BASES.join(", ")}` };
}

/**
 * The hosts a frame check may ask: `runtimeHosts` in `config/network-allowlist.json`.
 *
 * An unreadable allowlist is an empty one, so every jsDelivr check answers `host-not-allowlisted`
 * and the item is held; it never widens to "any host".
 */
export async function loadSocialAssetAllowHosts(configRoot: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")) as { runtimeHosts?: unknown };
    return Array.isArray(parsed.runtimeHosts) ? parsed.runtimeHosts.filter((host): host is string => typeof host === "string") : [];
  } catch {
    return [];
  }
}

/** The repository path of a `/social/...` asset. */
export function socialAssetRepositoryPath(assetPath: string): string {
  return `${SOCIAL_ASSET_ROOT}${assetPath}`;
}

/** `https://cdn.jsdelivr.net/gh/lukaskourilcz/quorum@<sha>/site/public/social/<rest>`: immutable once the commit is pushed. */
export function jsDelivrAssetUrl(commit: string, assetPath: string): string {
  if (!/^[a-f0-9]{40}$/u.test(commit)) throw new Error("A jsDelivr asset URL needs a full commit hash");
  return `https://${JSDELIVR_HOST}/gh/${SOCIAL_ASSET_REPOSITORY}@${commit}/${socialAssetRepositoryPath(assetPath)}`;
}

/**
 * The commit that carries each frame, read from the checkout the publisher runs in.
 *
 * The social publisher checks out with full history after the cycle has committed and pushed, so
 * `git log -1 -- <path>` names a commit jsDelivr can serve. The bytes are read back from that same
 * commit, not from the working tree, because the commit is what jsDelivr will serve.
 */
export interface SocialAssetCommits {
  /** The newest commit that touched the path, or null when no commit carries it. */
  latestCommit(repositoryPath: string): Promise<string | null>;
  /** The path's bytes in that commit, or null when the commit does not hold the file (it deleted it). */
  committedBytes(commit: string, repositoryPath: string): Promise<Buffer | null>;
}

export function gitSocialAssetCommits(repoRoot: string): SocialAssetCommits {
  return {
    async latestCommit(repositoryPath) {
      try {
        const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%H", "--", repositoryPath], { cwd: repoRoot, encoding: "utf8" });
        const commit = stdout.trim();
        return /^[a-f0-9]{40}$/u.test(commit) ? commit : null;
      } catch {
        return null;
      }
    },
    async committedBytes(commit, repositoryPath) {
      try {
        const { stdout } = await execFileAsync("git", ["cat-file", "blob", `${commit}:${repositoryPath}`], {
          cwd: repoRoot,
          encoding: "buffer",
          maxBuffer: 16 * 1_024 * 1_024
        });
        return stdout;
      } catch {
        return null;
      }
    }
  };
}

/** A frame the platform may fetch: the exact URL that answered, and the bytes it was proved to be. */
export interface VerifiedSocialAsset {
  path: string;
  url: string;
  sha256: string;
  contentType: "image/png" | "image/jpeg";
  commit: string | null;
  /**
   * The reviewed alt text of this one frame, from the same verified package as its hash; null when
   * no record pairs the frame with a slide. The item's own `altText` describes the whole carousel.
   */
  altText: string | null;
}

export type SocialAssetVerification =
  | { status: "ready"; base: SocialAssetBase | null; assets: VerifiedSocialAsset[] }
  | { status: "held"; hold: SocialAssetHold };

export interface SocialAssetCheckOptions {
  environment: NodeJS.ProcessEnv;
  recorded: RecordedAssetHashes;
  commits: SocialAssetCommits;
  /** `runtimeHosts` from `config/network-allowlist.json`. */
  allowHosts: readonly string[];
  now: Date;
  fetchImpl?: typeof fetch;
  resolveImpl?: (hostname: string) => Promise<string[]>;
}

type Checked = SocialAssetCheck & { verified?: VerifiedSocialAsset };
type Channel = CapabilityAwareQueueItem["channel"];

function check(assetPath: string, fields: Partial<SocialAssetCheck> & Pick<SocialAssetCheck, "outcome">): Checked {
  return { path: assetPath, url: null, commit: null, recordedSha256: null, detail: null, ...fields };
}

/** The proved bytes against the channel's own image rules; null when they pass or the channel has none. */
async function platformRefusal(assetPath: string, bytes: Uint8Array, channel: Channel, fields: Partial<SocialAssetCheck>): Promise<Checked | null> {
  if (!isImagePlatform(channel)) return null;
  const answer = await checkPlatformImage(bytes, channel);
  return answer.ok ? null : check(assetPath, { ...fields, outcome: "platform-unsupported", detail: answer.detail });
}

async function checkJsDelivr(assetPath: string, recorded: string, channel: Channel, options: SocialAssetCheckOptions): Promise<Checked> {
  const repositoryPath = socialAssetRepositoryPath(assetPath);
  const commit = await options.commits.latestCommit(repositoryPath);
  if (!commit) return check(assetPath, { recordedSha256: recorded, outcome: "uncommitted", detail: `no commit carries ${repositoryPath}` });
  const url = jsDelivrAssetUrl(commit, assetPath);
  const bytes = await options.commits.committedBytes(commit, repositoryPath);
  if (!bytes) return check(assetPath, { url, commit, recordedSha256: recorded, outcome: "not-at-commit", detail: "the newest commit touching the frame removed it" });
  const actual = sha256(bytes);
  if (actual !== recorded) {
    return check(assetPath, { url, commit, recordedSha256: recorded, outcome: "hash-mismatch", detail: `committed bytes hash to ${actual}` });
  }
  const refused = await platformRefusal(assetPath, bytes, channel, { url, commit, recordedSha256: recorded });
  if (refused) return refused;
  const answer = await checkHostedSocialImage(url, {
    assetPath,
    allowHosts: options.allowHosts,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.resolveImpl ? { resolveImpl: options.resolveImpl } : {})
  });
  if (!answer.ok) return check(assetPath, { url, commit, recordedSha256: recorded, outcome: answer.outcome, detail: answer.detail });
  return {
    ...check(assetPath, { url, commit, recordedSha256: recorded, outcome: "ready" }),
    verified: { path: assetPath, url, sha256: actual, contentType: answer.contentType, commit, altText: options.recorded.altTexts.get(assetPath) ?? null }
  };
}

/**
 * The site base: `PUBLIC_SITE_URL` plus the path, as the adapter always built it.
 *
 * Nothing in git proves what a deployed site serves, so this base downloads the frame and hashes
 * what came back. Its host is the one the owner configured, which is the allowlist for this base.
 */
async function checkSite(assetPath: string, recorded: string, channel: Channel, options: SocialAssetCheckOptions): Promise<Checked> {
  const site = options.environment.PUBLIC_SITE_URL?.trim() ?? "";
  if (!site.startsWith("https://")) {
    return check(assetPath, { recordedSha256: recorded, outcome: "unreachable", detail: "PUBLIC_SITE_URL is not an HTTPS URL" });
  }
  let url: string;
  try {
    url = new URL(assetPath, site).toString();
  } catch {
    return check(assetPath, { recordedSha256: recorded, outcome: "unreachable", detail: "PUBLIC_SITE_URL is not a URL" });
  }
  const expected = hostedImageType(assetPath);
  try {
    const response = await safeFetch(url, {
      allowHosts: [new URL(url).hostname],
      headers: { Accept: expected },
      maxBytes: 8_000_000,
      maxRedirects: 0,
      timeoutMs: 15_000,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.resolveImpl ? { resolveImpl: options.resolveImpl } : {})
    });
    if (response.status !== 200) return check(assetPath, { url, recordedSha256: recorded, outcome: "unreachable", detail: `answered HTTP ${response.status}, not 200` });
    if (response.contentType !== expected) {
      return check(assetPath, { url, recordedSha256: recorded, outcome: "wrong-type", detail: `answered ${response.contentType || "no content type"}, not ${expected}` });
    }
    const actual = sha256(response.body);
    if (actual !== recorded) return check(assetPath, { url, recordedSha256: recorded, outcome: "hash-mismatch", detail: `served bytes hash to ${actual}` });
    const refused = await platformRefusal(assetPath, response.body, channel, { url, recordedSha256: recorded });
    if (refused) return refused;
    return {
      ...check(assetPath, { url, recordedSha256: recorded, outcome: "ready" }),
      verified: { path: assetPath, url, sha256: actual, contentType: expected, commit: null, altText: options.recorded.altTexts.get(assetPath) ?? null }
    };
  } catch (error) {
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 300) || "no detail";
    return check(assetPath, { url, recordedSha256: recorded, outcome: /Unexpected content type/u.test(detail) ? "wrong-type" : "unreachable", detail });
  }
}

function holdReason(checks: readonly SocialAssetCheck[]): SocialAssetHoldReason {
  if (checks.some((entry) => entry.outcome === "hash-mismatch")) return "asset-hash-mismatch";
  if (checks.some((entry) => entry.outcome === "hash-unrecorded")) return "asset-hash-unrecorded";
  if (checks.some((entry) => entry.outcome === "platform-unsupported")) return "asset-unsupported";
  return "asset-unreachable";
}

/**
 * Prove every frame an item names before a platform is asked to fetch it.
 *
 * In order, for each frame: its format must be one the platform takes; its hash must be recorded;
 * for jsDelivr, a commit must carry it and the bytes in that commit must hash to the record and meet
 * the platform's image rules, and only then is the commit-pinned URL asked with a `HEAD` for a 200
 * and the right image type. Local proofs come first so a frame that could never pass costs no request. Any miss holds the whole item: a carousel with one frame missing is not
 * the carousel that was approved, and no other URL is ever tried in its place.
 */
export async function verifySocialAssets(
  item: Pick<CapabilityAwareQueueItem, "id" | "sourceVentureId" | "channel" | "content">,
  options: SocialAssetCheckOptions
): Promise<SocialAssetVerification> {
  const selected = resolveSocialAssetBase(options.environment);
  const checks: Checked[] = [];
  for (const assetPath of item.content.assetPaths) {
    const recorded = options.recorded.hashes.get(assetPath) ?? null;
    if (!/\.(?:png|jpe?g)$/iu.test(assetPath)) {
      checks.push(check(assetPath, { recordedSha256: recorded, outcome: "wrong-type", detail: "only PNG and JPEG frames are hosted for Instagram and Threads" }));
    } else if (isImagePlatform(item.channel) && !platformAcceptsExtension(item.channel, assetPath)) {
      checks.push(check(assetPath, { recordedSha256: recorded, outcome: "platform-unsupported", detail: "Instagram takes JPEG only; the JPEG copy is the frame to send" }));
    } else if (selected.base === null) {
      checks.push(check(assetPath, { recordedSha256: recorded, outcome: "base-invalid", detail: selected.error }));
    } else if (selected.base === "blob") {
      checks.push(check(assetPath, { recordedSha256: recorded, outcome: "base-unbuilt", detail: "the Vercel Blob base is documented and not built" }));
    } else if (options.recorded.sourcePackage === "mismatch") {
      checks.push(check(assetPath, { outcome: "hash-mismatch", detail: "the source package no longer hashes to the item's packageHash" }));
    } else if (recorded === null) {
      checks.push(check(assetPath, { outcome: "hash-unrecorded", detail: options.recorded.sourcePackage === "unreadable" ? "the source package could not be read" : "no record names this frame's hash" }));
    } else {
      checks.push(selected.base === "jsdelivr"
        ? await checkJsDelivr(assetPath, recorded, item.channel, options)
        : await checkSite(assetPath, recorded, item.channel, options));
    }
    // One failed frame already holds the item; asking the network about the rest would only spend requests.
    if (checks.at(-1)!.outcome !== "ready") break;
  }
  if (checks.length === item.content.assetPaths.length && checks.every((entry) => entry.outcome === "ready")) {
    return { status: "ready", base: selected.base, assets: checks.map((entry) => entry.verified!) };
  }
  const hold = SocialAssetHoldSchema.parse({
    schemaVersion: "social-asset-hold/1",
    queueItemId: item.id,
    sourceVentureId: item.sourceVentureId,
    channel: item.channel,
    base: selected.base,
    reason: holdReason(checks),
    assets: checks.map(({ verified: _verified, ...entry }) => entry),
    checkedAt: options.now.toISOString(),
    publishingAuthorized: false
  });
  return { status: "held", hold };
}
