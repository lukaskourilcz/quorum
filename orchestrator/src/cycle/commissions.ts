import type { PriorityItem } from "../contracts/autonomy.js";
import type { VentureRegistry } from "../contracts/venture-registry.js";
import { mayRequestMeeting, type MeetingPolicy } from "../meetings/agenda.js";
import { COUNCIL_SEATS, type RecordedPosition } from "../standup/live.js";
import { getVentureMeetingDefinition, type VentureMeetingDefinition } from "../ventures/registry.js";

/**
 * The morning board's commission gate, moved verbatim out of `cycle.ts`.
 *
 * These functions decide one thing between them: whether the council's vote and its requests add
 * up to a specialist room being opened, and what to tell every venture that did not get one. They
 * were the top quarter of a two-thousand-line file and had nothing to do with the rest of it.
 *
 * Nothing here changed in the move. `runCycle` imports what it used to call directly.
 */

/**
 * Whether a second edition today is the owner asking for one rather than a cron repeating itself.
 *
 * The once-a-day guard is there because eighteen crons resolve to a phase and a re-run must not
 * publish the same day twice. It also stops a manual dispatch, which is the owner standing at the
 * keyboard asking for a new article — and there was no way to say so. The workflow sets this only
 * for a `workflow_dispatch` with dry disabled, so a schedule can never take this branch.
 */
export function manualEditionOverride(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CYCLE_FORCE_NEW_EDITION?.trim().toLowerCase() === "true";
}

/**
 * StandupSchema caps a starvation-review reason at 280 characters, and that is where every
 * reason below is published. An over-long one would not be truncated, it would fail the parse
 * and take the whole cycle down — so a scheduler message or a long transition list is cut here
 * rather than allowed to decide whether the morning gets written at all.
 */
const PUBLISHED_REASON_LIMIT = 280;

/**
 * Trim to the last whole word, not to the 279th character.
 *
 * These sentences are read on the admin's priority history, where a hard slice produced lines
 * ending mid-word — "the gate needs AUDIT plus three appro…". Backing up to the last space costs
 * a few characters and stops the record looking corrupted.
 */
