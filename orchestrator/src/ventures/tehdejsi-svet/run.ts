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

const FOUNDING_DECISION_PATH = "decisions/2026-08-12-tehdejsi-svet-founding.md";
const TEHDEJSI_SVET_CAST = ["LETOPIS", "VERBA", "QUILL", "HACEK", "AUDIT"] as const;

export interface TehdejsiSvetCycleInput {
  executionCycleId: string;
  dry: boolean;
  now: Date;
  root?: string;
}

function artifactPath(root: string, relative: string): string {
  return path.relative(repoRoot, path.join(root, relative));
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

/**
 * The room's honest checkpoint while its editorial pipeline is still being built.
 *
 * The venture is registered, so the clock dispatches this phase every evening. Until the desk
 * itself exists there is nothing to advance, and the one thing this must never do is fail: a
 * scheduled phase that throws takes the whole daily cycle red, which is how the council lost
 * three days in August. It records a $0 checkpoint that says plainly what has not been built,
 * and it calls no model, reads no product data and touches no channel.
 */
function buildCheckpointRecord(input: {
  executionCycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  dry: boolean;
  monthAllInUsd: number;
  monthCapUsd: number;
}): MeetingRecord {
  const closedAt = new Date(input.now.getTime() + 1).toISOString();
  const summary =
    "The Tehdejsi svet desk is registered and its editorial pipeline is not built yet. "
    + "Nothing was selected, written or rendered, and nothing was spent.";
  const evidenceRefs = [FOUNDING_DECISION_PATH];
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.executionCycleId,
    date: input.date,
    phase: "ts-desk",
    kind: "ts-desk",
    fixture: input.dry,
    status: "PAUSED",
    stage: input.stage,
    operatingBrief:
      "Hold the Tehdejsi svet slot open without pretending a desk ran. The founding decision is "
      + "pending countersignature and the editorial pipeline is still being implemented.",
    participantReasons: TEHDEJSI_SVET_CAST.map((agent) => ({
      agent,
      reason: "Registered for the desk but not called; the room has no pipeline to run yet and costs $0.",
      participated: false
    })),
    ledger: {
      estimatedCycleUsd: 0,
      actualCycleUsd: 0,
      monthAllInUsd: input.monthAllInUsd,
      monthCapUsd: input.monthCapUsd
    },
    decision: { outcome: "RESUME", summary, evidenceRefs },
    proposals: [{ agent: "LETOPIS", summary, evidenceRefs }],
    voteMatrix: [{ voter: "AUDIT", firstChoice: "RESUME", veto: false }],
    tasks: [{
      id: `TASK-${input.executionCycleId}-PIPELINE`,
      owner: "LETOPIS",
      summary: "Build the Tehdejsi svet editorial pipeline before this room can advance anything.",
      status: "blocked"
    }],
    growthPlan: "No public action is authorized. Tehdejsi svet remains drafts-only and owner-posted.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: input.now.toISOString(),
      closedAt,
      gavel: "LETOPIS",
      setting:
        "A deterministic checkpoint. No model, product data, account or social channel was touched.",
      turns: [{ agent: "LETOPIS", mode: "close", sentAt: closedAt, text: summary }]
    },
    generatedAt: closedAt
  });
}

export async function runTehdejsiSvetCycle(input: TehdejsiSvetCycleInput): Promise<CycleResult> {
  const { date } = pragueClockParts(input.now);
  const root = input.root ?? (input.dry ? path.join(repoRoot, "tmp/dry-run/state") : stateRoot);

  const meetingPath = `meetings/${date}-ts-desk.json`;
  const prior = await readJson<unknown | null>(root, meetingPath, null);
  if (prior !== null && MeetingRecordSchema.safeParse(prior).success) {
    return {
      cycleId: input.executionCycleId,
      phase: "ts-desk",
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
    readFile(path.join(configRoot, "stages.json"), "utf8")
      .then((raw) => (JSON.parse(raw) as { current: Stage }).current),
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
      phase: "ts-desk",
      dry: false,
      status: "paused",
      decision: "PAUSED",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [...TEHDEJSI_SVET_CAST],
      artifacts: []
    };
  }

  const spent = input.dry ? 0 : await monthSpend(root, date);
  const record = buildCheckpointRecord({
    executionCycleId: input.executionCycleId,
    date,
    now: input.now,
    stage,
    dry: input.dry,
    monthAllInUsd: spent,
    monthCapUsd: limits.monthlyOperatingUsd
  });

  const decisionPath = `decisions/${input.executionCycleId}.json`;
  const scorecardPath = `scorecards/${input.executionCycleId}.json`;
  await atomicWriteJson(root, decisionPath, {
    schemaVersion: 1,
    fixture: input.dry,
    cycleId: input.executionCycleId,
    phase: "ts-desk",
    outcome: "RESUME",
    summary: record.decision.summary,
    evidenceRefs: record.decision.evidenceRefs,
    generatedAt: record.generatedAt
  });
  await atomicWriteJson(root, scorecardPath, {
    schemaVersion: 1,
    fixture: input.dry,
    cycleId: input.executionCycleId,
    phase: "ts-desk",
    estimatedCycleUsd: 0,
    actualCycleUsd: 0,
    generatedAt: record.generatedAt
  });
  await atomicWriteJson(root, meetingPath, record);

  const [records, skips, articleSlots] = await Promise.all([
    loadMeetingRecords(root),
    loadMeetingSkips(root),
    loadArticleSlotOutcomes(root)
  ]);
  await writeCalendarFeed(root, buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records,
    skips,
    articleSlots,
    now: input.now
  }));

  return {
    cycleId: input.executionCycleId,
    phase: "ts-desk",
    dry: input.dry,
    status: "paused",
    decision: "PAUSED",
    estimatedWorstCaseUsd: 0,
    selectedAgents: [],
    skippedAgents: [...TEHDEJSI_SVET_CAST],
    artifacts: [decisionPath, scorecardPath, meetingPath].map((relative) => artifactPath(root, relative))
  };
}
