import { readFile } from "node:fs/promises";
import path from "node:path";
import { MeetingRecordSchema, type MeetingRecord } from "../../contracts/meeting-record.js";
import {
  buildCalendarFeed,
  loadArticleSlotOutcomes,
  loadMeetingRecords,
  loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "../../meetings/calendar.js";
import { pragueClockParts } from "../../meetings/clock.js";
import { configRoot, repoRoot, stateRoot } from "../../paths.js";
import { loadRuntimeBudgetLimits } from "../../portfolio/limits.js";
import { signedOwnerDecision } from "../../portfolio/schedule.js";
import { atomicWriteJson, readJson } from "../../state.js";
import type { CycleResult } from "../../cycle/types.js";
import type { Stage } from "../../types.js";
import { readBhSeedLibrary } from "./seed.js";
import { buildBhShortlist, writeBhShortlist } from "./shortlist.js";
import {
  applyBooksofHistoryCycleDay,
  booksofHistoryCycleComplete,
  BOOKSOFHISTORY_CYCLE_PATH,
  createBooksofHistoryCycle,
  readBooksofHistoryCycle,
  writeBooksofHistoryCycle
} from "./state.js";

const FOUNDING_DECISION_PATH = "decisions/2026-08-12-booksofhistory-founding.md";
const BOOKSOFHISTORY_CAST = ["FOLIO", "PLOT", "QUILL", "HACEK", "AUDIT"] as const;

function artifactPath(root: string, relative: string): string {
  return path.relative(repoRoot, path.join(root, relative));
}

function phaseSummary(phase: "selection" | "research" | "production", completed: boolean): string {
  if (!completed) {
    return `The ${phase} phase remains current. No provider was called, nothing was published and this day cost $0.`;
  }
  const next = phase === "selection" ? "research" : phase === "research" ? "production" : "cycle completion";
  return `The labelled dry ${phase} fixture completed at $0 and advanced to ${next}.`;
}

function buildDayRecord(input: {
  executionCycleId: string;
  currentCycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  phase: "selection" | "research" | "production";
  completed: boolean;
  dry: boolean;
  monthAllInUsd: number;
  monthCapUsd: number;
  evidenceRefs?: string[];
}): MeetingRecord {
  const closedAt = new Date(input.now.getTime() + 1).toISOString();
  const summary = phaseSummary(input.phase, input.completed);
  const evidenceRefs = input.evidenceRefs ?? [BOOKSOFHISTORY_CYCLE_PATH];
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.executionCycleId,
    date: input.date,
    phase: "bh-desk",
    kind: "bh-desk",
    fixture: input.dry,
    status: input.completed ? "PLAN" : "PAUSED",
    stage: input.stage,
    operatingBrief: `Continue ${input.phase} for BOOKSOFHISTORY cycle ${input.currentCycleId}; a phase advances only when its work completes.`,
    participantReasons: BOOKSOFHISTORY_CAST.map((agent) => ({
      agent,
      reason: input.dry
        ? "Registered for the desk but not called; the state-machine fixture is deterministic and costs $0."
        : "Registered for the desk but not called while the implementation or owner gate keeps this phase paused.",
      participated: false
    })),
    ledger: {
      estimatedCycleUsd: 0,
      actualCycleUsd: 0,
      monthAllInUsd: input.monthAllInUsd,
      monthCapUsd: input.monthCapUsd
    },
    decision: { outcome: input.completed ? "ADVANCE" : "RESUME", summary, evidenceRefs },
    proposals: [{ agent: "FOLIO", summary, evidenceRefs }],
    voteMatrix: [{ voter: "AUDIT", firstChoice: input.completed ? "ADVANCE" : "RESUME", veto: false }],
    tasks: [{
      id: `TASK-${input.executionCycleId}-STATE`,
      owner: "FOLIO",
      summary: input.completed ? `Record completion of the ${input.phase} fixture.` : `Resume the ${input.phase} phase on the next working day.`,
      status: input.completed ? "done" : "blocked"
    }],
    growthPlan: "No public action is authorized. BOOKSOFHISTORY remains drafts-only and owner-posted.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: input.now.toISOString(),
      closedAt,
      gavel: "FOLIO",
      setting: "A deterministic cycle checkpoint. No model, research provider, account or social channel was touched.",
      turns: [{ agent: "FOLIO", mode: "close", sentAt: closedAt, text: summary }]
    },
    generatedAt: closedAt
  });
}

async function monthSpend(root: string, date: string): Promise<number> {
  const ledger = await readJson<{ entries?: Array<{ ts?: unknown; usd?: unknown }> }>(
    root,
    "budget/ledger.json",
    { entries: [] }
  );
  return Number((ledger.entries ?? []).reduce((sum, entry) =>
    typeof entry.ts === "string" && entry.ts.slice(0, 7) === date.slice(0, 7) && typeof entry.usd === "number"
      ? sum + entry.usd
      : sum, 0).toFixed(8));
}

