import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_BUDGET_LIMITS,
  estimateTextCall,
  type BudgetLedgerEntry,
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
import { atomicWriteJson, readJson, readText, withFileLock } from "./state.js";
import {
  buildCalendarFeed,
  loadMeetingRecords,
  mondayOfWeek,
  writeCalendarFeed
} from "./meetings/calendar.js";
import { isCaughtUpPhase } from "./meetings/clock.js";
import { pragueClockParts } from "./meetings/clock.js";
import {
  createLiveEditionMeeting,
  createLiveProductMeeting,
  createOfflineCaughtUpMeeting,
  meetingRef
} from "./meetings/record.js";
import { appendEditionUsage, runLiveEdition } from "./edition/live.js";
import {
  PRODUCT_ROOM_RESERVE_USD,
  decideLiveProductRoom,
  prepareMorningIdea,
  toIdeaRoomVerdict
} from "./ideas/live.js";
import {
  CAUGHT_UP_IDEA_NAMESPACE,
  GLOBAL_IDEA_NAMESPACE,
  applyIdeaRoomVerdict,
  currentIdeaEntries,
  ensureIdeaInNamespace,
  ideaIndexPath,
  ideaLedgerPath,
  readIdeaLedger,
  readIdeaIndexSlice,
  regenerateIdeaIndex
} from "./ideas/ledger.js";
import {
  buildMeetingEmail,
  MeetingEmailLogSink,
  meetingEmailSinkFromEnvironment,
  sendMeetingEmail
} from "./notify/email.js";
import { MeetingRecordSchema } from "./contracts/meeting-record.js";
import {
  composeEditionSocialPack,
  recordMissingSocialPackConfiguration,
  recordSocialPackFailure
} from "./social/pack.js";
import { collectLiveCouncil, createLiveStandup } from "./standup/live.js";
import { publicStandup } from "./standup/public.js";
import { createOfflineStandup } from "./standup/run.js";
import { StandupSchema } from "./standup/schema.js";
import {
  getShiftDefinition,
  isShiftPhase
} from "./shifts.js";
import {
  composeMeetingRouteDefinition,
  loadVentureRegistry
} from "./ventures/registry.js";
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
    | "EDITION"
    | "ACCEPT"
    | "VETO"
    | "SUPERSEDE"
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

async function liveMeetingEmailSink() {
  const allowlist = JSON.parse(
    await readFile(path.join(configRoot, "network-allowlist.json"), "utf8")
  ) as { runtimeHosts: string[] };
  return meetingEmailSinkFromEnvironment({
    stateRoot,
    allowHosts: allowlist.runtimeHosts
  });
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

function ledgerSpend(
  entries: readonly BudgetLedgerEntry[],
  predicate: (entry: BudgetLedgerEntry) => boolean
): number {
  return Number(entries.filter(predicate).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8));
}

async function currentBudgetLedger(root: string): Promise<BudgetLedgerEntry[]> {
  return (await readJson<{ entries: BudgetLedgerEntry[] }>(
    root,
    "budget/ledger.json",
    { entries: [] }
  )).entries;
}

