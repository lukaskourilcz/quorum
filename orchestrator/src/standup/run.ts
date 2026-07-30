import type { RoomPacket } from "../boardroom/room.js";
import {
  getShiftDefinition,
  isShiftPhase
} from "../shifts.js";
import type { RunnablePhase, Stage } from "../types.js";
import { StandupSchema, type Standup } from "./schema.js";

export function createOfflineStandup(input: {
  cycleId: string;
  phase: RunnablePhase;
  stage: Stage;
  fixture: boolean;
  status: Standup["status"];
  room: RoomPacket;
  estimatedCycleUsd: number;
  now: Date;
  evidenceRefs?: string[];
}): Standup {
  const outcome =
    input.status === "INSUFFICIENT_EVIDENCE" ? "NO_ACTION" : input.status;
  const shift = isShiftPhase(input.phase)
    ? getShiftDefinition(input.phase)
    : null;
  const date = input.now.toISOString().slice(0, 10);
  const shiftTask = shift
    ? {
        morning: {
          owner: "SCOUT" as const,
          summary: "Collect attributable signals and record the evidence gaps."
        },
        afternoon: {
          owner: "FORGE" as const,
          summary: "Review bounded work, verify progress and surface blockers."
        },
        night: {
          owner: "SCRIBE" as const,
          summary: "Reconcile the shift record and preserve every open question."
        }
      }[shift.phase]
    : {
        owner: "SCOUT" as const,
        summary: "Collect real, attributable problem and intent signals."
      };

  return StandupSchema.parse({
    schemaVersion: 1,
    cycleId: input.cycleId,
    date,
    phase: input.phase,
    episode: shift
      ? {
          id: `EP-${date.replaceAll("-", "")}-${shift.phase.toUpperCase()}`,
          shift: shift.phase,
          title: shift.episodeTitle,
          hours: `${shift.startsAt}–${shift.endsAt}`,
          nextShift: shift.nextShift,
          handoff: shift.handoff
        }
      : null,
    fixture: input.fixture,
    status: input.status,
    stage: input.stage,
    operatingBrief:
      input.status === "INSUFFICIENT_EVIDENCE"
        ? "Discovery remains open. Synthetic fixtures were evaluated but no real opportunity passed the evidence gate."
        : shift
          ? `${shift.label} reviewed its bounded objective and prepared the next handoff.`
          : "The operating system completed a bounded offline review.",
    participantReasons: [
      ...input.room.selectedParticipants.map((participant) => ({
        agent: participant.agent,
        reason: participant.reason,
        participated: true
      })),
      ...input.room.skippedParticipants.map((participant) => ({
        agent: participant.agent,
        reason: participant.reason,
        participated: false
      }))
    ],
    ledger: {
      estimatedCycleUsd: input.estimatedCycleUsd,
      actualCycleUsd: input.fixture ? 0 : null,
      monthAllInUsd: 0,
      monthCapUsd: 20
    },
    decision: {
      outcome,
      summary:
        input.status === "INSUFFICIENT_EVIDENCE"
          ? "Do not found a venture. Collect eligible independent and direct evidence."
          : "No externally consequential action was approved.",
      evidenceRefs: input.evidenceRefs ?? []
    },
    proposals: input.room.selectedParticipants
      .filter(({ agent }) => ["VIZE", "FORGE", "PULSE", "AUDIT"].includes(agent))
      .map(({ agent }) => ({
        agent,
        summary:
          agent === "AUDIT"
            ? "Hold the evidence and budget gates."
            : "NO_ACTION until a bounded evidence-backed task exists.",
        evidenceRefs: input.evidenceRefs ?? []
      })),
    voteMatrix: input.room.selectedParticipants
      .filter(({ agent }) => ["VIZE", "FORGE", "PULSE", "AUDIT"].includes(agent))
      .map(({ agent }) => ({
        voter: agent,
        firstChoice: "NO_ACTION",
        veto: agent === "AUDIT" && input.status === "INSUFFICIENT_EVIDENCE"
      })),
    tasks: [
      {
        id: `TASK-${input.cycleId}-001`,
        owner: shiftTask.owner,
        summary: shiftTask.summary,
        status: "planned"
      }
    ],
    growthPlan: "NO_POST — there is no evidence-backed venture fact to distribute.",
    eveningOutcome:
      input.phase === "night"
        ? "Night shift reconciled the record; remain in DISCOVERY."
        : null,
    generatedAt: input.now.toISOString()
  });
}
