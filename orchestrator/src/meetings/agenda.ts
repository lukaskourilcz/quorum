import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AgendaPhaseSchema,
  MeetingAgendaQueueSchema,
  MeetingAgendaSchema,
  type AgendaPhase,
  type MeetingAgenda,
  type MeetingAgendaQueue
} from "../contracts/meeting-agenda.js";
import { ContractAgentIdSchema, VentureIdSchema } from "../contracts/common.js";
import { configRoot } from "../paths.js";
import { atomicWriteJson, readJson } from "../state.js";

export const MEETING_AGENDA_PATH = "meeting-agendas/queue.json";

const MeetingPolicySchema = z.object({
  schemaVersion: z.literal("meeting-policy/1"),
  agendaRequiredPhases: z.array(AgendaPhaseSchema),
  changeTriggeredPhases: z.array(AgendaPhaseSchema),
  servicePhases: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)),
  transitions: z.record(
    z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    z.array(AgendaPhaseSchema).max(8)
  ),
  maxPending: z.number().int().min(1).max(100),
  perVenturePendingCap: z.number().int().min(1).max(24),
  maxRequestsPerMeeting: z.literal(1),
  ttlDays: z.number().int().min(1).max(14)
}).superRefine((policy, context) => {
  const overlap = policy.agendaRequiredPhases.filter((phase) =>
    policy.changeTriggeredPhases.includes(phase)
  );
  if (overlap.length > 0) {
    context.addIssue({
      code: "custom",
      message: `Meeting phases cannot be both agenda-required and change-triggered: ${overlap.join(", ")}`,
      path: ["changeTriggeredPhases"]
    });
  }
});

export type MeetingPolicy = z.infer<typeof MeetingPolicySchema>;

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function expired(queue: MeetingAgendaQueue, now: Date): MeetingAgendaQueue {
  const at = now.getTime();
  return MeetingAgendaQueueSchema.parse({
    ...queue,
    agendas: queue.agendas.map((agenda) =>
      agenda.status === "pending" && Date.parse(agenda.expiresAt) < at
        ? { ...agenda, status: "expired" as const }
        : agenda
    ),
    updatedAt: now.toISOString()
  });
}

export async function loadMeetingPolicy(
  filePath = path.join(configRoot, "meeting-policy.json")
): Promise<MeetingPolicy> {
  return MeetingPolicySchema.parse(JSON.parse(await readFile(filePath, "utf8")));
}

export function phaseNeedsAgenda(policy: MeetingPolicy, phase: string): phase is AgendaPhase {
  return policy.agendaRequiredPhases.includes(phase as AgendaPhase);
}

export function phaseWakesOnChange(policy: MeetingPolicy, phase: string): phase is AgendaPhase {
  return policy.changeTriggeredPhases.includes(phase as AgendaPhase);
}

export function mayRequestMeeting(
  policy: MeetingPolicy,
  sourcePhase: string,
  targetPhase: AgendaPhase
): boolean {
  return (policy.transitions[sourcePhase] ?? []).includes(targetPhase);
}

export async function readMeetingAgendaQueue(
  root: string,
  now = new Date()
): Promise<MeetingAgendaQueue> {
  const queue = await readJson<unknown>(root, MEETING_AGENDA_PATH, {
    schemaVersion: "meeting-agenda-queue/1",
    agendas: [],
    updatedAt: now.toISOString()
  });
  return expired(MeetingAgendaQueueSchema.parse(queue), now);
}

export function dueMeetingAgenda(
  queue: MeetingAgendaQueue,
  phase: AgendaPhase,
  date: string
): MeetingAgenda | null {
  return queue.agendas
    .filter((agenda) =>
      agenda.status === "pending" &&
      agenda.phase === phase &&
      agenda.notBefore <= date &&
      Date.parse(agenda.expiresAt) >= Date.parse(`${date}T00:00:00.000Z`)
    )
    .sort((left, right) => left.requestedAt.localeCompare(right.requestedAt))[0] ?? null;
}

export function nextAgendaDate(input: {
  currentDate: string;
  currentHour: number;
  targetHour: number;
}): string {
  return input.targetHour > input.currentHour
    ? input.currentDate
    : addDays(input.currentDate, 1);
}

