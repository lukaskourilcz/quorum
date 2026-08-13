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
import type { guardedJsonCall } from "../../llm/call.js";
import { loadTehdejsiFacts } from "./facts.js";
import { runTehdejsiPipelineDay, type TehdejsiPipelineOutcome } from "./pipeline.js";
import { buildShortlist } from "./scorer.js";
import { readTehdejsiGoViralContext } from "./goviral.js";
import { runSundaySignalOverlay } from "./signals.js";
import { readTehdejsiPerformanceWeights, runSundayPerformanceOverlay } from "./performance.js";
import {
  applyTehdejsiCycleDay,
  createTehdejsiCycle,
  readTehdejsiCycle,
  tehdejsiCycleComplete,
  writeTehdejsiCycle
} from "./state.js";
import type { CycleResult } from "../../cycle/types.js";
import type { Stage } from "../../types.js";

const FOUNDING_DECISION_PATH = "decisions/2026-08-12-tehdejsi-svet-founding.md";
const TEHDEJSI_SVET_CAST = ["LETOPIS", "VERBA", "QUILL", "HACEK", "AUDIT"] as const;

export interface TehdejsiSvetCycleInput {
  executionCycleId: string;
  dry: boolean;
  now: Date;
  root?: string;
  /** A labelled fixture seam. Dry runs may exercise the full pipeline only through this call. */
  call?: typeof guardedJsonCall;
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
 * The room's honest checkpoint while owner authority is absent.
 *
 * The venture is registered, so the clock dispatches this phase every evening. A missing
 * countersignature keeps every paid editorial action closed. The desk may rank the committed
 * facts for review, but it cannot advance planning without the canonical brief that LETOPIS
 * writes. This checkpoint records that hold and costs $0.
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
    "The Tehdejsi svet desk remains behind its owner countersignature. "
    + "The free shortlist may be recorded, but no brief, copy, render or publication was created and nothing was spent.";
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
      "Hold the Tehdejsi svet slot without pretending paid editorial work ran. The founding "
      + "decision is pending countersignature.",
    participantReasons: TEHDEJSI_SVET_CAST.map((agent) => ({
      agent,
      reason: "Registered for the desk but not called while the owner countersignature is absent; the slot costs $0.",
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
      summary: "Resume the current Tehdejsi svet phase after the owner countersigns the founding decision.",
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

function buildActiveRecord(input: {
  executionCycleId: string;
  date: string;
  now: Date;
  stage: Stage;
  outcome: TehdejsiPipelineOutcome | null;
  failure: string | null;
  failurePhase: "planning" | "production" | null;
  actualCycleUsd: number;
  monthAllInUsd: number;
  monthCapUsd: number;
  overlayArtifacts: string[];
  dry: boolean;
}): MeetingRecord {
  const closedAt = new Date(input.now.getTime() + 1).toISOString();
  const phase = input.outcome?.phase ?? input.failurePhase ?? "planning";
  const status = input.outcome?.status ?? "PAUSED";
  const completed = input.outcome?.completed ?? false;
  const summary = input.outcome?.summary
    ?? `The ${phase} phase stopped and will resume. ${input.failure ?? "No draft was stored."}`;
  const evidenceRefs = [FOUNDING_DECISION_PATH, ...(input.outcome?.artifacts ?? []), ...input.overlayArtifacts];
  const participants = new Set(input.outcome?.participants ?? []);
  return MeetingRecordSchema.parse({
    schemaVersion: "meeting-record/2",
    cycleId: input.executionCycleId,
    date: input.date,
    phase: "ts-desk",
    kind: "ts-desk",
    fixture: input.dry,
    status,
    stage: input.stage,
    operatingBrief: `Run the recorded ${phase} phase. A phase advances only after its artifacts are durable.`,
    participantReasons: TEHDEJSI_SVET_CAST.map((agent) => ({
      agent,
      reason: participants.has(agent as "LETOPIS" | "VERBA")
        ? input.dry
          ? `Contributed to the ${phase} phase through a labelled deterministic fixture response.`
          : `Contributed to the ${phase} phase through the guarded editorial call.`
        : `Held the ${phase} seat; no separate call was required.`,
      participated: participants.has(agent as "LETOPIS" | "VERBA")
    })),
    ledger: {
      estimatedCycleUsd: 0.25,
      actualCycleUsd: input.actualCycleUsd,
      monthAllInUsd: input.monthAllInUsd,
      monthCapUsd: input.monthCapUsd
    },
    decision: { outcome: completed ? "ADVANCE" : "RESUME", summary, evidenceRefs },
    proposals: [{ agent: "LETOPIS", summary, evidenceRefs }],
    voteMatrix: [{ voter: "AUDIT", firstChoice: completed ? "ADVANCE" : "RESUME", veto: false }],
    tasks: [{
      id: `TASK-${input.executionCycleId}-${phase.toUpperCase()}`,
      owner: phase === "production" ? "VERBA" : "LETOPIS",
      summary: completed ? `Record completion of the ${phase} phase.` : `Resume the ${phase} phase at the next sitting.`,
      status: completed ? "done" : "blocked"
    }],
    growthPlan: "No public action is authorized. Every feature remains a draft for owner review and manual posting.",
    eveningOutcome: null,
    roomTranscript: {
      openedAt: input.now.toISOString(),
      closedAt,
      gavel: "LETOPIS",
      setting: "The guarded Tehdejsi svet editorial desk. It has no channel, account or posting capability.",
      turns: [{ agent: "LETOPIS", mode: "close", sentAt: closedAt, text: summary }]
    },
    generatedAt: closedAt
  });
}

function failureMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/(?:\/[A-Za-z0-9._-]+){2,}/gu, "[private path]").slice(0, 500);
}

async function signalsApprovalGranted(root: string): Promise<boolean> {
  const inbox = await readFile(path.join(root, "INBOX.md"), "utf8").catch(() => "");
  return /^- \[[xX]\] HUMAN_APPROVAL TS-RESULTS-005\b/mu.test(inbox);
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
  const ownerAllowed = !input.dry && (
    process.env.PORTFOLIO_LIVE_ENABLED === "true" &&
    signedOwnerDecision(await readFile(path.join(stateRoot, FOUNDING_DECISION_PATH), "utf8")) === "countersigned"
  );
  // A dry proof may walk the real join only when the caller supplies a labelled fixture call.
  // This keeps the ordinary CLI dry path and every closed live path incapable of a paid call.
  const pipelineAllowed = ownerAllowed || (input.dry && input.call !== undefined);
  const liveAllowed = input.dry || ownerAllowed;
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

  const spentBefore = input.dry ? 0 : await monthSpend(root, date);
  let outcome: TehdejsiPipelineOutcome | null = null;
  let failure: string | null = null;
  let failurePhase: "planning" | "production" | null = null;
  let phaseArtifacts: string[] = [];
  let overlayArtifacts: string[] = [];
  if (pipelineAllowed) {
    const current = await readTehdejsiCycle(root);
    failurePhase = current?.phase ?? "planning";
    try {
      outcome = await runTehdejsiPipelineDay({
        root,
        executionCycleId: input.executionCycleId,
        date,
        now: input.now,
        stage,
        ...(input.call ? { call: input.call } : {})
      });
      phaseArtifacts = outcome.artifacts;
    } catch (error) {
      failure = failureMessage(error);
      const cycle = await readTehdejsiCycle(root);
      if (cycle && !tehdejsiCycleComplete(cycle)) {
        phaseArtifacts.push(await writeTehdejsiCycle(root, applyTehdejsiCycleDay({
          cycle,
          date,
          now: input.now,
          outcome: { completed: false, pressure: "review-required" }
        })));
      }
    }
    const approvalGranted = await signalsApprovalGranted(root);
    overlayArtifacts = [
      ...await runSundaySignalOverlay({ root, date, now: input.now, approvalGranted }),
      ...await runSundayPerformanceOverlay({ root, date, now: input.now, approvalGranted })
    ];
    phaseArtifacts.push(...overlayArtifacts);
  } else {
    phaseArtifacts = await holdPausedCycle({ root, date, now: input.now });
  }
  const spentAfter = input.dry ? 0 : await monthSpend(root, date);
  const actualCycleUsd = Number(Math.max(0, spentAfter - spentBefore).toFixed(8));
  const record = ownerAllowed
    ? buildActiveRecord({
        executionCycleId: input.executionCycleId,
        date,
        now: input.now,
        stage,
        outcome,
        failure,
        failurePhase,
        actualCycleUsd,
        monthAllInUsd: spentAfter,
        monthCapUsd: limits.monthlyOperatingUsd,
        overlayArtifacts,
        dry: input.dry
      })
    : buildCheckpointRecord({
        executionCycleId: input.executionCycleId,
        date,
        now: input.now,
        stage,
        dry: input.dry,
        monthAllInUsd: spentAfter,
        monthCapUsd: limits.monthlyOperatingUsd
      });

  const decisionPath = `decisions/${input.executionCycleId}.json`;
  const scorecardPath = `scorecards/${input.executionCycleId}.json`;
  await atomicWriteJson(root, decisionPath, {
    schemaVersion: 1,
    fixture: input.dry,
    cycleId: input.executionCycleId,
    phase: "ts-desk",
    outcome: record.decision.outcome,
    summary: record.decision.summary,
    evidenceRefs: record.decision.evidenceRefs,
    generatedAt: record.generatedAt
  });
  await atomicWriteJson(root, scorecardPath, {
    schemaVersion: 1,
    fixture: input.dry,
    cycleId: input.executionCycleId,
    phase: "ts-desk",
    estimatedCycleUsd: record.ledger.estimatedCycleUsd,
    actualCycleUsd: record.ledger.actualCycleUsd,
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
    status: pipelineAllowed
      ? input.dry
        ? outcome?.completed ? "dry_complete" : "paused"
        : outcome?.completed ? "live_complete" : "paused"
      : "paused",
    decision: pipelineAllowed ? (outcome?.status ?? "PAUSED") : "PAUSED",
    estimatedWorstCaseUsd: pipelineAllowed ? 0.25 : 0,
    selectedAgents: outcome?.participants ?? [],
    skippedAgents: TEHDEJSI_SVET_CAST.filter((agent) => !(outcome?.participants ?? []).includes(agent as "LETOPIS" | "VERBA")),
    artifacts: [decisionPath, scorecardPath, meetingPath, ...phaseArtifacts]
      .map((relative) => artifactPath(root, relative))
  };
}

/**
 * Read the facts and record today's free ranking while paid work is closed.
 *
 * Planning stays active. Advancing it would claim a canonical brief exists when LETOPIS was never
 * called. A missing or unreadable facts file costs the shortlist and nothing else.
 */
async function holdPausedCycle(input: {
  root: string;
  date: string;
  now: Date;
}): Promise<string[]> {
  try {
    const facts = await loadTehdejsiFacts();
    const [existing, goViral, performance] = await Promise.all([
      readTehdejsiCycle(input.root),
      readTehdejsiGoViralContext(input.root, input.date),
      readTehdejsiPerformanceWeights(input.root)
    ]);
    const cycle = existing === null || tehdejsiCycleComplete(existing)
      ? createTehdejsiCycle({ date: input.date, now: input.now })
      : existing;

    const written: string[] = [];
    if (cycle.phase === "planning") {
      const shortlist = buildShortlist({
        facts: facts.facts,
        factsHash: facts.contentHash,
        date: input.date,
        goViral,
        performanceWeights: performance.dimensions
      });
      const shortlistPath = `ventures/tehdejsi-svet/shortlists/${input.date}.json`;
      await atomicWriteJson(input.root, shortlistPath, shortlist);
      written.push(shortlistPath);
      written.push(await writeTehdejsiCycle(input.root, applyTehdejsiCycleDay({
        cycle,
        date: input.date,
        now: input.now,
        outcome: { completed: false, pressure: "review-required" }
      })));
      return written;
    }
    // Production is the sitting that would write, and writing is what the pause withholds.
    written.push(await writeTehdejsiCycle(input.root, applyTehdejsiCycleDay({
      cycle,
      date: input.date,
      now: input.now,
      outcome: { completed: false, pressure: "review-required" }
    })));
    return written;
  } catch {
    return [];
  }
}
