import { createHash } from "node:crypto";
import { z } from "zod";
import {
  PriorityItemSchema,
  PriorityQueueSchema,
  type PriorityItem,
  type PriorityProposalProvenance,
  type PriorityQueue
} from "../contracts/autonomy.js";
import { ideaSimilarity } from "../ideas/ledger.js";
import { atomicWriteJson, readJson } from "../state.js";

export const PRIORITY_QUEUE_PATH = "priority-queue.json";

// The items cap in PriorityQueueSchema, restated so the prune below can reason about it.
// A test asserts the two stay equal.
export const PRIORITY_QUEUE_CAP = 200;

/**
 * How many live questions one venture may hold at once.
 *
 * Until the board could propose, no such cap existed and none was needed: the morning seed loop
 * skips a venture that already has a live item, so a venture held one and the ceiling was a side
 * effect of the only writer. A proposing board is a second writer that does not consult that
 * loop, so the ceiling has to become a rule. Three is the seeded objective plus two questions the
 * board invented — enough for it to open a line of enquiry beside the standing objective, and
 * short enough that a venture cannot bury its own objective under a week of proposals. The board
 * may propose once a day and items live a week, so without this a venture would drift toward
 * eight live questions of which seven came from a model.
 */
export const PRIORITY_QUEUE_VENTURE_CAP = 3;

/**
 * Wording overlap at or above which a proposed question is refused as one the queue already has.
 *
 * The same number and the same scorer as the ideas ledger's duplicate check, deliberately: that
 * ledger has been screening model-written proposals for wording overlap since founding, and a
 * second threshold tuned by guess would be a second thing to keep calibrated. See
 * deterministicVaultAdjudicator in ideas/ledger.ts for the precedent.
 */
export const PRIORITY_DUPLICATE_AT = 0.85;

/**
 * A proposal the queue refused, with the guard that refused it.
 *
 * A distinct type because the refusal is published — the standup prints it — and because the
 * caller must be able to tell "the board proposed something the queue would not take" from a
 * disk error or a contract failure, which are not the board's doing and must still crash.
 */
export class PriorityProposalRefused extends Error {
  constructor(
    readonly guard: "duplicate" | "venture-cap" | "queue-cap",
    message: string
  ) {
    super(message);
    this.name = "PriorityProposalRefused";
  }
}

// One week, the same window the morning seed gives an item in cycle.ts. A finished item
// is kept for a full window past its own expiry so a recently resolved question is still
// readable in the file, then it goes.
const RESOLVED_RETENTION_MS = 7 * 86_400_000;

// The file on disk is exactly what may already sit over the cap, so it is read with the
// cap lifted. Parsing it with PriorityQueueSchema would throw before the prune could run.
const StoredQueueSchema = PriorityQueueSchema.extend({
  items: z.array(PriorityItemSchema)
});

function archivedAtExpiry(items: readonly PriorityItem[], now: Date): PriorityItem[] {
  const at = now.getTime();
  return items.map((item) =>
    item.status === "open" && Date.parse(item.expires) <= at
      ? PriorityItemSchema.parse({ ...item, status: "archived" as const })
      : item
  );
}

// Prune on read.
//
// Open items do not accumulate: the morning branch skips any venture that already has one,
// and ensurePriorityItem matches open items, so a venture holds at most one at a time.
// Finished items are the other case. An item expires a week after it is seeded,
// archivedAtExpiry retires it, the next morning seeds a replacement, and before this function
// nothing took the retired one back out — so the file gained about one dead item per agenda
// venture per expiry window, with no ceiling short of the cap.
//
// No queue has actually reached the 200-item cap; this prune is what keeps it that way,
// rather than a repair for an outage that already happened. Were the file to reach the cap,
// PriorityQueueSchema.parse would reject it and readPriorityQueue and addPriorityItem would
// both throw, taking the morning cycle down with a zod error and no queue at all.
//
// Only finished items are dropped, and only once they are a full retention window past
// their own expiry: they cannot be selected, and ensurePriorityItem already matches open
// items only, so nothing live is lost.
function withoutStaleResolved(items: readonly PriorityItem[], now: Date): PriorityItem[] {
  const cutoff = now.getTime() - RESOLVED_RETENTION_MS;
  return items.filter((item) => item.status === "open" || Date.parse(item.expires) > cutoff);
}