function previousPragueDate(date: string): string {
  return new Date(Date.parse(`${date}T12:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
}

async function yesterdayEditionOutcome(root: string, date: string): Promise<string> {
  const yesterday = previousPragueDate(date);
  const delivery = await readJson<{
    status?: string;
    packageHash?: string;
  } | null>(root, `edition/deliveries/${yesterday}.json`, null);
  if (delivery?.status === "delivered") {
    return "Yesterday's edition has a reconciled delivery receipt; no sentinel flag is recorded in Quorum state.";
  }
  const meeting = await readJson<{ status?: string; decision?: { outcome?: string } } | null>(
    root,
    `meetings/${yesterday}-cu-edition.json`,
    null
  );
  if (meeting?.status === "NEEDS_RECONCILIATION") {
    return "Yesterday's edition needs delivery reconciliation; no sentinel flag is recorded in Quorum state.";
  }
  if (meeting?.decision?.outcome === "NO_EDITION") {
    return "Yesterday closed as an honest no-edition outcome; no sentinel flag is recorded in Quorum state.";
  }
  return "Yesterday's delivery outcome is unavailable in committed Quorum state; no sentinel flag is recorded here.";
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
  const [routing, stages, ventureRegistry] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry()
  ]);
  const definition = composeMeetingRouteDefinition(
    ventureRegistry,
    options.phase,
    "dry"
  );
  const meetingCap = Math.min(
    definition.envelopeUsd,
    budgetLimitsFromEnvironment().caughtUpMeetingUsd
  );
  const estimatedWorstCaseUsd = options.phase === "cu-product"
    ? PRODUCT_ROOM_RESERVE_USD
    : meetingCap;
  if (estimatedWorstCaseUsd > meetingCap) {
    throw new Error(`Caught Up ${options.phase} reserve exceeds the meeting cap`);
  }
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: estimatedWorstCaseUsd,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: definition.requiredParticipants,
    now
  });
  const artifactRoot = path.join(repoRoot, "tmp", "dry-run", "state");
  let fixtureIdea = null;
  let fixtureVerdict: "veto" | "defer" = "defer";
  if (options.phase === "cu-product") {
    const morningRaw = await readText(artifactRoot, `standups/${pragueClockParts(now).date}-morning.json`);
    const morning = morningRaw ? StandupSchema.parse(JSON.parse(morningRaw)) : null;
    if (morning?.caughtUpIdeaRef) {
      await ensureIdeaInNamespace(
        artifactRoot,
        CAUGHT_UP_IDEA_NAMESPACE,
        morning.caughtUpIdeaRef
      );
      const current = currentIdeaEntries(
        await readIdeaLedger(artifactRoot, CAUGHT_UP_IDEA_NAMESPACE)
      );
      const morningIdea = current.find((candidate) => candidate.id === morning.caughtUpIdeaRef);
      if (!morningIdea) throw new Error(`Dry morning handoff references unknown idea ${morning.caughtUpIdeaRef}`);
      fixtureVerdict = morningIdea.status === "vetoed" || morningIdea.status === "killed" ? "veto" : "defer";
      fixtureIdea = await applyIdeaRoomVerdict({
        root: artifactRoot,
        namespace: CAUGHT_UP_IDEA_NAMESPACE,
        ideaId: morningIdea.id,
        verdict: fixtureVerdict === "veto"
          ? { verdict: "veto", reason: "VAULT hard-stopped the fixture duplicate before deliberation." }
          : {
              verdict: "defer",
              reason: "Dry product rooms cannot authorize product action.",
              deferred: { condition: "A live bounded product room reviews the idea." }
            },
        meetingRef: meetingRef(morning.date, "cu-product"),
        at: now.toISOString()
      });
    }
  }
  const record = await createOfflineCaughtUpMeeting({
    cycleId,
    phase: options.phase,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: estimatedWorstCaseUsd,
    ...(fixtureIdea ? { idea: fixtureIdea, verdict: fixtureVerdict } : {})
  });
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
      ...(fixtureIdea ? { ideaId: fixtureIdea.id, vaultScreening: fixtureIdea.statusHistory[0]?.reason } : {}),
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
    "notify/health.json",
    ...(fixtureIdea
      ? [ideaLedgerPath(CAUGHT_UP_IDEA_NAMESPACE), ideaIndexPath(CAUGHT_UP_IDEA_NAMESPACE)]
      : [])
  ];
  return {
    cycleId,
    phase: options.phase,
    dry: true,
    status: "dry_complete",
    decision: options.phase === "cu-edition"
      ? "NO_EDITION"
      : fixtureVerdict === "veto"
        ? "VETO"
        : "DEFER",
    estimatedWorstCaseUsd,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) =>
      path.relative(repoRoot, path.join(artifactRoot, artifact))
    )
  };
}

async function runCaughtUpLiveEditionCycle(
  options: CycleOptions,
  cycleId: string,
  now: Date
): Promise<CycleResult> {
  if (options.phase !== "cu-edition" || options.dry) {
    throw new Error("Live Caught Up edition runner requires a non-dry cu-edition phase");
  }
  const [routing, stages, ventureRegistry] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry()
  ]);
  const definition = composeMeetingRouteDefinition(
    ventureRegistry,
    "cu-edition",
    "live"
  );
  const meetingBudgetUsd = Math.min(
    definition.envelopeUsd,
    budgetLimitsFromEnvironment().caughtUpMeetingUsd
  );
  const productionBudgetUsd = budgetLimitsFromEnvironment().editionProductionUsd;
  const estimatedWorstCaseUsd = Number((meetingBudgetUsd + productionBudgetUsd).toFixed(8));
  const date = pragueClockParts(now).date;
  const reference = meetingRef(date, "cu-edition");
  const baseUrl = (process.env.PUBLIC_SITE_URL || "https://quorum-site-chi.vercel.app").replace(/\/$/, "");
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: estimatedWorstCaseUsd,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: definition.requiredParticipants,
    now
  });
  const produced = await runLiveEdition({
    cycleId,
    date,
    now,
    meetingRef: reference,
    roomUrl: `${baseUrl}/${reference}`
  });
  const monthAllInUsd = await appendEditionUsage(stateRoot, cycleId, now, produced.report);
  const evidenceRefs = produced.package.status === "edition"
    ? produced.package.article.en.frontmatter.sources.map(
        (source) => `source:${source.source_id ?? source.id}`
      )
    : produced.sourceRun.sources
        .filter((source) => source.status === "success")
        .map((source) => `source:${source.sourceId}`)
        .slice(0, 12);
  const record = await createLiveEditionMeeting({
    cycleId,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: estimatedWorstCaseUsd,
    monthAllInUsd,
    editionPackage: produced.package,
    evidenceRefs
  });
  const meetingPath = `meetings/${date}-cu-edition.json`;
  const decisionPath = `decisions/${cycleId}.json`;
  const scorecardPath = `scorecards/${cycleId}.json`;
  const priorRecords = await loadMeetingRecords(stateRoot);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords, record],
    now
  });
  const calendarPath = await writeCalendarFeed(stateRoot, calendar);
  await Promise.all([
    atomicWriteJson(stateRoot, meetingPath, record),
    atomicWriteJson(stateRoot, decisionPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-edition",
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      evidenceRefs: record.decision.evidenceRefs,
      editionRef: produced.package.idempotencyKey,
      generatedAt: record.generatedAt
    }),
    atomicWriteJson(stateRoot, scorecardPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-edition",
      estimatedWorstCaseUsd,
      actualUsd: produced.report.measuredCostUsd ?? 0,
      participants: room.selectedParticipants.map((participant) => participant.agent),
      sourceResults: produced.sourceRun.sources,
      editionStatus: produced.package.status,
      packageHash: produced.package.idempotencyKey,
      generatedAt: record.generatedAt
    })
  ]);
  const socialArtifacts: string[] = [];
  let editionUrl: string | undefined;
  if (produced.package.status === "edition") {
    const caughtUpBaseUrl = process.env.CAUGHT_UP_SITE_URL;
    if (!caughtUpBaseUrl) {
      await recordMissingSocialPackConfiguration(stateRoot);
      console.warn("Caught Up social pack skipped: CAUGHT_UP_SITE_URL is not configured");
    } else {
      try {
        const slug = produced.package.article.en.frontmatter.slug;
        const destinations = {
          en: new URL(`/articles/${slug}`, caughtUpBaseUrl).toString(),
          cs: new URL(`/cs/articles/${slug}`, caughtUpBaseUrl).toString()
        };
        editionUrl = destinations.en;
        const social = await composeEditionSocialPack({
          editionPackage: produced.package,
          meeting: record,
          destinations,
          repoRoot,
          stateRoot,
          now
        });
        if (social) socialArtifacts.push(...social.artifactPaths);
      } catch (error) {
        editionUrl = undefined;
        const detail = error instanceof Error ? error.message : "unknown composer failure";
        console.warn(`Caught Up social pack failed: ${detail}`);
        await recordSocialPackFailure(stateRoot, detail);
      }
    }
  }
  const emailPayload = buildMeetingEmail({
    record,
    boardlessBaseUrl: baseUrl,
    ...(editionUrl ? { editionUrl } : {})
  });
  await sendMeetingEmail({
    payload: emailPayload,
    sink: await liveMeetingEmailSink(),
    stateRoot,
    now
  });
  if (options.explainBudget) {
    console.log(JSON.stringify({
      cycleId,
      callGraph: produced.report.usage.map((usage) => ({
        stage: usage.stage,
        model: usage.model,
        measuredUsd: usage.costUsd
      })),
      estimatedWorstCaseUsd,
      measuredUsd: produced.report.measuredCostUsd ?? null
    }, null, 2));
  }
  if (options.explainRouting) {
    console.log(JSON.stringify({
      selected: room.selectedParticipants,
      skipped: room.skippedParticipants,
      caps: { rounds: room.maxRounds, turns: room.maxTurns, tokens: room.maxTotalTokens }
    }, null, 2));
  }
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
    produced.outboxPath,
    produced.reportPath,
    `notify/email/${reference.replaceAll("/", "-")}.json`,
    "notify/health.json",
    "budget/ledger.json",
    ...socialArtifacts
  ];
  return {
    cycleId,
    phase: "cu-edition",
    dry: false,
    status: "live_complete",
    decision: produced.package.status === "edition" ? "EDITION" : "NO_EDITION",
    estimatedWorstCaseUsd,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
  };
}

async function runCaughtUpLiveProductCycle(
  options: CycleOptions,
  cycleId: string,
  now: Date
): Promise<CycleResult> {
  if (options.phase !== "cu-product" || options.dry) {
    throw new Error("Live Caught Up product runner requires a non-dry cu-product phase");
  }
  const [routing, stages, ventureRegistry] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry()
  ]);
  const definition = composeMeetingRouteDefinition(
    ventureRegistry,
    "cu-product",
    "live"
  );
  const limits = budgetLimitsFromEnvironment();
  const meetingCap = Math.min(definition.envelopeUsd, limits.caughtUpMeetingUsd);
  if (PRODUCT_ROOM_RESERVE_USD > meetingCap) {
    throw new Error(
      `Product-room reserve ${PRODUCT_ROOM_RESERVE_USD} exceeds Caught Up meeting cap ${meetingCap}`
    );
  }
  const date = pragueClockParts(now).date;
  const reference = meetingRef(date, "cu-product");
  const baseUrl = (process.env.PUBLIC_SITE_URL || "https://quorum-site-chi.vercel.app").replace(/\/$/, "");
  const room = routeBoardroom(routing, {
    roomId: `ROOM-${cycleId.toUpperCase()}`,
    topicType: definition.topicType,
    objective: definition.objective,
    evidenceRefs: [],
    decisionNeeded: definition.decisionNeeded,
    riskTags: [],
    budgetImpactUsd: PRODUCT_ROOM_RESERVE_USD,
    ventureId: definition.ventureId,
    preset: definition.preset,
    requiredParticipants: definition.requiredParticipants,
    now
  });
  const [index, globalIndex] = await Promise.all([
    regenerateIdeaIndex(stateRoot, CAUGHT_UP_IDEA_NAMESPACE),
    readIdeaIndexSlice(stateRoot, GLOBAL_IDEA_NAMESPACE)
  ]);
  const morningRaw = await readText(stateRoot, `standups/${date}-morning.json`);
  const morning = morningRaw ? StandupSchema.parse(JSON.parse(morningRaw)) : null;
  if (morning?.caughtUpIdeaRef) {
    await ensureIdeaInNamespace(
      stateRoot,
      CAUGHT_UP_IDEA_NAMESPACE,
      morning.caughtUpIdeaRef
    );
  }
  const ideas = currentIdeaEntries(
    await readIdeaLedger(stateRoot, CAUGHT_UP_IDEA_NAMESPACE)
  );
  const idea = morning?.caughtUpIdeaRef
    ? ideas.find((candidate) => candidate.id === morning.caughtUpIdeaRef) ?? null
    : null;
  if (morning?.caughtUpIdeaRef && !idea) {
    throw new Error(`Morning handoff references unknown idea ${morning.caughtUpIdeaRef}`);
  }
  const previousOutcome = await yesterdayEditionOutcome(stateRoot, date);
  const response = idea
    ? await decideLiveProductRoom({
        context: {
          root: stateRoot,
          ideaNamespace: CAUGHT_UP_IDEA_NAMESPACE,
          cycleId,
          stage: stages.current,
          now,
          limits,
          remainingScheduledCycles: remainingScheduledCycles(now)
        },
        idea,
        index,
        globalIndex,
        yesterdayOutcome: previousOutcome
      })
    : null;
  const recordedIdea = idea && response
    ? await applyIdeaRoomVerdict({
        root: stateRoot,
        namespace: CAUGHT_UP_IDEA_NAMESPACE,
        ideaId: idea.id,
        verdict: toIdeaRoomVerdict(response),
        meetingRef: reference,
        at: now.toISOString()
      })
    : null;
  const budgetLedger = await currentBudgetLedger(stateRoot);
  const actualCycleUsd = ledgerSpend(
    budgetLedger,
    (entry) => entry.cycleId === cycleId
  );
  const month = now.toISOString().slice(0, 7);
  const monthAllInUsd = ledgerSpend(
    budgetLedger,
    (entry) => entry.ts.slice(0, 7) === month
  );
  const record = await createLiveProductMeeting({
    cycleId,
    stage: stages.current,
    room,
    now,
    estimatedCycleUsd: PRODUCT_ROOM_RESERVE_USD,
    actualCycleUsd,
    monthAllInUsd,
    idea: recordedIdea,
    response,
    yesterdayOutcome: previousOutcome
  });
  const meetingPath = `meetings/${date}-cu-product.json`;
  const decisionPath = `decisions/${cycleId}.json`;
  const scorecardPath = `scorecards/${cycleId}.json`;
  const priorRecords = await loadMeetingRecords(stateRoot);
  const calendar = buildCalendarFeed({
    weekOf: mondayOfWeek(date),
    records: [...priorRecords, record],
    now
  });
  const calendarPath = await writeCalendarFeed(stateRoot, calendar);
  await Promise.all([
    atomicWriteJson(stateRoot, meetingPath, record),
    atomicWriteJson(stateRoot, decisionPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-product",
      outcome: record.decision.outcome,
      summary: record.decision.summary,
      evidenceRefs: record.decision.evidenceRefs,
      ...(record.caughtUpIdeaRef ? { caughtUpIdeaRef: record.caughtUpIdeaRef } : {}),
      generatedAt: record.generatedAt
    }),
    atomicWriteJson(stateRoot, scorecardPath, {
      schemaVersion: 1,
      fixture: false,
      cycleId,
      phase: "cu-product",
      estimatedWorstCaseUsd: PRODUCT_ROOM_RESERVE_USD,
      actualUsd: actualCycleUsd,
      participants: room.selectedParticipants.map((participant) => participant.agent),
      ideaId: recordedIdea?.id ?? null,
      vaultScreening: recordedIdea?.statusHistory[0]?.reason ?? "missing_morning_handoff",
      growthIdeaNovelty: recordedIdea?.statusHistory[0]?.reason.includes("hard stop") ? 0 : recordedIdea ? 1 : null,
      yesterdayOutcome: previousOutcome,
      generatedAt: record.generatedAt
    })
  ]);
  const emailPayload = buildMeetingEmail({ record, boardlessBaseUrl: baseUrl });
  await sendMeetingEmail({
    payload: emailPayload,
    sink: await liveMeetingEmailSink(),
    stateRoot,
    now
  });
  if (options.explainBudget) {
    console.log(JSON.stringify({
      cycleId,
      callGraph: budgetLedger
        .filter((entry) => entry.cycleId === cycleId)
        .map((entry) => ({ agent: entry.agent, model: entry.model, measuredUsd: entry.usd })),
      estimatedWorstCaseUsd: PRODUCT_ROOM_RESERVE_USD,
      measuredUsd: actualCycleUsd
    }, null, 2));
  }
  if (options.explainRouting) {
    console.log(JSON.stringify({
      selected: room.selectedParticipants,
      skipped: room.skippedParticipants,
      caps: { rounds: room.maxRounds, turns: room.maxTurns, tokens: room.maxTotalTokens }
    }, null, 2));
  }
  const decision = response?.verdict === "accept"
    ? "ACCEPT"
    : response?.verdict === "veto"
      ? "VETO"
      : response?.verdict === "supersede"
        ? "SUPERSEDE"
        : "DEFER";
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
    ideaLedgerPath(CAUGHT_UP_IDEA_NAMESPACE),
    ideaIndexPath(CAUGHT_UP_IDEA_NAMESPACE),
    `notify/email/${reference.replaceAll("/", "-")}.json`,
    "notify/health.json",
    "budget/ledger.json"
  ];
  return {
    cycleId,
    phase: "cu-product",
    dry: false,
    status: "live_complete",
    decision,
    estimatedWorstCaseUsd: PRODUCT_ROOM_RESERVE_USD,
    selectedAgents: room.selectedParticipants.map((participant) => participant.agent),
    skippedAgents: room.skippedParticipants.map((participant) => participant.agent),
    artifacts: artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
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
    if (options.dry) return runCaughtUpDryCycle(options, cycleId, now);
    if (options.phase === "cu-edition") {
      return withFileLock(stateRoot, ".lock", () =>
        runCaughtUpLiveEditionCycle(options, cycleId, now)
      );
    }
    return withFileLock(stateRoot, ".lock", () =>
      runCaughtUpLiveProductCycle(options, cycleId, now)
    );
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
    if (venturePhase === "morning") {
      for (const [role, configRole, maxOutputTokens] of [
        ["SPARK", "OPENAI_SPECIALIST", 280],
        ["VAULT", "DIGEST", 240]
      ] as const) {
        const model = modelConfig.roles[configRole];
        if (!model) throw new Error(`Missing model config for ${configRole}`);
        callGraph.push({
          role,
          model: model.model,
          estimate: estimateTextCall({
            provider: model.provider,
            model: model.model,
            promptChars: 12_000,
            maxOutputTokens,
            at: now
          })
        });
      }
    }
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
    const artifactRoot = options.dry
      ? path.join(repoRoot, "tmp", "dry-run", "state")
      : stateRoot;
    const liveCouncil = !options.dry && venturePhase !== "founding"
      ? await collectLiveCouncil({
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
      : null;
    const caughtUpIdea = venturePhase === "morning"
      ? await prepareMorningIdea({
          context: {
            root: artifactRoot,
            ideaNamespace: CAUGHT_UP_IDEA_NAMESPACE,
            cycleId,
            stage: stages.current,
            now,
            limits: budgetLimitsFromEnvironment(),
            remainingScheduledCycles: remainingScheduledCycles(now)
          },
          dry: options.dry,
          councilSummary: liveCouncil
            ? liveCouncil.positions.map((position) => position.publicSummary).join(" ")
            : "Deterministic dry morning fixture; no live council position was called."
        })
      : undefined;
    let measuredCouncil = liveCouncil;
    if (liveCouncil && caughtUpIdea) {
      const ledger = await currentBudgetLedger(artifactRoot);
      const month = now.toISOString().slice(0, 7);
      measuredCouncil = {
        ...liveCouncil,
        actualCycleUsd: ledgerSpend(ledger, (entry) => entry.cycleId === cycleId),
        monthAllInUsd: ledgerSpend(ledger, (entry) => entry.ts.slice(0, 7) === month)
      };
    }
    const standup = measuredCouncil
      ? createLiveStandup({
          cycleId,
          phase: venturePhase as Exclude<typeof venturePhase, "founding">,
          stage: stages.current,
          room,
          estimatedCycleUsd: estimatedWorstCaseUsd,
          now,
          council: measuredCouncil,
          ...(caughtUpIdea ? { caughtUpIdea } : {})
        })
      : createOfflineStandup({
          cycleId,
          phase: venturePhase,
          stage: stages.current,
          fixture: options.dry,
          status: decision,
          room,
          estimatedCycleUsd: estimatedWorstCaseUsd,
          now,
          evidenceRefs: opportunityGate.evidenceRefs,
          ...(caughtUpIdea ? { caughtUpIdea } : {})
        });
    const artifacts = [
      `standups/${standup.date}-${options.phase}.json`,
      `meetings/${cycleId}.json`,
      `scorecards/${cycleId}.json`,
      `decisions/${cycleId}.json`,
      ...(caughtUpIdea
        ? [ideaLedgerPath(CAUGHT_UP_IDEA_NAMESPACE), ideaIndexPath(CAUGHT_UP_IDEA_NAMESPACE)]
        : [])
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
        ...(caughtUpIdea ? {
          caughtUpIdeaRef: caughtUpIdea.entry.id,
          growthIdeaNovelty: caughtUpIdea.autoRejected ? 0 : 1,
          vaultVerdict: caughtUpIdea.verdict
        } : {}),
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
        ...(caughtUpIdea ? { caughtUpIdeaRef: caughtUpIdea.entry.id } : {}),
        generatedAt: now.toISOString()
      })
    ]);
    const emailRecord = MeetingRecordSchema.parse({
      ...standup,
      schemaVersion: "meeting-record/2",
      kind: "venture"
    });
    const emailPayload = buildMeetingEmail({
      record: emailRecord,
      boardlessBaseUrl: (process.env.PUBLIC_SITE_URL || "https://quorum-site-chi.vercel.app").replace(/\/$/, "")
    });
    await sendMeetingEmail({
      payload: emailPayload,
      sink: options.dry ? new MeetingEmailLogSink(artifactRoot) : await liveMeetingEmailSink(),
      stateRoot: artifactRoot,
      now
    });
    artifacts.push(
      `notify/email/${emailPayload.meetingRef.replaceAll("/", "-")}.json`,
      "notify/health.json"
    );
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
