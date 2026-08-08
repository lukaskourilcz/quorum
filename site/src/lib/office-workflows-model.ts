import type { CalendarStatus } from "@/lib/calendar-feed-model";
import type { OfficeProjectKey } from "@/lib/office-walkthrough";

/**
 * What the floor plan is made of, and the pure logic that reads it.
 *
 * This sits apart from the resolver deliberately. The resolver is `server-only` — it reads the
 * repository and holds the sanitising boundary — while the section that draws the plan is a client
 * component, and the two need the same types, the same day, and the same answers to "which room
 * does this hour light" and "what hangs on this door". Importing the resolver from the client to
 * get them would drag the whole file-reading module into the browser bundle, which is exactly what
 * `server-only` exists to refuse.
 *
 * So everything here is pure: no imports with a runtime cost, no filesystem, no clock. That is
 * also what makes it the testable part.
 */

/**
 * Where the working day starts and ends. Both ends are inclusive.
 *
 * These bounded the replay rail until D1 removed it. What still reads them is the guard asserting
 * that every slot the registry holds falls inside the day the plan is drawn against — a slot at
 * 03:00 would have had nowhere to be on the rail, and now would have nowhere to be in the
 * performance either.
 */
export const REPLAY_FIRST_HOUR = 5;
export const REPLAY_LAST_HOUR = 22;

/** The room that is never dark, because its machinery is always available. */
export const WORKSHOP_ROOM: OfficeProjectKey = "carousel-studio";

/**
 * What hangs on a room's door once its session has closed.
 *
 * Every session writes a record, so every closed room hangs a note; the two marks share one
 * silhouette because both are the same kind of made thing, and differ by fill. `missed` hangs no
 * tag at all — an empty clip — because nothing was recorded to hang.
 */
export type WorkflowsNoteKind = "sent" | "quiet" | "missed" | "waiting" | "none";

export interface WorkflowsSlot {
  kind: string;
  hour: number;
  /** `publicKindLabel`, so the slot is named the same here as on the calendar and the results table. */
  label: string;
  room: OfficeProjectKey;
  color: string;
  status: CalendarStatus;
  note: WorkflowsNoteKind;
  /** The sentence the feed recorded, already run through `readableSlotReason`. */
  reason: string | null;
  /**
   * Whether this room actually sits today.
   *
   * This is what keeps GoVIRAL dark on six days in seven without a second calendar: its 13:00
   * slot is on the registry every day and is gated shut on every day but Monday, and a gated
   * slot is recorded as skipped or not-needed rather than as a room that failed to open.
   */
  sits: boolean;
}

/** One role standing in a room, as the roster already publishes it. */
export interface WorkflowsRole {
  id: string;
  title: string;
  department: string;
}

/**
 * The most recent thing a room produced.
 *
 * For the two magazine rooms this is the article itself, with enough to draw the card a link
 * preview would draw. `url` and `image` are only ever set from what the delivery receipt and the
 * package actually record — an article nobody wrote down the address of gets a title and a date
 * and no link, because a link this file invented would be a link to nowhere.
 */
export interface WorkflowsOutput {
  /** What it is: `article` draws a link preview, `decision` draws a line of prose. */
  kind: "article" | "decision";
  title: string;
  date: string;
  url: string | null;
  /** The published thumbnail, derived from the recorded address. `null` when there is none. */
  image: string | null;
}

export interface WorkflowsRoom {
  key: OfficeProjectKey;
  name: string;
  color: string;
  /** In hour order. Empty for the workshop, which holds no session. */
  slots: WorkflowsSlot[];
  /** What the room is for. Site copy, the way the project cards' sentences are. */
  purpose: string;
  /** What it opens onto, in the plan's own terms — doors, exits, the lines in the spine. */
  connects: string;
  /** How it runs, including what it deliberately does not do. */
  operates: string;
  /** The active roles assigned to it, from `ventures` in the agent registry. */
  roles: WorkflowsRole[];
  /** The most recent thing this room produced, or `null` when nothing is on record. */
  latest: WorkflowsOutput | null;
}