export async function requestMeetingAgenda(input: {
  root: string;
  policy: MeetingPolicy;
  ventureId: string;
  phase: AgendaPhase;
  requestedBy: string;
  sourcePhase: string;
  sourceMeetingRef: string;
  summary: string;
  evidenceRefs?: string[];
  notBefore: string;
  now: Date;
}): Promise<{ agenda: MeetingAgenda; created: boolean }> {
  if (!mayRequestMeeting(input.policy, input.sourcePhase, input.phase)) {
    throw new Error(`${input.sourcePhase} may not schedule ${input.phase}`);
  }
  const queue = await readMeetingAgendaQueue(input.root, input.now);
  const existing = queue.agendas.find((agenda) =>
    agenda.status === "pending" &&
    agenda.phase === input.phase &&
    agenda.notBefore === input.notBefore
  );
  if (existing) return { agenda: existing, created: false };
  const pending = queue.agendas.filter((agenda) => agenda.status === "pending");
  if (pending.length >= input.policy.maxPending) {
    throw new Error(`Meeting agenda queue reached its ${input.policy.maxPending}-item pending limit`);
  }
  const venturePending = pending.filter((agenda) => agenda.ventureId === input.ventureId);
  if (venturePending.length >= input.policy.perVenturePendingCap) {
    throw new Error(`Venture ${input.ventureId} reached its ${input.policy.perVenturePendingCap}-item pending limit`);
  }
  const requestedAt = input.now.toISOString();
  const id = `agenda-${createHash("sha256")
    .update(`${input.sourceMeetingRef}\n${input.phase}\n${input.notBefore}`)
    .digest("hex")
    .slice(0, 16)}`;
  const agenda = MeetingAgendaSchema.parse({
    schemaVersion: "meeting-agenda/1",
    id,
    ventureId: VentureIdSchema.parse(input.ventureId),
    phase: input.phase,
    requestedBy: ContractAgentIdSchema.parse(input.requestedBy),
    sourcePhase: input.sourcePhase,
    sourceMeetingRef: input.sourceMeetingRef,
    summary: input.summary,
    evidenceRefs: [...new Set(input.evidenceRefs ?? [])].slice(0, 12),
    requestedAt,
    notBefore: input.notBefore,
    expiresAt: `${addDays(input.notBefore, input.policy.ttlDays)}T23:59:59.000Z`,
    status: "pending"
  });
  await atomicWriteJson(input.root, MEETING_AGENDA_PATH, MeetingAgendaQueueSchema.parse({
    schemaVersion: "meeting-agenda-queue/1",
    agendas: [...queue.agendas, agenda],
    updatedAt: requestedAt
  }));
  return { agenda, created: true };
}

export interface StarvationEntry {
  ventureId: string;
  lastConsumedAt: string | null;
  daysWithoutConsumedAgenda: number | null;
}

export function starvationList(input: {
  queue: MeetingAgendaQueue;
  ventureIds: readonly string[];
  now: Date;
  thresholdDays?: number;
}): StarvationEntry[] {
  const thresholdDays = input.thresholdDays ?? 7;
  const thresholdMs = thresholdDays * 86_400_000;
  return [...new Set(input.ventureIds)].sort().flatMap((ventureId) => {
    const lastConsumedAt = input.queue.agendas
      .filter((agenda) => agenda.ventureId === ventureId && agenda.status === "consumed" && agenda.consumedAt)
      .map((agenda) => agenda.consumedAt!)
      .sort()
      .at(-1) ?? null;
    if (lastConsumedAt && input.now.getTime() - Date.parse(lastConsumedAt) < thresholdMs) return [];
    return [{
      ventureId,
      lastConsumedAt,
      daysWithoutConsumedAgenda: lastConsumedAt
        ? Math.floor((input.now.getTime() - Date.parse(lastConsumedAt)) / 86_400_000)
        : null
    }];
  });
}

export async function consumeMeetingAgenda(input: {
  root: string;
  agendaId: string;
  cycleId: string;
  now: Date;
}): Promise<void> {
  const queue = await readMeetingAgendaQueue(input.root, input.now);
  let found = false;
  const agendas = queue.agendas.map((agenda) => {
    if (agenda.id !== input.agendaId) return agenda;
    found = true;
    if (agenda.status === "consumed" && agenda.consumedBy === input.cycleId) return agenda;
    if (agenda.status !== "pending") {
      throw new Error(`Meeting agenda ${agenda.id} is ${agenda.status}, not pending`);
    }
    return MeetingAgendaSchema.parse({
      ...agenda,
      status: "consumed",
      consumedBy: input.cycleId,
      consumedAt: input.now.toISOString()
    });
  });
  if (!found) throw new Error(`Unknown meeting agenda ${input.agendaId}`);
  await atomicWriteJson(input.root, MEETING_AGENDA_PATH, MeetingAgendaQueueSchema.parse({
    schemaVersion: "meeting-agenda-queue/1",
    agendas,
    updatedAt: input.now.toISOString()
  }));
}