// An open item is never dropped to fit the cap. Losing unanswered questions to keep a file
// parseable trades a loud failure for a silent one, so recent finished items give way first
// (oldest expiry out first) and a queue that is full of open work says so.
function withinCap(items: readonly PriorityItem[]): PriorityItem[] {
  if (items.length <= PRIORITY_QUEUE_CAP) return [...items];
  const open = items.filter((item) => item.status === "open").length;
  if (open > PRIORITY_QUEUE_CAP) {
    throw new Error(
      `Priority queue holds ${open} open items, past the ${PRIORITY_QUEUE_CAP}-item cap. `
      + "Nothing was dropped. This needs a human: selectPriorityItem, skipPriorityItem and "
      + "archivePriorityItem all read the queue through here first, so every one of them "
      + "raises this same error and the queue cannot clear itself from inside the council. "
      + `Resolve open items in the admin UI, which reads ${PRIORITY_QUEUE_PATH} on its own `
      + "without this cap, or edit that file directly."
    );
  }
  const doomed = new Set(
    items
      .map((item, index) => ({ item, index }))
      .filter((entry) => entry.item.status !== "open")
      .sort((left, right) =>
        left.item.expires.localeCompare(right.item.expires)
        || left.item.created.localeCompare(right.item.created)
        || left.index - right.index)
      .slice(0, items.length - PRIORITY_QUEUE_CAP)
      .map((entry) => entry.index)
  );
  return items.filter((_, index) => !doomed.has(index));
}

export async function readPriorityQueue(root: string, now = new Date()): Promise<PriorityQueue> {
  const value = await readJson<unknown>(root, PRIORITY_QUEUE_PATH, {
    schemaVersion: "priority-queue/1",
    items: [],
    updatedAt: now.toISOString()
  });
  const stored = StoredQueueSchema.parse(value);
  return PriorityQueueSchema.parse({
    ...stored,
    items: withinCap(withoutStaleResolved(archivedAtExpiry(stored.items, now), now)),
    updatedAt: now.toISOString()
  });
}

/**
 * The questions the board can still commission a room for.
 *
 * "why-not" is not a closed question — it is one the board declined on a particular morning, and
 * the starvation review publishes exactly that wording. Filtering it out here meant the board
 * skipped every item it did not select, and from the next morning on it was handed an empty list
 * and told by its own prompt that an empty list means request nothing. Five seeded questions on
 * 1 August, none ever asked again: the room met every day and could not have commissioned
 * anything if it had wanted to. "archived" is the terminal one.
 */
export function openPriorityItems(queue: PriorityQueue, venture?: string): PriorityItem[] {
  return queue.items
    .filter((item) => (item.status === "open" || item.status === "why-not") && (!venture || item.venture === venture))
    .sort((left, right) => left.created.localeCompare(right.created) || left.id.localeCompare(right.id));
}

export async function addPriorityItem(input: {
  root: string;
  venture: string;
  question: string;
  decisionAtStake: string;
  evidenceNeeded?: string[];
  requestedBy?: string;
  now: Date;
  expires: Date;
  proposal?: PriorityProposalProvenance;
}): Promise<PriorityItem> {
  const queue = await readPriorityQueue(input.root, input.now);
  const id = `priority-${createHash("sha256")
    .update(`${input.venture}\n${input.question.trim()}\n${input.decisionAtStake.trim()}\n${input.now.toISOString()}`)
    .digest("hex")
    .slice(0, 16)}`;
  const item = PriorityItemSchema.parse({
    schemaVersion: "priority-item/1",
    id,
    venture: input.venture,
    question: input.question,
    decision_at_stake: input.decisionAtStake,
    evidence_needed: [...new Set(input.evidenceNeeded ?? [])].slice(0, 12),
    requested_by: input.requestedBy ?? "VIZE",
    created: input.now.toISOString(),
    expires: input.expires.toISOString(),
    status: "open",
    why_not_reason: null,
    consumed_by: null,
    origin: input.proposal ? "proposed" : "seeded",
    proposal: input.proposal ?? null
  });
  await atomicWriteJson(input.root, PRIORITY_QUEUE_PATH, PriorityQueueSchema.parse({
    schemaVersion: "priority-queue/1",
    // The read pruned by age; this only bites when the append itself lands on the cap, and
    // it fails loudly rather than with a bare zod message when open work fills the queue.
    items: withinCap([...queue.items, item]),
    updatedAt: input.now.toISOString()
  }));
  return item;
}