/**
 * How many hooks each surface's library holds.
 *
 * `null` is the datum for a library that is not written: that surface takes the logged `no-hook`
 * fallback and the template's own headline renders, which is an ordinary outcome and not a
 * failure. A library that exists and is empty would read `0`, which means something different.
 */
export interface WorkflowsHookRack {
  quiz: number | null;
  quizTierB: number | null;
  news: number | null;
  mma: number | null;
}

/** The gate figures the DNESKAi panel prints, all from `config/edition-quality.json`. */
export interface WorkflowsGates {
  minimumSuccessfulSources: number;
  minimumCandidateItems: number;
  maximumCurationCandidates: number;
  minimumScore: number;
  maximumRegenerationAttempts: number;
  targetWords: number;
}

/**
 * The courier's receipt for the newest delivered edition.
 *
 * The hash is truncated in the resolver, on the server, to the 12 hex characters the delivery
 * commit subject already publishes. The full 64-character hash never crosses.
 */
export interface WorkflowsReceipt {
  status: string;
  /** `[package:<first 12 hex>]`, the exact form the delivery commit subject uses. */
  packageRef: string;
  deliveredOn: string;
}

/**
 * One real published edition, threading the DNESKAi, workshop and courier panels.
 *
 * Resolved whole or not at all. A half-resolved example would put a real date beside an invented
 * headline, and the chip's unavailable state says the true thing instead.
 */
export interface WorkflowsExample {
  date: string;
  kicker: string;
  headline: string;
  standfirst: string;
  /** The article's own order, kept — an argument reordered is an argument changed. */
  firstPassage: string;
  passageCount: number;
  sourceCount: number;
  heroCredit: string | null;
  articleUrl: string;
  tags: string[];
}

/** The question bank marketingShark imported once. Provenance stays upstream; this is the count. */
export interface WorkflowsBank {
  questions: number;
  importedOn: string;
}

export interface OfficeWorkflows {
  /** The Prague calendar date this was resolved for. */
  today: string;
  /** Plan order: the top rank west to east, then the bottom rank west to east. */
  rooms: WorkflowsRoom[];
  /** All thirteen slots, in hour order. */
  slots: WorkflowsSlot[];
  hooks: WorkflowsHookRack;
  gates: WorkflowsGates;
  receipt: WorkflowsReceipt | null;
  example: WorkflowsExample | null;
  bank: WorkflowsBank | null;
  editionCap: number;
  monthlyLimit: number;
  apiLimit: number;
}

/**
 * What note a slot's door hangs, from its recorded status.
 *
 * A quiet close is a success and reads as one: a room that met and decided nothing was needed
 * hangs the same silhouette as a room that sent something, filled differently. Only a slot whose
 * hour passed with no record at all hangs nothing, and it carries the reason instead.
 *
 * `scheduled` and `ongoing` hang nothing because nothing has closed — an empty clip before the
 * hour, or while the run is still working, would be a lie about the day.
 */
export function doorNoteKind(status: CalendarStatus, delivered: boolean): WorkflowsNoteKind {
  if (status === "held") return delivered ? "sent" : "quiet";
  if (status === "not-needed" || status === "skipped") return "quiet";
  if (status === "missed") return "missed";
  if (status === "late") return "waiting";
  return "none";
}

/**
 * Which room the current hour lights, if any.
 *
 * A gated slot lights nothing, which is what keeps GoVIRAL's room dark at 13:00 on the six days
 * it does not sit without a second calendar anywhere. The workshop is never returned here: it is
 * not lit by an hour, it is lit always, and the plan draws that as a floor that is never dark.
 */
export function litRoomForHour(
  hour: number,
  slots: readonly WorkflowsSlot[]
): OfficeProjectKey | null {
  const slot = slots.find((entry) => entry.hour === hour && entry.sits && entry.room !== WORKSHOP_ROOM);
  return slot?.room ?? null;
}