export async function runBooksofHistoryCycle(input: {
  executionCycleId: string;
  dry: boolean;
  now: Date;
  root?: string;
}): Promise<CycleResult> {
  const date = pragueClockParts(input.now).date;
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp", "dry-run", "state") : stateRoot);
  const meetingPath = `meetings/${date}-bh-desk.json`;
  const prior = await readJson<unknown | null>(root, meetingPath, null);
  if (prior !== null && MeetingRecordSchema.safeParse(prior).success) {
    return {
      cycleId: input.executionCycleId,
      phase: "bh-desk",
      dry: input.dry,
      status: "already_recorded",
      decision: "NO_ACTION",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: [],
      alreadyRecordedAt: artifactPath(root, meetingPath)
    };
  }

  const [stage, limits] = await Promise.all([
    readFile(path.join(configRoot, "stages.json"), "utf8").then((raw) => (JSON.parse(raw) as { current: Stage }).current),
    loadRuntimeBudgetLimits()
  ]);
  const liveAllowed = input.dry || (
    process.env.PORTFOLIO_LIVE_ENABLED === "true" &&
    signedOwnerDecision(await readFile(path.join(stateRoot, FOUNDING_DECISION_PATH), "utf8")) === "countersigned"
  );
  // A manual invocation of a closed live room claims no calendar slot and writes no fictional meeting.
  if (!liveAllowed && process.env.MEETING_TRIGGER !== "schedule") {
    return {
      cycleId: input.executionCycleId,
      phase: "bh-desk",
      dry: false,
      status: "paused",
      decision: "PAUSED",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [...BOOKSOFHISTORY_CAST],
      artifacts: []
    };
  }

  let cycle = await readBooksofHistoryCycle(root);
  if (cycle === null || booksofHistoryCycleComplete(cycle)) {
    cycle = createBooksofHistoryCycle({ date, now: input.now });
  }
  const workedPhase = cycle.phase;
  const completed = input.dry;
  const shortlistPath = workedPhase === "selection" && completed
    ? await writeBhShortlist(root, buildBhShortlist({
        date,
        cycleId: cycle.currentCycleId,
        asOf: input.now,
        books: (await readBhSeedLibrary(input.dry ? stateRoot : root)).books,
        context: {
          asOf: input.now,
          trendSignals: [],
          recentFeatures: [],
          lanePerformance: {},
          shelfStoriesByBookId: {}
        }
      }))
    : null;
  cycle = applyBooksofHistoryCycleDay({
    cycle,
    date,
    now: input.now,
    outcome: { completed, ...(!completed ? { pressure: "incomplete-phase" as const } : {}) }
  });

  const spent = input.dry ? 0 : await monthSpend(root, date);
  const record = buildDayRecord({
    executionCycleId: input.executionCycleId,
    currentCycleId: cycle.currentCycleId,
    date,
    now: input.now,
    stage,
    phase: workedPhase,
    completed,
    dry: input.dry,
    monthAllInUsd: spent,
    monthCapUsd: limits.monthlyOperatingUsd,
    evidenceRefs: [BOOKSOFHISTORY_CYCLE_PATH, ...(shortlistPath ? [shortlistPath] : [])]
  });
  const decisionPath = `decisions/${input.executionCycleId}.json`;
  const scorecardPath = `scorecards/${input.executionCycleId}.json`;
  const summary = phaseSummary(workedPhase, completed);
  await atomicWriteJson(root, decisionPath, {
    schemaVersion: 1,
    fixture: input.dry,
    cycleId: input.executionCycleId,
    phase: "bh-desk",
    editorialPhase: workedPhase,
    outcome: completed ? "ADVANCE" : "RESUME",
    summary,
    evidenceRefs: [BOOKSOFHISTORY_CYCLE_PATH],
    generatedAt: record.generatedAt
  });
  await atomicWriteJson(root, scorecardPath, {
    schemaVersion: 1,
    fixture: input.dry,
    cycleId: input.executionCycleId,
    phase: "bh-desk",
    editorialPhase: workedPhase,
    estimatedWorstCaseUsd: 0,
    actualUsd: 0,
    participants: [],
    schedulerOutcome: completed ? "completed" : "paused",
    generatedAt: record.generatedAt
  });
  await atomicWriteJson(root, meetingPath, record);
  await writeBooksofHistoryCycle(root, cycle);
  const calendarPath = await writeCalendarFeed(root, buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: await loadMeetingRecords(root),
    skips: await loadMeetingSkips(root),
    articleSlots: await loadArticleSlotOutcomes(root),
    now: input.now
  }));
  const artifacts = [meetingPath, decisionPath, scorecardPath, BOOKSOFHISTORY_CYCLE_PATH, calendarPath, ...(shortlistPath ? [shortlistPath] : [])]
    .map((relative) => artifactPath(root, relative));
  return {
    cycleId: input.executionCycleId,
    phase: "bh-desk",
    dry: input.dry,
    status: completed ? "dry_complete" : "paused",
    decision: completed ? "PLAN" : "PAUSED",
    estimatedWorstCaseUsd: 0,
    selectedAgents: [],
    skippedAgents: [...BOOKSOFHISTORY_CAST],
    artifacts
  };
}
