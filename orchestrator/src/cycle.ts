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
  loadArticleSlotOutcomes, loadMeetingRecords, loadMeetingSkips,
  mondayOfWeek,
  writeCalendarFeed
} from "./meetings/calendar.js";
import { isCaughtUpPhase, isPortfolioPhase } from "./meetings/clock.js";
import { pragueClockParts } from "./meetings/clock.js";
import {
  MEETING_AGENDA_PATH,
  loadMeetingPolicy,
  mayRequestMeeting,
  nextAgendaDate,
  phaseNeedsAgenda,
  readMeetingAgendaQueue,
  requestMeetingAgenda,
  starvationList
} from "./meetings/agenda.js";
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
import { MeetingRecordSchema } from "./contracts/meeting-record.js";
import {
  composeEditionSocialPack,
  recordMissingSocialPackConfiguration,
  recordSocialPackFailure
} from "./social/pack.js";
import { socialContentGenerationEnabled } from "./social/activation.js";
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
  getVentureMeetingDefinition,
  loadVentureRegistry,
  parseCadenceHour
} from "./ventures/registry.js";
import {
  caughtUpSocialProductionEnabled,
  disabledAgentsForVenture,
  enabledAgentsForVenture,
  loadVentureAgentControls
} from "./ventures/agent-controls.js";
import type { RunnablePhase, Stage } from "./types.js";
import { runPortfolioCycle } from "./portfolio/run.js";
import { runDryArticleProduction } from "./mma-files/dry-run.js";
import { runLiveArticleProduction } from "./mma-files/live.js";
import { signedOwnerDecision } from "./portfolio/schedule.js";
import { AUTONOMY_SNAPSHOT_PATH, refreshAutonomySnapshot } from "./autonomy/signals.js";
import { ensurePriorityItem, openPriorityItems, readPriorityQueue, selectPriorityItem, skipPriorityItem, PRIORITY_QUEUE_PATH } from "./priority/queue.js";
import { runDailyMoneyAndKpis } from "./money/daily.js";
import { loadFixedMonthlyUsd } from "./money/fixed-costs.js";
import { loadRuntimeBudgetLimits } from "./portfolio/limits.js";
import { refreshEcosystemOperatingTruth } from "./docs/ecosystem.js";

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

/** A completed article is final for its date; a no-edition board status is provisional. */
/**
 * Whether a second edition today is the owner asking for one rather than a cron repeating itself.
 *
 * The once-a-day guard is there because eighteen crons resolve to a phase and a re-run must not
 * publish the same day twice. It also stops a manual dispatch, which is the owner standing at the
 * keyboard asking for a new article — and there was no way to say so. The workflow sets this only
 * for a `workflow_dispatch` with dry disabled, so a schedule can never take this branch.
 */
export function manualEditionOverride(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CYCLE_FORCE_NEW_EDITION?.trim().toLowerCase() === "true";
}

export async function hasDeliveredPublishedEdition(
  date: string,
  root = stateRoot
): Promise<boolean> {
  if (manualEditionOverride()) return false;
  const receipt = await readJson<{
    status?: unknown;
    editionStatus?: unknown;
    tags?: unknown;
  } | null>(root, `edition/deliveries/${date}.json`, null);
  if (receipt?.status !== "delivered") return false;
  if (receipt.editionStatus === "edition") return true;
  return Array.isArray(receipt.tags) && receipt.tags.length > 0;
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

function ledgerSpend(
  entries: readonly BudgetLedgerEntry[],
  predicate: (entry: BudgetLedgerEntry) => boolean
): number {
  return Number(entries.filter(predicate).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8));
}

/**
 * Month-to-date all-in spend and the cap in force, for a record that has no council to ask.
 *
 * The deterministic afternoon and night shifts write the newest standup of any day, and the
 * site reads the newest standup for its headline running cost. A literal here is therefore
 * published as fact: the site showed "$0.00 of $50" on a day the ledger held $1.18 against a
 * countersigned $30 cap.
 */
