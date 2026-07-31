import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  VentureRegistrySchema,
  type VentureRegistry
} from "../contracts/venture-registry.js";
import {
  FoundingAgentSchema,
  ScheduledPhaseSchema,
  type ScheduledPhase
} from "../types.js";
import { configRoot } from "../paths.js";

export const PORTFOLIO_BOARD_SLOTS = [
  { phase: "morning", hour: 6, label: "Venture morning" },
  { phase: "afternoon", hour: 14, label: "Venture afternoon" },
  { phase: "night", hour: 22, label: "Venture night" }
] as const;

export interface ResolvedMeetingSlot {
  phase: ScheduledPhase;
  hour: number;
  label: string;
  ventureId: string | null;
}

export type VentureMeetingDefinition = VentureRegistry["ventures"][number]["meetings"][number];

export function parseCadenceHour(cadence: string): number {
  const match = /^daily@(\d{2}):00$/.exec(cadence);
  if (!match) throw new Error(`Unsupported venture cadence: ${cadence}`);
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 5 || hour > 23) {
    throw new Error(`Venture cadence hour is outside 05:00 to 23:00: ${cadence}`);
  }
  return hour;
}

export function parseVentureRegistry(value: unknown): VentureRegistry {
  return VentureRegistrySchema.parse(value);
}

export function readVentureRegistry(
  filePath = path.join(configRoot, "ventures.json")
): VentureRegistry {
  return parseVentureRegistry(JSON.parse(readFileSync(filePath, "utf8")));
}

export async function loadVentureRegistry(
  filePath = path.join(configRoot, "ventures.json")
): Promise<VentureRegistry> {
  return parseVentureRegistry(JSON.parse(await readFile(filePath, "utf8")));
}

export function resolveMeetingClock(
  registry: VentureRegistry
): ResolvedMeetingSlot[] {
  const ventureSlots = registry.ventures.flatMap((venture) =>
    venture.meetings.map((meeting) => ({
      phase: ScheduledPhaseSchema.parse(meeting.kind),
      hour: parseCadenceHour(meeting.cadence),
      label: meeting.label,
      ventureId: venture.id
    }))
  );
  return [
    ...PORTFOLIO_BOARD_SLOTS.map((slot) => ({ ...slot, ventureId: null })),
    ...ventureSlots
  ].sort((left, right) => left.hour - right.hour);
}

export function getVentureMeetingDefinition(
  registry: VentureRegistry,
  kind: string
): { ventureId: string; meeting: VentureMeetingDefinition } {
  for (const venture of registry.ventures) {
    const meeting = venture.meetings.find((candidate) => candidate.kind === kind);
    if (meeting) return { ventureId: venture.id, meeting };
  }
  throw new Error(`No venture meeting is registered for ${kind}`);
}

export function composeMeetingRouteDefinition(
  registry: VentureRegistry,
  kind: string,
  mode: "dry" | "live"
) {
  const { ventureId, meeting } = getVentureMeetingDefinition(registry, kind);
  const venture = registry.ventures.find((candidate) => candidate.id === ventureId)!;
  return {
    ventureId,
    envelopeUsd: meeting.envelopeUsd,
    topicType: meeting.packet.topicType,
    objective: meeting.packet.objectives[mode],
    decisionNeeded: meeting.packet.decisionNeeded,
    preset: meeting.packet.preset,
    preSteps: venture.taste && venture.meetings[0]?.kind === meeting.kind ? ["palate"] as const : [] as const,
    requiredParticipants: meeting.cast.map((agent) => FoundingAgentSchema.parse(agent))
  };
}

export function cronPayloads(registry: VentureRegistry): Array<{
  cron: string;
  phase: ScheduledPhase;
}> {
  return resolveMeetingClock(registry).flatMap((slot) => [
    { cron: `0 ${(slot.hour + 22) % 24} * * *`, phase: slot.phase },
    { cron: `0 ${(slot.hour + 23) % 24} * * *`, phase: slot.phase }
  ]);
}

export function ventureIdForPhase(
  registry: VentureRegistry,
  phase: string
): string | "global" {
  for (const venture of registry.ventures) {
    if (venture.meetings.some((meeting) => meeting.kind === phase)) return venture.id;
  }
  return "global";
}
