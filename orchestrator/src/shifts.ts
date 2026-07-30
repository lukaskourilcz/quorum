import {
  ShiftPhaseSchema,
  type Phase,
  type ShiftPhase
} from "./types.js";

export interface ShiftDefinition {
  endsAt: string;
  episodeTitle: string;
  handoff: string;
  label: string;
  meetingHour: number;
  nextShift: ShiftPhase;
  objective: string;
  phase: ShiftPhase;
  startsAt: string;
}

export const SHIFT_DEFINITIONS: Record<ShiftPhase, ShiftDefinition> = {
  morning: {
    endsAt: "14:00",
    episodeTitle: "Morning briefing",
    handoff:
      "Pass priorities, evidence gaps and blocked work to the afternoon shift.",
    label: "Morning shift",
    meetingHour: 6,
    nextShift: "afternoon",
    objective:
      "Set evidence-backed priorities for the next eight hours and name every open question",
    phase: "morning",
    startsAt: "06:00"
  },
  afternoon: {
    endsAt: "22:00",
    episodeTitle: "Afternoon build check",
    handoff:
      "Pass completed work, blockers and changed assumptions to the night shift.",
    label: "Afternoon shift",
    meetingHour: 14,
    nextShift: "night",
    objective:
      "Review progress, resolve bounded blockers and choose the next useful action or NO_ACTION",
    phase: "afternoon",
    startsAt: "14:00"
  },
  night: {
    endsAt: "06:00",
    episodeTitle: "Night handoff",
    handoff:
      "Reconcile the day and leave a concise opening brief for the morning shift.",
    label: "Night shift",
    meetingHour: 22,
    nextShift: "morning",
    objective:
      "Reconcile outcomes, preserve open questions and prepare the morning handoff",
    phase: "night",
    startsAt: "22:00"
  }
};

export function isShiftPhase(phase: Phase): phase is ShiftPhase {
  return ShiftPhaseSchema.safeParse(phase).success;
}

export function getShiftDefinition(phase: ShiftPhase): ShiftDefinition {
  return SHIFT_DEFINITIONS[phase];
}
