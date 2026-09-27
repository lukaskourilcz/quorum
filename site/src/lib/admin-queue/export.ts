import "server-only";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { readAdminJson, readAdminSocialImage } from "@/lib/admin-repository";
import { readQueueFrame } from "./frames";
import { queueRepositoryRoot, readQueueEntries } from "./state";
import type { QueueItem } from "./item";

/**
 * One queue item as a file the owner can post by hand (quorum#592), until the guarded Meta
 * publisher (#587) is connected.
 *
 * The export reads what the Queue already shows and writes nothing: no event, no status, no
 * receipt. A post the owner sends from a phone is invisible to the Queue, so the manifest says
 * so rather than letting a download read as a publication.
 *
 * Frames come through `readQueueFrame`, the same resolver as the card's strip, so the export is
 * the bytes the owner reviewed. The extras (a first reply, a story card, a Threads question) come
 * from the item's own approved package and are optional: a package that lacks one, or does not
 * parse, costs that file and never the export.
 */
export interface QueueExport {
  fileName: string;
  bytes: Uint8Array<ArrayBuffer>;
}

const ARTIFACT_REF = /^state\/[a-zA-Z0-9/._-]+\.json$/u;
const STORY_FRAME = /^\/social\/[a-zA-Z0-9/_-]+\.png$/u;
const encoder = new TextEncoder();

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown, max = 5_000): string | null {
  return typeof value === "string" && value.trim() && value.length <= max ? value : null;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sourcePackage(root: string, item: QueueItem): Promise<Record<string, unknown> | null> {
  if (item.schemaVersion !== 2 || !item.sourcePackage) return null;
  const reference = item.sourcePackage.artifactRef;
  if (!ARTIFACT_REF.test(reference) || reference.split("/").includes("..")) return null;
  try {
    return record(await readAdminJson(root, reference));
  } catch {
    return null;
  }
}

/** The optional files a package contributes, by its schema. */
async function packageExtras(root: string, pkg: Record<string, unknown> | null): Promise<Record<string, Uint8Array>> {
  if (!pkg) return {};
  const extras: Record<string, Uint8Array> = {};
  const firstReply = text(record(pkg.firstReply)?.text);
  if (firstReply) extras["first-reply.txt"] = encoder.encode(`${firstReply}\n`);
  if (pkg.schemaVersion === "social-pack/1") {
    const story = record(pkg.story);
    const frame = text(story?.frame, 300);
    const link = text(story?.link, 2_000);
    const linkLine = text(story?.linkLine, 300);
    if (frame && STORY_FRAME.test(frame) && !frame.includes("..")) {
      try {
        extras["story.png"] = await readAdminSocialImage(root, `site/public${frame}`);
      } catch {
        // A story card that was never hosted is simply not in the export.
      }
    }
    if (link?.startsWith("https://")) extras["story-link.txt"] = encoder.encode(`${link}\n${linkLine ?? ""}\n`);
    const question = text(record(pkg.threadsQuestion)?.text);
    if (question) extras["threads-question.txt"] = encoder.encode(`${question}\n`);
  }
  if (pkg.schemaVersion === "dneskai-recipe/1") {
    const threads = text(record(pkg.threads)?.text);
    if (threads) extras["threads.txt"] = encoder.encode(`${threads}\n`);
    // The no-edition recipe's 9:16 story of the same card, for manual posting.
    const story = record(pkg.story);
    const frame = text(record(story?.frame)?.path, 300);
    const link = text(story?.link, 2_000);
    if (frame && STORY_FRAME.test(frame) && !frame.includes("..")) {
      try {
        extras["story.png"] = await readAdminSocialImage(root, `site/public${frame}`);
      } catch {
        // Not hosted, so not exported.
      }
    }
    if (link?.startsWith("https://")) extras["story-link.txt"] = encoder.encode(`${link}\n`);
  }
  return extras;
}

export async function buildQueueExport(itemId: string, root = queueRepositoryRoot()): Promise<QueueExport | null> {
  const { entries } = await readQueueEntries(root);
  const item = entries.find((entry) => entry.item.id === itemId)?.item;
  if (!item) return null;

  const files: Record<string, Uint8Array> = {};
  for (const [index] of item.content.assetPaths.entries()) {
    const frame = await readQueueFrame(item.id, index + 1, root);
    if (!frame) continue;
    const extension = frame.contentType === "image/png" ? "png" : "jpg";
    files[`frame-${String(index + 1).padStart(2, "0")}.${extension}`] = frame.bytes;
  }
  files["caption.txt"] = encoder.encode(`${item.content.text}\n`);
  if (item.content.altText) files["alt-text.txt"] = encoder.encode(`${item.content.altText}\n`);
  Object.assign(files, await packageExtras(root, await sourcePackage(root, item)));

  const venture = item.schemaVersion === 2 ? item.sourceVentureId : item.venture;
  const manifest = {
    schemaVersion: "queue-export/1",
    itemId: item.id,
    venture,
    platform: item.channel,
    locale: item.locale,
    status: item.status,
    publishWindow: item.publishWindow,
    contentHash: item.content.contentHash,
    framesExpected: item.content.assetPaths.length,
    note: "For manual posting. Exporting records nothing: the Queue does not learn that this post was sent.",
    files: Object.entries(files).map(([name, bytes]) => ({ name, bytes: bytes.byteLength, sha256: sha256(bytes) }))
  };
  files["manifest.json"] = encoder.encode(`${JSON.stringify(manifest, null, 2)}\n`);

  // Store mode with a fixed mtime, as the Design Lab's deck export: the same item exports to the
  // same bytes, and the frames are already compressed.
  const zip = zipSync(files, { level: 0, mtime: new Date("2026-01-01T00:00:00.000Z") });
  return { fileName: `${item.id}.zip`, bytes: new Uint8Array(zip) };
}