async function monthToDateLedger(root: string, now: Date): Promise<{ monthAllInUsd: number; monthCapUsd: number }> {
  const [entries, limits, fixedMonthlyUsd] = await Promise.all([
    currentBudgetLedger(root),
    loadRuntimeBudgetLimits(),
    loadFixedMonthlyUsd(configRoot, now)
  ]);
  const month = pragueClockParts(now).date.slice(0, 7);
  const apiUsd = Number(entries.filter((entry) => entry.ts.slice(0, 7) === month).reduce((sum, entry) => sum + entry.usd, 0).toFixed(8));
  return {
    monthAllInUsd: Number((apiUsd + fixedMonthlyUsd).toFixed(8)),
    monthCapUsd: limits.monthlyOperatingUsd
  };
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
  const [routing, stages, ventureRegistry, agentControls] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry(),
    loadVentureAgentControls()
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
    disabledParticipants: [...disabledAgentsForVenture(agentControls, definition.ventureId)],
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
    skips: await loadMeetingSkips(artifactRoot),
    articleSlots: await loadArticleSlotOutcomes(artifactRoot),
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
  const artifacts = [
    meetingPath,
    decisionPath,
    scorecardPath,
    calendarPath,
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
  const [routing, stages, ventureRegistry, agentControls] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry(),
    loadVentureAgentControls()
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
  if (await hasDeliveredPublishedEdition(date)) {
    return {
      cycleId,
      phase: "cu-edition",
      dry: false,
      status: "preflight_complete",
      decision: "NO_ACTION",
      estimatedWorstCaseUsd,
      selectedAgents: [],
      skippedAgents: [],
      artifacts: [`state/edition/deliveries/${date}.json`]
    };
  }
  const reference = meetingRef(date, "cu-edition");
  const baseUrl = (process.env.PUBLIC_SITE_URL || "https://boardless-ai.vercel.app").replace(/\/$/, "");
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
    disabledParticipants: [...disabledAgentsForVenture(agentControls, definition.ventureId)],
    now
  });
  const socialContentEnabled = caughtUpSocialProductionEnabled(agentControls) &&
    await socialContentGenerationEnabled(stateRoot, "caught-up");
  const produced = await runLiveEdition({
    cycleId,
    date,
    now,
    meetingRef: reference,
    roomUrl: `${baseUrl}/${reference}`,
    socialPackEnabled: socialContentEnabled,
    licensedImageSearchEnabled: true
  });
  const monthAllInUsd = await appendEditionUsage(stateRoot, cycleId, now, produced.report);
  const evidenceRefs = produced.package.status === "edition"
    ? produced.package.article.cs.frontmatter.sources.map(
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
    skips: await loadMeetingSkips(stateRoot),
    articleSlots: await loadArticleSlotOutcomes(stateRoot),
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
  if (produced.package.status === "edition" && socialContentEnabled) {
    const caughtUpBaseUrl = process.env.CAUGHT_UP_SITE_URL;
    if (!caughtUpBaseUrl) {
      await recordMissingSocialPackConfiguration(stateRoot);
      console.warn("Caught Up social pack skipped: CAUGHT_UP_SITE_URL is not configured");
    } else {
      try {
        const slug = produced.package.article.cs.frontmatter.slug;
        // Czech is served at the site root now, and /cs 308s there. A queue item carries its
        // destination to the platform and cannot be edited afterwards, so it points at the
        // final URL rather than at a redirect.
        const destinations = {
          cs: new URL(`/articles/${slug}`, caughtUpBaseUrl).toString()
        };
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
        const detail = error instanceof Error ? error.message : "unknown composer failure";
        console.warn(`Caught Up social pack failed: ${detail}`);
        await recordSocialPackFailure(stateRoot, detail);
      }
    }
  }
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
    ...(produced.outboxPath ? [produced.outboxPath] : []),
    produced.reportPath,
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
  const [routing, stages, ventureRegistry, agentControls, fixedMonthlyUsd] = await Promise.all([
    loadRoutingConfig(path.join(configRoot, "agent-routing.json")),
    readFile(path.join(configRoot, "stages.json"), "utf8").then(
      (raw) => JSON.parse(raw) as { current: Stage }
    ),
    loadVentureRegistry(),
    loadVentureAgentControls(),
    loadFixedMonthlyUsd(configRoot, now)
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
    disabledParticipants: [...disabledAgentsForVenture(agentControls, definition.ventureId)],
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
          remainingScheduledCycles: remainingScheduledCycles(now),
          fixedMonthlyUsd
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
    skips: await loadMeetingSkips(stateRoot),
    articleSlots: await loadArticleSlotOutcomes(stateRoot),
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
  if (isPortfolioPhase(options.phase)) {
    const phase = options.phase;
    const run = () => runPortfolioCycle({
      phase,
      cycleId,
      dry: options.dry,
      explainBudget: options.explainBudget,
      explainRouting: options.explainRouting,
      now
    });
    return options.dry ? run() : withFileLock(stateRoot, ".lock", run);
  }
  if (options.phase === "article-am" || options.phase === "article-pm") {
    if (!options.dry) {
      const budgetFifty = await readFile(path.join(stateRoot, "decisions", "2026-08-04-budget-fifty.md"), "utf8");
      if (
        signedOwnerDecision(budgetFifty) !== "countersigned" ||
        process.env.PORTFOLIO_LIVE_ENABLED !== "true" ||
        process.env.MMA_FILES_LIVE_ENABLED !== "true"
      ) {
        return { cycleId, phase: options.phase, dry: false, status: "paused", decision: "PAUSED", estimatedWorstCaseUsd: 0, selectedAgents: [], skippedAgents: [], artifacts: [] };
      }
      const result = await runLiveArticleProduction({
        cycleId,
        slot: options.phase === "article-am" ? "am" : "pm",
        now
      });
      const articleAgents = ["JAB", "HACEK", "STET", "REACH", "FRAME"] as const;
      const controls = await loadVentureAgentControls();
      const enabledArticleAgents = enabledAgentsForVenture(controls, "mma-files", articleAgents);
      const disabledArticleAgents = articleAgents.filter((agent) => !enabledArticleAgents.includes(agent));
      return {
        cycleId,
        phase: options.phase,
        dry: false,
        status: "live_complete",
        decision: "PLAN",
        estimatedWorstCaseUsd: result.estimatedWorstCaseUsd,
        selectedAgents: result.status === "killed" ? [] : enabledArticleAgents,
        skippedAgents: result.status === "killed" ? [...articleAgents] : disabledArticleAgents,
        artifacts: result.artifacts.map((artifact) => path.relative(repoRoot, path.join(stateRoot, artifact)))
      };
    }
    const root = path.join(repoRoot, "tmp", "dry-run", "state");
    const result = await runDryArticleProduction({ root, slot: options.phase === "article-am" ? "am" : "pm", now });
    return {
      cycleId,
      phase: options.phase,
      dry: true,
      status: "dry_complete",
      decision: "PLAN",
      estimatedWorstCaseUsd: 0,
      selectedAgents: ["JAB", "HACEK", "STET", "REACH", "FRAME"],
      skippedAgents: [],
      artifacts: [result.articlePath, ...(result.socialPath ? [result.socialPath] : []), ...result.mediaPaths].map((artifact) => path.relative(repoRoot, path.join(root, artifact)))
    };
  }
  if (options.phase !== "founding" && !isShiftPhase(options.phase)) {
    throw new Error(`Unsupported venture phase: ${options.phase}`);
  }
  const venturePhase = options.phase;
  const deterministicCheckpoint = venturePhase === "afternoon" || venturePhase === "night";
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
    const callRoles = venturePhase === "morning"
      ? ["VIZE", "FORGE", "PULSE", "AUDIT"]
      : [];
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
    const morningContext = venturePhase === "morning"
      ? await (async () => {
          const moneyAndKpis = await runDailyMoneyAndKpis({
            repoRoot,
            stateRoot: artifactRoot,
            now,
            writeOwnerNotices: !options.dry
          });
          const [autonomy, meetingPolicy, ventureRegistry, agendaQueue, priorityQueue] = await Promise.all([
            refreshAutonomySnapshot({ repoRoot, stateRoot: artifactRoot, now }),
            loadMeetingPolicy(),
            loadVentureRegistry(),
            readMeetingAgendaQueue(artifactRoot, now),
            readPriorityQueue(artifactRoot, now)
          ]);
          const agendaVentures = [...new Set(ventureRegistry.ventures
            .filter((venture) => venture.meetings.some((meeting) => phaseNeedsAgenda(meetingPolicy, meeting.kind)))
            .map((venture) => venture.id))];

          // Bootstrap the priority queue so the agenda loop can start on its own.
          //
          // An agenda-gated room needs a due agenda; an agenda needs an open priority item;
          // and the council may only request a room against an item that already exists. The
          // sole writer of the queue was the admin UI, so with an empty queue no agent could
          // ever open tt-marketing, incubator-scan, incubator-synthesis, mma-analysis,
          // mag-desk or studio. The loop could not be entered from inside the system.
          //
          // The seed is not invented: each venture states its own growth objective in
          // config/ventures.json, and that is what the queue is for. ensurePriorityItem is
          // idempotent on (venture, question, decision), so a venture that already has an
          // open item is left alone and a re-run adds nothing. Agents refine from here by
          // requesting rooms against the item, which is the behaviour that was designed.
          let seededQueue = priorityQueue;
          if (!options.dry) {
            let seeded = false;
            for (const ventureId of agendaVentures) {
              if (openPriorityItems(seededQueue, ventureId).length > 0) continue;
              const venture = ventureRegistry.ventures.find((candidate) => candidate.id === ventureId);
              if (!venture || venture.status === "paused") continue;
              const objective = venture.growth_objective;
              const result = await ensurePriorityItem({
                root: artifactRoot,
                venture: ventureId,
                question: `What is currently blocking this objective: ${objective.label}?`,
                decisionAtStake: `Which next bounded action moves ${objective.components.join(", ")} for ${venture.name}.`,
                evidenceNeeded: [...objective.components],
                requestedBy: "VIZE",
                now,
                // One week, matching the admin control, and shorter than a quarter so a
                // stale objective expires rather than pinning the queue open forever.
                expires: new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000))
              });
              if (result.created) seeded = true;
            }
            if (seeded) seededQueue = await readPriorityQueue(artifactRoot, now);
          }

          return {
            moneyAndKpis,
            autonomy,
            priorityQueue: seededQueue,
            openPriorities: openPriorityItems(seededQueue),
            starvation: starvationList({ queue: agendaQueue, ventureIds: agendaVentures, now })
          };
        })()
      : null;
    const liveCouncil = !options.dry && venturePhase === "morning"
      ? await collectLiveCouncil({
          cycleId,
          phase: venturePhase,
          stage: stages.current,
          now,
          businessContext: {
            autonomy: morningContext!.autonomy,
            openPriorities: morningContext!.openPriorities,
            starvation: morningContext!.starvation,
            quarterlyKpis: morningContext!.moneyAndKpis.summary
          },
          budgetContext: (ledger): ReserveContext => ({
            now,
            cycleId,
            stage: stages.current,
            ledger,
            allInNonApiSpentUsd: morningContext!.moneyAndKpis.fixedMonthlyUsd,
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
            remainingScheduledCycles: remainingScheduledCycles(now),
            fixedMonthlyUsd: morningContext!.moneyAndKpis.fixedMonthlyUsd
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
    const meetingAgendaIds: string[] = [];
    let meetingAgendaStateChanged = false;
    let priorityStateChanged = false;
    let selectedPriorityId: string | null = null;
    let selectedPriorityVenture: string | null = null;
    if (measuredCouncil && venturePhase === "morning") {
      const approvals = measuredCouncil.positions.filter((position) => position.recommendation === "approve");
      const auditApproved = approvals.some((position) => position.agent === "AUDIT");
      const request = measuredCouncil.positions.find((position) =>
        position.agent !== "AUDIT" && position.meetingRequest !== null
      );
      if (auditApproved && approvals.length >= 3 && request?.meetingRequest) {
        const [meetingPolicy, ventureRegistry] = await Promise.all([
          loadMeetingPolicy(),
          loadVentureRegistry()
        ]);
        if (mayRequestMeeting(meetingPolicy, venturePhase, request.meetingRequest.phase)) {
          const target = getVentureMeetingDefinition(ventureRegistry, request.meetingRequest.phase);
          const priority = morningContext?.openPriorities.find((item) => item.id === request.meetingRequest?.priorityItemId);
          if (!priority || priority.venture !== target.ventureId) {
            console.warn("Council meeting request did not match an open priority item for the target venture");
          } else {
            const local = pragueClockParts(now);
            try {
              const scheduled = await requestMeetingAgenda({
                root: artifactRoot,
                policy: meetingPolicy,
                ventureId: target.ventureId,
                phase: request.meetingRequest.phase,
                requestedBy: request.agent,
                sourcePhase: venturePhase,
                sourceMeetingRef: `standups/${local.date}-morning`,
                summary: request.meetingRequest.summary,
                evidenceRefs: request.meetingRequest.evidenceRefs,
                notBefore: nextAgendaDate({
                  currentDate: local.date,
                  currentHour: local.hour,
                  targetHour: parseCadenceHour(target.meeting.cadence)
                }),
                now
              });
              meetingAgendaIds.push(scheduled.agenda.id);
              meetingAgendaStateChanged = scheduled.created;
              await selectPriorityItem({
                root: artifactRoot,
                itemId: priority.id,
                meetingRef: `standups/${local.date}-morning`,
                now
              });
              selectedPriorityId = priority.id;
              selectedPriorityVenture = priority.venture;
              priorityStateChanged = true;
            } catch (error) {
              console.warn(`Council meeting request was not queued: ${error instanceof Error ? error.message : "unknown scheduler error"}`);
            }
          }
        }
      }
      for (const item of morningContext?.openPriorities ?? []) {
        if (item.id === selectedPriorityId) continue;
        await skipPriorityItem({
          root: artifactRoot,
          itemId: item.id,
          reason: "The 06:00 board did not select this item for today's single specialist commission.",
          now
        });
        priorityStateChanged = true;
      }
    }
    const agentsParticipated = Boolean(measuredCouncil) || (options.dry && !deterministicCheckpoint);
    const standup = measuredCouncil
      ? createLiveStandup({
          cycleId,
          phase: venturePhase as Exclude<typeof venturePhase, "founding">,
          stage: stages.current,
          room,
          estimatedCycleUsd: estimatedWorstCaseUsd,
          now,
          council: measuredCouncil,
          ...(morningContext ? { autonomy: morningContext.autonomy } : {}),
          ...(morningContext ? { quarterlyKpis: morningContext.moneyAndKpis.summary } : {}),
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
          agentsParticipated,
          ledger: await monthToDateLedger(artifactRoot, now),
          ...(morningContext ? { autonomy: morningContext.autonomy } : {}),
          ...(morningContext ? { quarterlyKpis: morningContext.moneyAndKpis.summary } : {}),
          ...(caughtUpIdea ? { caughtUpIdea } : {})
        });
    const recordedStandup = morningContext
      ? StandupSchema.parse({
          ...standup,
          starvationReview: morningContext.starvation.map((entry) => ({
            ventureId: entry.ventureId,
            outcome: selectedPriorityVenture === entry.ventureId ? "commissioned" as const : "why-not" as const,
            reason: selectedPriorityVenture === entry.ventureId
              ? "The board commissioned the venture's selected open priority item."
              : morningContext.openPriorities.some((item) => item.venture === entry.ventureId)
                ? "The board used its single commission on a higher-priority bounded decision."
                : "No open priority item for this venture had a concrete decision at stake.",
            priorityItemId: selectedPriorityVenture === entry.ventureId ? selectedPriorityId : null
          }))
        })
      : standup;
    const artifacts = [
      `standups/${recordedStandup.date}-${options.phase}.json`,
      `meetings/${cycleId}.json`,
      `scorecards/${cycleId}.json`,
      `decisions/${cycleId}.json`,
      ...(caughtUpIdea
        ? [ideaLedgerPath(CAUGHT_UP_IDEA_NAMESPACE), ideaIndexPath(CAUGHT_UP_IDEA_NAMESPACE)]
        : []),
      ...(meetingAgendaStateChanged ? [MEETING_AGENDA_PATH] : []),
      ...(morningContext ? [AUTONOMY_SNAPSHOT_PATH] : []),
      ...(morningContext ? morningContext.moneyAndKpis.artifacts : []),
      ...(priorityStateChanged ? [PRIORITY_QUEUE_PATH] : [])
    ];
    await Promise.all([
      atomicWriteJson(
        artifactRoot,
        artifacts[0]!,
        publicStandup(recordedStandup)
      ),
      atomicWriteJson(artifactRoot, artifacts[1]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        room,
        summary: recordedStandup.decision.summary,
        generatedAt: now.toISOString()
      }),
      atomicWriteJson(artifactRoot, artifacts[2]!, {
        schemaVersion: 1,
        fixture: options.dry,
        cycleId,
        stage: stages.current,
        opportunityGate,
        estimatedWorstCaseUsd,
        actualUsd: recordedStandup.ledger.actualCycleUsd,
        socialDecision: "NO_POST",
        ...(caughtUpIdea ? {
          caughtUpIdeaRef: caughtUpIdea.entry.id,
          growthIdeaNovelty: caughtUpIdea.autoRejected ? 0 : 1,
          vaultVerdict: caughtUpIdea.verdict
        } : {}),
        meetingAgendaIds,
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
        meetingAgendaIds,
        generatedAt: now.toISOString()
      })
    ]);
    const ecosystemArtifact = !options.dry && venturePhase === "night"
      ? (await refreshEcosystemOperatingTruth({ repoRoot })).path
      : null;
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
      selectedAgents: agentsParticipated
        ? room.selectedParticipants.map(({ agent }) => agent)
        : [],
      skippedAgents: agentsParticipated
        ? room.skippedParticipants.map(({ agent }) => agent)
        : [...room.selectedParticipants, ...room.skippedParticipants].map(({ agent }) => agent),
      artifacts: [
        ...artifacts.map((artifact) => path.relative(repoRoot, path.join(artifactRoot, artifact))),
        ...(ecosystemArtifact ? [ecosystemArtifact] : [])
      ]
    };
  };
  if (options.dry) {
    return execute();
  }
  return withFileLock(stateRoot, ".lock", execute);
}
