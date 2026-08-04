import { createHash } from "node:crypto";
import { z } from "zod";
import { atomicWriteJson, readJson } from "../state.js";

/**
 * The one place the incubator evidence packet is written and read.
 *
 * `refreshIncubatorEvidence` in ../portfolio/evidence.ts writes this file and returns the path
 * it used. That module is the only other place the string exists, and the two used to be
 * independent literals: if either moved, the sweep would keep writing while the trigger below
 * kept reading an absent file, so the room would be shut forever while its record said the
 * sweep had returned nothing. `assertSweptToPacketPath` closes that by checking the sweep's own
 * report against this constant on every run, and incubator-room.test.ts fails if the literal in
 * evidence.ts stops matching.
 */
export const INCUBATOR_EVIDENCE_PATH = "ventures/incubator/evidence.json";

/** Which packet items a room has actually been shown. Written only after seats have spoken. */
export const INCUBATOR_READ_ITEMS_PATH = "ventures/incubator/read-items.json";

/**
 * How many item keys the read log remembers, most recently seen last.
 *
 * A packet holds at most `INCUBATOR_PACKET_CHARS` worth of items — around a dozen — so 400 keys
 * is roughly a month of scans. Beyond that the oldest are dropped, and an item that left the
 * packet that long ago and comes back reads as new again. That is the one flap this design
 * accepts, and it is bounded: it costs one extra room, not a daily one.
 */
export const INCUBATOR_READ_ITEMS_LIMIT = 400;

/**
 * Characters of packet the incubator rooms are shown, and how much of each item's summary.
 *
 * Measured, not guessed. `estimateTextCall` over the real prompts, personas and seat models
 * prices one incubator-scan room (5 seats) at $0.0334 with an empty context and $0.0591 with a
 * full 18,000-character one — against a $0.06 envelope that run.ts refuses to exceed, so a full
 * packet left $0.0009 of headroom and any prompt edit would have turned the room into a thrown
 * "call graph exceeds envelope" instead of research. The same measurement puts the 6-seat
 * incubator-synthesis room at $0.0705 on a full context: over its own $0.06 envelope, so that
 * room could not have opened at all. At the 8,000-character ceiling below the two rooms price
 * at $0.0448 and $0.0534, both inside the envelope with room for a prompt to grow.
 */
export const INCUBATOR_CONTEXT_CHARS = 8_000;
export const INCUBATOR_PACKET_CHARS = 5_000;
export const INCUBATOR_ITEM_SUMMARY_CHARS = 200;

const PacketItemSchema = z.object({
  sourceId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  publishedAt: z.string().nullable().optional(),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional()
});

export type IncubatorPacketItem = z.infer<typeof PacketItemSchema>;

const ReadItemsSchema = z.object({
  schemaVersion: z.literal("incubator-read-items/1"),
  updatedAt: z.string(),
  lastReadBy: z.string().nullable(),
  keys: z.array(z.string().regex(/^[0-9a-f]{32}$/))
});

export type IncubatorReadItems = z.infer<typeof ReadItemsSchema>;

/**
 * The identity of one packet item, independent of everything the pipeline decides by race.
 *
 * Three things upstream move on their own between two runs of the same day's news, and a
 * fingerprint that reads any of them reports a changed day and opens a paid room for nothing:
 *
 * - `runScrapersDetailed` dedupes by raw URL and keeps whichever of six concurrent workers
 *   arrived first, so a URL two sources carry gets a `sourceId` that depends on the race. The
 *   key therefore never reads `sourceId`.
 * - `createDigest` sorts by publishedAt then weight, and ties fall back to insertion order —
 *   which is that same race — while undated items are ordered by `fetchedAt`, a timestamp that
 *   is new on every run. The key is per item and the comparison below is set-based, so neither
 *   order nor position is read.
 * - `createDigest` then slices to 40, so which items are in the packet can move even when the
 *   underlying set has not. The read log remembers keys rather than a packet-wide hash, so an
 *   item that drops out and returns is still an item this room has read.
 *
 * What is left is the URL and the title, canonicalised: the fragment and the tracking
 * parameters a link picks up in transit are dropped, and the title is compared case- and
 * space-insensitively. A publisher that changes any other query parameter, or retitles a story
 * in substance, is read as a new item — which is the honest reading of "new to the room".
 */
