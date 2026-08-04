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
 * Measured, not guessed: `estimateTextCall` over the real prompts, personas and seat models,
 * with the JSON-shape suffix taken from run.ts itself rather than approximated.
 *
 *                          empty context   8,000 chars   18,000 chars   envelope
 *   incubator-scan  (5)       $0.0327        $0.0441        $0.0584      $0.06
 *   incubator-synth (6)       $0.0388        $0.0525        $0.0696      $0.06
 *
 * The 18,000-character column is why this ceiling exists. It left the scan $0.0016 under an
 * envelope run.ts refuses to exceed, so any prompt edit would have turned the room into a thrown
 * "call graph exceeds envelope" instead of research — and it put the synthesis room $0.0096
 * over its own envelope, so that room could not have opened at all. At 8,000 both sit inside
 * the envelope with room for a prompt to grow.
 */
export const INCUBATOR_CONTEXT_CHARS = 8_000;
export const INCUBATOR_PACKET_CHARS = 5_000;
export const INCUBATOR_ITEM_SUMMARY_CHARS = 200;

/**
 * The other two blocks of the synthesis context, budgeted so their sum cannot reach the ceiling.
 *
 * The packet block is not `INCUBATOR_PACKET_CHARS` exactly: `boundIncubatorPacket` fills 5,000
 * characters of JSON and then puts its counted header in front, so the block is at most about
 * 5,152 — the 5,001-character array the fill rule actually admits, a newline, and a header whose
 * only variable parts are two counts. With 1,200 and 1,600 behind it and the two newlines that
 * join the three, the worst case is roughly 7,954, under `INCUBATOR_CONTEXT_CHARS` by about 46.
 * Sweeping item counts and summary lengths for the shape that maximises the composition puts the
 * observed worst at 7,778.
 *
 * The margin is deliberately small and the arithmetic above is easy to invalidate, so
 * `composePortfolioContext` throws rather than trims if a future budget breaks it. What must not
 * come back is the cut these budgets replaced: the three blocks were joined and then sliced to
 * 8,000, so the last one ended wherever the ceiling fell. Measured on the 1 August scan record
 * behind a full packet, the synthesis room received 72.7% of that record, ending inside a string
 * literal, and the block it was handed did not parse — and a real HELD record, several times
 * that fixture's size, fares worse.
 */
export const INCUBATOR_TASTE_CHARS = 1_200;
export const INCUBATOR_SCAN_CHARS = 1_600;

/**
 * What one opening of this room actually costs, and what it costs the rest of the day.
 *
 * incubator-scan is the incubator's first meeting and the venture has `taste: true`, so
 * `registry.ts` gives it a `palate` pre-step — a Haiku call capped at `PALATE_PASS_BUDGET_USD`
 * ($0.02) that runs before any seat. So one opening is the pre-step plus the room:
 *
 * - Room, measured with `estimateTextCall` over the real prompts, personas and seat models:
 *   $0.0327 with an empty context, $0.0441 with a full 8,000-character one.
 * - Palate pre-step: $0.00 today and up to $0.02 later. `runPalatePass` returns `no_ratings`
 *   before it reaches the distiller while the incubator rating ledger is empty, which is the
 *   current state; the first owner rating turns it on.
 * - So an opening costs $0.0441 today and up to $0.0641 once ratings exist, against the room's
 *   own $0.06 envelope. The envelope covers the room but not the pre-step, which is why the
 *   pre-step is capped separately rather than out of the same $0.06.
 *
 * Against the $1.00 daily pace from budget-2026-08e, a full opening is 4.4% of the day now and
 * 6.4% later. That is not the binding constraint: fourteen active phases reserve about $1.74
 * against that $1.00, so `exceedsDailyCap` in ../portfolio/run.ts refuses whichever rooms are
 * late enough in the day to find it spent. This room sits at 07:00, near the front of the queue,
 * so it is normally funded and its cost is felt by the rooms behind it rather than by itself.
 * The change trigger is what keeps that honest: on a morning with nothing unread the room does
 * not open, and the day keeps the whole $0.0441.
 */
export const INCUBATOR_OPENING_USD_TODAY = 0.0441;

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

const ScanRecordSchema = z.object({
  date: z.string().optional(),
  status: z.string().optional(),
  decision: z.object({ outcome: z.string().optional(), summary: z.string().optional() }).optional(),
  proposals: z.array(z.object({ agent: z.string(), summary: z.string() })).optional(),
  tasks: z.array(z.object({ owner: z.string(), summary: z.string() })).optional(),
  growthPlan: z.string().optional(),
  roomTranscript: z.object({
    turns: z.array(z.object({ agent: z.string(), text: z.string() })).optional()
  }).optional()
});

