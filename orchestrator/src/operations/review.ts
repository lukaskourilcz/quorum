import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CouncilAgent } from "../types.js";
import type { OperationsPacket } from "./packet.js";

/**
 * What the board's positions add up to, resolved deterministically.
 *
 * The seats each answer inside their own lens; this puts the answers together under the caps the
 * owner set — three fix tasks and two growth ideas a day, whole-board — and does it in code rather
 * than in a prompt, because a cap a model is asked to respect is a request and a cap enforced here
 * is a cap. Order is seat order, so a tie is broken by who sits where and not by chance.
 */
export interface ResolvedOperationsReview {
  perVentureVerdicts: Array<{ ventureId: string; verdict: "on-track" | "needs-attention" | "stalled"; evidence: string }>;
  fixTasks: Array<{ proposedBy: CouncilAgent; title: string; scope: string; expectedProof: string }>;
  growthIdeas: Array<{ proposedBy: CouncilAgent; ventureId: string; title: string; summary: string }>;
  /** Proposals the caps refused, so the record says what was dropped and why. */
  dropped: Array<{ agent: CouncilAgent; field: string; reason: string }>;
}

export const MAX_FIX_TASKS = 3;
export const MAX_GROWTH_IDEAS = 2;

export function resolveOperationsReview(positions: ReadonlyArray<{
  agent: CouncilAgent;
  ventureVerdicts?: ReadonlyArray<{ ventureId: string; verdict: "on-track" | "needs-attention" | "stalled"; evidence: string }>;
  fixTask?: { title: string; scope: string; expectedProof: string } | null;
  growthIdea?: { ventureId: string; title: string; summary: string } | null;
}>): ResolvedOperationsReview {
  const dropped: ResolvedOperationsReview["dropped"] = [];

  // One verdict per venture across the whole board. VIZE owns the lens, so if another seat
  // returned verdicts anyway the first one on a venture wins and the rest are named as dropped.
  const verdicts: ResolvedOperationsReview["perVentureVerdicts"] = [];
  const claimed = new Set<string>();
  for (const position of positions) {
    for (const verdict of position.ventureVerdicts ?? []) {
      if (claimed.has(verdict.ventureId)) {
        dropped.push({
          agent: position.agent,
          field: "ventureVerdicts",
          reason: `A verdict for ${verdict.ventureId} was already recorded this meeting.`
        });
        continue;
      }
      claimed.add(verdict.ventureId);
      verdicts.push(verdict);
    }
  }

  const fixTasks: ResolvedOperationsReview["fixTasks"] = [];
  for (const position of positions) {
    if (!position.fixTask) continue;
    if (fixTasks.length >= MAX_FIX_TASKS) {
      dropped.push({
        agent: position.agent,
        field: "fixTask",
        reason: `A meeting opens at most ${MAX_FIX_TASKS} fix tasks; this one was full.`
      });
      continue;
    }
    fixTasks.push({ proposedBy: position.agent, ...position.fixTask });
  }

  const growthIdeas: ResolvedOperationsReview["growthIdeas"] = [];
  for (const position of positions) {
    if (!position.growthIdea) continue;
    if (growthIdeas.length >= MAX_GROWTH_IDEAS) {
      dropped.push({
        agent: position.agent,
        field: "growthIdea",
        reason: `A day carries at most ${MAX_GROWTH_IDEAS} growth ideas; this one was full.`
      });
      continue;
    }
    growthIdeas.push({ proposedBy: position.agent, ...position.growthIdea });
  }

  return { perVentureVerdicts: verdicts, fixTasks, growthIdeas, dropped };
}

/**
 * The dated operations decision file, in the checkbox convention the builder loop reads.
 *
 * Written beside the JSON standup rather than instead of it: the JSON is the record, this is the
 * work list a session can pick up and tick off. A morning with no fix tasks writes no file at all —
 * an empty decision file would be a daily invitation to invent something to put in it.
 */
export async function writeOperationsDecision(input: {
  stateRoot: string;
  date: string;
  review: ResolvedOperationsReview;
  packet: OperationsPacket;
}): Promise<string | null> {
  if (input.review.fixTasks.length === 0) return null;

  const relative = `decisions/${input.date}-operations.md`;
  const absolute = path.join(input.stateRoot, relative);
  const verdictLines = input.review.perVentureVerdicts.length === 0
    ? ["_No per-venture verdicts were returned this morning._"]
    : input.review.perVentureVerdicts.map((entry) =>
      `- **${entry.ventureId}** — ${entry.verdict}. ${entry.evidence}`);
  const skipLines = input.packet.meetings.skipped.length === 0
    ? ["_Every scheduled slot met._"]
    : input.packet.meetings.skipped.map((skip) => `- **${skip.phase}** — ${skip.reason}`);
  const silentLines = input.packet.meetings.unaccounted.length === 0
    ? []
    : [
      "",
      "### Slots with no record either way",
      "",
      ...input.packet.meetings.unaccounted.map((slot) => `- **${slot.kind}** — scheduled, neither held nor skipped.`)
    ];

  const body = [
    `# Operations review — ${input.date}`,
    "",
    `Written by the ${input.date} morning board from the operations packet for ${input.packet.reviewDate}.`,
    "Every task below names the path it touches and the proof that would close it.",
    "",
    "## Tasks",
    "",
    ...input.review.fixTasks.map((task) =>
      `- [ ] **${task.title}** — ${task.scope}. Proof: ${task.expectedProof} _(${task.proposedBy})_`),
    "",
    "## Where each venture stood",
    "",
    ...verdictLines,
    "",
    "## Meetings that did not happen",
    "",
    ...skipLines,
    ...silentLines,
    ""
  ].join("\n");

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, body, "utf8");
  return relative;
}
