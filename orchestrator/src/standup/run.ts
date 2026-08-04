import type { RoomPacket } from "../boardroom/room.js";
import { pragueClockParts } from "../meetings/clock.js";
import {
  getShiftDefinition,
  isShiftPhase
} from "../shifts.js";
import type { RunnablePhase, Stage } from "../types.js";
import type { IdeaScreeningResult } from "../ideas/ledger.js";
import { StandupSchema, type Standup } from "./schema.js";
import type { AutonomySnapshot } from "../autonomy/signals.js";
import type { QuarterlyKpiPacketSummary } from "../money/daily.js";

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
  caughtUpIdea?: IdeaScreeningResult;
  agentsParticipated?: boolean;
  autonomy?: AutonomySnapshot;
  quarterlyKpis?: QuarterlyKpiPacketSummary;
  /** Month-to-date all-in spend and the cap in force, both read from the runtime. */
  ledger: { monthAllInUsd: number; monthCapUsd: number };
}): Standup {
  const outcome =
    input.status === "INSUFFICIENT_EVIDENCE" ? "NO_ACTION" : input.status;
  const shift = isShiftPhase(input.phase)
    ? getShiftDefinition(input.phase)
    : null;
  // The Prague wall-clock day, which is the day every other record and the calendar use.
  // This was the UTC day. Prague runs one or two hours ahead, so between midnight and 02:00
  // local the UTC date is still yesterday: a night shift queued past midnight filed itself
  // under the previous day, overwriting that day's record of the same phase, and the calendar
  // — laid out in Prague days and keyed on this field — showed the real day's slot as missed.
  const date = pragueClockParts(input.now).date;
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
  const openedAt = input.now.toISOString();
  const closedAt = new Date(input.now.getTime() + 2_000).toISOString();
  const agentsParticipated = input.agentsParticipated ?? true;

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
        reason: agentsParticipated
          ? participant.reason
          : "registered for the checkpoint but not called because this shift is deterministic",
        participated: agentsParticipated
      })),
      ...input.room.skippedParticipants.map((participant) => ({
        agent: participant.agent,
        reason: participant.reason,
        participated: false
      }))
    ],
    // Month-to-date spend and the cap come from the runtime, never from a literal here. The
    // afternoon and night shifts are deterministic, so this branch always writes the newest
    // standup, and the site reads the newest standup for its headline running cost: it
    // published "$0.00 of $50" on a day the ledger held $1.18 against a $30 cap.
    ledger: {
      estimatedCycleUsd: input.estimatedCycleUsd,
      actualCycleUsd: 0,
      monthAllInUsd: input.ledger.monthAllInUsd,
      monthCapUsd: input.ledger.monthCapUsd
    },
    decision: {
      outcome,
      summary:
        input.status === "INSUFFICIENT_EVIDENCE"
          ? "Do not found a venture. Collect eligible independent and direct evidence."
          : "No externally consequential action was approved.",
      evidenceRefs: input.evidenceRefs ?? []
    },
    proposals: [
      ...(agentsParticipated ? input.room.selectedParticipants : [])
      .filter(({ agent }) => ["VIZE", "FORGE", "PULSE", "AUDIT"].includes(agent))
      .map(({ agent }) => ({
        agent,
        summary:
          agent === "AUDIT"
            ? "Hold the evidence and budget gates."
            : "NO_ACTION until a bounded evidence-backed task exists.",
        evidenceRefs: input.evidenceRefs ?? []
      })),
      ...(input.caughtUpIdea ? [{
        agent: "SPARK" as const,
        summary: `${input.caughtUpIdea.entry.title}: ${input.caughtUpIdea.entry.summary}`,
        evidenceRefs: input.caughtUpIdea.entry.revival
          ? [input.caughtUpIdea.entry.revival.evidenceRef]
          : []
      }] : [])
    ],
    voteMatrix: (agentsParticipated ? input.room.selectedParticipants : [])
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
        status: agentsParticipated ? "planned" : "skipped"
      }
    ],
    growthPlan: "NO_POST — there is no evidence-backed venture fact to distribute.",
    ...(input.autonomy ? {
      operatingSignals: {
        snapshotRef: "state/autonomy/latest.json",
        growth: input.autonomy.growth,
        quality: input.autonomy.quality
      }
    } : {}),
    ...(input.quarterlyKpis ? { quarterlyKpis: input.quarterlyKpis } : {}),
    eveningOutcome:
      input.phase === "night"
        ? "Night shift reconciled the record; remain in DISCOVERY."
        : null,
    ...(input.caughtUpIdea ? { caughtUpIdeaRef: input.caughtUpIdea.entry.id } : {}),
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: "VIZE",
      setting: input.fixture
        ? "Deterministic offline fixture. No live council call occurred."
        : "Bounded operating record without a live council call.",
      turns: [
        {
          agent: "VIZE",
          mode: "gavel",
          sentAt: openedAt,
          text: input.fixture
            ? "This fixture opens a deterministic review. No live agent position is being presented."
            : agentsParticipated
              ? "The bounded operating review opens."
              : "The deterministic checkpoint records the handoff. No council model was called."
        },
        {
          agent: "LEDGER",
          mode: "reads-ledger",
          sentAt: closedAt,
          text: `Recorded estimate: $${input.estimatedCycleUsd.toFixed(4)}. ${input.fixture ? "No paid API call occurred." : "No live cost was recorded."}`
        },
        ...(input.caughtUpIdea ? [{
          agent: "SPARK" as const,
          mode: "statement" as const,
          sentAt: closedAt,
          text: `${input.caughtUpIdea.entry.title}. VAULT recorded ${input.caughtUpIdea.verdict}; carry ${input.caughtUpIdea.entry.id} to the product room.`,
          evidenceRefs: [
            input.caughtUpIdea.entry.id,
            ...(input.caughtUpIdea.entry.revival
              ? [input.caughtUpIdea.entry.revival.evidenceRef]
              : [])
          ]
        }] : [])
      ]
    },
    generatedAt: input.now.toISOString()
  });
}