/**
 * What the synthesis room is told its own scan decided, as a whole object rather than a prefix.
 *
 * The morning's scan record was pasted in raw and the composed context was then cut to
 * `INCUBATOR_CONTEXT_CHARS` by characters, so this block — always the last of the three — ended
 * wherever the ceiling fell: inside a string literal, unparseable, with the tail of the record
 * missing and nothing saying so. Rebuilding it as a projection fixes the cause rather than the
 * symptom. Only the fields the synthesis room argues from are carried, each clipped on its own,
 * and transcript turns are dropped from the end — whole turns — until the serialised object fits
 * its budget. The result is always valid JSON, and `turnsOmitted` tells the room what it is not
 * seeing instead of leaving it to infer completeness from a truncated string.
 *
 * A record that is absent or will not parse yields a stated absence, not a crash and not silence.
 */
export function incubatorScanBrief(raw: string, budgetChars = INCUBATOR_SCAN_CHARS): string {
  if (raw.trim().length === 0) {
    return JSON.stringify({ scanRecord: "none on file for today; argue only from the packet above" });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return JSON.stringify({ scanRecord: "on file but unreadable; argue only from the packet above" });
  }
  const record = ScanRecordSchema.safeParse(parsed);
  if (!record.success) {
    return JSON.stringify({ scanRecord: "on file but not in the expected shape; argue only from the packet above" });
  }
  const value = record.data;
  const turns = (value.roomTranscript?.turns ?? []).map((turn) => ({
    agent: turn.agent,
    text: turn.text.slice(0, 240)
  }));
  const base = {
    scanRecord: value.date ?? "today",
    status: value.status ?? "unknown",
    outcome: value.decision?.outcome ?? "unknown",
    summary: (value.decision?.summary ?? "").slice(0, 280),
    proposals: (value.proposals ?? []).map((proposal) => ({
      agent: proposal.agent,
      summary: proposal.summary.slice(0, 240)
    })),
    tasks: (value.tasks ?? []).map((task) => ({ owner: task.owner, summary: task.summary.slice(0, 240) })),
    growthPlan: (value.growthPlan ?? "").slice(0, 280)
  };
  // Drop whole turns from the end until the object fits. The turn count is reported either way,
  // so a room that is shown six of nine turns is told it is shown six of nine.
  for (let kept = turns.length; kept >= 0; kept -= 1) {
    const projection = {
      ...base,
      turns: turns.slice(0, kept),
      turnsOmitted: turns.length - kept
    };
    const text = JSON.stringify(projection);
    if (text.length <= budgetChars || kept === 0) return text;
  }
  /* c8 ignore next -- the kept === 0 branch above always returns first. */
  return JSON.stringify({ scanRecord: "too large to summarise" });
}

export interface IncubatorScanTriggerPreview {
  event: "incubator_scan_trigger_preview";
  packetPath: string;
  /**
   * Whether a packet exists at all, which is not the same question as whether it holds items.
   *
   * Without this the preview reported the same all-zero body for "the last sweep returned
   * nothing" and "no sweep has ever run here", and those call for opposite readings: the first
   * says the room stays shut, the second says the room has never been reached. It is also what
   * made the dry-run assertion vacuous — every root, including ones that do not exist, agreed.
   */
  packetOnDisk: boolean;
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
  const raw = await readJson<{ packet?: unknown } | null>(root, INCUBATOR_EVIDENCE_PATH, null);
  const shown = boundIncubatorPacket(await readIncubatorPacketItems(root));
  const unread = unreadPacketItems(shown.items, (await readIncubatorReadItems(root)).keys);
  return {
    event: "incubator_scan_trigger_preview",
    packetPath: INCUBATOR_EVIDENCE_PATH,
    packetOnDisk: raw !== null,
    itemsInPacket: shown.offered,
    itemsShownToRoom: shown.items.length,
    itemsNoSeatHasRead: unread.length,
    wouldOpenOnThisPacket: unread.length > 0,
    note: raw === null
      ? "No sweep has ever written a packet to this root, so there is nothing here to decide against. A scheduled run sweeps first, and every item that sweep returns is unread."
      : "Read-only preview of the live state root. A scheduled run sweeps first and decides on what that sweep returns."
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
