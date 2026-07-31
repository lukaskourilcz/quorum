import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_BUDGET_LIMITS,
  estimateTextCall,
  type BudgetLimits,
  type ReserveContext
} from "./budget.js";
import { loadRoutingConfig, routeBoardroom } from "./boardroom/router.js";
import { configRoot, repoRoot, stateRoot } from "./paths.js";
import {
  parseEvidenceJsonl
} from "./research/evidence.js";
import {
  OpportunitySchema,
  selectOpportunity,
  type OpportunityGate
} from "./research/opportunities.js";
import { atomicWriteJson, withFileLock } from "./state.js";
import {
  buildCalendarFeed,
  loadMeetingRecords,
  mondayOfWeek,
  writeCalendarFeed
} from "./meetings/calendar.js";
import { isCaughtUpPhase } from "./meetings/clock.js";
import { createOfflineCaughtUpMeeting } from "./meetings/record.js";
import {
  buildMeetingEmail,
  MeetingEmailLogSink,
  sendMeetingEmail
} from "./notify/email.js";
import { collectLiveCouncil, createLiveStandup } from "./standup/live.js";
import { publicStandup } from "./standup/public.js";
import { createOfflineStandup } from "./standup/run.js";
import {
  getShiftDefinition,
  isShiftPhase
} from "./shifts.js";
import type { RunnablePhase, Stage } from "./types.js";

export interface CycleOptions {
  phase: RunnablePhase;
  dry: boolean;
  explainBudget: boolean;
  explainRouting: boolean;
  now?: Date;
}

export interface CycleResult {
  cycleId: string;
  phase: RunnablePhase;
  dry: boolean;
  status: "dry_complete" | "paused" | "live_complete" | "preflight_complete";
  decision:
    | "INSUFFICIENT_EVIDENCE"
    | "NO_ACTION"
    | "NO_EDITION"
    | "DEFER"
    | "PLAN"
    | "PAUSED";
  estimatedWorstCaseUsd: number;
  selectedAgents: string[];
  skippedAgents: string[];
  artifacts: string[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function envNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return parsed;
}

function budgetLimitsFromEnvironment(): BudgetLimits {
  return {
    ...DEFAULT_BUDGET_LIMITS,
    maxCycleUsd: envNumber(
      "MAX_CYCLE_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.maxCycleUsd
    ),
    caughtUpMeetingUsd: envNumber(
      "CU_MEETING_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.caughtUpMeetingUsd
    ),
    editionProductionUsd: envNumber(
      "EDITION_PRODUCTION_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.editionProductionUsd
    ),
    dailyUsd: envNumber("DAILY_BUDGET_USD", DEFAULT_BUDGET_LIMITS.dailyUsd),
    monthlyApiUsd: envNumber(
      "MONTHLY_BUDGET_USD",
      DEFAULT_BUDGET_LIMITS.monthlyApiUsd
    ),
    monthlyOperatingUsd: envNumber(
      "MONTHLY_OPERATING_CAP_USD",
      DEFAULT_BUDGET_LIMITS.monthlyOperatingUsd
    )
  };
}

function remainingScheduledCycles(now: Date): number {
  const endOfMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((endOfMonth - now.getTime()) / (8 * 60 * 60 * 1_000)));
}