export function publishableReason(reason: string): string {
  if (reason.length <= PUBLISHED_REASON_LIMIT) return reason;
  const cut = reason.slice(0, PUBLISHED_REASON_LIMIT - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > PUBLISHED_REASON_LIMIT / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export type MorningCommission =
  | {
      commission: true;
      requestedBy: RecordedPosition["agent"];
      request: NonNullable<RecordedPosition["meetingRequest"]>;
      target: { ventureId: string; meeting: VentureMeetingDefinition };
      priority: PriorityItem;
    }
  | { commission: false; reason: string };

/**
 * Decide whether the morning board commissions one specialist room, and say why when it does not.
 *
 * Pure, because the reason is published: the standup's starvation review prints it to every
 * venture that did not get the day's single commission. Refusing a room the board may not open
 * used to write no reason at all, so the standup fell back to the caller's default — "the council
 * did not reach the commission gate" — which is the wrong sentence for a council that reached it
 * and then named the wrong room. Every return below carries its own.
 */
/**
 * The vote half of the commission gate: AUDIT plus three approvals, and nothing about rooms.
 *
 * Extracted so a priority proposal passes the identical test rather than a second one written to
 * look like it. Two hand-written copies of "AUDIT plus three" would drift the first time either
 * moved, and the drift would be silent in the direction that matters — a board that can add work
 * to its own queue on a weaker majority than it needs to spend a meeting.
 */
export function councilVoteGate(positions: readonly RecordedPosition[]): {
  passed: boolean;
  approvals: number;
  auditApproved: boolean;
  summary: string;
} {
  const approvals = positions.filter((position) => position.recommendation === "approve");
  const auditApproved = approvals.some((position) => position.agent === "AUDIT");
  return {
    passed: auditApproved && approvals.length >= 3,
    approvals: approvals.length,
    auditApproved,
    /*
     * This sentence is read by a person, on the admin's priority history.
     *
     * It said "2 of 4 seats returned a position; 0 approved; AUDIT did not approve" — three
     * pieces of internal vocabulary in one line, about a meeting the owner did not attend. It
     * says the same three facts in words somebody who has never read this repository can follow.
     */
    summary: [
      `${positions.length} of ${COUNCIL_SEATS} board members gave an opinion`,
      approvals.length === 1 ? "1 said yes" : `${approvals.length} said yes`,
      auditApproved
        ? "the member who checks the records agreed"
        : "the member who checks the records did not agree"
    ].join("; ")
  };
}

export function resolveMorningCommission(input: {
  positions: readonly RecordedPosition[];
  openPriorities: readonly PriorityItem[];
  policy: MeetingPolicy;
  registry: VentureRegistry;
  sourcePhase: string;
  /**
   * Which requesting seat to resolve. Defaults to the first non-AUDIT seat carrying a request,
   * which is what a single-commission morning meant and what every existing caller expects.
   */
  requestIndex?: number;
}): MorningCommission {
  const gate = councilVoteGate(input.positions);
  const requesters = input.positions.filter((position) =>
    position.agent !== "AUDIT" && position.meetingRequest !== null
  );
  const requester = requesters[input.requestIndex ?? 0];
  const request = requester?.meetingRequest ?? null;
  if (!gate.passed || !request || !requester) {
    return {
      commission: false,
      reason: publishableReason([
        gate.summary,
        request ? "a room was requested" : "no seat requested a room"
      ].join("; ") + ". A meeting opens only when three of the four agree and the member who checks the records is one of them.")
    };
  }
  if (!mayRequestMeeting(input.policy, input.sourcePhase, request.phase)) {
    const allowed = (input.policy.transitions[input.sourcePhase] ?? []).join(", ");
    return {
      commission: false,
      reason: publishableReason(`${requester.agent} asked for the ${request.phase} room, which the ${input.sourcePhase} board may not commission. It may commission ${allowed.length > 0 ? allowed : "no room at all"}.`)
    };
  }
  const target = getVentureMeetingDefinition(input.registry, request.phase);
  const priority = input.openPriorities.find((item) => item.id === request.priorityItemId);
  if (!priority || priority.venture !== target.ventureId) {
    return {
      commission: false,
      reason: publishableReason(`${requester.agent} asked for the ${request.phase} room, which belongs to ${target.ventureId}, against ${priority ? `an open ${priority.venture} priority item` : "a priority item that is not open"}. A room is only commissioned for its own venture's item.`)
    };
  }
  return { commission: true, requestedBy: requester.agent, request, target, priority };
}

/**
 * Every room this morning commissions, at most one per venture.
 *
 * The morning used to take the first seat's request and stop, so the board could open one room a
 * day across the whole portfolio while four rooms needed an agenda every day to open at all.
 * Thirteen of August's forty-four meeting records are $0 pauses reading "no bounded agenda was
 * due": the rooms were not declining to meet, they were never given anything to meet about. The
 * gate is unchanged and still applies to the meeting rather than to each request — a board that
 * cannot reach AUDIT plus three approvals commissions nothing at all — and the queue's own
 * pending caps still have the last word on each write.
 *
 * One per venture, because two rooms for the same venture on the same morning is the same job
 * commissioned twice, and because the per-venture cap in the agenda queue is the thing that would
 * otherwise absorb it silently. `maxRequestsPerMeeting` bounds the total.
 */
export function resolveMorningCommissions(input: {
  positions: readonly RecordedPosition[];
  openPriorities: readonly PriorityItem[];
  policy: MeetingPolicy;
  registry: VentureRegistry;
  sourcePhase: string;
}): { commissions: Extract<MorningCommission, { commission: true }>[]; blockedReason: string } {
  const requesterCount = input.positions.filter((position) =>
    position.agent !== "AUDIT" && position.meetingRequest !== null
  ).length;
  const commissions: Extract<MorningCommission, { commission: true }>[] = [];
  const ventures = new Set<string>();
  // The reason published when nothing was commissioned is the first refusal, which on a morning
  // where no seat asked at all is the same sentence the single-commission gate wrote. Later seats
  // only ever add rooms, so a morning that commissioned something never publishes one of these.
  let blockedReason = "";
  for (let index = 0; index < Math.max(requesterCount, 1); index += 1) {
    if (commissions.length >= input.policy.maxRequestsPerMeeting) break;
    const outcome = resolveMorningCommission({ ...input, requestIndex: index });
    if (!outcome.commission) {
      if (!blockedReason) blockedReason = outcome.reason;
      continue;
    }
    if (ventures.has(outcome.target.ventureId)) continue;
    ventures.add(outcome.target.ventureId);
    commissions.push(outcome);
  }
  return {
    commissions,
    blockedReason: blockedReason || "Every room this board asked for was commissioned."
  };
}

export type PriorityProposalDecision =
  | { kind: "none" }
  | {
      kind: "take";
      proposedBy: RecordedPosition["agent"];
      request: NonNullable<RecordedPosition["priorityProposal"]>;
      alsoProposed: number;
    }
  | {
      kind: "refuse";
      proposedBy: RecordedPosition["agent"];
      request: NonNullable<RecordedPosition["priorityProposal"]>;
      reason: string;
    };

/**
 * Decide whether the room agreed to put a seat's new question on the priority queue.
 *
 * Pure and separate from the queue write, so the decision can be tested without a filesystem and
 * so the write stays a write. Three rules live here and nowhere else:
 *
 * One proposal per meeting. Seats are read in council order and the first non-AUDIT seat carrying
 * a proposal is the one taken; any others are counted and published, not queued. Counting rather
 * than refusing the whole thing matters — two seats proposing is agreement, and punishing the
 * board for it would teach it to stay quiet.
 *
 * AUDIT does not propose. It is the seat that has to be able to say no to work, and a seat that
 * authors work cannot audit it. This mirrors the existing rule that AUDIT never requests a room.
 *
 * The vote gate decides. A proposal from a meeting that could not reach AUDIT plus three
 * approvals is refused, and the refusal is recorded against the seat that made it rather than
 * dropped, because "the board proposed something and did not have the votes" is a fact about the
 * board that the record should keep.
 */
export function resolvePriorityProposal(input: {
  positions: readonly RecordedPosition[];
}): PriorityProposalDecision {
  const proposers = input.positions.filter((position) =>
    position.agent !== "AUDIT" && position.priorityProposal !== null
  );
  const first = proposers[0];
  if (!first?.priorityProposal) return { kind: "none" };
  const gate = councilVoteGate(input.positions);
  if (!gate.passed) {
    return {
      kind: "refuse",
      proposedBy: first.agent,
      request: first.priorityProposal,
      reason: publishableReason(`${gate.summary}. A new question is only added when the meeting itself carries, which needs three of the four to agree including the member who checks the records.`)
    };
  }
  return {
    kind: "take",
    proposedBy: first.agent,
    request: first.priorityProposal,
    alsoProposed: proposers.length - 1
  };
}

/**
 * Why a commission that passed every gate still did not reach the agenda queue.
 *
 * requestMeetingAgenda enforces the queue-wide and per-venture pending caps and re-parses the
 * agenda contract, so it can refuse work the gate above has already approved. That refusal used
 * to be a console line only, and the standup published the default reason as if the council had
 * never agreed on anything.
 */
export function schedulerBlockedReason(phase: string, error: unknown): string {
  return publishableReason(`The council commissioned the ${phase} room but the agenda queue refused it: ${
    error instanceof Error ? error.message : "unknown scheduler error"
  }`);
}