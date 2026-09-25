import { readFile, readdir, rmdir, unlink } from "node:fs/promises";
import path from "node:path";
import { SocialAssetRetentionSchema, type SocialAssetRetention } from "../../contracts/social-assets.js";
import { sha256 } from "../../hashing.js";
import { atomicWriteJson } from "../../state.js";

/**
 * How long a committed frame stays in `site/public/social/`.
 *
 * Ninety days covers every publish window by a wide margin (the longest is three days) and the
 * weeks an owner may take to approve a draft. Removing a file from the tree does not break a URL
 * already handed to a platform: a jsDelivr URL is pinned to the commit that still holds it.
 */
export const SOCIAL_ASSET_RETENTION_DAYS = 90;

const SOCIAL_DIRECTORY = "site/public/social";
const SAFE_PATH = /^site\/public\/social\/[a-zA-Z0-9/._-]+$/u;
const DATE_SEGMENT = /^\d{4}-\d{2}-\d{2}$/u;
const MAX_NAMED_UNMANAGED = 200;

export function retentionRecordPath(date: string): string {
  return `social/asset-retention/${date}.json`;
}

/** `date` minus `days`, in whole calendar days. */
export function retentionKeepFrom(date: string, days: number): string {
  const start = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(start)) throw new Error(`Not a date: ${date}`);
  return new Date(start - days * 86_400_000).toISOString().slice(0, 10);
}

/** The first segment of the path that is a real calendar date, or null. */
function datedSegment(relative: string): string | null {
  for (const segment of relative.split("/")) {
    if (!DATE_SEGMENT.test(segment)) continue;
    const parsed = new Date(`${segment}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === segment) return segment;
  }
  return null;
}

interface Walked {
  files: string[];
  unmanaged: string[];
  directories: string[];
}

async function walk(repoRoot: string, relative: string, into: Walked): Promise<void> {
  const entries = await readdir(path.join(repoRoot, relative), { withFileTypes: true }).catch((error: NodeJS.ErrnoException) =>
    error.code === "ENOENT" ? [] : Promise.reject(error));
  for (const entry of entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      into.directories.push(child);
      await walk(repoRoot, child, into);
    } else if (entry.isFile() && SAFE_PATH.test(child)) {
      into.files.push(child);
    } else {
      into.unmanaged.push(child);
    }
  }
}

/** Remove directories the prune emptied, deepest first. The root itself always stays. */
async function removeEmptyDirectories(repoRoot: string, directories: readonly string[]): Promise<void> {
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    const remaining = await readdir(path.join(repoRoot, directory)).catch(() => null);
    if (remaining && remaining.length === 0) await rmdir(path.join(repoRoot, directory)).catch(() => undefined);
  }
}

/**
 * Prune committed social frames dated before the retention window, and record what went.
 *
 * Runs in the cycle's daily queue-health step, which commits both the deletions and the record.
 * Every removed file's hash is written first, so the record proves what the bytes were. A run that
 * removes nothing writes nothing; a second run on the same day adds to that day's record instead of
 * replacing it, because replacing it would erase the evidence of the first.
 */
export async function pruneSocialAssets(input: {
  repoRoot: string;
  stateRoot: string;
  today: string;
  retentionDays?: number;
}): Promise<{ record: SocialAssetRetention; artifacts: string[] }> {
  const retentionDays = input.retentionDays ?? SOCIAL_ASSET_RETENTION_DAYS;
  const keepFrom = retentionKeepFrom(input.today, retentionDays);
  const walked: Walked = { files: [], unmanaged: [], directories: [] };
  await walk(input.repoRoot, SOCIAL_DIRECTORY, walked);

  const removed: SocialAssetRetention["removed"] = [];
  let keptCount = 0;
  for (const relative of walked.files) {
    const dated = datedSegment(relative);
    if (dated === null) {
      walked.unmanaged.push(relative);
      continue;
    }
    if (dated >= keepFrom) {
      keptCount += 1;
      continue;
    }
    const absolute = path.join(input.repoRoot, relative);
    const bytes = await readFile(absolute);
    removed.push({ path: relative, dated, sha256: sha256(bytes), bytes: bytes.byteLength });
    await unlink(absolute);
  }
  if (removed.length > 0) await removeEmptyDirectories(input.repoRoot, walked.directories);

  const unmanaged = [...walked.unmanaged].sort();
  let record = SocialAssetRetentionSchema.parse({
    schemaVersion: "social-asset-retention/1",
    date: input.today,
    retentionDays,
    keepFrom,
    removed,
    keptCount,
    unmanagedPaths: unmanaged.slice(0, MAX_NAMED_UNMANAGED),
    unmanagedCount: unmanaged.length
  });
  if (removed.length === 0) return { record, artifacts: [] };

  const relativeRecord = retentionRecordPath(input.today);
  const earlier = SocialAssetRetentionSchema.safeParse(
    await readFile(path.join(input.stateRoot, relativeRecord), "utf8").then((raw) => JSON.parse(raw) as unknown).catch(() => null)
  );
  if (earlier.success && earlier.data.keepFrom === keepFrom) {
    const seen = new Set(record.removed.map((file) => file.path));
    record = SocialAssetRetentionSchema.parse({
      ...record,
      removed: [...earlier.data.removed.filter((file) => !seen.has(file.path)), ...record.removed]
    });
  }
  await atomicWriteJson(input.stateRoot, relativeRecord, record);
  return { record, artifacts: [relativeRecord] };
}