async function runCaughtUpDryCycle(
  options: CycleOptions,
  cycleId: string,
  now: Date
): Promise<CycleResult> {
  if (!isCaughtUpPhase(options.phase)) {
    throw new Error(`Not a Caught Up phase: ${options.phase}`);
  }
  if (!options.dry) {
    throw new Error("Caught Up scheduled phases remain dry until the Phase 9 cutover");
  }
  const [routing, stages] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    )
  ]);
  const definition = options.phase === "cu-edition"
    ? {
        topicType: "edition" as const,
        objective: "Review the overnight digest and select one story or record NO_EDITION",
        decisionNeeded: "EDITION" as const,
        preset: "edition-room"
      }
    : {
        topicType: "product" as const,
        objective: "Review the morning Caught Up idea and record a ledger verdict",
        decisionNeeded: "IDEA_VERDICT" as const,
        preset: "product-room"
      };
  const estimatedWorstCaseUsd = budgetLimitsFromEnvironment().caughtUpMeetingUsd;
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: estimatedWorstCaseUsd,
    preset: definition.preset,
    now
  });
  const record = await createOfflineCaughtUpMeeting({
    cycleId,
    phase: options.phase,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: estimatedWorstCaseUsd
  });
  const artifactRoot = path.join(repoRoot, "tmp", "dry-run", "state");
  const meetingPath = `meetings/${record.date}-${options.phase}.json`;
  const decisionPath = `decisions/${cycleId}.json`;
  const scorecardPath = `scorecards/${cycleId}.json`;
  const priorRecords = await loadMeetingRecords(artifactRoot);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(record.date),
    records: [...priorRecords, record],
    now
  });
  const calendarPath = await writeCalendarFeed(artifactRoot, calendar);
  await Promise.all([
    atomicWriteJson(artifactRoot, meetingPath, record),
    atomicWriteJson(artifactRoot, decisionPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId,
      phase: options.phase,
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      evidenceRefs: record.decision.evidenceRefs,
      generatedAt: record.generatedAt
    }),
    atomicWriteJson(artifactRoot, scorecardPath, {
      schemaVersion: 1,
      fixture: true,
      cycleId,
      phase: options.phase,
      estimatedWorstCaseUsd,
      actualUsd: record.ledger.actualCycleUsd,
      participants: room.selectedParticipants.map((participant) => participant.agent),
      generatedAt: record.generatedAt
    })
  ]);
  const emailPayload = buildMeetingEmail({
    record,
    boardlessBaseUrl: "https://boardless.example"
  });
  const emailStatus = await sendMeetingEmail({
    payload: emailPayload,
    sink: new MeetingEmailLogSink(artifactRoot),
    stateRoot: artifactRoot,
    now
  });
  if (emailStatus !== "sent") {
    console.warn(`Meeting email log sink failed for ${emailPayload.meetingRef}`);
  }
  if (options.explainBudget) {
    console.log(JSON.stringify({ cycleId, callGraph: [], estimatedWorstCaseUsd }, null, 2));
  }
  if (options.explainRouting) {
    console.log(JSON.stringify({
      selected: room.selectedParticipants,
      skipped: room.skippedParticipants,
      caps: { rounds: room.maxRounds, turns: room.maxTurns, tokens: room.maxTotalTokens }
    }, null, 2));
  }
  const emailPath = `notify/email/${emailPayload.meetingRef.replaceAll("/", "-")}.json`;
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
    emailPath,
    "notify/health.json"
  ];
  return {
    cycleId,
    phase: options.phase,
    dry: true,
    status: "dry_complete",
    decision: options.phase === "cu-edition" ? "NO_EDITION" : "DEFER",
    estimatedWorstCaseUsd,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) =>
      path.relative(repoRoot, path.join(artifactRoot, artifact))
    )
  };
}

