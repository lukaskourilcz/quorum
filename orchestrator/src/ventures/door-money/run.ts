import { readFile } from "node:fs/promises";
import path from "node:path";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";
import type { CycleResult } from "../../cycle/types.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  loadMeetingRecords,
  loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "../../meetings/calendar.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { configRoot, repoRoot } from "../../paths.js";
import { atomicWriteJson } from "../../state.js";
import type { RunnablePhase, Stage } from "../../types.js";
import {
  getVentureMeetingDefinition,
  loadVentureRegistry
} from "../registry.js";

export type DoorMoneyPhase = "dm-desk" | "dm-growth";

export function isDoorMoneyPhase(phase: RunnablePhase): phase is DoorMoneyPhase {
  return phase === "dm-desk" || phase === "dm-growth";
}

function isThursday(date: string): boolean {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay() === 4;
}

/**
 * The Phase A room is deliberately smaller than the real runners introduced later.
 *
 * It proves dispatch, record and calendar plumbing without reading a manuscript, inventing a
 * passage fixture before the ingestion contract exists, or making a provider call. The later
 * desk and growth tasks replace the truthful NO_ACTION reason with their bounded work.
 */
export async function runDoorMoneyDryCycle(input: {
  phase: DoorMoneyPhase;
  cycleId: string;
  now: Date;
}): Promise<CycleResult> {
  const date = pragueClockParts(input.now).date;
  const root = path.join(repoRoot, "tmp", "dry-run", "state");
  const [registry, stages] = await Promise.all([
    loadVentureRegistry(),
    readFile(path.join(configRoot, "stages.json"), "utf8")
      .then((raw) => JSON.parse(raw) as { current: Stage })
  ]);
  const { meeting } = getVentureMeetingDefinition(registry, input.phase);
  const growthOffDay = input.phase === "dm-growth" && !isThursday(date);
  const summary = growthOffDay
    ? "$0 — this room meets on Thursdays. Nothing was spent and no action was taken."
    : input.phase === "dm-desk"
      ? "No recommendation was drafted: the Phase A dry room has no synthetic knowledge fixture yet. No book text was read."
      : "No action packet was drafted: the Phase A dry room has no synthetic agenda or owner results yet.";
  const selectedAgents = growthOffDay ? [] : [...meeting.cast];
  const skippedAgents = growthOffDay ? [...meeting.cast] : [];
  const openedAt = input.now.toISOString();
  const closedAt = new Date(input.now.getTime() + 1_000).toISOString();
  const chair = meeting.cast[0]!;
  const record = MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date,
    phase: input.phase,
    kind: input.phase,
    fixture: true,
    status: "NO_ACTION",
    stage: stages.current,
    operatingBrief: meeting.packet.objectives.dry,
    participantReasons: meeting.cast.map((agent) => ({
      agent,
      reason: growthOffDay
        ? "registered for the room but not asked anything because the room meets on Thursdays"
        : "registered for the deterministic Phase A dry room",
      participated: !growthOffDay
    })),
    ledger: {
      estimatedCycleUsd: meeting.envelopeUsd,
      actualCycleUsd: 0,
      monthAllInUsd: 0,
      monthCapUsd: 30
    },
    decision: { outcome: "NO_ACTION", summary, evidenceRefs: [] },
    proposals: [],
    voteMatrix: growthOffDay
      ? []
      : meeting.cast.map((voter) => ({ voter, firstChoice: "NO_ACTION", veto: false })),
    tasks: [],
    growthPlan: "Nothing was published, posted, scheduled, bought or sent; no account or channel was touched and no spend was authorized.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt,
      closedAt,
      gavel: chair,
      setting: growthOffDay
        ? "The Thursday gate closed this fixture room before any seat was called."
        : "Deterministic Phase A fixture. No manuscript, provider or external system was read or called.",
      turns: [{ agent: chair, mode: "close", sentAt: closedAt, text: summary }]
    },
    generatedAt: closedAt
  });
  const meetingPath = `meetings/${date}-${input.phase}.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const priorRecords = await loadMeetingRecords(root);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords, record],
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now: input.now
  });
  const [, , , calendarPath] = await Promise.all([
    atomicWriteJson(root, meetingPath, record),
    atomicWriteJson(root, decisionPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId: input.cycleId,
      phase: input.phase,
      outcome: "NO_ACTION",
      summary,
      evidenceRefs: [],
      generatedAt: closedAt
    }),
    atomicWriteJson(root, scorecardPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId: input.cycleId,
      phase: input.phase,
      estimatedWorstCaseUsd: meeting.envelopeUsd,
      actualUsd: 0,
      participants: selectedAgents,
      generatedAt: closedAt
    }),
    writeCalendarFeed(root, calendar)
  ]);
  const artifacts = [meetingPath, decisionPath, scorecardPath, calendarPath]
    .map((relative) => path.relative(repoRoot, path.join(root, relative)));
  return {
    cycleId: input.cycleId,
    phase: input.phase,
    dry: true,
    status: "dry_complete",
    decision: "NO_ACTION",
    estimatedWorstCaseUsd: meeting.envelopeUsd,
    selectedAgents,
    skippedAgents,
    artifacts
  };
}
