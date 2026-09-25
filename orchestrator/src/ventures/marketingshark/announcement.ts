import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { PostWriterOutput } from "./package.js";

/**
 * The premium launch announcement: one post the owner writes by hand and approves from the Queue
 * on launch day (quorum#576, second handoff B9).
 *
 * The owner saves the copy at `announcementCopyPath(date, brand)`, dated the day it should post.
 * That morning the room drafts it instead of the rotation's kind, whatever the weekday, at $0: no
 * model is called. It runs the same gates as every other post — the caps, the clip check, the
 * captions' rules, the reward-for-engagement rule — and a number that is not in the fact sheet in
 * effect is refused, so the price and the date can only ship once the owner's fact sheet says them.
 * The copy is the owner's alone; this repository carries its shape and a placeholder fixture, never
 * its words.
 */

export const ANNOUNCEMENT_DIRECTORY = "ventures/marketingshark/announcements";

/** Every placeholder in the fixture carries this, and a copy that still does is refused. */
export const OWNER_COPY_PLACEHOLDER = "OWNER COPY";

/** Where the owner's copy for a date goes, relative to the state root. */
export function announcementCopyPath(date: string, brandId: string): string {
  return `${ANNOUNCEMENT_DIRECTORY}/${date}-${brandId}.json`;
}

export const AnnouncementCopySchema = z.strictObject({
  schemaVersion: z.literal("marketingshark-announcement/1"),
  date: z.iso.date(),
  brandId: z.literal("devshark"),
  author: z.literal("owner"),
  ...PostWriterOutput.shape
});
export type AnnouncementCopy = z.infer<typeof AnnouncementCopySchema>;

export type AnnouncementRead =
  | { status: "none" }
  | { status: "ready"; copy: AnnouncementCopy; copyRef: string }
  | { status: "invalid"; copyRef: string; reason: string };

/**
 * The owner's copy for a date, if there is one. A file that is there but does not parse, or is
 * dated for another day or brand, is reported rather than skipped: the owner meant to announce, and
 * drafting the rotation's post in its place would hide that the announcement did not happen.
 */
export async function readAnnouncementCopy(stateRoot: string, date: string, brandId: string): Promise<AnnouncementRead> {
  const relative = announcementCopyPath(date, brandId);
  const copyRef = `state/${relative}`;
  let raw: string;
  try {
    raw = await readFile(path.join(stateRoot, relative), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { status: "none" };
    return { status: "invalid", copyRef, reason: `the file could not be read: ${(error as Error).message}` };
  }
  let parsed: ReturnType<typeof AnnouncementCopySchema.safeParse>;
  try {
    parsed = AnnouncementCopySchema.safeParse(JSON.parse(raw));
  } catch {
    return { status: "invalid", copyRef, reason: "the file is not JSON" };
  }
  if (!parsed.success) {
    return { status: "invalid", copyRef, reason: `the file is not a marketingshark-announcement/1 copy: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`).slice(0, 3).join("; ")}` };
  }
  if (parsed.data.date !== date || parsed.data.brandId !== brandId) {
    return { status: "invalid", copyRef, reason: `the copy is dated ${parsed.data.date} for ${parsed.data.brandId}, not ${date} for ${brandId}` };
  }
  return { status: "ready", copy: parsed.data, copyRef };
}
