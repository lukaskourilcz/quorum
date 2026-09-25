import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { Sha256Schema } from "../../contracts/common.js";
import { canonicalJson, sha256 } from "../../hashing.js";
import type { CapabilityAwareQueueItem } from "../queue.js";

/**
 * The hash each of an item's frames must have, as recorded when the frame was written.
 *
 * `sourcePackage` says what happened to the item's approved package:
 *  - `verified`: the package still hashes to the item's `packageHash`, so its frame records count;
 *  - `mismatch`: it does not, so nothing it says about its frames is trusted and every frame the
 *    item names is held as a hash mismatch;
 *  - `unreadable`: the reference is missing, outside `state/`, or not JSON;
 *  - `none`: the item carries no package reference (a migrated v1 item).
 *
 * A path recorded twice with two different hashes is a conflict and is dropped: a frame whose
 * expected bytes are ambiguous has no expected bytes.
 */
export interface RecordedAssetHashes {
  hashes: ReadonlyMap<string, string>;
  /**
   * Each frame's reviewed alt text, where a verified package pairs frames with slides. Read from the
   * same package, under the same hash check, as the frame hashes, so an approval binds both.
   */
  altTexts: ReadonlyMap<string, string>;
  sourcePackage: "verified" | "mismatch" | "unreadable" | "none";
  /** Records that failed to parse and were left out, so the hold can say why a hash is missing. */
  dropped: number;
}

const AssetRecordSchema = z.looseObject({
  frameHashes: z.record(z.string().regex(/^\/social\//u), Sha256Schema)
});

const DATED_ASSET = /^\/social\/(\d{4}-\d{2}-\d{2})\//u;

/**
 * A package that renders slides into frames: `render.frames[]` names each frame's locale and slide
 * number, and `carousels.<locale>.slides[]` holds each slide's alt text. marketingShark's packages
 * have this shape. Anything else simply pairs no frame with alt text.
 */
const SlideFramesSchema = z.looseObject({
  carousels: z.record(z.string(), z.looseObject({
    slides: z.array(z.looseObject({ alt: z.string().trim().min(1).max(1_000) }))
  })),
  render: z.looseObject({
    frames: z.array(z.looseObject({
      locale: z.string(),
      slide: z.number().int().min(1),
      png: z.looseObject({ path: z.string() }).optional(),
      jpeg: z.looseObject({ path: z.string() }).optional()
    }))
  })
});

function collectFrameAltTexts(value: unknown, into: Map<string, string>): void {
  const parsed = SlideFramesSchema.safeParse(value);
  if (!parsed.success) return;
  for (const frame of parsed.data.render.frames) {
    const alt = parsed.data.carousels[frame.locale]?.slides[frame.slide - 1]?.alt;
    if (!alt) continue;
    for (const file of [frame.png, frame.jpeg]) if (file?.path.startsWith("/social/")) into.set(file.path, alt);
  }
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

/** `{ path: "/social/...", sha256 }` anywhere in an approved package: how a package records a hosted file. */
function collectFrameRecords(value: unknown, into: Array<[string, string]>): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectFrameRecords(entry, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.path === "string" && record.path.startsWith("/social/")
    && typeof record.sha256 === "string" && Sha256Schema.safeParse(record.sha256).success) {
    into.push([record.path, record.sha256]);
  }
  for (const child of Object.values(record)) collectFrameRecords(child, into);
}

function repositoryFile(repoRoot: string, reference: string): string | null {
  if (!/^state\/[a-zA-Z0-9/._-]+\.json$/u.test(reference) || reference.split("/").includes("..")) return null;
  return path.join(repoRoot, reference);
}

/**
 * Read the recorded hashes for every frame an item names.
 *
 * Two places record them today. An approved package (marketingShark's, and any later one) records
 * each hosted file as `{ path, sha256 }`, and only counts while the package still hashes to the
 * `packageHash` the item was bound to. DNESKAi's composer records `frameHashes` in
 * `state/social/assets/<date>.json`. MMA Files and Titty Tuesdays record deck hashes without paths,
 * so their frames have no recorded hash and are held; both ventures are paused.
 */
export async function readRecordedAssetHashes(input: {
  item: Pick<CapabilityAwareQueueItem, "sourcePackage" | "content">;
  repoRoot: string;
  stateRoot: string;
}): Promise<RecordedAssetHashes> {
  const entries: Array<[string, string]> = [];
  const altTexts = new Map<string, string>();
  let dropped = 0;
  let sourcePackage: RecordedAssetHashes["sourcePackage"] = "none";

  const reference = input.item.sourcePackage;
  if (reference) {
    const file = repositoryFile(input.repoRoot, reference.artifactRef);
    const raw = file ? await readJson(file).catch(() => undefined) : undefined;
    if (raw === undefined) {
      sourcePackage = "unreadable";
      dropped += 1;
    } else if (sha256(canonicalJson(raw)) !== reference.packageHash) {
      sourcePackage = "mismatch";
    } else {
      sourcePackage = "verified";
      collectFrameRecords(raw, entries);
      collectFrameAltTexts(raw, altTexts);
    }
  }

  const dates = new Set(input.item.content.assetPaths.map((asset) => DATED_ASSET.exec(asset)?.[1]).filter((date): date is string => Boolean(date)));
  for (const date of dates) {
    const raw = await readJson(path.join(input.stateRoot, "social", "assets", `${date}.json`)).catch(() => undefined);
    if (raw === undefined) continue;
    const parsed = AssetRecordSchema.safeParse(raw);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    entries.push(...Object.entries(parsed.data.frameHashes));
  }

  const hashes = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const [assetPath, hash] of entries) {
    const existing = hashes.get(assetPath);
    if (existing !== undefined && existing !== hash) conflicts.add(assetPath);
    hashes.set(assetPath, hash);
  }
  for (const assetPath of conflicts) hashes.delete(assetPath);
  return { hashes, altTexts, sourcePackage, dropped: dropped + conflicts.size };
}