export function packetItemKey(item: { url: string; title: string }): string {
  let canonical = item.url.trim();
  try {
    const parsed = new URL(item.url);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ref") parsed.searchParams.delete(key);
    }
    canonical = parsed.toString();
  } catch {
    // A packet item whose url will not parse is still an item; compare it as the raw string.
  }
  return createHash("sha256")
    .update(`${canonical}\n${item.title.toLowerCase().replace(/\s+/gu, " ").trim()}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Fail loudly when the sweep stops writing where the trigger reads.
 *
 * The alternative is silence: a room that never opens again while every record says the sweep
 * found nothing new. `refreshIncubatorEvidence` reports the paths it wrote, so the disagreement
 * is observable on every live run rather than only in review.
 */
export function assertSweptToPacketPath(artifactPaths: readonly string[]): void {
  if (!artifactPaths.includes(INCUBATOR_EVIDENCE_PATH)) {
    throw new Error(
      `The incubator sweep wrote ${artifactPaths.join(", ") || "nothing"}, not ${INCUBATOR_EVIDENCE_PATH}; the scan trigger reads that path and would never see a change again`
    );
  }
}

/** Parse the packet the sweep wrote. A packet that will not parse is an empty one, not a crash. */
export async function readIncubatorPacketItems(root: string): Promise<IncubatorPacketItem[]> {
  const evidence = await readJson<{ packet?: unknown }>(root, INCUBATOR_EVIDENCE_PATH, {});
  if (typeof evidence.packet !== "string" || evidence.packet.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(evidence.packet);
  } catch {
    return [];
  }
  const items = z.array(PacketItemSchema).safeParse(parsed);
  return items.success ? items.data : [];
}

export interface BoundedIncubatorPacket {
  /** The text the room is shown, listing whole items only. */
  text: string;
  /** The items in that text — the only ones a room can be said to have read. */
  items: IncubatorPacketItem[];
  /** Citation allowlist narrowed to the sources whose items are actually in the text. */
  evidenceRefs: string[];
  /** How many the sweep offered, so the room can see its own window. */
  offered: number;
}

/**
 * Cut the packet by whole items rather than by characters.
 *
 * The composed context is capped at `INCUBATOR_CONTEXT_CHARS` the way every other room's is,
 * and a source summary may be 2,000 characters, so a packet of forty items can run several
 * times past that ceiling. Slicing the serialised JSON at the ceiling hands the room a string
 * that ends mid-token: not a short packet, an unparseable one. Items are dropped from the end
 * instead — the end `createDigest` sorts last, which is the oldest dated items and then the
 * undated ones.
 */
export function boundIncubatorPacket(
  items: readonly IncubatorPacketItem[],
  budgetChars = INCUBATOR_PACKET_CHARS
): BoundedIncubatorPacket {
  const kept: IncubatorPacketItem[] = [];
  let used = 0;
  for (const item of items) {
    const clipped: IncubatorPacketItem = {
      sourceId: item.sourceId,
      title: item.title,
      url: item.url,
      publishedAt: item.publishedAt ?? null,
      summary: (item.summary ?? "").slice(0, INCUBATOR_ITEM_SUMMARY_CHARS),
      tags: item.tags ?? []
    };
    const cost = JSON.stringify(clipped).length + 1;
    if (used + cost > budgetChars) break;
    used += cost;
    kept.push(clipped);
  }
  const header = `Source sweep: ${items.length} item${items.length === 1 ? "" : "s"} kept by the digest, ${kept.length} shown here. Items past the room's context budget are not in this packet and no seat has read them.`;
  return {
    text: `${header}\n${JSON.stringify(kept)}`,
    items: kept,
    evidenceRefs: [...new Set(kept.map((item) => `source:${item.sourceId}`))],
    offered: items.length
  };
}

export interface IncubatorScanTriggerPreview {
  event: "incubator_scan_trigger_preview";
  packetPath: string;
  itemsInPacket: number;
  itemsShownToRoom: number;
  itemsNoSeatHasRead: number;
  wouldOpenOnThisPacket: boolean;
  note: string;
}

/**
 * What a scheduled scan would decide against the packet that is on disk right now.
 *
 * A dry run sweeps nothing and writes nothing, so before this it could say nothing at all about
 * the only question worth asking of this room — whether the next scheduled wake-up opens it.
 * The answer is computed by the same two functions the live trigger calls, so it cannot drift
 * from the decision it describes; what it cannot know is the sweep, which runs first on a
 * scheduled morning and can add items this preview has not seen.
 */
export async function incubatorScanTriggerPreview(root: string): Promise<IncubatorScanTriggerPreview> {
  const shown = boundIncubatorPacket(await readIncubatorPacketItems(root));
  const unread = unreadPacketItems(shown.items, (await readIncubatorReadItems(root)).keys);
  return {
    event: "incubator_scan_trigger_preview",
    packetPath: INCUBATOR_EVIDENCE_PATH,
    itemsInPacket: shown.offered,
    itemsShownToRoom: shown.items.length,
    itemsNoSeatHasRead: unread.length,
    wouldOpenOnThisPacket: unread.length > 0,
    note: "Read-only preview of the live state root. A scheduled run sweeps first and decides on what that sweep returns."
  };
}

export async function readIncubatorReadItems(root: string): Promise<IncubatorReadItems> {
  const raw = await readJson<unknown>(root, INCUBATOR_READ_ITEMS_PATH, null);
  const parsed = ReadItemsSchema.safeParse(raw);
  return parsed.success
    ? parsed.data
    : { schemaVersion: "incubator-read-items/1", updatedAt: "", lastReadBy: null, keys: [] };
}

/** The shown items no seat has read yet. Set difference, so packet order never enters it. */
export function unreadPacketItems(
  items: readonly IncubatorPacketItem[],
  readKeys: readonly string[]
): IncubatorPacketItem[] {
  const seen = new Set(readKeys);
  return items.filter((item) => !seen.has(packetItemKey(item)));
}

/**
 * Record what a room read, after it read it.
 *
 * Called from the artifact write that follows the seats, never from the sweep. The sweep
 * replaces the packet before the palate pre-step, and a cap refusing that pre-step returns
 * from the room with the new packet already on disk; anything written at sweep time would
 * therefore claim a room had read a packet no seat was ever shown, and the next scan would
 * compare against it and stay shut.
 */
export async function recordIncubatorPacketRead(input: {
  root: string;
  items: readonly IncubatorPacketItem[];
  cycleId: string;
  now: Date;
}): Promise<string> {
  const current = await readIncubatorReadItems(input.root);
  const fresh = input.items.map((item) => packetItemKey(item));
  const merged = [...current.keys.filter((key) => !fresh.includes(key)), ...fresh];
  await atomicWriteJson(input.root, INCUBATOR_READ_ITEMS_PATH, ReadItemsSchema.parse({
    schemaVersion: "incubator-read-items/1",
    updatedAt: input.now.toISOString(),
    lastReadBy: input.cycleId,
    keys: merged.slice(-INCUBATOR_READ_ITEMS_LIMIT)
  }));
  return INCUBATOR_READ_ITEMS_PATH;
}