export async function runCycle(options: CycleOptions): Promise<CycleResult> {
  const now = options.now ?? new Date();
  const cycleId = `${now.toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${options.phase}`;
  if (await exists(path.join(stateRoot, "PAUSED"))) {
    return {
      cycleId,
      phase: options.phase,
      dry: options.dry,
      status: "paused",
      decision: "PAUSED",
      estimatedWorstCaseUsd: 0,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: []
    };
  }
  if (!options.dry && options.phase === "founding") {
    throw new Error("A live founding cycle is not permitted; Caught Up was adopted by owner decision");
  }
  if (isCaughtUpPhase(options.phase)) {
    return runCaughtUpDryCycle(options, cycleId, now);
  }
  if (options.phase !== "founding" && !isShiftPhase(options.phase)) {
    throw new Error(`Unsupported venture phase: ${options.phase}`);
  }
  const venturePhase = options.phase;
  const execute = async (): Promise<CycleResult> => {
    const modelConfig = JSON.parse(
      await readFile(path.join(configRoot, "models.json"), "utf8")
    ) as {
      roles: Record<
        string,
        {
          provider: "openai" | "anthropic";
          model: string;
          maxOutputTokens: number;
        }
      >;
    };
    const callRoles = ["VIZE", "FORGE", "PULSE", "AUDIT"];
    const callGraph = callRoles.map((role) => {
      const model = modelConfig.roles[role];
      if (!model) {
        throw new Error(`Missing model config for ${role}`);
      }
      return {
        role,
        model: model.model,
        estimate: estimateTextCall({
          provider: model.provider,
          model: model.model,
          promptChars: 8_000,
          maxOutputTokens: Math.min(model.maxOutputTokens, 400),
          at: now
        })
      };
    });
    const estimatedWorstCaseUsd = Number(
      callGraph
        .reduce((sum, call) => sum + call.estimate.estimatedUsd, 0)
        .toFixed(8)
    );
    const routing = await loadRoutingConfig(
      path.join(configRoot, "agent-routing.json")
    );
    const room = routeBoardroom(routing, {
      roomId: `ROOM-${cycleId.toUpperCase()}`,
      topicType: "council",
      objective:
        venturePhase === "founding"
          ? "Choose up to three evidence-backed operating tasks or NO_ACTION"
          : getShiftDefinition(venturePhase).objective,
      evidenceRefs: [],
      decisionNeeded: "NO_ACTION",
      riskTags: [],
      budgetImpactUsd: estimatedWorstCaseUsd,
      preset: venturePhase === "morning" ? "venture-morning" : "daily-standup",
      now
    });
    const stages = JSON.parse(
      await readFile(path.join(configRoot, "stages.json"), "utf8")
    ) as { current: Stage };
    const evidence = parseEvidenceJsonl(
      await readFile(path.join(stateRoot, "EVIDENCE.jsonl"), "utf8")
    );
    const opportunityState = JSON.parse(
      await readFile(path.join(stateRoot, "OPPORTUNITIES.json"), "utf8")
    ) as { opportunities: unknown[] };
    const opportunityGate: OpportunityGate = selectOpportunity(
      opportunityState.opportunities.map((value) =>
        OpportunitySchema.parse(value)
      ),
      evidence
    );
    const decision =
      venturePhase === "founding"
        ? opportunityGate.passed
          ? "NO_ACTION"
          : "INSUFFICIENT_EVIDENCE"
        : "NO_ACTION";
    const standup =
      options.dry || venturePhase === "founding"
        ? createOfflineStandup({
            cycleId,
            phase: venturePhase,
            stage: stages.current,
            fixture: options.dry,
            status: decision,
            room,
            estimatedCycleUsd: estimatedWorstCaseUsd,
            now,
            evidenceRefs: opportunityGate.evidenceRefs
          })
        : createLiveStandup({
            cycleId,
            phase: venturePhase,
            stage: stages.current,
            room,
            estimatedCycleUsd: estimatedWorstCaseUsd,
            now,
            council: await collectLiveCouncil({
              cycleId,
              phase: venturePhase,
              stage: stages.current,
              now,
              budgetContext: (ledger): ReserveContext => ({
                now,
                cycleId,
                stage: stages.current,
                ledger,
                allInNonApiSpentUsd: 0,
                allInCommittedUsd: 0,
                knownMonthlyForecastUsd: 0,
                remainingScheduledCycles: remainingScheduledCycles(now),
                limits: budgetLimitsFromEnvironment()
              })
            })
          });
    const artifactRoot = options.dry
      ? path.join(repoRoot, "tmp", "dry-run", "state")
      : stateRoot;
    const artifacts = [
      `standups/${standup.date}-${options.phase}.json`,
      `meetings/${cycleId}.json`,
      `scorecards/${cycleId}.json`,
      `decisions/${cycleId}.json`
    ];
    await Promise.all([
      atomicWriteJson(
        artifactRoot,
        artifacts[0]!,
        publicStandup(standup)
      ),
      atomicWriteJson(artifactRoot, artifacts[1]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        room,
        summary: standup.decision.summary,
        generatedAt: now.toISOString()
      }),
      atomicWriteJson(artifactRoot, artifacts[2]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        stage: stages.current,
        opportunityGate,
        estimatedWorstCaseUsd,
        actualUsd: standup.ledger.actualCycleUsd,
        socialDecision: "NO_POST",
        generatedAt: now.toISOString()
      }),
      atomicWriteJson(artifactRoot, artifacts[3]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        outcome: decision,
        selectedOpportunityId: opportunityGate.passed
          ? opportunityGate.opportunityId
          : null,
        reasons: opportunityGate.reasons,
        evidenceRefs: opportunityGate.evidenceRefs,
        generatedAt: now.toISOString()
      })
    ]);
    if (options.explainBudget) {
      console.log(
        JSON.stringify(
          {
            cycleId,
            callGraph: callGraph.map((call) => ({
              role: call.role,
              model: call.model,
              estimatedUsd: call.estimate.estimatedUsd,
              pricingVerifiedAt: call.estimate.priceVerifiedAt
            })),
            estimatedWorstCaseUsd
          },
          null,
          2
        )
      );
    }
    if (options.explainRouting) {
      console.log(
        JSON.stringify(
          {
            selected: room.selectedParticipants,
            skipped: room.skippedParticipants,
            caps: {
              rounds: room.maxRounds,
              turns: room.maxTurns,
              tokens: room.maxTotalTokens
            }
          },
          null,
          2
        )
      );
    }
    return {
      cycleId,
      phase: options.phase,
      dry: options.dry,
      status: options.dry ? "dry_complete" : "live_complete",
      decision:
        standup.status === "PLAN"
          ? "PLAN"
          : standup.status === "INSUFFICIENT_EVIDENCE"
            ? "INSUFFICIENT_EVIDENCE"
            : "NO_ACTION",
      estimatedWorstCaseUsd,
      selectedAgents: room.selectedParticipants.map(({ agent }) => agent),
      skippedAgents: room.skippedParticipants.map(({ agent }) => agent),
      artifacts: artifacts.map((artifact) =>
        path.relative(repoRoot, path.join(artifactRoot, artifact))
      )
    };
  };
  if (options.dry) {
    return execute();
  }
  return withFileLock(stateRoot, ".lock", execute);
}