/**
 * Items a proposal is checked against: everything on this venture's queue that is not archived.
 *
 * Wider than openPriorityItems on purpose. A "selected" item is the question the board is having
 * a room answer right now, and re-proposing it while that room sits in the agenda queue is the
 * most obvious way to get the same work commissioned twice. "why-not" is the one the brief calls
 * out and the one the queue is currently full of — ten items, every one of them declined at some
 * morning — so a check that skipped them would let the board re-propose its own back catalogue on
 * day one. Only "archived" is excluded: those expired, and a question worth asking again a week
 * later is a new question, not a duplicate.
 */
export function livePriorityItems(queue: PriorityQueue, venture: string): PriorityItem[] {
  return queue.items.filter((item) => item.venture === venture && item.status !== "archived");
}

/**
 * The item a proposed question duplicates, or null.
 *
 * Scoped to the venture. The same sentence under two ventures is two different jobs — "what is
 * blocking the content pipeline" means something different for FightAIQ than for MMA Files — and
 * refusing across ventures would let whichever venture asked first silence the rest.
 */
export function findDuplicatePriorityItem(input: {
  queue: PriorityQueue;
  venture: string;
  question: string;
  decisionAtStake: string;
}): { item: PriorityItem; score: number } | null {
  const proposed = { title: input.question.trim(), summary: input.decisionAtStake.trim() };
  let best: { item: PriorityItem; score: number } | null = null;
  for (const item of livePriorityItems(input.queue, input.venture)) {
    const score = ideaSimilarity(proposed, {
      title: item.question,
      summary: item.decision_at_stake
    });
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= PRIORITY_DUPLICATE_AT ? best : null;
}

/**
 * Put a question the board invented on the queue, or refuse it and say which guard refused.
 *
 * Separate from ensurePriorityItem rather than a flag on it, because the two have opposite
 * defaults. The seed is idempotent and silent: it exists so a re-run adds nothing, and it matches
 * only exact wording because the wording it writes is generated from config and never varies.
 * A proposal is neither. It is model-written prose that will vary a little every day while
 * meaning the same thing, so it needs fuzzy matching, and it must be refused out loud rather than
 * quietly folded into an existing item, because the board is told whether its proposal landed and
 * a silent no-op would read to it as a yes.
 *
 * Every refusal below throws PriorityProposalRefused, whose message the caller publishes. None of
 * them is a bug: they are the queue declining work, which is a normal outcome the record states.
 */
export async function proposePriorityItem(input: {
  root: string;
  venture: string;
  question: string;
  decisionAtStake: string;
  evidenceNeeded?: string[];
  proposedBy: string;
  meetingRef: string;
  now: Date;
  expires: Date;
}): Promise<PriorityItem> {
  const queue = await readPriorityQueue(input.root, input.now);

  const duplicate = findDuplicatePriorityItem({
    queue,
    venture: input.venture,
    question: input.question,
    decisionAtStake: input.decisionAtStake
  });
  if (duplicate) {
    throw new PriorityProposalRefused(
      "duplicate",
      `The queue already holds ${duplicate.item.id} for ${input.venture} at ${duplicate.score.toFixed(2)} wording overlap (${duplicate.item.status}). A question already on the queue is asked by selecting it, not by proposing it again.`
    );
  }

  const live = livePriorityItems(queue, input.venture);
  if (live.length >= PRIORITY_QUEUE_VENTURE_CAP) {
    throw new PriorityProposalRefused(
      "venture-cap",
      `${input.venture} already holds ${live.length} live questions, at the ${PRIORITY_QUEUE_VENTURE_CAP}-question limit per project. Settle one before adding another.`
    );
  }

  // Checked before the append rather than left to withinCap. withinCap would accept this item and
  // evict the oldest finished one to stay under the cap — correct when the writer is the seed
  // loop restoring a venture's standing question, wrong when the writer is the board, which must
  // not be able to push a resolved question out of the record by inventing new ones.
  if (queue.items.length >= PRIORITY_QUEUE_CAP) {
    throw new PriorityProposalRefused(
      "queue-cap",
      `The priority queue holds ${queue.items.length} items, at its ${PRIORITY_QUEUE_CAP}-item limit. Nothing was dropped to make room for a proposal.`
    );
  }

  return addPriorityItem({
    root: input.root,
    venture: input.venture,
    question: input.question,
    decisionAtStake: input.decisionAtStake,
    ...(input.evidenceNeeded ? { evidenceNeeded: input.evidenceNeeded } : {}),
    // requested_by carries the proposing seat too, so the admin UI and every existing reader that
    // only knows about that field still attribute the question to the seat that asked for it.
    requestedBy: input.proposedBy,
    now: input.now,
    expires: input.expires,
    proposal: {
      proposed_by: input.proposedBy,
      meeting_ref: input.meetingRef,
      proposed_at: input.now.toISOString()
    } as PriorityProposalProvenance
  });
}

export async function ensurePriorityItem(input: {
  root: string;
  venture: string;
  question: string;
  decisionAtStake: string;
  evidenceNeeded?: string[];
  requestedBy?: string;
  now: Date;
  expires: Date;
}): Promise<{ item: PriorityItem; created: boolean }> {
  const queue = await readPriorityQueue(input.root, input.now);
  // Match only OPEN items. Matching across every status meant a question that had been
  // consumed or had expired still counted as present, so the morning seed could run exactly
  // once per venture for the life of the repo and the agenda loop would go quiet a week
  // later with nothing in the queue and no way to refill it.
  const existing = queue.items.find((item) =>
    item.status === "open"
    && item.venture === input.venture
    && item.question === input.question.trim()
    && item.decision_at_stake === input.decisionAtStake.trim()
  );
  if (existing) return { item: existing, created: false };
  return { item: await addPriorityItem(input), created: true };
}

/**
 * Whether a stored status may become the requested one.
 *
 * openPriorityItems hands "why-not" items back to the board precisely so a later morning can
 * commission one, and this function refusing the move is what made that offer empty: the board
 * picked an item it had been shown, the write threw "is why-not, not open", the cycle caught the
 * throw and published "the agenda queue refused it", and the item went back on tomorrow's list to
 * be offered and refused again. Ten items, nine of them why-not, none of them ever selectable.
 * Re-offering a question and then refusing to take it is one behaviour written twice, in opposite
 * directions; the offer is the one that was designed, so this side gives way.
 *
 * "archived" stays terminal, and a why-not item still may not be re-skipped into a different
 * refusal reason — the same status is allowed through so a repeated write is a no-op rather than a
 * crash.
 */
function mayTransition(
  from: PriorityItem["status"],
  to: "selected" | "why-not" | "archived"
): boolean {
  if (from === to) return true;
  if (from === "open") return true;
  return from === "why-not" && to === "selected";
}

async function transition(input: {
  root: string;
  itemId: string;
  now: Date;
  status: "selected" | "why-not" | "archived";
  consumedBy?: string;
  reason?: string;
}): Promise<PriorityItem> {
  const queue = await readPriorityQueue(input.root, input.now);
  let result: PriorityItem | null = null;
  const items = queue.items.map((item) => {
    if (item.id !== input.itemId) return item;
    if (!mayTransition(item.status, input.status)) {
      throw new Error(
        `Priority item ${item.id} is ${item.status}, which cannot become ${input.status}`
      );
    }
    result = PriorityItemSchema.parse({
      ...item,
      status: input.status,
      why_not_reason: input.status === "why-not" ? input.reason : null,
      consumed_by: input.status === "selected" ? input.consumedBy : null
    });
    return result;
  });
  if (!result) throw new Error(`Unknown priority item ${input.itemId}`);
  await atomicWriteJson(input.root, PRIORITY_QUEUE_PATH, PriorityQueueSchema.parse({
    schemaVersion: "priority-queue/1",
    items,
    updatedAt: input.now.toISOString()
  }));
  return result;
}

export function selectPriorityItem(input: {
  root: string;
  itemId: string;
  meetingRef: string;
  now: Date;
}): Promise<PriorityItem> {
  return transition({ ...input, status: "selected", consumedBy: input.meetingRef });
}

export function skipPriorityItem(input: {
  root: string;
  itemId: string;
  reason: string;
  now: Date;
}): Promise<PriorityItem> {
  return transition({ ...input, status: "why-not", reason: input.reason });
}

export function archivePriorityItem(input: {
  root: string;
  itemId: string;
  now: Date;
}): Promise<PriorityItem> {
  return transition({ ...input, status: "archived" });
}
