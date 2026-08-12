import { readFile } from "node:fs/promises";
import path from "node:path";
import { MeetingRecordSchema } from "../../contracts/meeting-record.js";
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
import type { Stage } from "../../types.js";
import type { CycleResult } from "../../cycle/types.js";

const NO_MONITOR_DATA = "No monitor data was available, so the desk recorded an honest quiet outcome.";

/**
 * Phase A proof for a room whose monitor does not exist yet.
 *
 * This is intentionally not the desk runner. It makes no provider call, reads no external source
 * and creates no recommendation. KV-12 replaces this dispatch with the real fixture/live runner;
 * until then the only successful invocation is an explicit dry run and its whole ledger is zero.
 */
export async function runKvorumScaffoldDryCycle(input: {
  cycleId: string;
  now: Date;
  root?: string;
}): Promise<CycleResult> {
  const root = input.root ?? path.join(repoRoot, "tmp", "dry-run", "state");
  const date = pragueClockParts(input.now).date;
  const closedAt = new Date(input.now.getTime() + 1).toISOString();
  const stages = JSON.parse(await readFile(path.join(configRoot, "stages.json"), "utf8")) as { current: Stage };
  const meetingPath = `meetings/${date}-kv-desk.json`;
  const decisionPath = `decisions/${input.cycleId}.json`;
  const scorecardPath = `scorecards/${input.cycleId}.json`;
  const record = MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.cycleId,
    date,
    phase: "kv-desk",
    kind: "kv-desk",
    fixture: true,
    status: "NO_ACTION",
    stage: stages.current,
    operatingBrief: "Check the fixture monitor and choose one sourced recommendation or record a quiet day.",
    participantReasons: [
      { agent: "TRIBUN", reason: "TRIBUN would chair the recommendation desk if monitor data existed.", participated: false },
      { agent: "HACEK", reason: "HACEK would check the Czech register if a draft existed.", participated: false },
      { agent: "AUDIT", reason: "AUDIT would retain the truth veto if a draft existed.", participated: false }
    ],
    ledger: {
      estimatedCycleUsd: 0,
      actualCycleUsd: 0,
      monthAllInUsd: 0,
      monthCapUsd: 30
    },
    decision: { outcome: "NO_ACTION", summary: NO_MONITOR_DATA, evidenceRefs: [] },
    proposals: [],
    voteMatrix: [],
    tasks: [],
    growthPlan: "Nothing was drafted or authorized. No source, provider, publisher, account or channel was touched.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: input.now.toISOString(),
      closedAt,
      gavel: "TRIBUN",
      setting: "The fixture monitor was empty. External sourcing and model calls remained disabled.",
      turns: [{ agent: "TRIBUN", mode: "close", sentAt: closedAt, text: NO_MONITOR_DATA }]
    },
    generatedAt: closedAt
  });
  const priorRecords = await loadMeetingRecords(root);
  const calendarPath = await writeCalendarFeed(root, buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords, record],
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now: input.now
  }));
  await Promise.all([
    atomicWriteJson(root, meetingPath, record),
    atomicWriteJson(root, decisionPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId: input.cycleId,
      phase: "kv-desk",
      outcome: "NO_ACTION",
      summary: NO_MONITOR_DATA,
      evidenceRefs: [],
      generatedAt: closedAt
    }),
    atomicWriteJson(root, scorecardPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId: input.cycleId,
      phase: "kv-desk",
      estimatedWorstCaseUsd: 0,
      actualUsd: 0,
      participants: [],
      schedulerOutcome: "not-needed",
      generatedAt: closedAt
    })
  ]);
  return {
    cycleId: input.cycleId,
    phase: "kv-desk",
    dry: true,
    status: "dry_complete",
    decision: "NO_ACTION",
    estimatedWorstCaseUsd: 0,
    selectedAgents: [],
    skippedAgents: ["TRIBUN", "HACEK", "AUDIT"],
    artifacts: [meetingPath, decisionPath, scorecardPath, calendarPath]
      .map((artifact) => path.relative(repoRoot, path.join(root, artifact)))
  };
}
